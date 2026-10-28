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
#include <initializer_list>
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

// Issue 181 (ADR 0024): generation appends entries whose rule starts with `afr-`. The analysis
// assertions below read the entries before the first of those.
bool IsGenerationEntry(const TraceEntry& entry) { return entry.rule.starts_with("afr-"); }

std::vector<std::string> FiredIds(const Trace& trace) {
  std::vector<std::string> ids;
  for (const TraceEntry& entry : trace.entries) {
    if (IsGenerationEntry(entry)) {
      break;
    }
    ids.push_back(entry.rule + (entry.event == TraceEvent::fired ? "" : " other"));
  }
  return ids;
}

std::size_t CountRule(const Trace& trace, std::string_view rule_id) {
  return static_cast<std::size_t>(std::ranges::count_if(
      trace.entries, [&](const TraceEntry& entry) { return entry.rule == rule_id; }));
}

bool AnyNotFired(const Trace& trace) {
  return std::ranges::any_of(trace.entries, [](const TraceEntry& entry) {
    return !IsGenerationEntry(entry) && entry.event != TraceEvent::fired;
  });
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

// --- Issue 198, rows R01 to R09 (docs/factory/issues/198-test-cases.md): the plc, cnt and and
// relations on A07, A09 and A13. Expected values transcribed from that table. A trace is asserted
// by containment. Node UWs and attributes the table marks as findings (F1, F2, F3) are not
// asserted.
// ---

bool TraceStartsWith(const Trace& trace, const std::vector<std::string>& ids) {
  if (trace.entries.size() < ids.size()) {
    return false;
  }
  for (std::size_t i = 0; i < ids.size(); ++i) {
    if (trace.entries[i].rule != ids[i]) {
      return false;
    }
  }
  return true;
}

std::size_t CountFired(const Trace& trace, std::string_view rule_id) {
  return static_cast<std::size_t>(std::ranges::count_if(trace.entries, [&](const TraceEntry& e) {
    return e.rule == rule_id && e.event == TraceEvent::fired;
  }));
}

std::size_t CountLabel(const Result& result, std::string_view label) {
  return static_cast<std::size_t>(std::ranges::count_if(
      result.unl.relations, [&](const Relation& r) { return r.label == label; }));
}

TEST(engine_status, R01_a07_a_book_in_a_box_has_the_plc_relation) {
  const Result result = TranslateEng("a book in a box");
  // The status claim moved to issue 199 (A07's exact match): `box` is partial under ADR 0025.
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_EQ(result.unl.nodes[0].attributes, std::vector<std::string>{"@indef"});
  EXPECT_EQ(result.unl.nodes[1].attributes, std::vector<std::string>{"@indef"});
  ASSERT_EQ(result.unl.relations.size(), 1U);
  EXPECT_EQ(result.unl.relations[0].label, "plc");
  EXPECT_EQ(result.unl.relations[0].from, 0U);
  EXPECT_EQ(result.unl.relations[0].to, 1U);
  EXPECT_TRUE(TraceStartsWith(result.trace, {"1", "5"}));
  EXPECT_EQ(CountFired(result.trace, "154"), 1U);
  EXPECT_EQ(CountRule(result.trace, "166"), 0U);
}

TEST(engine_status, R02_a07_carries_no_cnt_and_no_tim) {
  const Result result = TranslateEng("a book in a box");
  EXPECT_EQ(CountLabel(result, "cnt"), 0U);
  EXPECT_EQ(CountLabel(result, "tim"), 0U);
  EXPECT_EQ(CountRule(result.trace, "134"), 0U);
  EXPECT_EQ(CountRule(result.trace, "166"), 0U);
}

TEST(engine_status, R03_a08_carries_no_plc_and_rules_five_and_154_stay_silent) {
  const Result result = TranslateEng("a beautiful book");
  ASSERT_EQ(result.unl.relations.size(), 1U);
  EXPECT_EQ(result.unl.relations[0].label, "mod");
  EXPECT_EQ(result.unl.relations[0].from, 1U);
  EXPECT_EQ(result.unl.relations[0].to, 0U);
  EXPECT_EQ(CountRule(result.trace, "5"), 0U);
  EXPECT_EQ(CountRule(result.trace, "154"), 0U);
}

TEST(engine_status, R04_a09_a_book_about_geneva_has_the_cnt_relation) {
  const Result result = TranslateEng("a book about Geneva");
  EXPECT_EQ(result.status, Status::partial);
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_EQ(result.unl.nodes[0].attributes, std::vector<std::string>{"@indef"});
  EXPECT_EQ(result.unl.nodes[1].uw, "\"Geneva\"");
  ASSERT_EQ(result.unl.relations.size(), 1U);
  EXPECT_EQ(result.unl.relations[0].label, "cnt");
  EXPECT_EQ(result.unl.relations[0].from, 0U);
  EXPECT_EQ(result.unl.relations[0].to, 1U);
  EXPECT_TRUE(TraceStartsWith(result.trace, {"4"}));
  EXPECT_EQ(CountFired(result.trace, "182"), 1U);
  EXPECT_EQ(CountFired(result.trace, "134"), 1U);
}

TEST(engine_status, R05_a13_john_and_mary_has_the_and_relation) {
  const Result result = TranslateEng("John and Mary");
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "\"John\"");
  EXPECT_TRUE(result.unl.nodes[0].attributes.empty());
  EXPECT_EQ(result.unl.nodes[1].uw, "\"Mary\"");
  EXPECT_TRUE(result.unl.nodes[1].attributes.empty());
  ASSERT_EQ(result.unl.relations.size(), 1U);
  EXPECT_EQ(result.unl.relations[0].label, "and");
  EXPECT_EQ(result.unl.relations[0].from, 1U);
  EXPECT_EQ(result.unl.relations[0].to, 0U);
  EXPECT_EQ(CountFired(result.trace, "182"), 2U);
  EXPECT_EQ(CountFired(result.trace, "18"), 1U);
}

TEST(engine_status, R06_a13_carries_exactly_one_and_and_no_or) {
  const Result result = TranslateEng("John and Mary");
  EXPECT_EQ(CountLabel(result, "and"), 1U);
  EXPECT_EQ(CountLabel(result, "or"), 0U);
  EXPECT_EQ(CountFired(result.trace, "18"), 1U);
  EXPECT_EQ(CountRule(result.trace, "16"), 0U);
  EXPECT_EQ(CountRule(result.trace, "19"), 0U);
}

TEST(engine_status, R07_mary_and_john_puts_the_later_conjunct_at_the_head) {
  const Result result = TranslateEng("Mary and John");
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "\"Mary\"");
  EXPECT_EQ(result.unl.nodes[1].uw, "\"John\"");
  ASSERT_EQ(result.unl.relations.size(), 1U);
  EXPECT_EQ(result.unl.relations[0].label, "and");
  EXPECT_EQ(result.unl.relations[0].from, 1U);
  EXPECT_EQ(result.unl.relations[0].to, 0U);
  EXPECT_EQ(CountFired(result.trace, "18"), 1U);
}

TEST(engine_status, R08_rule_182_stays_silent_without_a_name_literal) {
  for (const char* text : {"The book", "john", "book xyzzy"}) {
    const Result result = TranslateEng(text);
    EXPECT_EQ(CountRule(result.trace, "182"), 0U) << text;
    if (std::string_view(text) == "book xyzzy") {
      EXPECT_EQ(result.status, Status::partial) << text;
    }
  }
}

TEST(engine_status, R09_a_non_initial_capital_gets_the_temp_tag_and_rule_182_fires_once) {
  const Result result = TranslateEng("book John");
  ASSERT_GE(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[1].uw, "\"John\"");
  EXPECT_EQ(CountFired(result.trace, "182"), 1U);
}

// --- Issue 181, rows N01 to N19 and N55 (docs/factory/issues/181-test-cases.md): generation runs
// inside Engine::translate. Texts transcribed from that table. A trace is asserted by containment
// of fired entries. ---

bool Fired(const Result& result, std::string_view rule_id) {
  return CountFired(result.trace, rule_id) > 0;
}

void ExpectFired(const Result& result, std::initializer_list<std::string_view> ids) {
  for (std::string_view id : ids) {
    EXPECT_TRUE(Fired(result, id)) << "missing " << id;
  }
}

void ExpectNotFired(const Result& result, std::initializer_list<std::string_view> ids) {
  for (std::string_view id : ids) {
    EXPECT_FALSE(Fired(result, id)) << "unexpected " << id;
  }
}

TEST(engine_status, N01_a01_book_is_boek) {
  const Result result = TranslateEng("book");
  EXPECT_EQ(result.text, "boek");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-227", "afr-inf-M3"});
  ExpectNotFired(result, {"afr-gen-35", "afr-gen-36", "afr-gen-56", "afr-gen-195", "afr-gen-231"});
}

TEST(engine_status, N02_a02_the_book_is_die_boek) {
  const Result result = TranslateEng("the book");
  EXPECT_EQ(result.text, "die boek");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-35", "afr-gen-125", "afr-gen-195", "afr-gen-230", "afr-gen-231",
                       "afr-inf-M3"});
  ExpectNotFired(result, {"afr-gen-33", "afr-gen-36", "afr-gen-67", "afr-gen-196", "afr-gen-229",
                          "afr-dis-5"});
}

TEST(engine_status, N03_a03_a_book_is_n_boek) {
  const Result result = TranslateEng("a book");
  EXPECT_EQ(result.text, "'n boek");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-36", "afr-gen-195", "afr-gen-231"});
  ExpectNotFired(result, {"afr-gen-35", "afr-dis-5"});
}

TEST(engine_status, N04_a04_books_is_boeke) {
  const Result result = TranslateEng("books");
  EXPECT_EQ(result.text, "boeke");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-56", "afr-gen-227", "afr-inf-M3"});
  ExpectNotFired(result, {"afr-gen-35", "afr-gen-36", "afr-gen-40", "afr-gen-231", "afr-inf-M2",
                          "afr-inf-M7", "afr-inf-M16"});
}

TEST(engine_status, N05_a05_the_books_is_die_boeke) {
  const Result result = TranslateEng("the books");
  EXPECT_EQ(result.text, "die boeke");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-35", "afr-gen-56", "afr-inf-M3"});
  ExpectNotFired(result, {"afr-gen-37", "afr-gen-60"});
}

TEST(engine_status, N08_a08_a_beautiful_book_is_n_mooi_boek) {
  const Result result = TranslateEng("a beautiful book");
  EXPECT_EQ(result.text, "'n mooi boek");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-8", "afr-gen-36", "afr-gen-67", "afr-gen-124", "afr-gen-196"});
  ExpectNotFired(result, {"afr-gen-9", "afr-gen-26", "afr-gen-35", "afr-gen-42", "afr-gen-234"});
}

TEST(engine_status, N10_a11_the_beautiful_car_is_die_mooi_motor) {
  const Result result = TranslateEng("the beautiful car");
  EXPECT_EQ(result.text, "die mooi motor");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-8", "afr-gen-35", "afr-gen-67", "afr-gen-196"});
  ExpectNotFired(result, {"afr-gen-36"});
}

TEST(engine_status, N12_a13_john_and_mary_is_john_en_mary) {
  const Result result = TranslateEng("John and Mary");
  EXPECT_EQ(result.text, "John en Mary");
  EXPECT_EQ(result.status, Status::ok);
  ExpectFired(result, {"afr-gen-33", "afr-gen-229"});
  ExpectNotFired(result, {"afr-gen-34", "afr-gen-58", "afr-gen-227", "afr-inf-M3"});
}

TEST(engine_status, N15_determiner_disambiguation_stays_silent_on_a02_a03_a07) {
  for (const char* text : {"the book", "a book", "a book in a box"}) {
    ExpectNotFired(TranslateEng(text), {"afr-dis-5"});
  }
}

TEST(engine_status, N16_a09_a_book_about_geneva_appends_the_mark) {
  const Result result = TranslateEng("a book about Geneva");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_TRUE(result.text.starts_with("'n boek "));
  const std::string mark = "⟦Geneva⟧";
  const std::size_t first = result.text.find(mark);
  ASSERT_NE(first, std::string::npos);
  EXPECT_EQ(result.text.find(mark, first + 1), std::string::npos);
  EXPECT_TRUE(Fired(result, "afr-gen-36"));
}

TEST(engine_status, N17_book_xyzzy_appends_the_unknown_word) {
  const Result result = TranslateEng("book xyzzy");
  EXPECT_EQ(result.text, "boek ⟦xyzzy⟧");
  EXPECT_EQ(result.status, Status::partial);
}

TEST(engine_status, N18_book_geneva_appends_the_name) {
  const Result result = TranslateEng("book Geneva");
  EXPECT_EQ(result.text, "boek ⟦Geneva⟧");
  EXPECT_EQ(result.status, Status::partial);
  ExpectNotFired(result, {"afr-gen-8", "afr-gen-9"});
}

TEST(engine_status, N19_a_closed_class_word_alone_gives_empty_ok_text) {
  const Result result = TranslateEng("the");
  EXPECT_TRUE(result.text.empty());
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_TRUE(result.unl.nodes.empty());
}

TEST(engine_status, N55_a02_trace_is_analysis_entries_then_qualified_generation_entries) {
  const Result result = TranslateEng("the book");
  std::size_t first = 0;
  while (first < result.trace.entries.size() && !IsGenerationEntry(result.trace.entries[first])) {
    ++first;
  }
  ASSERT_LT(first, result.trace.entries.size());
  std::vector<std::string> before;
  for (std::size_t i = 0; i < first; ++i) {
    before.push_back(result.trace.entries[i].event == TraceEvent::fired
                         ? result.trace.entries[i].rule
                         : result.trace.entries[i].rule + " other");
  }
  EXPECT_EQ(before, (std::vector<std::string>{"70", "60", "72", "12", "62"}));
  for (std::size_t i = first; i < result.trace.entries.size(); ++i) {
    const std::string& rule = result.trace.entries[i].rule;
    EXPECT_TRUE(rule.starts_with("afr-gen-") || rule.starts_with("afr-inf-") ||
                rule.starts_with("afr-dis-"))
        << rule;
  }
}

TEST(engine_status, N65_directions_puts_no_grammar_quote_into_the_text) {
  const Result result = TranslateEng("directions");
  EXPECT_EQ(result.text.find('"'), std::string::npos) << result.text;
}

TEST(engine_status, N66_the_book_and_john_is_die_boek_en_john) {
  const Result result = TranslateEng("the book and John");
  EXPECT_EQ(result.text, "die boek en John");
  EXPECT_EQ(result.status, Status::ok);
}

}  // namespace
}  // namespace verstaan
