// SPDX-License-Identifier: MPL-2.0
#include "verstaan/tokeniser.hpp"

#include <cstddef>
#include <optional>
#include <string_view>
#include <vector>

namespace verstaan {
namespace {

// docs/factory/issues/19-test-cases.md, "Split algorithm": the three byte classes the
// scanner tests against, plus word-character-by-exclusion (every other byte, including UTF-8
// continuation/lead bytes).

constexpr char kSpace = ' ';
constexpr char kTab = '\t';
constexpr char kNewline = '\n';
constexpr char kCarriageReturn = '\r';

bool is_whitespace_byte(char byte) {
  return byte == kSpace || byte == kTab || byte == kNewline || byte == kCarriageReturn;
}

bool is_split_punctuation_byte(char byte) {
  return byte == '.' || byte == ',' || byte == '!' || byte == '?' || byte == ';' || byte == ':';
}

bool is_apostrophe_byte(char byte) { return byte == '\''; }

bool is_word_byte(char byte) {
  return !is_whitespace_byte(byte) && !is_split_punctuation_byte(byte) && !is_apostrophe_byte(byte);
}

}  // namespace

std::vector<Token> tokenise(std::string_view text) {
  std::vector<Token> tokens;
  std::optional<std::size_t> token_start;

  const auto close_token = [&](std::size_t end) {
    if (token_start.has_value()) {
      tokens.push_back(Token{
          .surface = text.substr(*token_start, end - *token_start),
          .offset = *token_start,
          .pos_guess = Pos::none,
      });
      token_start.reset();
    }
  };

  const std::size_t size = text.size();
  for (std::size_t i = 0; i < size; ++i) {
    const char byte = text[i];

    if (is_whitespace_byte(byte)) {
      // Rule 1: a run of whitespace closes the open token and is itself consumed.
      close_token(i);
      continue;
    }

    if (is_split_punctuation_byte(byte)) {
      // Rule 2: the punctuation byte closes the open token, then stands as its own token.
      close_token(i);
      tokens.push_back(Token{.surface = text.substr(i, 1), .offset = i, .pos_guess = Pos::none});
      continue;
    }

    if (is_apostrophe_byte(byte)) {
      // Rule 3: classify the byte before (L) and after (R) the apostrophe as word or boundary.
      const bool left_is_word = i > 0 && is_word_byte(text[i - 1]);
      const bool right_is_word = i + 1 < size && is_word_byte(text[i + 1]);

      if (left_is_word && right_is_word) {
        // 3a: content. The token in progress already spans up to this byte; keep it open so the
        // slice at close time includes the apostrophe.
        continue;
      }
      if (left_is_word && !right_is_word) {
        // 3b: trailing, boundary-facing. Close without the apostrophe, then emit it alone.
        close_token(i);
        tokens.push_back(Token{.surface = text.substr(i, 1), .offset = i, .pos_guess = Pos::none});
        continue;
      }
      if (!left_is_word && right_is_word) {
        // 3c: leading, attaches to what follows. Open a new token on the apostrophe itself.
        close_token(i);
        token_start = i;
        continue;
      }
      // 3d: isolated apostrophe (boundary on both sides). Emit it alone.
      close_token(i);
      tokens.push_back(Token{.surface = text.substr(i, 1), .offset = i, .pos_guess = Pos::none});
      continue;
    }

    // Rule 4: any other byte extends the token in progress, opening one first if none is open.
    if (!token_start.has_value()) {
      token_start = i;
    }
  }

  // Rule 5: end of text closes whatever token is open.
  close_token(size);

  return tokens;
}

}  // namespace verstaan
