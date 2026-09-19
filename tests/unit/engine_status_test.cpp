// Engine::translate status/trace tests (docs/standards/testing.md: "fast"), `ctest -R
// engine_status` (docs/factory/issues/23-options-result-status-and-trace.md, "Done when").
//
// Reads the real `data/languages/eng` and `data/languages/afr` stores (`VERSTAAN_REPO_ROOT`,
// tests/CMakeLists.txt), the same precedent dictionary_lookup_test.cpp and
// rule_interpreter_test.cpp already set: only the real store can prove a real Status against real
// data.
//
// A01 and A04 (docs/factory/issues/24-test-cases.md) are the two of the fifteen fixed English
// sentences this issue's own runtime-tables pipeline fully resolves without a function-word
// lexicon: single content words, one already dictionary-resolved verbatim, the other also
// exercising eng-ana-1 (books > book.@pl), the same rule issue 22's own GoogleTest asserts fired.
// The other thirteen rows need closed-class tagging ("the", "a", "and", ...) that neither the
// dictionary (issue 24's importer-gap note) nor issue 22's RuleInterpreter supplies yet, so this
// file does not claim Status::ok for them.

#include <gtest/gtest.h>

#include <algorithm>
#include <string>

#include "verstaan/engine.hpp"
#include "verstaan/rule_set.hpp"

namespace verstaan {
namespace {

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

std::string EngStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/eng"; }
std::string AfrStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/afr"; }

const Engine& EngToAfrEngine() {
  static const Engine engine = Engine::load(RuleSet::load(EngStoreRoot(), AfrStoreRoot()));
  return engine;
}

bool trace_has(const Trace& trace, std::string_view rule_id) {
  return std::ranges::any_of(trace.entries,
                             [&](const TraceEntry& entry) { return entry.rule == rule_id; });
}

// --- A01: a bare, already-resolved content word. The full 181-rule analysis.yaml runs against it
// (not the single isolated rule rule_interpreter_test.cpp extracts), so other rules legitimately
// firing default attributes is not itself a fault -- only Status matters here. ---

TEST(engine_status, A01BareWordFullyResolvedIsOk) {
  const Result result =
      EngToAfrEngine().translate("book", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::ok);
}

// --- A04: `books` fires eng-ana-1, the same rule issue 22's WorkedRuleOneMarksPluralNoun already
// asserts fired, marking @pl. Still every token resolved, so still ok. ---

TEST(engine_status, A04PluralWordFiresRuleOneAndIsOk) {
  const Result result =
      EngToAfrEngine().translate("books", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_TRUE(trace_has(result.trace, "1"));
}

// --- A09's designated partial word (docs/factory/issues/24-test-cases.md): `Geneva` is in no
// `data/languages/eng/dictionary/*.yaml` shard. A hand-built sentence pairs it with a word that is
// resolved, so the row proves the mark lands on the missing word specifically, not the whole
// sentence. ---

TEST(engine_status, SentenceWithAMissingDictionaryWordIsPartialAndMarksThatWord) {
  const Result result =
      EngToAfrEngine().translate("book Geneva", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_NE(result.text.find("⟦Geneva⟧"), std::string::npos);
  EXPECT_EQ(result.text.find("⟦book⟧"), std::string::npos);  // the resolved word is not
                                                             // itself marked.
}

// --- A malformed input the tokeniser cannot segment into any token at all: empty text produces
// no candidate reading, so no graph -- not even a partial one -- can be built from it. ---

TEST(engine_status, EmptyInputCannotBeSegmentedAndIsNoParse) {
  const Result result = EngToAfrEngine().translate("", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::no_parse);
  EXPECT_TRUE(result.trace.entries.empty());
  EXPECT_TRUE(result.text.empty());
}

TEST(engine_status, WhitespaceOnlyInputIsAlsoNoParse) {
  const Result result =
      EngToAfrEngine().translate("   \t  ", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::no_parse);
}

// --- not_implemented stays reserved for a Lang/Register/Context combination no M3 store covers --
// never for a plain eng-to-afr, neutral, no-context call, once this issue closes. ---

TEST(engine_status, UnsupportedDirectionIsNotImplemented) {
  const Result result =
      EngToAfrEngine().translate("book", Options{.from = Lang::afr, .to = Lang::eng});
  EXPECT_EQ(result.status, Status::not_implemented);
}

TEST(engine_status, UnsupportedRegisterIsNotImplemented) {
  const Result result = EngToAfrEngine().translate(
      "book", Options{.from = Lang::eng, .to = Lang::afr, .reg = Register::formal});
  EXPECT_EQ(result.status, Status::not_implemented);
}

}  // namespace
}  // namespace verstaan
