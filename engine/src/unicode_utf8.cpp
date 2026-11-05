// SPDX-License-Identifier: MPL-2.0
#include "unicode_utf8.hpp"

#include <cstdint>

namespace verstaan {

namespace {

constexpr std::uint32_t kAsciiLimit = 0x80U;
constexpr std::uint32_t kContinuationTag = 0x80U;
constexpr std::uint32_t kContinuationMask = 0xC0U;
constexpr std::uint32_t kContinuationPayload = 0x3FU;
constexpr std::uint32_t kContinuationBits = 6U;

struct Sequence {
  std::uint32_t first_lead;  // lowest lead byte of this length
  std::uint32_t last_lead;   // highest lead byte of this length
  std::uint32_t lead_tag;    // the tag bits of the lead byte
  std::uint32_t lead_mask;   // the payload bits of the lead byte
  std::uint32_t min_code;    // smallest value this length may hold; below it the form is overlong
};

// Lead bytes C0 and C1 are absent: every value they could start is an overlong form.
constexpr Sequence kTwoBytes{
    .first_lead = 0xC2U,
    .last_lead = 0xDFU,
    .lead_tag = 0xC0U,
    .lead_mask = 0x1FU,
    .min_code = 0x80U,
};
constexpr Sequence kThreeBytes{
    .first_lead = 0xE0U,
    .last_lead = 0xEFU,
    .lead_tag = 0xE0U,
    .lead_mask = 0x0FU,
    .min_code = 0x800U,
};
constexpr Sequence kFourBytes{
    .first_lead = 0xF0U,
    .last_lead = 0xF4U,
    .lead_tag = 0xF0U,
    .lead_mask = 0x07U,
    .min_code = 0x10000U,
};

constexpr std::uint32_t kSurrogateFirst = 0xD800U;
constexpr std::uint32_t kSurrogateLast = 0xDFFFU;
constexpr std::uint32_t kMaxCode = 0x10FFFFU;

constexpr std::uint32_t kTwoByteLimit = 0x800U;
constexpr std::uint32_t kThreeByteLimit = 0x10000U;

constexpr std::size_t kTwoLength = 2;
constexpr std::size_t kThreeLength = 3;
constexpr std::size_t kFourLength = 4;

}  // namespace

Utf8CodePoint decode_leading_code_point(std::string_view surface) {
  if (surface.empty()) {
    return {};
  }
  const auto lead = static_cast<std::uint32_t>(static_cast<unsigned char>(surface.front()));
  if (lead < kAsciiLimit) {
    return {.code = static_cast<char32_t>(lead), .length = 1};
  }
  const Sequence* sequence = nullptr;
  std::size_t length = 0;
  if (lead >= kTwoBytes.first_lead && lead <= kTwoBytes.last_lead) {
    sequence = &kTwoBytes;
    length = kTwoLength;
  } else if (lead >= kThreeBytes.first_lead && lead <= kThreeBytes.last_lead) {
    sequence = &kThreeBytes;
    length = kThreeLength;
  } else if (lead >= kFourBytes.first_lead && lead <= kFourBytes.last_lead) {
    sequence = &kFourBytes;
    length = kFourLength;
  } else {
    return {};
  }
  if (surface.size() < length) {
    return {};
  }
  std::uint32_t code = lead & sequence->lead_mask;
  for (std::size_t k = 1; k < length; ++k) {
    const auto next = static_cast<std::uint32_t>(static_cast<unsigned char>(surface[k]));
    if ((next & kContinuationMask) != kContinuationTag) {
      return {};
    }
    code = (code << kContinuationBits) | (next & kContinuationPayload);
  }
  const bool surrogate = code >= kSurrogateFirst && code <= kSurrogateLast;
  if (code < sequence->min_code || code > kMaxCode || surrogate) {
    return {};
  }
  return {.code = static_cast<char32_t>(code), .length = length};
}

void append_utf8(std::string& out, char32_t code) {
  const auto value = static_cast<std::uint32_t>(code);
  const Sequence* sequence = &kFourBytes;
  std::size_t length = kFourLength;
  if (value < kAsciiLimit) {
    out += static_cast<char>(value);
    return;
  }
  if (value < kTwoByteLimit) {
    sequence = &kTwoBytes;
    length = kTwoLength;
  } else if (value < kThreeByteLimit) {
    sequence = &kThreeBytes;
    length = kThreeLength;
  }
  const std::uint32_t lead_shift = kContinuationBits * static_cast<std::uint32_t>(length - 1);
  out += static_cast<char>(sequence->lead_tag | (value >> lead_shift));
  for (std::size_t k = 1; k < length; ++k) {
    const std::uint32_t shift = kContinuationBits * static_cast<std::uint32_t>(length - 1 - k);
    out += static_cast<char>(kContinuationTag | ((value >> shift) & kContinuationPayload));
  }
}

}  // namespace verstaan
