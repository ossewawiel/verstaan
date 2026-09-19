// Dictionary lookup unit tests (docs/standards/testing.md: "fast"). Every expected headword and
// id below is transcribed from a `grep` against the real store, never derived from running the
// code under test (docs/standards/testing.md: "Never derive expected values by running the code
// under test"). `VERSTAAN_REPO_ROOT` (tests/CMakeLists.txt) points at the checkout root so this
// suite can read the real `data/languages/eng` and `data/languages/afr` stores issue 20 requires
// (SPEC.md §3.3); this is deliberately not a pure in-memory domain test, because the component
// under test is the store reader itself -- there is no fixture store small enough to prove a
// wrong shard or a wrong iso3 translation the way the real, sharded store does.
//
// Every `TEST` sits in the `dictionary_lookup` suite, matching `tokeniser_test.cpp`'s own
// `TEST(tokeniser, ...)` convention, so `ctest -R dictionary_lookup` (issue 20's "Done when")
// selects this whole file by name.

#include <gtest/gtest.h>

#include <algorithm>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "verstaan/dictionary.hpp"
#include "verstaan/tokeniser.hpp"

namespace verstaan {
namespace {

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

std::string EngStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/eng"; }
std::string AfrStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/afr"; }

// One `Dictionary` per language, built once and shared read-only across every `TEST` below: each
// `dictionary/<letter>.yaml` shard this file's tests touch is read from disk at most once, no
// matter how many `TEST`s look a word up in it (`Dictionary::lookup`'s own shard cache,
// engine/include/verstaan/dictionary.hpp).
const Dictionary& EnglishDictionary() {
  static const Dictionary dictionary = Dictionary::load(EngStoreRoot(), Lang::eng);
  return dictionary;
}

const Dictionary& AfrikaansDictionary() {
  static const Dictionary dictionary = Dictionary::load(AfrStoreRoot(), Lang::afr);
  return dictionary;
}

bool HasId(const std::vector<DictionaryEntry>& entries, std::int64_t id) {
  return std::any_of(entries.begin(), entries.end(),
                     [id](const DictionaryEntry& entry) { return entry.id == id; });
}

// --- Every content word from the fifteen fixed sentences (docs/factory/issues/24-test-cases.md)
// resolves to at least one entry, and a known real id proves the shard and the headword match are
// both correct, not accidentally non-empty. ---

struct ExpectedWord {
  std::string_view surface;
  std::string_view headword;
  std::int64_t id;
};

// One representative id per content word, `grep -n "^- headword: <word>$" data/languages/eng/
// dictionary/<letter>.yaml` then the `id:` line immediately below the first match, 2026-09-19.
// Function words the store does not carry at all ("the", "a", "and", "of", "on", "without", "in",
// "about") are deliberately absent from this table -- docs/factory/issues/24-test-cases.md, "What
// the store does not carry yet": the importer routed every `LEX: D` entry to `_unparsed.txt`, so
// these tokens are expected to stay unresolved and are not this test's job to cover.
constexpr ExpectedWord kEnglishContentWords[] = {
    {"book", "book", 408062},     {"books", "books", 489278},
    {"all", "all", 270061},       {"some", "some", 270049},
    {"days", "days", 430177},     {"before", "before", 270930},
    {"summer", "summer", 431571}, {"beautiful", "beautiful", 286581},
    {"box", "box", 423059},       {"city", "city", 371182},
    {"car", "car", 328185},       {"very", "very", 270891},
    {"mug", "mug", 414242},       {"pictures", "pictures", 505038},
    {"photos", "photos", 358132}, {"table", "table", 373323},
};

TEST(dictionary_lookup, EveryFixedSetContentWordResolves) {
  const Dictionary& dictionary = EnglishDictionary();
  for (const ExpectedWord& word : kEnglishContentWords) {
    const std::vector<DictionaryEntry> entries = dictionary.lookup(word.surface);
    EXPECT_FALSE(entries.empty()) << "surface: " << word.surface;
    for (const DictionaryEntry& entry : entries) {
      EXPECT_EQ(entry.headword, word.headword) << "surface: " << word.surface;
      EXPECT_EQ(entry.lang, Lang::eng) << "surface: " << word.surface;
    }
    EXPECT_TRUE(HasId(entries, word.id))
        << "surface: " << word.surface << " missing known id " << word.id;
  }
}

TEST(dictionary_lookup, TokeniserPipelineFeedsLookupDirectly) {
  // A15's long sentence (docs/factory/issues/24-test-cases.md), run through the real tokeniser
  // (issue 19) first, exactly as issue 20's "What" describes the two components wiring together.
  static constexpr std::string_view kInput =
      "the beautiful book about the city of Paris without pictures and photos on the table";
  const std::vector<Token> tokens = tokenise(kInput);
  const std::vector<LookupEntry> looked_up = EnglishDictionary().lookup_tokens(tokens);
  ASSERT_EQ(looked_up.size(), tokens.size());

  // "beautiful", "city", "pictures", "photos" and "table" are content words the dictionary
  // reaches; "the", "about", "of", "without", "on" are the acknowledged function-word gap
  // (24-test-cases.md) and are not asserted here.
  const auto find_word = [&](std::string_view surface) -> const LookupEntry& {
    for (const LookupEntry& entry : looked_up) {
      if (entry.surface == surface) {
        return entry;
      }
    }
    ADD_FAILURE() << "token not found: " << surface;
    static const LookupEntry kEmpty{};
    return kEmpty;
  };

  EXPECT_TRUE(find_word("beautiful").resolved());
  EXPECT_TRUE(find_word("city").resolved());
  EXPECT_TRUE(find_word("pictures").resolved());
  EXPECT_TRUE(find_word("photos").resolved());
  EXPECT_TRUE(find_word("table").resolved());

  // "Paris" (capital P) is the A15 fall-through word (docs/factory/issues/24-test-cases.md, "Where
  // M16 forces a second partial"): the corpus UW 500003943 is in neither store, and the only
  // dictionary entries under headword "Paris" map a different UW (the herb, 112469372) -- a fact
  // about UW resolution issue 22/25 owns, not about surface lookup, which legitimately still
  // finds a "Paris" headword. This test does not assert on it either way; it exists so a future
  // reader does not mistake a "Paris" match here for a bug in this issue's scope.
}

// --- A token with no matching entry is marked unresolved, not an exception. ---

TEST(dictionary_lookup, RealFixedSetWordWithNoDictionaryEntryIsUnresolved) {
  // A09's designated partial (docs/factory/issues/24-test-cases.md): "Geneva" is in no
  // data/languages/eng/dictionary/<a-z>.yaml shard. g.yaml holds "Geneva gown", "Genevan" and
  // "Genevans", never a bare "Geneva" (grep -n "Geneva" data/languages/eng/dictionary/g.yaml,
  // 2026-09-19).
  const std::vector<DictionaryEntry> entries = EnglishDictionary().lookup("Geneva");
  EXPECT_TRUE(entries.empty());
}

TEST(dictionary_lookup, SyntheticTypoIsUnresolvedNotAnException) {
  // Not a real word in any language; proves the "no match" path does not depend on which real
  // shard happens to be sparse today.
  EXPECT_NO_THROW({
    const std::vector<DictionaryEntry> entries = EnglishDictionary().lookup("xyzzyqqnotaword");
    EXPECT_TRUE(entries.empty());
  });
}

TEST(dictionary_lookup, CapitalisedTokenDoesNotMatchLowerCaseHomograph) {
  // docs/factory/issues/24-test-cases.md, row A13: "john" is a common noun in data/languages/eng/
  // dictionary/j.yaml, but "Mary" is in no English shard, and "John" (capital J) never matches
  // the lower-case "john" entries -- SPEC.md §3.3's shard key is the lower-cased first letter
  // only, not a case fold of the whole headword.
  const Dictionary& dictionary = EnglishDictionary();
  EXPECT_TRUE(dictionary.lookup("Mary").empty());
  EXPECT_TRUE(dictionary.lookup("John").empty());
  EXPECT_FALSE(dictionary.lookup("john").empty());
}

// --- A homograph token returns every matching sense, not one picked for it. ---

TEST(dictionary_lookup, BankHomographReturnsBothKnownSenses) {
  // data/languages/eng/dictionary/b.yaml carries 36 "bank" entries (grep -c, 2026-09-19); these
  // two ids are the first two, an "ABN: ABT" (abstract, a financial institution) sense and an
  // "ABN: CCT" (concrete, a landform) sense -- two different `uw`s, `100169305` and `102787772`.
  const std::vector<DictionaryEntry> entries = EnglishDictionary().lookup("bank");
  EXPECT_GT(entries.size(), 1u);
  for (const DictionaryEntry& entry : entries) {
    EXPECT_EQ(entry.headword, "bank");
  }
  EXPECT_TRUE(HasId(entries, 408452));
  EXPECT_TRUE(HasId(entries, 408453));
}

// --- Punctuation and apostrophe-only tokens never look inside a shard. ---

TEST(dictionary_lookup, PunctuationTokenIsUnresolved) {
  const Dictionary& dictionary = EnglishDictionary();
  EXPECT_TRUE(dictionary.lookup(".").empty());
  EXPECT_TRUE(dictionary.lookup(",").empty());
  EXPECT_TRUE(dictionary.lookup("'").empty());
}

// --- Tagset warnings never crash the lookup; the warning list only grows on request. ---

TEST(dictionary_lookup, TagsetWarningsStartEmptyOnAFreshInstance) {
  const Dictionary dictionary = Dictionary::load(EngStoreRoot(), Lang::eng);
  EXPECT_TRUE(dictionary.warnings().empty());
}

// --- The Afrikaans store, sharded and shaped the same way, resolves too. ---

TEST(dictionary_lookup, AfrikaansBoekResolvesWithTheKnownId) {
  // grep -n "^- headword: boek$" -A1 data/languages/afr/dictionary/b.yaml, 2026-09-19: the first
  // match's id is 18597.
  const std::vector<DictionaryEntry> entries = AfrikaansDictionary().lookup("boek");
  EXPECT_FALSE(entries.empty());
  for (const DictionaryEntry& entry : entries) {
    EXPECT_EQ(entry.headword, "boek");
    EXPECT_EQ(entry.lang, Lang::afr);
  }
  EXPECT_TRUE(HasId(entries, 18597));
}

TEST(dictionary_lookup, AfrikaansMooiHomographHasMultipleSenses) {
  // docs/factory/issues/24-test-cases.md, row A08: "mooi is a homograph: the afr dictionary
  // holds it as ADJ and as AAV." grep -c "^- headword: mooi$" data/languages/afr/dictionary/
  // m.yaml is 30, 2026-09-19; id 20866 is the first.
  const std::vector<DictionaryEntry> entries = AfrikaansDictionary().lookup("mooi");
  EXPECT_GT(entries.size(), 1u);
  EXPECT_TRUE(HasId(entries, 20866));
}

}  // namespace
}  // namespace verstaan
