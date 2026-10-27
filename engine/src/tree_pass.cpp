// SPDX-License-Identifier: MPL-2.0
//
// engine/src/tree_pass.cpp -- the tree pass of ADR 0017 (issue 194): `make_forest`, the hand-over
// from disambiguation, and `RuleInterpreter::analyse_tree`.
//
// Stub for the `test(#194)` commit (docs/standards/testing.md: prove a gate fails first). Both
// bodies fire nothing: `make_forest` returns an empty Forest and `analyse_tree` returns its input
// with `Status::not_implemented`, so every row of docs/factory/issues/194-test-cases.md, block T,
// is red. The work commit replaces this file with the pass.

#include <utility>
#include <vector>

#include "verstaan/rule_interpreter.hpp"

namespace verstaan {

// The pass moves each Candidate out of `nodes`; the stub reads none, so clang-tidy would ask for a
// const reference, which would change the public signature.
// NOLINTNEXTLINE(performance-unnecessary-value-param)
Forest make_forest(std::vector<Candidate> /*nodes*/) { return {}; }

// The pass reads `rules_`; the stub does not, so clang-tidy would ask for `static`.
// NOLINTNEXTLINE(readability-convert-member-functions-to-static)
TreeResult RuleInterpreter::analyse_tree(Forest forest, Trace& /*trace*/) const {
  return TreeResult{.forest = std::move(forest), .status = Status::not_implemented};
}

}  // namespace verstaan
