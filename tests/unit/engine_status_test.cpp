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
#include <string_view>
#include <vector>

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

// --- Issue 196: a capitalised name enters the graph as a quoted literal. ---

bool has_uw(const Result& result, std::string_view uw) {
  return std::ranges::any_of(result.unl.nodes, [&](const Node& node) { return node.uw == uw; });
}

TEST(engine_status, A13NamesEnterTheGraphAsQuotedLiterals) {
  const Result result =
      EngToAfrEngine().translate("John and Mary", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_TRUE(has_uw(result, "\"John\""));
  EXPECT_TRUE(has_uw(result, "\"Mary\""));
}

TEST(engine_status, A09GenevaIsALiteralAndTheRowKeepsStatusPartial) {
  const Result result = EngToAfrEngine().translate("a book about Geneva",
                                                   Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_TRUE(has_uw(result, "\"Geneva\""));
  EXPECT_EQ(result.status, Status::partial);
}

TEST(engine_status, SentenceInitialTheStillResolvesThroughTheDictionary) {
  const Result result =
      EngToAfrEngine().translate("The book", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_FALSE(has_uw(result, "\"The\""));
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(result.text.find("⟦"), std::string::npos);
}

TEST(engine_status, LowerCaseJohnStillResolvesToTheCommonNoun) {
  const Result result =
      EngToAfrEngine().translate("john", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_FALSE(has_uw(result, "\"john\""));
  EXPECT_FALSE(has_uw(result, "\"John\""));
  EXPECT_EQ(result.status, Status::ok);
}

TEST(engine_status, CapitalisedNameAfterALowerCaseWordIsALiteralNotTheCommonNoun) {
  const Result result =
      EngToAfrEngine().translate("book John", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_TRUE(has_uw(result, "\"John\""));
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

// --- Issue 180, rows G01 to G09 (docs/factory/issues/180-test-cases.md): the mod relation reaches
// the UNL graph through the tree pass. Expected values transcribed from that table. ---

Result TranslateEng(const char* text) {
  return EngToAfrEngine().translate(text, Options{.from = Lang::eng, .to = Lang::afr});
}

std::vector<std::string> FiredIds(const Trace& trace) {
  std::vector<std::string> ids;
  for (const TraceEntry& entry : trace.entries) {
    ids.push_back(entry.rule + (entry.event == TraceEvent::fired ? "" : " other"));
  }
  return ids;
}

std::size_t CountRule(const Trace& trace, std::string_view rule_id) {
  return static_cast<std::size_t>(std::ranges::count_if(
      trace.entries, [&](const TraceEntry& entry) { return entry.rule == rule_id; }));
}

bool AnyNotFired(const Trace& trace) {
  return std::ranges::any_of(
      trace.entries, [](const TraceEntry& entry) { return entry.event != TraceEvent::fired; });
}

void ExpectBeautiful(const Result& result, std::string_view noun_uw, std::string_view article,
                     const std::vector<std::string>& trace) {
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "300217728");
  EXPECT_TRUE(result.unl.nodes[0].attributes.empty());
  EXPECT_EQ(result.unl.nodes[1].uw, noun_uw);
  EXPECT_EQ(result.unl.nodes[1].attributes, std::vector<std::string>{std::string(article)});
  ASSERT_EQ(result.unl.relations.size(), 1U);
  EXPECT_EQ(result.unl.relations[0].label, "mod");
  EXPECT_EQ(result.unl.relations[0].from, 1U);
  EXPECT_EQ(result.unl.relations[0].to, 0U);
  EXPECT_EQ(FiredIds(result.trace), trace);
}

TEST(engine_status, G01_a08_a_beautiful_book_has_the_mod_relation) {
  ExpectBeautiful(TranslateEng("a beautiful book"), "102870092", "@indef",
                  {"70", "60", "71", "61", "72", "50", "12", "62", "80", "82", "100", "172"});
}

TEST(engine_status, G02_a11_the_beautiful_car_has_the_mod_relation) {
  ExpectBeautiful(TranslateEng("the beautiful car"), "102958343", "@def",
                  {"70", "60", "71", "61", "72", "50", "12", "62", "80", "82", "100", "172"});
}

TEST(engine_status, G03_a02_the_book_has_no_relation) {
  const Result result = TranslateEng("the book");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_EQ(result.unl.nodes[0].attributes, std::vector<std::string>{"@def"});
  EXPECT_TRUE(result.unl.relations.empty());
  EXPECT_EQ(FiredIds(result.trace), (std::vector<std::string>{"70", "60", "72", "12", "62"}));
  EXPECT_EQ(CountRule(result.trace, "172"), 0U);
}

TEST(engine_status, G04_closed_class_words_are_not_graph_nodes) {
  const struct {
    const char* text;
    std::size_t nodes;
  } rows[] = {{"the book", 1}, {"a beautiful book", 2}, {"the beautiful car", 2}};
  for (const auto& row : rows) {
    const Result result = TranslateEng(row.text);
    EXPECT_EQ(result.unl.nodes.size(), row.nodes) << row.text;
    for (const Node& node : result.unl.nodes) {
      EXPECT_FALSE(node.uw.empty()) << row.text;
    }
  }
}

TEST(engine_status, G05_rule_172_fires_once_and_rule_176_never) {
  for (const char* text : {"a beautiful book", "the beautiful car"}) {
    const Result result = TranslateEng(text);
    EXPECT_EQ(CountRule(result.trace, "172"), 1U) << text;
    EXPECT_EQ(CountRule(result.trace, "176"), 0U) << text;
  }
}

TEST(engine_status, G06_a01_a_bare_noun_has_no_relation) {
  const Result result = TranslateEng("book");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_TRUE(result.unl.nodes[0].attributes.empty());
  EXPECT_TRUE(result.unl.relations.empty());
}

TEST(engine_status, G07_a04_books_is_the_plural_noun_and_rule_one_fires_once) {
  const Result result = TranslateEng("books");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_EQ(result.unl.nodes[0].attributes, std::vector<std::string>{"@pl"});
  EXPECT_TRUE(result.unl.relations.empty());
  EXPECT_EQ(CountRule(result.trace, "1"), 1U);
}

TEST(engine_status, G08_both_books_does_not_loop_between_rules_one_and_177) {
  const Result result = TranslateEng("both books");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_EQ(result.unl.nodes[0].attributes, std::vector<std::string>{"@both"});
  EXPECT_TRUE(result.unl.relations.empty());
  EXPECT_FALSE(AnyNotFired(result.trace));
  EXPECT_EQ(CountRule(result.trace, "1"), 1U);
  EXPECT_EQ(CountRule(result.trace, "177"), 1U);
}

TEST(engine_status, G09_a06_all_the_books_copies_no_link_with_a_closed_class_end) {
  const Result result = TranslateEng("all the books");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_TRUE(std::ranges::any_of(result.unl.nodes,
                                  [](const Node& node) { return node.uw == "102870092"; }));
  EXPECT_TRUE(result.unl.relations.empty());
  for (const Node& node : result.unl.nodes) {
    EXPECT_FALSE(node.uw.empty());
  }
}

}  // namespace
}  // namespace verstaan
