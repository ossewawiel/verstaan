// SPDX-License-Identifier: MPL-2.0
// Internal to the engine. Unicode `Lu` test and simple lower-case mapping, no port dependency
// (docs/adr/0030).
#pragma once

namespace verstaan {

// True when `code` has general category `Lu`.
[[nodiscard]] bool is_upper_case(char32_t code);

// The simple lower-case mapping of an `Lu` code point, or 0 when it has none (or is not `Lu`).
[[nodiscard]] char32_t simple_lower_case(char32_t code);

}  // namespace verstaan
