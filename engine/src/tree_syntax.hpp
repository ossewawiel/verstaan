// SPDX-License-Identifier: MPL-2.0
#pragma once

// Internal header (not public API). The transformation-grammar left-side syntax and its matcher,
// shared by the analysis tree pass (tree_pass.cpp, ADR 0017) and the generation pass
// (generation.cpp, ADR 0021). docs/unl-reference/formats/transformation-grammar.md is the syntax.

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "verstaan/rule_interpreter.hpp"

namespace verstaan::detail {

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

struct Parse {
  bool ok = true;
  bool unsupported = false;
};

// One top-level piece of a left or right side: a parenthesised group (its inner text) or a link
// term (its whole text, label included).
struct Piece {
  bool group = false;
  std::string_view text;
};

// A test has three values (ADR 0017): false, unknown (a test the pass cannot read) or true. An AND
// group takes the least, a disjunction the greatest, and `^` swaps true and false.
enum class Tri : std::uint8_t { False, Unknown, True };

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

// --- Text helpers. A `"` toggles a quoted span; `(`, `[`, `{` open a nested span. ---
[[nodiscard]] std::string_view trim(std::string_view s);
[[nodiscard]] std::vector<std::string_view> split_top(std::string_view text, char delim);
[[nodiscard]] std::optional<std::vector<Piece>> split_pieces(std::string_view text);
// The index of the `(` of a link term `LABEL(...)`, when `raw` is one.
[[nodiscard]] std::optional<std::size_t> link_open(std::string_view raw);

// --- Left-side and edit parsing. ---
[[nodiscard]] NodeSpec parse_side(std::string_view raw, Parse& parse);
[[nodiscard]] LinkSpec parse_link(std::string_view raw, std::size_t open, Parse& parse);
[[nodiscard]] Edit parse_edit(std::string_view raw);

// --- Matching. ---
[[nodiscard]] std::optional<std::size_t> find_cap(const Match& match, std::string_view name);
[[nodiscard]] std::optional<std::string> first_value(const TreeNode& node, std::string_view key);
[[nodiscard]] bool has_tag(const TreeNode& node, std::string_view tag);
[[nodiscard]] Tri match_spec(const NodeSpec& spec, const Forest& forest, std::size_t node,
                             Match& match);
[[nodiscard]] Tri match_link(const LinkSpec& spec, const Forest& forest, std::size_t index,
                             Match& match);
[[nodiscard]] Tri match_nodes(const std::vector<NodeSpec>& pattern, const Forest& forest,
                              const std::vector<std::size_t>& window, Match& match);

// Visit order walks the list left to right and, at each node, the nodes its links hold, top-down.
// Live nodes the walk misses follow in arena order (ADR 0017).
[[nodiscard]] std::vector<std::size_t> visit_order(const Forest& forest);
// Link indexes, top-down: by the position of the scope in visit order, graph order within a scope.
[[nodiscard]] std::vector<std::size_t> link_order(const Forest& forest);

// --- Node edits. ---
void add_feature(TreeNode& node, Feature feature);
void add_attribute(TreeNode& node, const std::string& attribute);
void remove_tag(TreeNode& node, const std::string& tag);

}  // namespace verstaan::detail
