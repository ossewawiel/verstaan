// SPDX-License-Identifier: MPL-2.0
//
// engine/src/tree_syntax.cpp -- the transformation-grammar left-side parser and matcher that the
// analysis tree pass (ADR 0017, issue 194) and the generation pass (ADR 0021, issue 181) share.
// Moved out of tree_pass.cpp unchanged in behaviour. Syntax:
// docs/unl-reference/formats/transformation-grammar.md.

#include "tree_syntax.hpp"

#include <algorithm>
#include <cstddef>
#include <numeric>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace verstaan::detail {

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

static bool opens_span(char c) { return c == '(' || c == '[' || c == '{'; }
static bool closes_span(char c) { return c == ')' || c == ']' || c == '}'; }

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
static std::size_t find_close(std::string_view text, std::size_t open) {
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

static Cond parse_cond(std::string_view raw) {
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

static Item parse_item(std::string_view raw, Parse& parse) {
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

static Tri negated(Tri value) {
  if (value == Tri::True) {
    return Tri::False;
  }
  return value == Tri::False ? Tri::True : Tri::Unknown;
}

static Tri from_bool(bool value) { return value ? Tri::True : Tri::False; }

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

static bool has_pair(const TreeNode& node, const Feature& pair) {
  if (pair.first == "att") {
    return std::ranges::find(node.attributes, pair.second) != node.attributes.end();
  }
  return std::ranges::find(node.features, pair) != node.features.end();
}

static Tri cond_holds(const Cond& cond, const Forest& forest, const TreeNode& node,
                      const Match& match) {
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

static Tri cond_matches(const Cond& cond, const Forest& forest, const TreeNode& node,
                        const Match& match) {
  const Tri value = cond_holds(cond, forest, node, match);
  return cond.negate ? negated(value) : value;
}

// Does `node` hold a link that matches `spec`? The link's scope is the node. True when one link is
// true, else unknown when one is unknown.
static Tri match_held(const LinkSpec& spec, const Forest& forest, std::size_t node, Match& match) {
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

static Tri match_item(const Item& item, const Forest& forest, std::size_t node, Match& match) {
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
static bool word_char(char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
}

// Splits `body` into atoms (each the characters it accepts); nullopt when `body` leaves the subset.
static std::optional<std::vector<std::string_view>> regex_atoms(std::string_view body) {
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
static Tri label_matches(const LinkSpec& spec, const Link& link) {
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

Tri match_nodes(const std::vector<NodeSpec>& pattern, const Forest& forest,
                const std::vector<std::size_t>& window, Match& match) {
  Tri all = Tri::True;
  for (std::size_t i = 0; i < window.size() && all != Tri::False; ++i) {
    all = std::min(all, match_spec(pattern[i], forest, window[i], match));
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

}  // namespace verstaan::detail
