// Tokeniser unit tests (docs/standards/testing.md: "fast"). Every row is transcribed from
// docs/factory/issues/19-test-cases.md's two token tables (15 English + 15 Afrikaans) plus
// its two synthetic English apostrophe fixtures, S1 and S2. Do not re-derive expected tokens from
// the tokeniser under test; the design note is the source of truth.

#include "verstaan/tokeniser.hpp"

#include <gtest/gtest.h>

#include <string_view>
#include <vector>

namespace verstaan {
namespace {

// Asserts token count and every surface form, in order, against `expected`.
void ExpectTokens(std::string_view input, const std::vector<std::string_view>& expected) {
  const std::vector<Token> tokens = tokenise(input);
  ASSERT_EQ(tokens.size(), expected.size()) << "input: " << input;
  for (std::size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(tokens[i].surface, expected[i]) << "input: " << input << ", token index: " << i;
  }
}

// --- English fixed sentences (data/languages/eng/corpus/ugoa1.yaml) ---

TEST(tokeniser, EnglishLine001Book) { ExpectTokens("book", {"book"}); }

TEST(tokeniser, EnglishLine002TheBook) { ExpectTokens("the book", {"the", "book"}); }

TEST(tokeniser, EnglishLine003ABook) { ExpectTokens("a book", {"a", "book"}); }

TEST(tokeniser, EnglishLine010Books) { ExpectTokens("books", {"books"}); }

TEST(tokeniser, EnglishLine031TheBooks) { ExpectTokens("the books", {"the", "books"}); }

TEST(tokeniser, EnglishLine035AllTheBooks) {
  ExpectTokens("all the books", {"all", "the", "books"});
}

TEST(tokeniser, EnglishLine091ABookInABox) {
  ExpectTokens("a book in a box", {"a", "book", "in", "a", "box"});
}

TEST(tokeniser, EnglishLine121ABeautifulBook) {
  ExpectTokens("a beautiful book", {"a", "beautiful", "book"});
}

TEST(tokeniser, EnglishLine128ABookAboutGeneva) {
  ExpectTokens("a book about Geneva", {"a", "book", "about", "Geneva"});
}

TEST(tokeniser, EnglishLine143SomeDaysBeforeTheSummer) {
  ExpectTokens("some days before the summer", {"some", "days", "before", "the", "summer"});
}

TEST(tokeniser, EnglishLine209TheBeautifulCar) {
  ExpectTokens("the beautiful car", {"the", "beautiful", "car"});
}

TEST(tokeniser, EnglishLine210AVeryBeautifulCar) {
  ExpectTokens("a very beautiful car", {"a", "very", "beautiful", "car"});
}

TEST(tokeniser, EnglishLine219JohnAndMary) {
  ExpectTokens("John and Mary", {"John", "and", "Mary"});
}

TEST(tokeniser, EnglishLine230ACarACommaBookAndAMug) {
  static constexpr std::string_view kInput = "a car, a book and a mug";
  ExpectTokens(kInput, {"a", "car", ",", "a", "book", "and", "a", "mug"});

  // Offsets are real byte positions, not sequential indices (ASCII-only, so byte == char index).
  const std::vector<Token> tokens = tokenise(kInput);
  ASSERT_EQ(tokens.size(), 8u);
  EXPECT_EQ(tokens[0].offset, 0u);   // "a"
  EXPECT_EQ(tokens[1].offset, 2u);   // "car"
  EXPECT_EQ(tokens[2].offset, 5u);   // ","
  EXPECT_EQ(tokens[3].offset, 7u);   // "a"
  EXPECT_EQ(tokens[4].offset, 9u);   // "book"
  EXPECT_EQ(tokens[5].offset, 14u);  // "and"
  EXPECT_EQ(tokens[6].offset, 18u);  // "a"
  EXPECT_EQ(tokens[7].offset, 20u);  // "mug"
}

TEST(tokeniser, EnglishLine248LongSentence) {
  ExpectTokens(
      "the beautiful book about the city of Paris without pictures and photos on the table",
      {"the", "beautiful", "book", "about", "the", "city", "of", "Paris", "without", "pictures",
       "and", "photos", "on", "the", "table"});
}

// --- Afrikaans fixed sentences (data/languages/afr/corpus/ugoa1.yaml) ---

TEST(tokeniser, AfrikaansLine001Boek) { ExpectTokens("boek", {"boek"}); }

TEST(tokeniser, AfrikaansLine002DieBoek) { ExpectTokens("die boek", {"die", "boek"}); }

TEST(tokeniser, AfrikaansLine003NBoek) { ExpectTokens("'n boek", {"'n", "boek"}); }

TEST(tokeniser, AfrikaansLine010Boeke) { ExpectTokens("boeke", {"boeke"}); }

TEST(tokeniser, AfrikaansLine031DieBoeke) { ExpectTokens("die boeke", {"die", "boeke"}); }

TEST(tokeniser, AfrikaansLine035AlDieBoeke) {
  ExpectTokens("al die boeke", {"al", "die", "boeke"});
}

TEST(tokeniser, AfrikaansLine091NBoekInNDoos) {
  ExpectTokens("'n boek in 'n doos", {"'n", "boek", "in", "'n", "doos"});
}

TEST(tokeniser, AfrikaansLine121NMooiBoek) { ExpectTokens("'n mooi boek", {"'n", "mooi", "boek"}); }

TEST(tokeniser, AfrikaansLine128NBoekOorGeneve) {
  ExpectTokens("'n boek oor Genève", {"'n", "boek", "oor", "Genève"});
}

TEST(tokeniser, AfrikaansLine143NPaarDaeVoorDieSomer) {
  ExpectTokens("'n paar dae voor die somer", {"'n", "paar", "dae", "voor", "die", "somer"});
}

TEST(tokeniser, AfrikaansLine209DieMooiKar) {
  ExpectTokens("die mooi kar", {"die", "mooi", "kar"});
}

TEST(tokeniser, AfrikaansLine210NBaieMooiKar) {
  ExpectTokens("'n baie mooi kar", {"'n", "baie", "mooi", "kar"});
}

TEST(tokeniser, AfrikaansLine219JohnEnMary) {
  ExpectTokens("John en Mary", {"John", "en", "Mary"});
}

TEST(tokeniser, AfrikaansLine230NKarACommaNBoekEnNBeker) {
  ExpectTokens("'n kar, 'n boek en 'n beker",
               {"'n", "kar", ",", "'n", "boek", "en", "'n", "beker"});
}

TEST(tokeniser, AfrikaansLine248LongSentenceWithFotoS) {
  ExpectTokens("die mooi boek op die tafel oor Parys die stad sonder prente en foto's",
               {"die", "mooi", "boek", "op", "die", "tafel", "oor", "Parys", "die", "stad",
                "sonder", "prente", "en", "foto's"});
}

// --- Synthetic English apostrophe fixtures ---

TEST(tokeniser, S1ApostropheInsideWord) {
  ExpectTokens("I don't have the book.", {"I", "don't", "have", "the", "book", "."});
}

TEST(tokeniser, S2ApostropheAtBoundary) {
  ExpectTokens("This is James' book.", {"This", "is", "James", "'", "book", "."});
}

}  // namespace
}  // namespace verstaan
