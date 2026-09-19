// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API addition (same precedent as verstaan/rule_set.hpp). Applies one RuleSet's grammar to
// hand-built input: disambiguation (grammar/disambiguation.yaml), analysis (grammar/analysis.yaml,
// eng to UNL) and inflection (grammar/inflection.yaml, either direction). Every rule fired is
// appended to a Trace, in firing order, per SPEC.md §3.4 ("Trace lists every rule fired in
// order"). docs/factory/issues/22-rule-interpreter-on-runtime-tables.md.

#include <string>
#include <string_view>
#include <vector>

#include "verstaan/dictionary.hpp"  // Feature
#include "verstaan/engine.hpp"      // Trace, TraceEntry
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
  [[nodiscard]] std::vector<Candidate> analyse(std::vector<Candidate> nodes, Trace& trace) const;

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
