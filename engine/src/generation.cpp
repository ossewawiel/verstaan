// SPDX-License-Identifier: MPL-2.0
//
// engine/src/generation.cpp -- the generation pass of ADR 0021 (issue 181):
// `RuleInterpreter::generate`, which turns a UNL graph into target-language text. It builds a
// forest from the graph (one word per graph node, chosen from the target dictionary by ADR 0023,
// one link per relation), runs every rule of grammar/generation.yaml over it as one first-match
// loop in file order (ADR 0017's run order), then runs the target's grammar/disambiguation.yaml
// over the final word list and joins the words. docs/factory/issues/181-test-cases.md is the source
// of truth for the rows.
//
// The rule syntax is docs/unl-reference/formats/transformation-grammar.md's, matched by the parser
// and matcher tree_pass.cpp shares (tree_syntax.hpp). ADR 0021 names the right sides this pass adds
// to ADR 0017's: a link in a link end, a literal word, a group around one link term, two link terms
// to one nested link, a link to a word list, a link to one group holding a word list, a list-node
// pattern and `!K`. A rule whose right side is none of these retires as `unsupported`.
//
// Words are placed by spans. A node's span is the ordered list of nodes it stands for. A word's
// span starts as the word alone; a hyper-node with no span stands for its head.

#include <algorithm>
#include <cstddef>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "inflection_syntax.hpp"
#include "tree_syntax.hpp"
#include "verstaan/rule_interpreter.hpp"

namespace verstaan {
namespace {

using namespace detail;

constexpr std::size_t kNone = static_cast<std::size_t>(-1);

// SPEC.md §3.4's fall-through mark: "⟦word⟧".
std::string mark(std::string_view surface) {
  std::string marked = "⟦";
  marked += surface;
  marked += "⟧";
  return marked;
}

// --- Rule representation. ---

struct RhsLink;

// A word a rule names: `[w]` (an entry: it takes the closed-class record's features, ADR 0022) or
// `"w"` (a string: only its surface).
struct Literal {
  std::string text;
  bool entry = false;
};

// One end of a right-side link term.
struct RhsEnd {
  std::optional<std::string> capture;
  std::optional<Literal> literal;
  std::vector<Edit> edits;
  std::shared_ptr<RhsLink> nested;  // a link term in the end: ADR 0021, right side 1
};

struct RhsLink {
  std::string label;
  RhsEnd from;
  RhsEnd to;
};

// One `(...)` group of a right side, or one slot of a word list inside a group.
struct Group {
  std::optional<std::string> capture;  // a bare `%x`
  bool fresh = false;                  // `%new`
  std::optional<Literal> literal;
  std::vector<Edit> edits;
  std::optional<std::string> inflect;  // `!K`
  std::vector<RhsLink> links;
  std::vector<Group> list;  // an embedded word list: `((%y)([en])(%x),+LEX=%x)`
};

struct ParsedRule {
  std::string id;
  bool valid = false;
  bool unsupported_rhs = false;  // matched, then retired
  bool list_lhs = false;         // `(a)(b)` against the list, else link terms against the links
  std::vector<NodeSpec> pattern;
  std::vector<std::string> node_list;  // `((%x)(%y))`: the capture of each item
  std::vector<LinkSpec> terms;
  std::vector<Group> groups;
  std::vector<RhsLink> links;
};

// --- Right-side parsing. ---

RhsLink parse_rhs_link(std::string_view raw, std::size_t open, Parse& parse);
Group parse_group(std::string_view content, Parse& parse);

std::optional<Literal> parse_literal(std::string_view raw) {
  if (raw.size() >= 2 && raw.front() == '[' && raw.back() == ']') {
    return Literal{.text = std::string(raw.substr(1, raw.size() - 2)), .entry = true};
  }
  if (raw.size() >= 2 && raw.front() == '"' && raw.back() == '"') {
    return Literal{.text = std::string(raw.substr(1, raw.size() - 2)), .entry = false};
  }
  return std::nullopt;
}

// `?` (an optional item), `$` (a counter) and `&` (a merge) are not applied by this pass.
bool is_unsupported_item(std::string_view raw) {
  return raw.front() == '?' || raw.front() == '$' || raw.find('&') != std::string_view::npos;
}

void add_end_item(std::string_view raw, RhsEnd& end, Parse& parse) {
  if (raw.empty()) {
    return;
  }
  if (is_unsupported_item(raw)) {
    parse.unsupported = true;
  } else if (const std::optional<std::size_t> open = link_open(raw)) {
    end.nested = std::make_shared<RhsLink>(parse_rhs_link(raw, *open, parse));
  } else if (raw.front() == '%') {
    if (raw != "%new") {
      end.capture = std::string(raw.substr(1));
    }
  } else if (std::optional<Literal> literal = parse_literal(raw)) {
    end.literal = std::move(literal);
  } else {
    end.edits.push_back(parse_edit(raw));
  }
}

RhsEnd parse_end(std::string_view raw, Parse& parse) {
  RhsEnd end;
  for (const std::string_view item : split_top(raw, ',')) {
    add_end_item(item, end, parse);
  }
  return end;
}

RhsLink parse_rhs_link(std::string_view raw, std::size_t open, Parse& parse) {
  RhsLink link;
  link.label = std::string(trim(raw.substr(0, open)));
  const std::vector<std::string_view> ends =
      split_top(raw.substr(open + 1, raw.size() - open - 2), ';');
  if (ends.size() != 2) {
    parse.ok = false;
    return link;
  }
  link.from = parse_end(ends[0], parse);
  link.to = parse_end(ends[1], parse);
  return link;
}

void add_group_item(std::string_view raw, Group& group, Parse& parse) {
  if (raw.empty()) {
    return;
  }
  if (is_unsupported_item(raw)) {
    parse.unsupported = true;
  } else if (raw.front() == '(') {
    const std::optional<std::vector<Piece>> pieces = split_pieces(raw);
    if (!pieces) {
      parse.ok = false;
      return;
    }
    for (const Piece& piece : *pieces) {
      if (!piece.group) {
        parse.ok = false;
        return;
      }
      group.list.push_back(parse_group(piece.text, parse));
    }
  } else if (raw.front() == '%') {
    if (raw == "%new") {
      group.fresh = true;
    } else if (!group.capture) {
      group.capture = std::string(raw.substr(1));
    }
  } else if (raw.front() == '!') {
    group.inflect = std::string(raw.substr(1));
  } else if (std::optional<Literal> literal = parse_literal(raw)) {
    group.literal = std::move(literal);
  } else if (const std::optional<std::size_t> open = link_open(raw)) {
    group.links.push_back(parse_rhs_link(raw, *open, parse));
  } else {
    group.edits.push_back(parse_edit(raw));
  }
}

Group parse_group(std::string_view content, Parse& parse) {
  Group group;
  for (const std::string_view item : split_top(content, ',')) {
    add_group_item(item, group, parse);
  }
  return group;
}

// --- Left-side and whole-rule parsing. ---

// `((%x)(%y))`: the capture name of each item, empty when an item is not a bare capture.
std::vector<std::string> parse_node_list(std::string_view text, Parse& parse) {
  std::vector<std::string> names;
  const std::optional<std::vector<Piece>> pieces = split_pieces(text);
  if (!pieces) {
    parse.ok = false;
    return names;
  }
  for (const Piece& piece : *pieces) {
    const std::string_view name = trim(piece.text);
    if (!piece.group || !name.starts_with('%')) {
      parse.ok = false;
      return names;
    }
    names.emplace_back(name.substr(1));
  }
  return names;
}

void parse_lhs_pieces(const std::vector<Piece>& pieces, ParsedRule& parsed, Parse& parse) {
  for (const Piece& piece : pieces) {
    if (piece.group != parsed.list_lhs) {
      parse.ok = false;  // a group beside a link term
      continue;
    }
    if (piece.group && piece.text.starts_with('(')) {
      parsed.node_list = parse_node_list(piece.text, parse);
    } else if (piece.group) {
      parsed.pattern.push_back(parse_side(piece.text, parse));
    } else if (const std::optional<std::size_t> open = link_open(piece.text)) {
      parsed.terms.push_back(parse_link(piece.text, *open, parse));
    } else {
      parse.ok = false;  // text that is neither
    }
  }
}

void parse_rhs_pieces(const std::vector<Piece>& pieces, ParsedRule& parsed, Parse& parse) {
  for (const Piece& piece : pieces) {
    if (piece.group) {
      parsed.groups.push_back(parse_group(piece.text, parse));
    } else if (const std::optional<std::size_t> open = link_open(piece.text)) {
      parsed.links.push_back(parse_rhs_link(piece.text, *open, parse));
    } else if (piece.text.starts_with('+')) {
      parse.unsupported = true;  // `+VC(...)`: a link added beside the matched one (rules 43 to 49)
    } else {
      parse.ok = false;
    }
  }
}

ParsedRule parse_rule(const GrammarRule& rule) {
  ParsedRule parsed;
  parsed.id = rule.id;
  const std::optional<std::vector<Piece>> lhs = split_pieces(trim(rule.lhs));
  const std::optional<std::vector<Piece>> rhs = split_pieces(trim(rule.rhs));
  if (!lhs || !rhs || lhs->empty()) {
    return parsed;
  }
  Parse parse;
  parsed.list_lhs = lhs->front().group;
  parse_lhs_pieces(*lhs, parsed, parse);
  parse_rhs_pieces(*rhs, parsed, parse);
  parsed.valid = parse.ok;
  parsed.unsupported_rhs = parse.unsupported;
  return parsed;
}

// --- The generation state: a forest with a span and a head per node. ---

struct State {
  Forest forest;
  std::vector<std::vector<std::size_t>> span;  // empty: the node's own default span
  std::vector<std::size_t> head;               // a hyper-node's head, else kNone
  std::vector<bool> hyper;                     // no surface: made by a rule or the graph root
  std::size_t root = 0;                        // the hyper-node that holds the graph's links

  std::size_t add(TreeNode node, bool is_hyper = false, std::size_t head_node = kNone) {
    forest.nodes.push_back(std::move(node));
    span.emplace_back();
    head.push_back(head_node);
    hyper.push_back(is_hyper);
    return forest.nodes.size() - 1;
  }
};

// The node a node stands for when it has no span of its own: a hyper-node stands for its head.
std::size_t stands_for(const State& st, std::size_t node) {
  std::size_t current = node;
  for (std::size_t guard = 0; guard < st.forest.nodes.size(); ++guard) {
    if (!st.span[current].empty() || !st.hyper[current] || st.head[current] == kNone) {
      return current;
    }
    current = st.head[current];
  }
  return current;
}

// The ordered nodes a node stands for: its span, else the node alone.
std::vector<std::size_t> span_items(const State& st, std::size_t node) {
  if (st.span[node].empty()) {
    return {node};
  }
  return st.span[node];
}

// The scope of a node: the scope of the first link, in link order, that names it; the root scope
// when no link names it (ADR 0021, right side 3).
std::size_t scope_of(const State& st, std::size_t node) {
  for (const std::size_t index : link_order(st.forest)) {
    const Link& link = st.forest.links[index];
    if (link.from == node || link.to == node) {
      return link.scope;
    }
  }
  return st.root;
}

// --- Applying a right side. Every read through an index uses `before`, the state as it stood when
// the rule matched (ADR 0017). ---

struct GenContext {
  const RuleSet& rules;
  const RuleInterpreter& interpreter;
  const Dictionary& target;
  std::string gen_prefix;  // "afr-gen-"
  std::string inf_prefix;  // "afr-inf-"
};

struct Apply {
  const ParsedRule& rule;
  const Match& match;
  const State& before;
  State& st;
  const GenContext& ctx;
  std::vector<TraceEntry>& pending;  // paradigm entries, appended after the rule's own
};

void copy_attributes(const Apply& apply, std::size_t node, const Edit& edit) {
  const std::optional<std::size_t> source = find_cap(apply.match, edit.value);
  if (!source) {
    return;
  }
  for (const std::string& attribute : apply.before.forest.nodes[*source].attributes) {
    add_attribute(apply.st.forest.nodes[node], attribute);
  }
}

void copy_feature(const Apply& apply, std::size_t node, const Edit& edit) {
  const std::optional<std::size_t> source = find_cap(apply.match, edit.value);
  if (!source) {
    return;
  }
  if (const std::optional<std::string> value =
          first_value(apply.before.forest.nodes[*source], edit.key)) {
    add_feature(apply.st.forest.nodes[node], Feature{edit.key, *value});
  }
}

void apply_edit(const Apply& apply, std::size_t node, const Edit& edit) {
  TreeNode& target = apply.st.forest.nodes[node];
  if (edit.remove) {
    remove_tag(target, edit.key);
  } else if (edit.key == "att" && edit.value_is_ref) {
    copy_attributes(apply, node, edit);
  } else if (edit.key == "att") {
    add_attribute(target, edit.value);
  } else if (edit.value_is_ref) {
    copy_feature(apply, node, edit);
  } else {
    add_feature(target, Feature{edit.key, edit.value});
  }
}

void apply_edits(const Apply& apply, std::size_t node, const std::vector<Edit>& edits) {
  for (const Edit& edit : edits) {
    apply_edit(apply, node, edit);
  }
}

// A new word node for a literal. An entry takes the features of the first closed-class record of
// that headword (a record with an empty UW, ADR 0022); a string, or an entry with no such record,
// carries the rule's edits only.
std::size_t new_word(const Apply& apply, const Literal& literal) {
  TreeNode node;
  node.surface = literal.text;
  if (literal.entry) {
    for (const DictionaryEntry& entry : apply.ctx.target.lookup(literal.text)) {
      if (entry.uw.empty()) {
        node.features = entry.features;
        break;
      }
    }
  }
  return apply.st.add(std::move(node));
}

// A hyper-node's tag test reads its own features, so it takes its head's `LEX` when it is made
// (ADR 0021, right side 1).
std::size_t new_hyper(const Apply& apply, std::size_t head) {
  TreeNode node;
  if (const std::optional<std::string> lex = first_value(apply.st.forest.nodes[head], "LEX")) {
    node.features.emplace_back("LEX", *lex);
  }
  return apply.st.add(std::move(node), /*is_hyper=*/true, head);
}

std::optional<std::size_t> resolve_end(const Apply& apply, const RhsEnd& end);

// A link term inside a link end: a hyper-node that holds the inner link.
std::optional<std::size_t> make_nested(const Apply& apply, const RhsLink& inner) {
  const std::optional<std::size_t> from = resolve_end(apply, inner.from);
  const std::optional<std::size_t> to = resolve_end(apply, inner.to);
  if (!from || !to) {
    return std::nullopt;
  }
  const std::size_t hyper = new_hyper(apply, *from);
  apply.st.forest.links.push_back(Link{
      .label = inner.label,
      .from = *from,
      .to = *to,
      .scope = hyper,
      .built_by = apply.rule.id,
      .labelled_by = apply.rule.id,
  });
  return hyper;
}

// The node a link end names: a new word for a literal, a new hyper-node for a nested link, the
// capture's node, or a new empty node when the end names none. Applies the end's edits to it.
std::optional<std::size_t> resolve_end(const Apply& apply, const RhsEnd& end) {
  std::size_t node = 0;
  if (end.literal) {
    node = new_word(apply, *end.literal);
  } else if (end.nested) {
    const std::optional<std::size_t> hyper = make_nested(apply, *end.nested);
    if (!hyper) {
      return std::nullopt;
    }
    node = *hyper;
  } else if (end.capture) {
    const std::optional<std::size_t> bound = find_cap(apply.match, *end.capture);
    if (!bound) {
      return std::nullopt;
    }
    node = *bound;
  } else {
    node = apply.st.add(TreeNode{});
  }
  apply_edits(apply, node, end.edits);
  return node;
}

// `!K` (rule 227): runs the inflection rule the node's `K` value names, on the branch whose
// `&`-joined tags all hold on the node (ADR 0021, right side 8).
void inflect_node(const Apply& apply, std::size_t node, const std::string& key) {
  TreeNode& target = apply.st.forest.nodes[node];
  const std::optional<std::string> paradigm = first_value(target, key);
  if (!paradigm) {
    return;
  }
  const auto holds = [&](std::string_view tags) {
    const std::vector<std::string_view> list = split_top(tags, '&');
    return std::ranges::all_of(list, [&](std::string_view tag) { return has_tag(target, tag); });
  };
  for (const GrammarRule& rule : apply.ctx.rules.to_inflection()) {
    if (rule.id != *paradigm) {
      continue;
    }
    for (const auto& [tags, a_rule] : split_inflection_branches(rule.rhs)) {
      if (!holds(tags)) {
        continue;
      }
      Trace scratch;
      std::string form = apply.ctx.interpreter.inflect(*paradigm, tags, target.surface,
                                                       /*from_language=*/false, scratch);
      if (!scratch.entries.empty()) {
        target.surface = std::move(form);
        apply.pending.push_back(TraceEntry{.rule = apply.ctx.inf_prefix + *paradigm});
      }
      return;
    }
  }
}

// The node a word-list group names: a literal, a new node (`%new`), the capture's node or, with
// none of these, the left-side node at the group's own position. Applies the group's edits.
std::optional<std::size_t> group_node(const Apply& apply, const Group& group,
                                      std::size_t position) {
  std::size_t node = 0;
  if (group.literal) {
    node = new_word(apply, *group.literal);
  } else if (group.fresh) {
    node = apply.st.add(TreeNode{});
  } else if (group.capture) {
    const std::optional<std::size_t> bound = find_cap(apply.match, *group.capture);
    if (!bound) {
      return std::nullopt;
    }
    node = *bound;
  } else if (position < apply.match.window.size()) {
    node = apply.match.window[position];
  } else {
    return std::nullopt;
  }
  apply_edits(apply, node, group.edits);
  if (group.inflect) {
    inflect_node(apply, node, *group.inflect);
  }
  return node;
}

void delete_node(State& st, std::size_t node) {
  st.forest.nodes[node].deleted = true;
  std::erase_if(st.forest.links, [&](const Link& link) {
    return link.from == node || link.to == node || link.scope == node;
  });
}

// Replaces the matched window of the list by `outputs`, when the window sits in the list.
void splice_list(Forest& forest, const Match& match, const std::vector<std::size_t>& outputs) {
  const std::vector<std::size_t>& window = match.window;
  const auto at = std::ranges::find(forest.list, window.front());
  if (at == forest.list.end() || static_cast<std::size_t>(forest.list.end() - at) < window.size()) {
    return;
  }
  const auto first = forest.list.erase(at, at + static_cast<std::ptrdiff_t>(window.size()));
  forest.list.insert(first, outputs.begin(), outputs.end());
}

// Rules 35 to 42 and 50 to 52: one group holds one link term. The link goes into the scope of the
// node it starts at, and the group's edits go to that node. No hyper-node is made.
bool apply_group_links(const Apply& apply) {
  for (const Group& group : apply.rule.groups) {
    std::optional<std::size_t> head;
    for (const RhsLink& rhs : group.links) {
      const std::optional<std::size_t> from = resolve_end(apply, rhs.from);
      const std::optional<std::size_t> to = resolve_end(apply, rhs.to);
      if (!from || !to) {
        return false;
      }
      const std::size_t scope = *from < apply.before.forest.nodes.size()
                                    ? scope_of(apply.before, *from)
                                    : apply.before.root;
      apply.st.forest.links.push_back(Link{
          .label = rhs.label,
          .from = *from,
          .to = *to,
          .scope = scope,
          .built_by = apply.rule.id,
          .labelled_by = apply.rule.id,
      });
      if (!head) {
        head = from;
      }
    }
    if (!head) {
      return false;
    }
    apply_edits(apply, *head, group.edits);
  }
  return true;
}

// A list rule: the matched window becomes one node per right-side group. A window node no group
// names is deleted, with every link that names it.
bool apply_list_rule(const Apply& apply) {
  if (std::ranges::any_of(apply.rule.groups, [](const Group& g) { return !g.links.empty(); })) {
    return apply_group_links(apply);
  }
  std::vector<std::size_t> outputs;
  for (std::size_t i = 0; i < apply.rule.groups.size(); ++i) {
    const std::optional<std::size_t> node = group_node(apply, apply.rule.groups[i], i);
    if (!node) {
      return false;
    }
    outputs.push_back(*node);
  }
  for (const std::size_t node : apply.match.window) {
    if (std::ranges::find(outputs, node) == outputs.end()) {
      delete_node(apply.st, node);
    }
  }
  splice_list(apply.st.forest, apply.match, outputs);
  return true;
}

// ADR 0021, right side 7: a list node whose span holds exactly the pattern's items is replaced by
// those items. A word that is an item of its own span stands for itself, and its span is spent.
bool apply_node_list(const Apply& apply) {
  State& st = apply.st;
  const std::size_t node = apply.match.window.front();
  const std::size_t owner = stands_for(st, node);
  const std::vector<std::size_t> items = span_items(st, owner);
  std::vector<std::size_t> outputs;
  for (const Group& group : apply.rule.groups) {
    if (!group.capture) {
      return false;
    }
    const auto name = std::ranges::find(apply.rule.node_list, *group.capture);
    if (name == apply.rule.node_list.end()) {
      return false;
    }
    outputs.push_back(items[static_cast<std::size_t>(name - apply.rule.node_list.begin())]);
  }
  const auto at = std::ranges::find(st.forest.list, node);
  if (at == st.forest.list.end()) {
    return false;
  }
  const auto first = st.forest.list.erase(at);
  st.forest.list.insert(first, outputs.begin(), outputs.end());
  for (const std::size_t item : outputs) {
    if (item == owner || item == node) {
      st.span[item].clear();
    }
  }
  return true;
}

// One link in, one out: the link keeps its place and takes the new label and ends.
bool apply_relabel(const Apply& apply) {
  const RhsLink& rhs = apply.rule.links.front();
  const std::optional<std::size_t> from = resolve_end(apply, rhs.from);
  const std::optional<std::size_t> to = resolve_end(apply, rhs.to);
  if (!from || !to) {
    return false;
  }
  Link& link = apply.st.forest.links[apply.match.top.front()];
  link.label = rhs.label;
  link.from = *from;
  link.to = *to;
  link.labelled_by = apply.rule.id;
  return true;
}

// The node a bare capture end of an inner link names.
std::optional<std::size_t> end_node(const Apply& apply, const RhsEnd& end) {
  if (!end.capture || end.literal || end.nested) {
    return std::nullopt;
  }
  return find_cap(apply.match, *end.capture);
}

// ADR 0021, right side 4: two link terms in, one nested link out. The inner link is the matched
// term with the same label and ends. It moves into a new hyper-node `H`; the other term becomes
// the outer link, in its place and scope, with `H` as its head. `H` replaces the shared head in
// every other link end and in the list.
bool apply_arborise(const Apply& apply) {
  const RhsLink& rhs = apply.rule.links.front();
  const bool nested_from = rhs.from.nested != nullptr;
  if (nested_from == (rhs.to.nested != nullptr)) {
    return false;
  }
  const RhsEnd& nested_end = nested_from ? rhs.from : rhs.to;
  const RhsEnd& other_end = nested_from ? rhs.to : rhs.from;
  const RhsLink& inner = *nested_end.nested;
  const std::optional<std::size_t> inner_from = end_node(apply, inner.from);
  const std::optional<std::size_t> inner_to = end_node(apply, inner.to);
  if (!inner_from || !inner_to) {
    return false;
  }
  std::vector<Link>& links = apply.st.forest.links;
  std::size_t inner_index = kNone;
  std::size_t outer_index = kNone;
  for (const std::size_t index : apply.match.top) {
    if (inner_index == kNone && links[index].label == inner.label &&
        links[index].from == *inner_from && links[index].to == *inner_to) {
      inner_index = index;
    } else {
      outer_index = index;
    }
  }
  if (inner_index == kNone || outer_index == kNone) {
    return false;
  }
  const std::size_t hyper = new_hyper(apply, *inner_from);
  apply_edits(apply, hyper, nested_end.edits);
  const std::optional<std::size_t> other = resolve_end(apply, other_end);
  if (!other) {
    return false;
  }
  links[inner_index].scope = hyper;
  links[outer_index].label = rhs.label;
  links[outer_index].from = nested_from ? hyper : *other;
  links[outer_index].to = nested_from ? *other : hyper;
  links[outer_index].labelled_by = apply.rule.id;
  for (std::size_t index = 0; index < links.size(); ++index) {
    if (index == inner_index || index == outer_index) {
      continue;
    }
    if (links[index].from == *inner_from) {
      links[index].from = hyper;
    }
    if (links[index].to == *inner_from) {
      links[index].to = hyper;
    }
  }
  std::ranges::replace(apply.st.forest.list, *inner_from, hyper);
  return true;
}

// ADR 0021, right side 5: a link in, a word list out. The link is removed and the order goes onto
// the head's span: `(%y)(%x)` puts the dependent before it, `(%x)(%y)` after it.
bool apply_linearise(const Apply& apply) {
  if (apply.rule.groups.size() != 2) {
    return false;
  }
  const Link link = apply.st.forest.links[apply.match.top.front()];
  const std::optional<std::size_t> first = group_node(apply, apply.rule.groups[0], 0);
  const std::optional<std::size_t> second = group_node(apply, apply.rule.groups[1], 1);
  if (!first || !second) {
    return false;
  }
  const bool dependent_first = *first == link.to && *second == link.from;
  const bool dependent_last = *first == link.from && *second == link.to;
  if (!dependent_first && !dependent_last) {
    return false;
  }
  std::vector<std::size_t> items = span_items(apply.st, link.from);
  if (dependent_first) {
    items.insert(items.begin(), link.to);
  } else {
    items.push_back(link.to);
  }
  apply.st.span[link.from] = std::move(items);
  apply.st.forest.links.erase(apply.st.forest.links.begin() +
                              static_cast<std::ptrdiff_t>(apply.match.top.front()));
  return true;
}

// ADR 0021, right side 6: a link in, one group holding a word list out. A new node `C` holds the
// list as its span. The link is removed and `C` replaces the link's head in every other link end
// and in the list.
bool apply_collect(const Apply& apply) {
  const Group& group = apply.rule.groups.front();
  const Link link = apply.st.forest.links[apply.match.top.front()];
  std::vector<std::size_t> items;
  for (const Group& slot : group.list) {
    const std::optional<std::size_t> node = group_node(apply, slot, kNone);
    if (!node) {
      return false;
    }
    items.push_back(*node);
  }
  const std::size_t collected = new_hyper(apply, link.from);
  apply_edits(apply, collected, group.edits);
  apply.st.span[collected] = std::move(items);
  std::vector<Link>& links = apply.st.forest.links;
  links.erase(links.begin() + static_cast<std::ptrdiff_t>(apply.match.top.front()));
  for (Link& other : links) {
    if (other.from == link.from) {
      other.from = collected;
    }
    if (other.to == link.from) {
      other.to = collected;
    }
  }
  std::ranges::replace(apply.st.forest.list, link.from, collected);
  return true;
}

bool apply_link_rule(const Apply& apply) {
  const ParsedRule& rule = apply.rule;
  if (!apply.match.held.empty()) {
    return false;  // a nested link on the left (rule 68)
  }
  if (rule.terms.size() == 1 && rule.links.size() == 1 && rule.groups.empty()) {
    return apply_relabel(apply);
  }
  if (rule.terms.size() == 2 && rule.links.size() == 1 && rule.groups.empty()) {
    return apply_arborise(apply);
  }
  if (rule.terms.size() == 1 && rule.links.empty() && rule.groups.size() == 1 &&
      !rule.groups.front().list.empty()) {
    return apply_collect(apply);
  }
  if (rule.terms.size() == 1 && rule.links.empty() && !rule.groups.empty()) {
    return apply_linearise(apply);
  }
  return false;
}

// Applies the right side whole, or leaves the state as it was and returns false.
bool apply_rule(const ParsedRule& rule, const Match& match, State& st, const GenContext& ctx,
                std::vector<TraceEntry>& pending) {
  if (rule.unsupported_rhs) {
    return false;
  }
  const State before = st;
  const Apply apply{
      .rule = rule,
      .match = match,
      .before = before,
      .st = st,
      .ctx = ctx,
      .pending = pending,
  };
  bool applied = false;
  if (!rule.node_list.empty()) {
    applied = apply_node_list(apply);
  } else if (rule.list_lhs) {
    applied = apply_list_rule(apply);
  } else {
    applied = apply_link_rule(apply);
  }
  if (!applied) {
    st = before;
    pending.clear();
  }
  return applied;
}

// --- Matching. ---

// What a step needs to know about the forest, computed once per step.
struct Views {
  std::vector<std::size_t> visit;
  std::vector<std::size_t> links;
};

std::optional<Found> find_list_match(const ParsedRule& rule, const State& st, const Views& views) {
  const std::size_t width = rule.pattern.size();
  std::vector<std::vector<std::size_t>> places;
  if (width == 1) {
    for (const std::size_t node : views.visit) {
      places.push_back({node});
    }
  } else {
    const std::vector<std::size_t>& list = st.forest.list;
    for (std::size_t start = 0; start + width <= list.size(); ++start) {
      places.emplace_back(list.begin() + static_cast<std::ptrdiff_t>(start),
                          list.begin() + static_cast<std::ptrdiff_t>(start + width));
    }
  }
  for (const std::vector<std::size_t>& window : places) {
    Found found;
    found.value = match_nodes(rule.pattern, st.forest, window, found.match);
    if (found.value != Tri::False) {
      return found;
    }
  }
  return std::nullopt;
}

// A list-node pattern matches the first list node whose span holds exactly that many items.
std::optional<Found> find_node_list_match(const ParsedRule& rule, const State& st) {
  for (const std::size_t node : st.forest.list) {
    if (span_items(st, stands_for(st, node)).size() == rule.node_list.size()) {
      Found found;
      found.value = Tri::True;
      found.match.window = {node};
      return found;
    }
  }
  return std::nullopt;
}

struct TermQuery {
  const ParsedRule& rule;
  const Forest& forest;
  const std::vector<std::size_t>& order;
};

// Matches link terms `term` onward, each against the first link, in link order, that is not false
// and that no earlier term took: two terms match two different links (ADR 0021, right side 4).
Tri match_terms(const TermQuery& query, std::size_t term, Match& match) {
  if (term == query.rule.terms.size()) {
    return Tri::True;
  }
  for (const std::size_t index : query.order) {
    if (std::ranges::find(match.top, index) != match.top.end()) {
      continue;
    }
    Match trial = match;
    Tri value = match_link(query.rule.terms[term], query.forest, index, trial);
    if (value == Tri::False) {
      continue;
    }
    trial.top.push_back(index);
    value = std::min(value, match_terms(query, term + 1, trial));
    if (value != Tri::False) {
      match = std::move(trial);
      return value;
    }
  }
  return Tri::False;
}

std::optional<Found> find_match(const ParsedRule& rule, const State& st, const Views& views) {
  if (!rule.node_list.empty()) {
    return find_node_list_match(rule, st);
  }
  if (rule.list_lhs) {
    return find_list_match(rule, st, views);
  }
  Found found;
  found.value = match_terms(TermQuery{.rule = rule, .forest = st.forest, .order = views.links}, 0,
                            found.match);
  if (found.value == Tri::False) {
    return std::nullopt;
  }
  return found;
}

// --- The loop (ADR 0017's, with ADR 0024's qualified ids). ---

struct RuleState {
  std::size_t count = 0;
  bool retired = false;
};

void retire(const ParsedRule& rule, RuleState& state, const GenContext& ctx, Trace& trace) {
  trace.entries.push_back(
      TraceEntry{.rule = ctx.gen_prefix + rule.id, .event = TraceEvent::unsupported});
  state.retired = true;
}

void fire_rule(const ParsedRule& rule, const Match& match, RuleState& state, State& st,
               const GenContext& ctx, Trace& trace) {
  std::vector<TraceEntry> pending;
  if (!apply_rule(rule, match, st, ctx, pending)) {
    retire(rule, state, ctx, trace);
    return;
  }
  trace.entries.push_back(TraceEntry{.rule = ctx.gen_prefix + rule.id});
  trace.entries.insert(trace.entries.end(), pending.begin(), pending.end());
  ++state.count;
  if (state.count >= kTreePassRuleCap) {
    trace.entries.push_back(
        TraceEntry{.rule = ctx.gen_prefix + rule.id, .event = TraceEvent::capped});
    state.retired = true;
  }
}

// Fires the first rule, in file order, whose left side is not false. A rule whose left side is
// unknown, or does not parse, is retired and the state stays as it was. False when none applies.
bool run_one_step(const std::vector<ParsedRule>& rules, std::vector<RuleState>& states, State& st,
                  const GenContext& ctx, Trace& trace) {
  const Views views{.visit = visit_order(st.forest), .links = link_order(st.forest)};
  for (std::size_t i = 0; i < rules.size(); ++i) {
    if (states[i].retired) {
      continue;
    }
    if (!rules[i].valid) {
      retire(rules[i], states[i], ctx, trace);
      return true;
    }
    const std::optional<Found> found = find_match(rules[i], st, views);
    if (!found) {
      continue;
    }
    if (found->value == Tri::Unknown) {
      retire(rules[i], states[i], ctx, trace);
    } else {
      fire_rule(rules[i], found->match, states[i], st, ctx, trace);
    }
    return true;
  }
  return false;
}

// --- The starting forest. ---

bool is_quoted(std::string_view uw) {
  return uw.size() >= 2 && uw.front() == '"' && uw.back() == '"';
}

// A UW without the quotes of a name literal: the text a mark shows when no source surface is known.
std::string_view plain_uw(std::string_view uw) {
  return is_quoted(uw) ? uw.substr(1, uw.size() - 2) : uw;
}

struct Reading {
  TreeNode node;
  std::vector<Candidate> alternatives;
};

// ADR 0023: the lemma entries of the UW (headword equal to `BF`, or no `BF`), highest priority
// first, then store order. The first is the node's reading, the rest its alternatives.
Reading choose_word(const Node& graph_node, std::string_view source, const Dictionary& target,
                    const RuleSet& rules) {
  Reading reading;
  TreeNode& node = reading.node;
  node.attributes = graph_node.attributes;
  const std::string& uw = graph_node.uw;
  if (is_quoted(uw)) {
    node.surface = uw.substr(1, uw.size() - 2);
    node.features.emplace_back(std::string(kUwFeatureKey), uw);
    return reading;
  }
  std::vector<DictionaryEntry> entries = target.lookup_uw(uw);
  std::erase_if(entries, [](const DictionaryEntry& entry) {
    return std::ranges::any_of(entry.features, [&](const Feature& f) {
      return f.first == "BF" && f.second != entry.headword;
    });
  });
  std::ranges::stable_sort(entries, [](const DictionaryEntry& a, const DictionaryEntry& b) {
    return a.priority > b.priority;
  });
  std::vector<DictionaryEntry> distinct;
  for (DictionaryEntry& entry : entries) {
    const bool seen = std::ranges::any_of(distinct, [&](const DictionaryEntry& kept) {
      return kept.headword == entry.headword && kept.features == entry.features;
    });
    if (!seen) {
      distinct.push_back(std::move(entry));
    }
  }
  if (distinct.empty()) {
    node.surface = mark(source.empty() ? plain_uw(uw) : source);
    node.features.emplace_back(std::string(kUwFeatureKey), uw);
    return reading;
  }
  node.surface = distinct.front().headword;
  node.features = distinct.front().features;
  for (const Feature& feature : distinct.front().features) {
    if (feature.first == "PAR" &&
        std::ranges::any_of(rules.to_inflection(),
                            [&](const GrammarRule& rule) { return rule.id == feature.second; })) {
      node.features.emplace_back("FLX", feature.second);
    }
  }
  node.features.emplace_back(std::string(kUwFeatureKey), uw);
  for (std::size_t i = 1; i < distinct.size(); ++i) {
    reading.alternatives.push_back(Candidate{
        .surface = distinct[i].headword,
        .features = distinct[i].features,
        .attributes = node.attributes,
    });
  }
  return reading;
}

TreeNode sentinel(std::string tag) {
  TreeNode node;
  node.features.emplace_back(std::move(tag), "");
  return node;
}

// ADR 0021, "The starting forest": SHEAD, one word per graph node, STAIL, then the root
// hyper-node. A root is a graph node no relation names as its dependent.
struct Start {
  State st;
  std::vector<std::vector<Candidate>> alternatives;  // per forest node
};

Start start_state(const Graph& graph, const std::vector<std::string>& source_surfaces,
                  const Dictionary& target, const RuleSet& rules) {
  Start start;
  State& st = start.st;
  st.add(sentinel("SHEAD"));
  start.alternatives.emplace_back();
  for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
    const std::string_view source =
        i < source_surfaces.size() ? std::string_view(source_surfaces[i]) : std::string_view();
    Reading reading = choose_word(graph.nodes[i], source, target, rules);
    st.add(std::move(reading.node));
    start.alternatives.push_back(std::move(reading.alternatives));
  }
  st.add(sentinel("STAIL"));
  start.alternatives.emplace_back();
  st.root = st.add(TreeNode(), true);
  start.alternatives.emplace_back();

  std::vector<bool> dependent(graph.nodes.size(), false);
  for (const Relation& relation : graph.relations) {
    if (relation.from >= graph.nodes.size() || relation.to >= graph.nodes.size()) {
      continue;
    }
    st.forest.links.push_back(Link{
        .label = relation.label,
        .from = relation.from + 1,
        .to = relation.to + 1,
        .scope = st.root,
        .built_by = "",
        .labelled_by = "",
    });
    // A name that heads a plain word through `mod` (`mod("Geneva"; book)`, English `book Geneva`)
    // is no root: no rule reads a name as a head, so the word is the root and the name is appended
    // (ADR 0025).
    const bool name_heads_word = relation.label == "mod" &&
                                 is_quoted(graph.nodes[relation.from].uw) &&
                                 !is_quoted(graph.nodes[relation.to].uw);
    dependent[name_heads_word ? relation.from : relation.to] = true;
  }
  st.forest.list.push_back(0);
  for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
    if (!dependent[i]) {
      st.forest.list.push_back(i + 1);
    }
  }
  if (!graph.nodes.empty() && st.forest.list.size() == 1) {
    st.forest.list.push_back(1);  // every node is a dependent: graph node 0 is the root
  }
  st.forest.list.push_back(graph.nodes.size() + 1);
  return start;
}

// --- After the loop. ---

bool is_sentinel(const TreeNode& node) { return has_tag(node, "SHEAD") || has_tag(node, "STAIL"); }

// The words the list holds once the loop is done: a word with its own surface, or a hyper-node
// that stands for one. A node whose span the loop never flattened is not placed (ADR 0025).
std::vector<std::size_t> settled_list(const State& st) {
  std::vector<std::size_t> words;
  for (const std::size_t node : st.forest.list) {
    if (is_sentinel(st.forest.nodes[node])) {
      words.push_back(node);
      continue;
    }
    const std::vector<std::size_t> items = span_items(st, stands_for(st, node));
    if (items.size() == 1 && !st.hyper[items.front()]) {
      words.push_back(items.front());
    }
  }
  return words;
}

// A blank or a punctuation mark already separates its neighbours.
bool separates(const TreeNode& node) { return has_tag(node, "BLK") || has_tag(node, "PUT"); }

bool same_reading(const TreeNode& node, const Candidate& candidate) {
  return node.surface == candidate.surface && node.features == candidate.features;
}

}  // namespace

GenerationResult RuleInterpreter::generate(const Graph& graph, const Dictionary& target,
                                           const std::vector<std::string>& source_surfaces,
                                           Lang target_language, Trace& trace) const {
  const std::string code(language_code(target_language));
  const GenContext ctx{
      .rules = rules_,
      .interpreter = *this,
      .target = target,
      .gen_prefix = code + "-gen-",
      .inf_prefix = code + "-inf-",
  };

  Start start = start_state(graph, source_surfaces, target, rules_);
  State& st = start.st;

  std::vector<ParsedRule> rules;
  rules.reserve(rules_.generation().size());
  for (const GrammarRule& rule : rules_.generation()) {
    rules.push_back(parse_rule(rule));
  }
  std::vector<RuleState> states(rules.size());
  while (run_one_step(rules, states, st, ctx, trace)) {
  }

  // One position per list node, sentinels included: the node itself, then its lexical alternatives
  // (ADR 0021, "After the loop").
  st.forest.list = settled_list(st);
  std::vector<Position> positions;
  positions.reserve(st.forest.list.size());
  for (const std::size_t index : st.forest.list) {
    const TreeNode& node = st.forest.nodes[index];
    Position position;
    position.candidates.push_back(Candidate{
        .surface = node.surface,
        .features = node.features,
        .attributes = node.attributes,
    });
    if (index < start.alternatives.size()) {
      position.candidates.insert(position.candidates.end(), start.alternatives[index].begin(),
                                 start.alternatives[index].end());
    }
    positions.push_back(std::move(position));
  }
  disambiguate_target(positions, target_language, trace);
  for (std::size_t i = 0; i < positions.size(); ++i) {
    TreeNode& node = st.forest.nodes[st.forest.list[i]];
    const Candidate& front = positions[i].candidates.front();
    if (!same_reading(node, front)) {
      node.surface = front.surface;
      node.features = front.features;
    }
  }

  std::string text;
  const TreeNode* previous = nullptr;
  std::vector<bool> placed(st.forest.nodes.size(), false);
  for (const std::size_t index : st.forest.list) {
    placed[index] = true;
    const TreeNode& node = st.forest.nodes[index];
    if (is_sentinel(node)) {
      continue;
    }
    // Rule 231 blanks the words of one tree; top-level items it did not separate get one blank.
    if (previous != nullptr && !separates(*previous) && !separates(node)) {
      text += ' ';
    }
    text += node.surface;
    previous = &node;
  }
  // ADR 0025: a graph node no rule placed is appended, in graph order, as a mark.
  for (std::size_t i = 0; i < graph.nodes.size(); ++i) {
    if (placed[i + 1]) {
      continue;
    }
    if (!text.empty()) {
      text += ' ';
    }
    text += mark(i < source_surfaces.size() ? std::string_view(source_surfaces[i])
                                            : plain_uw(graph.nodes[i].uw));
  }
  const bool marked = text.find("⟦") != std::string::npos;
  return GenerationResult{
      .forest = std::move(st.forest),
      .text = std::move(text),
      .status = marked ? Status::partial : Status::ok,
  };
}

}  // namespace verstaan
