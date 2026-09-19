// SPDX-License-Identifier: MPL-2.0
#include "verstaan/engine.hpp"

namespace verstaan {

Engine Engine::load(const RuleSet& rules) { return Engine(rules); }

Engine Engine::generated(Tier /*tier*/) { return {}; }

// Stays a const instance method per SPEC.md §3.4; issue 23 is the one that reads `rules_` here to
// return a real Status/Trace. Until then this reads it just enough to stay live code, not dead
// state -Wunused-private-field would otherwise catch.
Result Engine::translate(std::string_view /*text*/, Options /*options*/) const {
  (void)rules_;
  return {};
}

}  // namespace verstaan
