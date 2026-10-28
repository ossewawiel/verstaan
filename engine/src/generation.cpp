// SPDX-License-Identifier: MPL-2.0
//
// engine/src/generation.cpp -- the generation pass of ADR 0021 (issue 181):
// `RuleInterpreter::generate`, which turns a UNL graph into target-language text by running
// grammar/generation.yaml over a forest built from the graph, and
// `RuleInterpreter::disambiguate_target`, which runs the target's grammar/disambiguation.yaml over
// the generated word list. docs/factory/issues/181-test-cases.md is the source of truth for both.
//
// Stubs (docs/standards/testing.md): each body returns Status::not_implemented or changes nothing,
// so every row of block N that asserts a real result fails until the implementer fills them.

#include <string>
#include <vector>

#include "verstaan/rule_interpreter.hpp"

namespace verstaan {

GenerationResult RuleInterpreter::generate(const Graph& /*graph*/, const Dictionary& /*target*/,
                                           const std::vector<std::string>& /*source_surfaces*/,
                                           Lang /*target_language*/, Trace& /*trace*/) const {
  return GenerationResult{};
}

void RuleInterpreter::disambiguate_target(std::vector<Position>& /*positions*/,
                                          Lang /*target_language*/, Trace& /*trace*/) const {}

}  // namespace verstaan
