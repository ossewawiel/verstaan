// SPDX-License-Identifier: MPL-2.0
#pragma once

// Internal header (not public API). The inflection grammar's branch syntax, shared by
// rule_interpreter.cpp and generation.cpp.

#include <string_view>
#include <utility>
#include <vector>

namespace verstaan::detail {

// Splits a paradigm's rhs, `VALUE:=a-rule;VALUE:=a-rule;...`, into (VALUE, a-rule) pairs, quote-
// aware so a `;` or `:=` inside a quoted find/replace string never splits early. `VALUE` is the
// `&`-joined tag list (`PLR`, `3PS&PRS`).
[[nodiscard]] std::vector<std::pair<std::string_view, std::string_view>> split_inflection_branches(
    std::string_view rhs);

}  // namespace verstaan::detail
