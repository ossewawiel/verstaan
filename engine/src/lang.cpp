// SPDX-License-Identifier: MPL-2.0
#include "verstaan/lang.hpp"

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace verstaan {

namespace {

constexpr bool is_lower_ascii(unsigned char c) { return c >= 'a' && c <= 'z'; }

constexpr std::size_t kCodeLength = 3;
constexpr unsigned kByteBits = 8;
constexpr std::uint32_t kByteMask = 0xFF;
constexpr unsigned kTopByteShift = 24;  // Above the three code bytes: a valid code leaves it zero.

}  // namespace

std::optional<Lang> lang_from_iso3(std::string_view code) {
  if (code.size() != kCodeLength) {
    return std::nullopt;
  }
  std::uint32_t packed = 0;
  for (const char c : code) {
    if (!is_lower_ascii(static_cast<unsigned char>(c))) {
      return std::nullopt;
    }
    packed = (packed << kByteBits) | static_cast<unsigned char>(c);
  }
  return static_cast<Lang>(packed);
}

std::string iso3_of(Lang lang) {
  const auto packed = static_cast<std::uint32_t>(lang);
  std::string code;
  if ((packed >> kTopByteShift) != 0) {
    return {};
  }
  for (std::size_t i = kCodeLength; i > 0; --i) {
    const auto c = static_cast<unsigned char>((packed >> (kByteBits * (i - 1))) & kByteMask);
    if (!is_lower_ascii(c)) {
      return {};
    }
    code.push_back(static_cast<char>(c));
  }
  return code;
}

}  // namespace verstaan
