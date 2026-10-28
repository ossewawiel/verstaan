// SPDX-License-Identifier: MPL-2.0
#pragma once

// One line of `verstaan --trace` output (issue 180, docs/factory/issues/180-test-cases.md rows
// G40 to G43). Lives beside main.cpp, not in engine/include, so the public API stays as it is.

#include <string>

#include "verstaan/engine.hpp"

namespace verstaan::cli {

// The rule id alone for a `fired` entry, as the CLI printed before issue 180: `172`.
// The rule id, one space and the event name for any other entry: `1 capped`, `26 unsupported`.
[[nodiscard]] std::string trace_line(const TraceEntry& entry);

}  // namespace verstaan::cli
