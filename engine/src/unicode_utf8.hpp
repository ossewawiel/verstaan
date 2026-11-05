// SPDX-License-Identifier: MPL-2.0
// Internal to the engine. Strict UTF-8 for the capital test (docs/adr/0030).
#pragma once

#include <cstddef>
#include <string>
#include <string_view>

namespace verstaan {

// One UTF-8 code point: its value and byte length. `length` 0 means malformed.
struct Utf8CodePoint {
  char32_t code = 0;
  std::size_t length = 0;
};

// Decodes the code point at the start of `surface`. A cut sequence, a stray continuation byte,
// an overlong form, a surrogate and a value above U+10FFFF are malformed. Reads no byte past
// `surface`.
[[nodiscard]] Utf8CodePoint decode_leading_code_point(std::string_view surface);

// Appends `code` to `out` as UTF-8. `code` must be a valid scalar value.
void append_utf8(std::string& out, char32_t code);

}  // namespace verstaan
