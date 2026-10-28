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

#include "verstaan/rule_interpreter.hpp"

namespace verstaan {
namespace {

// --- Rule representation. ---

// One test on one node: a tag, a feature pair, a pair whose value another node supplies, an entry
// `[text]` or a quoted string `"text"` against the surface, or a test the pass cannot read.
struct Cond {
  enum class Kind : std::uint8_t { Tag, Pair, PairRef, Literal, Str, Opaque };
  Kind kind = Kind::Tag;
  bool negate = false;
  std::string key;
  std::string value;  // Pair: the value. PairRef: the capture name.
};

struct LinkSpec;

// One item of a node pattern: a capture, a disjunction of AND-groups, or a link the node holds.
struct Item {
  enum class Kind : std::uint8_t { Capture, Alt, Link };
  Kind kind = Kind::Alt;
  std::string name;
  std::vector<std::vector<Cond>> alts;
  std::shared_ptr<LinkSpec> link;
};

using NodeSpec = std::vector<Item>;

// `LABEL(from;to)` on a left side. A side is a node pattern; an empty side matches any node.
struct LinkSpec {
  std::string label;  // a `/regex/` label keeps its slashes
  NodeSpec from;
  NodeSpec to;
};

// One right-side item that edits a node: `+F`, `-F`, `+K=V`, `+K=%x`, `+att=@v`, `+att=%x`.
struct Edit {
  bool remove = false;
  std::string key;
  std::string value;
  bool value_is_ref = false;  // `value` names a capture
};

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

struct Parse {
  bool ok = true;
  bool unsupported = false;
};

// --- Text helpers. A `"` toggles a quoted span; `(`, `[`, `{` open a nested span. ---

std::string_view trim(std::string_view s) {
  while (!s.empty() && (s.front() == ' ' || s.front() == '\t')) {
    s.remove_prefix(1);
  }
  while (!s.empty() && (s.back() == ' ' || s.back() == '\t')) {
    s.remove_suffix(1);
  }
  return s;
}

bool opens_span(char c) { return c == '(' || c == '[' || c == '{'; }
bool closes_span(char c) { return c == ')' || c == ']' || c == '}'; }

std::vector<std::string_view> split_top(std::string_view text, char delim) {
  std::vector<std::string_view> parts;
  int depth = 0;
  bool quoted = false;
  std::size_t start = 0;
  for (std::size_t i = 0; i < text.size(); ++i) {
    const char c = text[i];
    if (c == '"') {
      quoted = !quoted;
    } else if (!quoted && opens_span(c)) {
      ++depth;
    } else if (!quoted && closes_span(c)) {
      --depth;
    } else if (!quoted && depth == 0 && c == delim) {
      parts.push_back(trim(text.substr(start, i - start)));
      start = i + 1;
    }
  }
  parts.push_back(trim(text.substr(start)));
  return parts;
}

// The index of the `)` that closes the `(` at `open`, or npos.
std::size_t find_close(std::string_view text, std::size_t open) {
  int depth = 0;
  bool quoted = false;
  for (std::size_t i = open; i < text.size(); ++i) {
    if (text[i] == '"') {
      quoted = !quoted;
    } else if (!quoted && text[i] == '(') {
      ++depth;
    } else if (!quoted && text[i] == ')') {
      --depth;
      if (depth == 0) {
        return i;
      }
    }
  }
  return std::string_view::npos;
}

// One top-level piece of a left or right side: a parenthesised group (its inner text) or a link
// term (its whole text, label included).
struct Piece {
  bool group = false;
  std::string_view text;
};

std::optional<std::vector<Piece>> split_pieces(std::string_view text) {
  std::vector<Piece> pieces;
  std::size_t pos = 0;
  while (pos < text.size()) {
    if (text[pos] == ' ' || text[pos] == '\t') {
      ++pos;
      continue;
    }
    std::size_t search = pos;
    if (text[pos] == '/') {  // a regex label runs to the next `/`; a `(` inside is not an end list
      const std::size_t slash = text.find('/', pos + 1);
      if (slash == std::string_view::npos) {
        return std::nullopt;
      }
      search = slash + 1;
    }
    const std::size_t open = text.find('(', search);
    const std::size_t close =
        open == std::string_view::npos ? std::string_view::npos : find_close(text, open);
    if (close == std::string_view::npos) {
      return std::nullopt;
    }
    if (open == pos) {
      pieces.push_back(Piece{.group = true, .text = text.substr(open + 1, close - open - 1)});
    } else {
      pieces.push_back(Piece{.group = false, .text = text.substr(pos, close - pos + 1)});
    }
    pos = close + 1;
  }
  return pieces;
}

// The index of the `(` of a link term `LABEL(...)`, when `raw` is one.
std::optional<std::size_t> link_open(std::string_view raw) {
  static constexpr std::string_view kNotLabelStart = "^[{\"%+-";
  if (raw.size() < 3 || raw.back() != ')' ||
      kNotLabelStart.find(raw.front()) != std::string_view::npos) {
    return std::nullopt;
  }
  if (raw.front() == '/') {
    const std::size_t slash = raw.find('/', 1);
    if (slash == std::string_view::npos || slash + 1 >= raw.size() || raw[slash + 1] != '(') {
      return std::nullopt;
    }
    return slash + 1;
  }
  const std::size_t open = raw.find('(');
  if (open == std::string_view::npos || open == 0) {
    return std::nullopt;
  }
  return open;
}

// --- Left-side parsing. ---

Cond parse_cond(std::string_view raw) {
  raw = trim(raw);
  Cond cond;
  if (raw.starts_with('^')) {
    cond.negate = true;
    raw = trim(raw.substr(1));
  }
  if (raw.size() >= 2 && raw.front() == '"' && raw.back() == '"') {
    const std::string_view text = raw.substr(1, raw.size() - 2);
    const bool regex = text.size() >= 2 && text.front() == '/' && text.back() == '/';
    cond.kind = regex ? Cond::Kind::Opaque : Cond::Kind::Str;
    cond.key = std::string(text);
    return cond;
  }
  if (raw.starts_with("[[") || raw.starts_with('/')) {
    cond.kind = Cond::Kind::Opaque;  // a UW, or a regex in a tag
    return cond;
  }
  if (raw.size() >= 2 && raw.front() == '[' && raw.back() == ']') {
    cond.kind = Cond::Kind::Literal;
    cond.key = std::string(raw.substr(1, raw.size() - 2));
    return cond;
  }
  const std::size_t eq = raw.find('=');
  if (eq == std::string_view::npos) {
    cond.key = std::string(raw);
    return cond;
  }
  cond.key = std::string(trim(raw.substr(0, eq)));
  const std::string_view value = trim(raw.substr(eq + 1));
  if (value.starts_with('/')) {
    cond.kind = Cond::Kind::Opaque;  // a regex in a value
  } else if (value.starts_with('%')) {
    cond.kind = Cond::Kind::PairRef;
    cond.value = std::string(value.substr(1));
  } else {
    cond.kind = Cond::Kind::Pair;
    cond.value = std::string(value);
  }
  return cond;
}

LinkSpec parse_link(std::string_view raw, std::size_t open, Parse& parse);

NodeSpec parse_side(std::string_view raw, Parse& parse);

Item parse_item(std::string_view raw, Parse& parse) {
  raw = trim(raw);
  Item item;
  if (raw.starts_with('%')) {
    item.kind = Item::Kind::Capture;
    item.name = std::string(raw.substr(1));
    return item;
  }
  if (raw.size() >= 2 && raw.front() == '{' && raw.back() == '}') {
    for (const std::string_view alt : split_top(raw.substr(1, raw.size() - 2), '|')) {
      std::vector<Cond> conds;
      for (const std::string_view sub : split_top(alt, ',')) {
        conds.push_back(parse_cond(sub));
      }
      item.alts.push_back(std::move(conds));
    }
    return item;
  }
  if (const std::optional<std::size_t> open = link_open(raw)) {
    item.kind = Item::Kind::Link;
    item.link = std::make_shared<LinkSpec>(parse_link(raw, *open, parse));
    return item;
  }
  item.alts.push_back({parse_cond(raw)});
  return item;
}

NodeSpec parse_side(std::string_view raw, Parse& parse) {
  NodeSpec spec;
  for (const std::string_view part : split_top(raw, ',')) {
    if (!part.empty()) {
      spec.push_back(parse_item(part, parse));
    }
  }
  return spec;
}

LinkSpec parse_link(std::string_view raw, std::size_t open, Parse& parse) {
  LinkSpec spec;
  spec.label = std::string(trim(raw.substr(0, open)));
  const std::vector<std::string_view> ends =
      split_top(raw.substr(open + 1, raw.size() - open - 2), ';');
  if (ends.size() != 2) {
    parse.ok = false;
    return spec;
  }
  spec.from = parse_side(ends[0], parse);
  spec.to = parse_side(ends[1], parse);
  return spec;
}

// --- Right-side parsing. ---

Edit parse_edit(std::string_view raw) {
  raw = trim(raw);
  Edit edit;
  if (raw.starts_with('+')) {
    raw.remove_prefix(1);
  } else if (raw.starts_with('-')) {
    edit.remove = true;
    raw.remove_prefix(1);
  }
  const std::size_t eq = raw.find('=');
  if (eq == std::string_view::npos) {
    edit.key = std::string(trim(raw));
    return edit;
  }
  edit.key = std::string(trim(raw.substr(0, eq)));
  const std::string_view value = trim(raw.substr(eq + 1));
  edit.value_is_ref = !edit.remove && value.starts_with('%');
  edit.value = std::string(edit.value_is_ref ? value.substr(1) : value);
  return edit;
}

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

// --- Matching. A test has three values (ADR 0017): false, unknown (a test the pass cannot read) or
// true. An AND group takes the least, a disjunction the greatest, and `^` swaps true and false. ---

enum class Tri : std::uint8_t { False, Unknown, True };

Tri negated(Tri value) {
  if (value == Tri::True) {
    return Tri::False;
  }
  return value == Tri::False ? Tri::True : Tri::Unknown;
}

Tri from_bool(bool value) { return value ? Tri::True : Tri::False; }

struct Match {
  std::vector<std::pair<std::string, std::size_t>> caps;
  std::vector<std::size_t> window;  // node of each pattern position
  std::vector<std::size_t> held;    // links matched as "the node holds this link"
  std::vector<std::size_t> top;     // links matched by the top-level link terms
};

// The first place, in match order, whose value is not false.
struct Found {
  Tri value = Tri::False;
  Match match;
};

std::optional<std::size_t> find_cap(const Match& match, std::string_view name) {
  const auto it =
      std::ranges::find_if(match.caps, [&](const auto& cap) { return cap.first == name; });
  if (it == match.caps.end()) {
    return std::nullopt;
  }
  return it->second;
}

std::optional<std::string> first_value(const TreeNode& node, std::string_view key) {
  const auto it =
      std::ranges::find_if(node.features, [&](const Feature& f) { return f.first == key; });
  if (it == node.features.end()) {
    return std::nullopt;
  }
  return it->second;
}

bool has_tag(const TreeNode& node, std::string_view tag) {
  return std::ranges::any_of(node.features,
                             [&](const Feature& f) { return f.first == tag || f.second == tag; }) ||
         std::ranges::find(node.attributes, tag) != node.attributes.end() ||
         (tag == "att" && !node.attributes.empty());
}

bool has_pair(const TreeNode& node, const Feature& pair) {
  if (pair.first == "att") {
    return std::ranges::find(node.attributes, pair.second) != node.attributes.end();
  }
  return std::ranges::find(node.features, pair) != node.features.end();
}

Tri cond_holds(const Cond& cond, const Forest& forest, const TreeNode& node, const Match& match) {
  switch (cond.kind) {
    case Cond::Kind::Tag:
      return from_bool(has_tag(node, cond.key));
    case Cond::Kind::Pair:
      return from_bool(has_pair(node, Feature{cond.key, cond.value}));
    case Cond::Kind::Literal:
    case Cond::Kind::Str:
      return from_bool(node.surface == cond.key);
    case Cond::Kind::Opaque:
      return Tri::Unknown;
    case Cond::Kind::PairRef: {
      const std::optional<std::size_t> ref = find_cap(match, cond.value);
      if (!ref) {
        return Tri::False;
      }
      const std::optional<std::string> value = first_value(forest.nodes[*ref], cond.key);
      return from_bool(value.has_value() && has_pair(node, Feature{cond.key, *value}));
    }
  }
  return Tri::False;
}

Tri cond_matches(const Cond& cond, const Forest& forest, const TreeNode& node, const Match& match) {
  const Tri value = cond_holds(cond, forest, node, match);
  return cond.negate ? negated(value) : value;
}

Tri match_link(const LinkSpec& spec, const Forest& forest, std::size_t index, Match& match);

Tri match_spec(const NodeSpec& spec, const Forest& forest, std::size_t node, Match& match);

// Does `node` hold a link that matches `spec`? The link's scope is the node. True when one link is
// true, else unknown when one is unknown.
Tri match_held(const LinkSpec& spec, const Forest& forest, std::size_t node, Match& match) {
  std::optional<Match> unknown;
  for (std::size_t index = 0; index < forest.links.size(); ++index) {
    if (forest.links[index].scope != node) {
      continue;
    }
    Match trial = match;
    const Tri value = match_link(spec, forest, index, trial);
    if (value == Tri::True) {
      trial.held.push_back(index);
      match = std::move(trial);
      return Tri::True;
    }
    if (value == Tri::Unknown && !unknown) {
      unknown = std::move(trial);
    }
  }
  if (unknown) {
    match = std::move(*unknown);
    return Tri::Unknown;
  }
  return Tri::False;
}

Tri match_item(const Item& item, const Forest& forest, std::size_t node, Match& match) {
  const TreeNode& target = forest.nodes[node];
  switch (item.kind) {
    case Item::Kind::Capture: {
      const std::optional<std::size_t> bound = find_cap(match, item.name);
      if (bound) {
        return from_bool(*bound == node);
      }
      match.caps.emplace_back(item.name, node);
      return Tri::True;
    }
    case Item::Kind::Alt: {
      Tri any = Tri::False;
      for (const std::vector<Cond>& conds : item.alts) {
        Tri all = Tri::True;
        for (const Cond& cond : conds) {
          all = std::min(all, cond_matches(cond, forest, target, match));
          if (all == Tri::False) {
            break;
          }
        }
        any = std::max(any, all);
      }
      return any;
    }
    case Item::Kind::Link:
      return match_held(*item.link, forest, node, match);
  }
  return Tri::False;
}

Tri match_spec(const NodeSpec& spec, const Forest& forest, std::size_t node, Match& match) {
  Tri all = Tri::True;
  for (const Item& item : spec) {
    all = std::min(all, match_item(item, forest, node, match));
    if (all == Tri::False) {
      break;
    }
  }
  return all;
}

// The regex subset of a label: a sequence of atoms, each one letter, digit or `_`, or a class
// `[...]` of such characters. Anything else makes the label unreadable.
bool word_char(char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
}

// Splits `body` into atoms (each the characters it accepts); nullopt when `body` leaves the subset.
std::optional<std::vector<std::string_view>> regex_atoms(std::string_view body) {
  std::vector<std::string_view> atoms;
  while (!body.empty()) {
    if (body.front() == '[') {
      const std::size_t close = body.find(']');
      if (close == std::string_view::npos || close == 1) {
        return std::nullopt;
      }
      const std::string_view chars = body.substr(1, close - 1);
      if (!std::ranges::all_of(chars, word_char)) {
        return std::nullopt;
      }
      atoms.push_back(chars);
      body.remove_prefix(close + 1);
    } else if (word_char(body.front())) {
      atoms.push_back(body.substr(0, 1));
      body.remove_prefix(1);
    } else {
      return std::nullopt;
    }
  }
  if (atoms.empty()) {
    return std::nullopt;
  }
  return atoms;
}

// A `/regex/` label must match the whole link label, one atom per character.
Tri label_matches(const LinkSpec& spec, const Link& link) {
  const std::string_view pattern = spec.label;
  if (pattern.size() < 2 || pattern.front() != '/' || pattern.back() != '/') {
    return from_bool(link.label == pattern);
  }
  const auto atoms = regex_atoms(pattern.substr(1, pattern.size() - 2));
  if (!atoms) {
    return Tri::Unknown;
  }
  if (atoms->size() != link.label.size()) {
    return Tri::False;
  }
  for (std::size_t i = 0; i < atoms->size(); ++i) {
    if ((*atoms)[i].find(link.label[i]) == std::string_view::npos) {
      return Tri::False;
    }
  }
  return Tri::True;
}

Tri match_link(const LinkSpec& spec, const Forest& forest, std::size_t index, Match& match) {
  const Link& link = forest.links[index];
  Tri value = label_matches(spec, link);
  if (value == Tri::False) {
    return value;
  }
  Match trial = match;
  value = std::min(value, match_spec(spec.from, forest, link.from, trial));
  if (value != Tri::False) {
    value = std::min(value, match_spec(spec.to, forest, link.to, trial));
  }
  if (value != Tri::False) {
    match = std::move(trial);
  }
  return value;
}

Tri match_nodes(const ParsedRule& rule, const Forest& forest,
                const std::vector<std::size_t>& window, Match& match) {
  Tri all = Tri::True;
  for (std::size_t i = 0; i < window.size() && all != Tri::False; ++i) {
    all = std::min(all, match_spec(rule.pattern[i], forest, window[i], match));
  }
  match.window = window;
  return all;
}

// --- Match order (ADR 0017). Visit order walks the list left to right and, at each node, the nodes
// its links hold, top-down. Live nodes the walk misses follow in arena order. ---

struct Walk {
  const Forest& forest;
  std::vector<bool> seen;
  std::vector<std::size_t> order;

  void visit(std::size_t node) {
    if (seen[node] || forest.nodes[node].deleted) {
      return;
    }
    seen[node] = true;
    order.push_back(node);
    for (const Link& link : forest.links) {
      if (link.scope == node) {
        visit(link.from);
        visit(link.to);
      }
    }
  }
};

std::vector<std::size_t> visit_order(const Forest& forest) {
  Walk walk{.forest = forest, .seen = std::vector<bool>(forest.nodes.size(), false), .order = {}};
  for (const std::size_t node : forest.list) {
    walk.visit(node);
  }
  for (std::size_t node = 0; node < forest.nodes.size(); ++node) {
    walk.visit(node);
  }
  return walk.order;
}

// Link indexes, top-down: by the position of the scope in visit order, graph order within a scope.
std::vector<std::size_t> link_order(const Forest& forest) {
  const std::vector<std::size_t> order = visit_order(forest);
  std::vector<std::size_t> rank(forest.nodes.size(), 0);
  for (std::size_t i = 0; i < order.size(); ++i) {
    rank[order[i]] = i;
  }
  std::vector<std::size_t> links(forest.links.size());
  std::iota(links.begin(), links.end(), std::size_t{0});
  std::ranges::stable_sort(links, [&](std::size_t a, std::size_t b) {
    return rank[forest.links[a].scope] < rank[forest.links[b].scope];
  });
  return links;
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
    found.value = match_nodes(rule, forest, window, found.match);
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

void add_feature(TreeNode& node, Feature feature) {
  if (std::ranges::find(node.features, feature) == node.features.end()) {
    node.features.push_back(std::move(feature));
  }
}

void add_attribute(TreeNode& node, const std::string& attribute) {
  if (std::ranges::find(node.attributes, attribute) == node.attributes.end()) {
    node.attributes.push_back(attribute);
  }
}

void remove_tag(TreeNode& node, const std::string& tag) {
  if (tag == "att") {
    node.attributes.clear();
    return;
  }
  std::erase_if(node.features, [&](const Feature& f) { return f.first == tag || f.second == tag; });
  std::erase(node.attributes, tag);
}

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

}  // namespace verstaan
