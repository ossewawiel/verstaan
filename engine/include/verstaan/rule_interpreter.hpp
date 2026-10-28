// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API addition (same precedent as verstaan/rule_set.hpp). Applies one RuleSet's grammar to
// hand-built input: disambiguation (grammar/disambiguation.yaml), analysis (grammar/analysis.yaml,
// eng to UNL) and inflection (grammar/inflection.yaml, either direction). Every rule fired is
// appended to a Trace, in firing order, per SPEC.md §3.4 ("Trace lists every rule fired in
// order"). docs/factory/issues/22-rule-interpreter-on-runtime-tables.md.
//
// Issue 194 adds the tree pass: Forest, make_forest and RuleInterpreter::analyse_tree. ADR 0017
// (docs/adr/) records its run order, its node shape and the hand-over from disambiguation. The
// `TraceEvent` field it needs lives on TraceEntry, in engine.hpp.

#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

#include "verstaan/dictionary.hpp"  // Feature
#include "verstaan/engine.hpp"      // Status, Trace, TraceEntry, TraceEvent
#include "verstaan/rule_set.hpp"

namespace verstaan {

// One candidate reading of one sentence position: a dictionary-style flat feature set (reusing
// `Feature`, verstaan/dictionary.hpp, rather than inventing a second key/value shape) plus the
// UNL attributes an analysis rule has attached so far (e.g. "@pl", "@present", "@not").
struct Candidate {
  std::string surface;
  std::vector<Feature> features;
  std::vector<std::string> attributes;
};

// One sentence position: every surviving candidate reading. More than one candidate marks a
// homograph the dictionary lookup (issue 20) left unresolved; `disambiguate()` prunes it down.
struct Position {
  std::vector<Candidate> candidates;
};

// --- The tree pass (ADR 0017, issue 194). ---

// The most times one rule may fire in one tree pass. The firing that reaches the cap is followed
// by `TraceEntry{rule.id, TraceEvent::capped}`, and the rule is retired for the rest of the pass.
// Every rule is bounded, so the pass always ends (ADR 0017).
inline constexpr std::size_t kTreePassRuleCap = 1024;

// One node of a Forest: a word, a sentinel (SHEAD, STAIL) or a hyper-node. A word starts as a
// copy of its Candidate, except that every `att` feature value moves into `attributes`. A
// hyper-node is a node a right-side group made around a link term; it has no surface and holds
// the links whose `scope` names it. The tag test reads a node's own features and attributes,
// never those of the nodes inside it.
struct TreeNode {
  std::string surface;
  std::vector<Feature> features;        // a bare tag is {tag, ""}, e.g. {"proj", ""}
  std::vector<std::string> attributes;  // UNL attributes, e.g. "@indef"; the `att` tag tests these
  bool deleted = false;                 // set only by a list rule; link rules never delete a node
};

// One labelled edge between two Forest nodes: a syntactic link (NB, XB, NA) or, once an
// interpretation rule relabels it, a UNL relation (mod). Issue 180 copies the UNL ones into
// Graph::relations. All indices are into Forest::nodes.
struct Link {
  std::string label;
  std::size_t from = 0;     // the head
  std::size_t to = 0;       // the dependent
  std::size_t scope = 0;    // the hyper-node that holds this link
  std::string built_by;     // id of the rule that created the link, e.g. "50"
  std::string labelled_by;  // id of the rule that last wrote `label`, e.g. "172"
};

// The tree pass's working structure: list, then tree, then network, in one shape.
// `make_forest` lays it out as nodes[0] = SHEAD, nodes[1..n] = the n words in input order,
// nodes[n+1] = STAIL; every node a rule creates is appended after STAIL. An index never moves.
// A sentinel has an empty surface and one bare tag: {"SHEAD", ""} or {"STAIL", ""}.
struct Forest {
  std::vector<TreeNode> nodes;
  std::vector<std::size_t> list;  // the top-level list, left to right, SHEAD first, STAIL last
  std::vector<Link> links;        // every link, in graph order: a relabel keeps its place
};

// What `RuleInterpreter::analyse_tree` returns. `status` is `ok` once the pass has run to its
// end, capped or unsupported rules included; the trace says which rules those were. It is
// `no_parse` when the input forest holds an index out of range or one that names a deleted node;
// the pass then runs no rule and returns the forest unchanged (ADR 0017).
struct TreeResult {
  Forest forest;
  Status status = Status::no_parse;
};

// The hand-over from disambiguation to the tree pass (ADR 0017). Wraps the disambiguated list in
// the SHEAD and STAIL sentinels, copies each Candidate into a word node, and moves every `att`
// feature value into that node's `attributes`. Makes no link.
[[nodiscard]] Forest make_forest(std::vector<Candidate> nodes);

// The feature key under which `Engine::translate` carries a word's UW through a Candidate and a
// TreeNode: `{"$uw", "102870092"}`. A closed-class word carries `{"$uw", ""}`; a word with no
// dictionary entry and no name literal carries no `$uw` feature. No grammar rule reads it.
inline constexpr std::string_view kUwFeatureKey = "$uw";

// The hand-over from the tree pass to the UNL graph (issue 180,
// docs/factory/issues/180-test-cases.md). Clears `graph`, then fills it from `forest`:
//   - `graph.nodes`: one Node per graph node, in arena order. A graph node is a live forest node
//     whose `$uw` feature is present and not empty. Its Node takes that UW and the node's
//     `attributes`, in order. A closed-class word, a sentinel, a hyper-node and a word with no
//     UW are not graph nodes.
//   - `graph.relations`: one Relation per UNL link, in graph order. A UNL link is a link whose
//     label starts with a lower-case letter `a` to `z` (`mod`, `or`, `to`) and whose `from` and
//     `to` both name graph nodes. `Relation::from` is the head, `Relation::to` the dependent, both
//     as indices into `graph.nodes`. Any other link is not copied.
// Returns `Status::ok`. Returns `Status::no_parse`, and leaves `graph` empty, when `forest` fails
// ADR 0017's readability check.
[[nodiscard]] Status read_graph(const Forest& forest, Graph& graph);

// Applies one RuleSet's disambiguation and analysis rules, and one paradigm at a time from either
// of its inflection lists, against hand-built input. Read-only over its RuleSet; the RuleSet
// outlives every RuleInterpreter built from it.
class RuleInterpreter {
 public:
  explicit RuleInterpreter(const RuleSet& rules) : rules_(rules) {}

  // grammar/disambiguation.yaml, applied one rule at a time, in file order. Every D-rule match
  // deletes the one candidate reading that made it match, at whichever position in the matched
  // window still carried more than one candidate (docs/unl-reference/formats/disambiguation.md:
  // "a D-rule only ever prunes readings"). Appends one `TraceEntry{rule.id}` per rule that deleted
  // at least one candidate.
  //
  // An empty rule list -- issue 21's decided eng-empty fallback
  // (docs/unl-reference/formats/disambiguation.md, "Where eng has no export") -- prunes every
  // position with more than one candidate down to its first candidate, in the order the caller
  // supplied it: "this language has no disambiguation rules, so the first candidate sense for
  // each word wins, in dictionary order." Never crashes and never drops a position to zero
  // candidates.
  void disambiguate(std::vector<Position>& positions, Trace& trace) const;

  // grammar/analysis.yaml, applied one rule at a time, in file order, each rule making one
  // non-overlapping left-to-right pass over `nodes`. A matched rule's right side can add
  // attributes to a node, merge two nodes into one (an index shared between a left-side node and
  // the surviving right-side node), or delete a node outright (a left-side node no right-side
  // group refers to), per docs/unl-reference/formats/transformation-grammar.md's `LL RULE` shape.
  // Appends one `TraceEntry{rule.id}` per firing (a rule already matching more than one window in
  // one pass appends once per window).
  //
  // The flat pass. It cannot build a tree, and it reads a link term such as `NA(%x;%y)` as a
  // one-node pattern, so it appends trace entries for rules 80 to 176 that change nothing. The
  // analysis pipeline moves to `analyse_tree` in issue 180 (ADR 0017).
  [[nodiscard]] std::vector<Candidate> analyse(std::vector<Candidate> nodes, Trace& trace) const;

  // The tree pass (ADR 0017). Runs every rule of grammar/analysis.yaml over `forest` in the
  // archive's order: at each step the first rule in file order whose left side matches fires
  // once, at its first match, and the scan starts again from the first rule. The pass ends when
  // no rule matches. First match: the leftmost window of `Forest::list` for a pattern of two or
  // more nodes; the first live node in visit order for a one-node pattern; the first link in link
  // order for a link pattern. Visit order walks `Forest::list` left to right and, at each node,
  // the nodes its links hold, top-down; live nodes the walk misses follow in arena order. Link
  // order sorts links by their scope's place in visit order, graph order within one scope.
  //
  // A left-side test the pass cannot read (a quoted regex, a UW, a label regex outside the
  // subset ADR 0017 names, a rule that does not parse) is unknown, never true or false.
  //
  // Appends `TraceEntry{rule.id}` per firing. A rule that fires kTreePassRuleCap times gets one
  // `TraceEvent::capped` entry and is retired. A rule whose first place not false is unknown, or
  // whose right side the pass cannot apply, gets one `TraceEvent::unsupported` entry and is
  // retired; the forest after that entry is equal to the forest before the rule matched. Checks
  // `forest` first and returns it unchanged with `Status::no_parse` when it is not readable.
  [[nodiscard]] TreeResult analyse_tree(Forest forest, Trace& trace) const;

  // Selects `from_inflection()` when `from_language` is true, `to_inflection()` otherwise, finds
  // the paradigm named `paradigm_id`, and applies whichever of its branches names `attribute`
  // exactly (e.g. "PLR", "PAS", "3PS&PRS") to `base_form`
  // (docs/unl-reference/formats/inflection.md's `<RULE>` syntax). Appends `TraceEntry{paradigm_id}`
  // to `trace` and returns the affixed form when the paradigm and branch both exist; returns
  // `base_form` unchanged, appending nothing, when either is missing -- never throws.
  [[nodiscard]] std::string inflect(std::string_view paradigm_id, std::string_view attribute,
                                    std::string_view base_form, bool from_language,
                                    Trace& trace) const;

 private:
  const RuleSet& rules_;
};

}  // namespace verstaan
