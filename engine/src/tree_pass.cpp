// SPDX-License-Identifier: MPL-2.0
//
// engine/src/tree_pass.cpp -- the tree pass of ADR 0017 (issue 194): `make_forest`, the hand-over
// from disambiguation, and `RuleInterpreter::analyse_tree`, which runs every rule of
// grammar/analysis.yaml over one Forest in the archive's order. At each step the first rule in file
// order whose left side matches fires once, at its first match; then the scan starts again from the
// first rule. The pass ends when no rule matches. A rule that fires `kTreePassRuleCap` times, or
// whose right side the pass cannot apply yet, is retired with a trace entry saying so.
//
// The rule syntax is docs/unl-reference/formats/transformation-grammar.md's. Each rule is parsed
// once per call into a `ParsedRule`; a rule that does not parse is retired as `unsupported`.

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <numeric>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "tree_syntax.hpp"
#include "verstaan/rule_interpreter.hpp"

namespace verstaan {
namespace {

using namespace detail;

struct Side {
  std::optional<std::string> capture;
  std::vector<Edit> edits;
};

struct RhsLink {
  std::string label;
  Side from;
  Side to;
};

struct Group {
  std::optional<std::string> base;  // a bare `%x`
  bool fresh = false;               // `%new`
  std::vector<Edit> edits;
  std::vector<RhsLink> links;
};

struct ParsedRule {
  std::string id;
  bool valid = false;
  bool unsupported_rhs = false;  // a merge or a literal group: matched, then retired
  bool list_lhs = false;         // `(a)(b)` against the list, else link terms against the links
  std::vector<NodeSpec> pattern;
  std::vector<LinkSpec> terms;
  std::vector<Group> groups;
  std::vector<RhsLink> links;
};

Side parse_rhs_side(std::string_view raw, Parse& parse) {
  Side side;
  for (const std::string_view part : split_top(raw, ',')) {
    if (part.empty()) {
      continue;
    }
    if (part.find('(') != std::string_view::npos) {
      parse.unsupported = true;  // a link nested in a link
    } else if (part.starts_with('%')) {
      side.capture = std::string(part.substr(1));
    } else {
      side.edits.push_back(parse_edit(part));
    }
  }
  return side;
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
  link.from = parse_rhs_side(ends[0], parse);
  link.to = parse_rhs_side(ends[1], parse);
  return link;
}

Group parse_group(std::string_view content, Parse& parse) {
  Group group;
  for (const std::string_view raw : split_top(content, ',')) {
    if (raw.empty()) {
      continue;
    }
    if (raw.find('&') != std::string_view::npos || raw.front() == '[' || raw.front() == '"') {
      parse.unsupported = true;  // a merge, or a node made from a literal
    } else if (raw.front() == '%') {
      if (raw == "%new") {
        group.fresh = true;
      } else if (!group.base) {
        group.base = std::string(raw.substr(1));
      }
    } else if (const std::optional<std::size_t> open = link_open(raw)) {
      group.links.push_back(parse_rhs_link(raw, *open, parse));
    } else {
      group.edits.push_back(parse_edit(raw));
    }
  }
  return group;
}

void parse_lhs_pieces(const std::vector<Piece>& pieces, ParsedRule& parsed, Parse& parse) {
  for (const Piece& piece : pieces) {
    if (piece.group != parsed.list_lhs) {
      parse.ok = false;  // a group beside a link term
    } else if (piece.group) {
      parsed.pattern.push_back(parse_side(piece.text, parse));
    } else if (const std::optional<std::size_t> open = link_open(piece.text)) {
      parsed.terms.push_back(parse_link(piece.text, *open, parse));
    } else {
      parse.ok = false;  // text that is neither
      parsed.terms.clear();
    }
  }
}

void parse_rhs_pieces(const std::vector<Piece>& pieces, ParsedRule& parsed, Parse& parse) {
  for (const Piece& piece : pieces) {
    if (piece.group) {
      parsed.groups.push_back(parse_group(piece.text, parse));
    } else if (const std::optional<std::size_t> open = link_open(piece.text)) {
      parsed.links.push_back(parse_rhs_link(piece.text, *open, parse));
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

// A one-node pattern takes the first node in visit order, hyper-node contents included. A longer
// pattern takes the leftmost window of adjacent nodes in the list.
std::optional<Found> find_list_match(const ParsedRule& rule, const Forest& forest) {
  const std::size_t width = rule.pattern.size();
  std::vector<std::vector<std::size_t>> places;
  if (width == 1) {
    for (const std::size_t node : visit_order(forest)) {
      places.push_back({node});
    }
  } else {
    for (std::size_t start = 0; start + width <= forest.list.size(); ++start) {
      places.emplace_back(forest.list.begin() + static_cast<std::ptrdiff_t>(start),
                          forest.list.begin() + static_cast<std::ptrdiff_t>(start + width));
    }
  }
  for (const std::vector<std::size_t>& window : places) {
    Found found;
    found.value = match_nodes(rule.pattern, forest, window, found.match);
    if (found.value != Tri::False) {
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

// Matches link terms `term` onward, each against the first link, in link order, that is not false.
Tri match_terms(const TermQuery& query, std::size_t term, Match& match) {
  if (term == query.rule.terms.size()) {
    return Tri::True;
  }
  for (const std::size_t index : query.order) {
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

std::optional<Found> find_match(const ParsedRule& rule, const Forest& forest) {
  if (rule.list_lhs) {
    return find_list_match(rule, forest);
  }
  const std::vector<std::size_t> order = link_order(forest);
  Found found;
  found.value =
      match_terms(TermQuery{.rule = rule, .forest = forest, .order = order}, 0, found.match);
  if (found.value == Tri::False) {
    return std::nullopt;
  }
  return found;
}

// --- Applying a right side. Every read through an index uses `before`, the nodes as they stood
// when the rule matched (ADR 0017). ---

struct Apply {
  const ParsedRule& rule;
  const Match& match;
  const std::vector<TreeNode>& before;
  Forest& forest;
};

void copy_attributes(const Apply& apply, std::size_t node, const Edit& edit) {
  const std::optional<std::size_t> source = find_cap(apply.match, edit.value);
  if (!source) {
    return;
  }
  for (const std::string& attribute : apply.before[*source].attributes) {
    add_attribute(apply.forest.nodes[node], attribute);
  }
}

void copy_feature(const Apply& apply, std::size_t node, const Edit& edit) {
  const std::optional<std::size_t> source = find_cap(apply.match, edit.value);
  if (!source) {
    return;
  }
  if (const std::optional<std::string> value = first_value(apply.before[*source], edit.key)) {
    add_feature(apply.forest.nodes[node], Feature{edit.key, *value});
  }
}

void apply_edit(const Apply& apply, std::size_t node, const Edit& edit) {
  TreeNode& target = apply.forest.nodes[node];
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

// The node a link end names: the capture's node, or a new node when the end names none (`e`,
// `+e`). Applies the end's edits to it.
std::optional<std::size_t> resolve_side(const Apply& apply, const Side& side) {
  std::size_t node = 0;
  if (side.capture) {
    const std::optional<std::size_t> bound = find_cap(apply.match, *side.capture);
    if (!bound) {
      return std::nullopt;
    }
    node = *bound;
  } else {
    apply.forest.nodes.emplace_back();
    node = apply.forest.nodes.size() - 1;
  }
  for (const Edit& edit : side.edits) {
    apply_edit(apply, node, edit);
  }
  return node;
}

// A link term in a group. When the left side held that very link (rule 82), it already exists and
// only the end edits apply; otherwise a new link goes at the end of graph order.
bool apply_group_link(const Apply& apply, const RhsLink& rhs, std::size_t scope,
                      std::vector<std::size_t>& named) {
  const std::optional<std::size_t> from = resolve_side(apply, rhs.from);
  const std::optional<std::size_t> to = resolve_side(apply, rhs.to);
  if (!from || !to) {
    return false;
  }
  if (rhs.from.capture) {
    named.push_back(*from);
  }
  if (rhs.to.capture) {
    named.push_back(*to);
  }
  const bool exists = std::ranges::any_of(apply.match.held, [&](std::size_t held) {
    const Link& link = apply.forest.links[held];
    return link.label == rhs.label && link.from == *from && link.to == *to;
  });
  if (!exists) {
    apply.forest.links.push_back(Link{
        .label = rhs.label,
        .from = *from,
        .to = *to,
        .scope = scope,
        .built_by = apply.rule.id,
        .labelled_by = apply.rule.id,
    });
  }
  return true;
}

// The node a group edits: the capture it names, a new node (`%new`, or a group that holds a link
// term), or the left-side node at the group's own position.
std::optional<std::size_t> group_node(const Apply& apply, const Group& group, std::size_t position,
                                      std::vector<std::size_t>& named) {
  if (group.base && !group.fresh) {
    const std::optional<std::size_t> bound = find_cap(apply.match, *group.base);
    if (bound) {
      named.push_back(*bound);
    }
    return bound;
  }
  if (!group.fresh && group.links.empty() && position < apply.match.window.size()) {
    named.push_back(apply.match.window[position]);
    return apply.match.window[position];
  }
  apply.forest.nodes.emplace_back();
  return apply.forest.nodes.size() - 1;
}

std::optional<std::size_t> apply_group(const Apply& apply, const Group& group, std::size_t position,
                                       std::vector<std::size_t>& named) {
  const std::optional<std::size_t> node = group_node(apply, group, position, named);
  if (!node) {
    return std::nullopt;
  }
  for (const Edit& edit : group.edits) {
    apply_edit(apply, *node, edit);
  }
  for (const RhsLink& link : group.links) {
    if (!apply_group_link(apply, link, *node, named)) {
      return std::nullopt;
    }
  }
  return node;
}

void delete_node(Forest& forest, std::size_t node) {
  forest.nodes[node].deleted = true;
  std::erase_if(forest.links, [&](const Link& link) {
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

// False when a group names an index the left side does not bind; the caller restores the forest.
bool apply_list_rule(const ParsedRule& rule, const Match& match, Forest& forest,
                     const std::vector<TreeNode>& before) {
  const Apply apply{.rule = rule, .match = match, .before = before, .forest = forest};
  std::vector<std::size_t> named;
  std::vector<std::size_t> outputs;
  for (std::size_t i = 0; i < rule.groups.size(); ++i) {
    const std::optional<std::size_t> node = apply_group(apply, rule.groups[i], i, named);
    if (!node) {
      return false;
    }
    outputs.push_back(*node);
  }
  // A left-side node that no group names is deleted, with every link that names it.
  for (const std::size_t node : match.window) {
    if (std::ranges::find(named, node) == named.end()) {
      delete_node(forest, node);
    }
  }
  splice_list(forest, match, outputs);
  return true;
}

struct Resolved {
  std::string label;
  std::size_t from = 0;
  std::size_t to = 0;
};

std::optional<Resolved> resolve_link(const Apply& apply, const RhsLink& rhs) {
  const std::optional<std::size_t> from = resolve_side(apply, rhs.from);
  const std::optional<std::size_t> to = resolve_side(apply, rhs.to);
  if (!from || !to) {
    return std::nullopt;
  }
  return Resolved{.label = rhs.label, .from = *from, .to = *to};
}

// One link in, one out: the link keeps its place and takes the new label and ends.
bool apply_relabel(const Apply& apply) {
  const std::optional<Resolved> out = resolve_link(apply, apply.rule.links.front());
  if (!out) {
    return false;
  }
  Link& link = apply.forest.links[apply.match.top.front()];
  link.label = out->label;
  link.from = out->from;
  link.to = out->to;
  link.labelled_by = apply.rule.id;
  return true;
}

// One link in, two out (rules 86 to 90). The right-side link with the label and ends of the
// matched inner link is that link: it keeps its place and moves to the outer link's scope. The
// other right-side link replaces the outer link in its place.
bool apply_dearborise(const Apply& apply) {
  std::vector<Resolved> out;
  for (const RhsLink& rhs : apply.rule.links) {
    if (std::optional<Resolved> resolved = resolve_link(apply, rhs)) {
      out.push_back(std::move(*resolved));
    }
  }
  if (out.size() != 2) {
    return false;
  }
  Link& inner = apply.forest.links[apply.match.held.front()];
  Link& outer = apply.forest.links[apply.match.top.front()];
  const auto is_inner = [&](const Resolved& r) {
    return r.label == inner.label && r.from == inner.from && r.to == inner.to;
  };
  const std::size_t kept = is_inner(out[0]) ? 0 : 1;
  if (kept == 1 && !is_inner(out[1])) {
    return false;
  }
  const Resolved& other = out[1 - kept];
  const std::size_t scope = outer.scope;
  inner.scope = scope;
  outer = Link{
      .label = other.label,
      .from = other.from,
      .to = other.to,
      .scope = scope,
      .built_by = apply.rule.id,
      .labelled_by = apply.rule.id,
  };
  return true;
}

// False when the right side is one this pass does not apply yet; the caller restores the forest.
bool apply_link_rule(const ParsedRule& rule, const Match& match, Forest& forest,
                     const std::vector<TreeNode>& before) {
  if (rule.terms.size() != 1) {
    return false;
  }
  const Apply apply{.rule = rule, .match = match, .before = before, .forest = forest};
  if (!match.held.empty()) {
    return rule.links.size() == 2 && apply_dearborise(apply);
  }
  if (rule.links.size() == 1) {
    return apply_relabel(apply);
  }
  if (rule.links.empty() && !rule.groups.empty()) {
    // `XB(%x;e):=(%x)`: the link goes, both nodes stay (T-rule SCOPE).
    forest.links.erase(forest.links.begin() + static_cast<std::ptrdiff_t>(match.top.front()));
    return true;
  }
  return false;
}

// --- The loop. ---

struct RuleState {
  std::size_t count = 0;
  bool retired = false;
};

// Applies the right side whole, or leaves the forest as it was and returns false.
bool apply_rule(const ParsedRule& rule, const Match& match, Forest& forest) {
  if (rule.unsupported_rhs) {
    return false;
  }
  const Forest backup = forest;
  const bool applied = rule.list_lhs ? apply_list_rule(rule, match, forest, backup.nodes)
                                     : apply_link_rule(rule, match, forest, backup.nodes);
  if (!applied) {
    forest = backup;
  }
  return applied;
}

void retire(const ParsedRule& rule, RuleState& state, Trace& trace) {
  trace.entries.push_back(TraceEntry{.rule = rule.id, .event = TraceEvent::unsupported});
  state.retired = true;
}

void fire_rule(const ParsedRule& rule, const Match& match, RuleState& state, Forest& forest,
               Trace& trace) {
  if (!apply_rule(rule, match, forest)) {
    retire(rule, state, trace);
    return;
  }
  trace.entries.push_back(TraceEntry{.rule = rule.id});
  ++state.count;
  if (state.count >= kTreePassRuleCap) {
    trace.entries.push_back(TraceEntry{.rule = rule.id, .event = TraceEvent::capped});
    state.retired = true;
  }
}

// Fires the first rule, in file order, whose left side is not false. A rule whose left side is
// unknown, or does not parse, is retired and the forest stays as it was. False when none applies.
bool run_one_step(const std::vector<ParsedRule>& rules, std::vector<RuleState>& states,
                  Forest& forest, Trace& trace) {
  for (std::size_t i = 0; i < rules.size(); ++i) {
    if (states[i].retired) {
      continue;
    }
    if (!rules[i].valid) {
      retire(rules[i], states[i], trace);
      return true;
    }
    const std::optional<Found> found = find_match(rules[i], forest);
    if (!found) {
      continue;
    }
    if (found->value == Tri::Unknown) {
      retire(rules[i], states[i], trace);
    } else {
      fire_rule(rules[i], found->match, states[i], forest, trace);
    }
    return true;
  }
  return false;
}

TreeNode sentinel(std::string tag) {
  TreeNode node;
  node.features.emplace_back(std::move(tag), "");
  return node;
}

TreeNode word_node(Candidate&& candidate) {
  TreeNode node;
  node.surface = std::move(candidate.surface);
  node.attributes = std::move(candidate.attributes);
  for (Feature& feature : candidate.features) {
    if (feature.first == "att") {
      node.attributes.push_back(std::move(feature.second));
    } else {
      node.features.push_back(std::move(feature));
    }
  }
  return node;
}

// Every index the forest holds names a live node (ADR 0017, "A forest the pass can read").
bool readable(const Forest& forest) {
  const auto live = [&](std::size_t node) {
    return node < forest.nodes.size() && !forest.nodes[node].deleted;
  };
  return std::ranges::all_of(forest.list, live) &&
         std::ranges::all_of(forest.links, [&](const Link& link) {
           return live(link.from) && live(link.to) && live(link.scope);
         });
}

}  // namespace

Forest make_forest(std::vector<Candidate> nodes) {
  Forest forest;
  forest.nodes.reserve(nodes.size() + 2);
  forest.nodes.push_back(sentinel("SHEAD"));
  for (Candidate& candidate : nodes) {
    forest.nodes.push_back(word_node(std::move(candidate)));
  }
  forest.nodes.push_back(sentinel("STAIL"));
  forest.list.resize(forest.nodes.size());
  std::iota(forest.list.begin(), forest.list.end(), std::size_t{0});
  return forest;
}

TreeResult RuleInterpreter::analyse_tree(Forest forest, Trace& trace) const {
  if (!readable(forest)) {
    return TreeResult{.forest = std::move(forest), .status = Status::no_parse};
  }
  std::vector<ParsedRule> rules;
  rules.reserve(rules_.analysis().size());
  for (const GrammarRule& rule : rules_.analysis()) {
    rules.push_back(parse_rule(rule));
  }
  std::vector<RuleState> states(rules.size());
  while (run_one_step(rules, states, forest, trace)) {
  }
  return TreeResult{.forest = std::move(forest), .status = Status::ok};
}

Status read_graph(const Forest& forest, Graph& graph) {
  graph = Graph{};
  if (!readable(forest)) {
    return Status::no_parse;
  }
  constexpr auto kNone = static_cast<std::size_t>(-1);
  std::vector<std::size_t> index(forest.nodes.size(), kNone);
  for (std::size_t i = 0; i < forest.nodes.size(); ++i) {
    const TreeNode& node = forest.nodes[i];
    if (node.deleted) {
      continue;
    }
    const std::optional<std::string> uw = detail::first_value(node, kUwFeatureKey);
    if (!uw || uw->empty()) {
      continue;
    }
    index[i] = graph.nodes.size();
    graph.nodes.push_back(Node{.uw = *uw, .attributes = node.attributes});
  }
  for (const Link& link : forest.links) {
    if (link.label.empty() || link.label.front() < 'a' || link.label.front() > 'z' ||
        index[link.from] == kNone || index[link.to] == kNone) {
      continue;
    }
    graph.relations.push_back(
        Relation{.label = link.label, .from = index[link.from], .to = index[link.to]});
  }
  return Status::ok;
}

}  // namespace verstaan