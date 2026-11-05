// SPDX-License-Identifier: MPL-2.0
// Stub (issue 207, test-writer pass). The implementer replaces this with the strict decoder.
#include "unicode_utf8.hpp"

namespace verstaan {

Utf8CodePoint decode_leading_code_point(std::string_view surface) {
  if (surface.empty()) {
    return {};
  }
  // Wrong on purpose: reads every first byte as one valid code point, malformed or not.
  return {.code = static_cast<char32_t>(static_cast<unsigned char>(surface.front())), .length = 1};
}

void append_utf8(std::string& out, char32_t code) { out += static_cast<char>(code); }

}  // namespace verstaan
