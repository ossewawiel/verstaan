// SPDX-License-Identifier: MPL-2.0
#include "verstaan/engine.hpp"

namespace verstaan {

Engine Engine::load(const RuleSet& /*rules*/) { return {}; }

Engine Engine::generated(Tier /*tier*/) { return {}; }

// Stays a const instance method per SPEC.md §3.4; the M0 stub does not yet read `this`, a real
// implementation will.
// NOLINTNEXTLINE(readability-convert-member-functions-to-static)
Result Engine::translate(std::string_view /*text*/, Options /*options*/) const { return {}; }

}  // namespace verstaan
