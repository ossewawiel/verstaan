// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API. SPEC.md §3.4. Changing this file needs an ADR (engine/CLAUDE.md).
//
// Splits input text into a token list before dictionary lookup (issue 20) runs against it.
// docs/factory/issues/19-test-cases.md is the algorithm's source of truth.

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>
#include <vector>

namespace verstaan {

// A minimal, growable POS tagset. `none` is the only value this issue ever emits; issue 20's
// dictionary lookup adds real tags later without changing Token's shape.
enum class Pos : std::uint8_t { none };

// One token: a zero-copy slice of the caller's input, its byte offset from the start of that
// input, and an optional POS guess (always `Pos::none` in this issue).
struct Token {
  std::string_view surface;
  std::size_t offset = 0;
  std::optional<Pos> pos_guess;
};

// Splits `text` into tokens per docs/factory/issues/19-test-cases.md's split algorithm.
// Every `Token::surface` is a slice of `text`; the caller must keep `text` alive as long as the
// returned tokens are used.
[[nodiscard]] std::vector<Token> tokenise(std::string_view text);

}  // namespace verstaan
