// Rule interpreter unit tests (docs/standards/testing.md: "fast"), `ctest -R rule_interpreter`
// (docs/factory/issues/22-rule-interpreter-on-runtime-tables.md, "Done when").
//
// Two kinds of test sit in this file, the same split dictionary_lookup_test.cpp draws:
//
// - The worked-rule, paradigm and afr-homograph tests read the real
//   `data/languages/eng` and `data/languages/afr` stores (`VERSTAAN_REPO_ROOT`,
//   tests/CMakeLists.txt) because the acceptance criteria name specific real rule ids
//   (analysis.yaml's "1", "2" and "8", the same three rules
//   docs/unl-reference/formats/transformation-grammar.md walks through; inflection.yaml's M2, M7
//   and M16 paradigms, per docs/unl-reference/formats/inflection.md; disambiguation.yaml's 13 real
//   afr D-rules). Each such test extracts the one real `GrammarRule` it needs and re-packs it alone
//   into a fresh `RuleSet::from_rules(...)`, so the assertion is about that one rule's real,
//   verbatim content firing on a hand-built trigger, not about whichever other rule among 181 real
//   analysis rules might also happen to match first.
// - The ordering and fallback tests build their own `RuleSet::from_rules(...)` entirely in memory
//   (docs/standards/testing.md: "Domain tests are pure: no file I/O"), one of them reusing the
//   real rule "1" extracted by the first test rather than re-typing its content.
//
// Every expected surface form below (books>book.@pl, is.@present killing>killing.@progressive.
// @present, not kill>kill.@not, table>tables, man>men, kill>killed) is transcribed from
// docs/unl-reference/formats/transformation-grammar.md and docs/unl-reference/formats/
// inflection.md, never derived by running the code under test (docs/standards/testing.md).

#include "verstaan/rule_interpreter.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <cstddef>
#include <initializer_list>
#include <iterator>
#include <string>
#include <vector>

#include "verstaan/dictionary.hpp"
#include "verstaan/engine.hpp"
#include "verstaan/rule_set.hpp"
#include "verstaan/tokeniser.hpp"

namespace verstaan {
namespace {

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

std::string EngStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/eng"; }
std::string AfrStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/afr"; }

// One real eng-to-afr RuleSet, built once and shared read-only across every TEST below, matching
// dictionary_lookup_test.cpp's own EnglishDictionary()/AfrikaansDictionary() pattern.
const RuleSet& EngToAfrRuleSet() {
  static const RuleSet rules = RuleSet::load(EngStoreRoot(), AfrStoreRoot());
  return rules;
}

const RuleSet& AfrRuleSet() {
  static const RuleSet rules = RuleSet::load(AfrStoreRoot(), AfrStoreRoot());
  return rules;
}

const GrammarRule& FindRule(const std::vector<GrammarRule>& rules, std::string_view id) {
  auto it = std::ranges::find_if(rules, [&](const GrammarRule& r) { return r.id == id; });
  if (it == rules.end()) {
    ADD_FAILURE() << "rule not found: " << id;
    static const GrammarRule kEmpty{};
    return kEmpty;
  }
  return *it;
}

bool HasAttribute(const Candidate& node, std::string_view attribute) {
  return std::ranges::find(node.attributes, attribute) != node.attributes.end();
}

bool HasFeature(const Candidate& node, std::string_view key, std::string_view value) {
  return std::ranges::any_of(node.features,
                             [&](const Feature& f) { return f.first == key && f.second == value; });
}

// --- RuleSet::load reads all five grammar kinds SPEC.md §3.3 names, per language. ---

TEST(rule_interpreter, RuleSetLoadsAllFiveGrammarKindsFromTheRealStores) {
  const RuleSet& rules = EngToAfrRuleSet();
  // Issue 199 test K55 (199-test-cases.md, replacing 198 R17): eng's disambiguation.yaml holds ten
  // project-written records, ids 1 to 10, in file order, each kind `disambiguation`, each rhs `0`.
  ASSERT_EQ(rules.disambiguation().size(), 10u);
  const char* const kExpectedIds[] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "10"};
  for (std::size_t i = 0; i < 10; ++i) {
    EXPECT_EQ(rules.disambiguation()[i].id, kExpectedIds[i]);
    EXPECT_EQ(rules.disambiguation()[i].kind, "disambiguation");
    EXPECT_EQ(rules.disambiguation()[i].rhs, "0");
  }
  EXPECT_GT(rules.analysis().size(), 0u);
  EXPECT_GT(rules.from_inflection().size(), 0u);
  EXPECT_GT(rules.subcategorisation().size(), 0u);
  EXPECT_GT(rules.generation().size(), 0u);
  EXPECT_GT(rules.to_inflection().size(), 0u);
}

// --- The three worked analysis rules from transformation-grammar.md each fire on a hand-built
// trigger sentence, the Trace naming each rule's id. ---

TEST(rule_interpreter, WorkedRuleOneMarksPluralNoun) {
  // (N,PLR,^@pl,^@multal,^@paucal,^@all):=(+att=@pl); books > book.@pl
  const GrammarRule& rule = FindRule(EngToAfrRuleSet().analysis(), "1");
  ASSERT_EQ(rule.id, "1");
  const RuleSet isolated = RuleSet::from_rules({}, {rule}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  std::vector<Candidate> nodes = {
      Candidate{.surface = "books", .features = {{"LEX", "N"}, {"NUM", "PLR"}}, .attributes = {}}};
  Trace trace;
  const std::vector<Candidate> result = interpreter.analyse(std::move(nodes), trace);

  ASSERT_EQ(result.size(), 1u);
  EXPECT_TRUE(HasAttribute(result[0], "@pl"));
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "1");
}

TEST(rule_interpreter, WorkedRuleTwoFoldsAuxiliaryTenseOntoGerund) {
  // (AUX,%x)(GER,%y):=(%y,+att=@progressive,+att=%x);
  // is.@present killing > killing.@progressive.@present
  const GrammarRule& rule = FindRule(EngToAfrRuleSet().analysis(), "2");
  ASSERT_EQ(rule.id, "2");
  const RuleSet isolated = RuleSet::from_rules({}, {rule}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  std::vector<Candidate> nodes = {
      Candidate{.surface = "is", .features = {{"LEX", "AUX"}}, .attributes = {"@present"}},
      Candidate{.surface = "killing", .features = {{"LEX", "GER"}}, .attributes = {}},
  };
  Trace trace;
  const std::vector<Candidate> result = interpreter.analyse(std::move(nodes), trace);

  ASSERT_EQ(result.size(), 1u);  // the auxiliary node is gone: conservation, RHS omits it.
  EXPECT_EQ(result[0].surface, "killing");
  EXPECT_TRUE(HasAttribute(result[0], "@progressive"));
  EXPECT_TRUE(HasAttribute(result[0], "@present"));
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "2");
}

TEST(rule_interpreter, WorkedRuleThreeAttachesNegationToTheVerb) {
  // ({[not]|[n't]})({V,^AUX|J|N|A|D},%x):=(+att=@not,%x); not kill > kill.@not
  const GrammarRule& rule = FindRule(EngToAfrRuleSet().analysis(), "8");
  ASSERT_EQ(rule.id, "8");
  const RuleSet isolated = RuleSet::from_rules({}, {rule}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  std::vector<Candidate> nodes = {
      Candidate{.surface = "not", .features = {}, .attributes = {}},
      Candidate{.surface = "kill", .features = {{"LEX", "V"}}, .attributes = {}},
  };
  Trace trace;
  const std::vector<Candidate> result = interpreter.analyse(std::move(nodes), trace);

  ASSERT_EQ(result.size(), 1u);  // "not" disappears: the disjunction node is never referenced on
                                 // the right side.
  EXPECT_EQ(result[0].surface, "kill");
  EXPECT_TRUE(HasAttribute(result[0], "@not"));
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "8");
}

// --- The M2, M7 and M16 inflection paradigms each apply to a hand-built word form, the affixed
// output matching the paradigm's right-hand string verbatim. ---

TEST(rule_interpreter, M2AddsSForThePlural) {
  // SNG:=0>"";PLR:=0>"s"; -- table>tables (docs/unl-reference/formats/inflection.md).
  const GrammarRule& paradigm = FindRule(EngToAfrRuleSet().from_inflection(), "M2");
  ASSERT_EQ(paradigm.id, "M2");
  const RuleSet isolated = RuleSet::from_rules({}, {}, {paradigm}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  Trace trace;
  const std::string result =
      interpreter.inflect("M2", "PLR", "table", /*from_language=*/true, trace);
  EXPECT_EQ(result, "tables");
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "M2");
}

TEST(rule_interpreter, M7ReplacesManWithMenForThePlural) {
  // SNG:=0>"";PLR:="man":"men"; -- man>men (docs/unl-reference/formats/inflection.md).
  const GrammarRule& paradigm = FindRule(EngToAfrRuleSet().from_inflection(), "M7");
  ASSERT_EQ(paradigm.id, "M7");
  const RuleSet isolated = RuleSet::from_rules({}, {}, {paradigm}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  Trace trace;
  const std::string result = interpreter.inflect("M7", "PLR", "man", /*from_language=*/true, trace);
  EXPECT_EQ(result, "men");
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "M7");
}

TEST(rule_interpreter, M16AddsEdForTheRegularPast) {
  // INF:=0>"";PAS:=0>"ed";PTP:=0>"ed";3PS&PRS:=0>"s";GER:=0>"ing";
  // kill > killed, killed, killing, kills (docs/unl-reference/formats/inflection.md).
  const GrammarRule& paradigm = FindRule(EngToAfrRuleSet().from_inflection(), "M16");
  ASSERT_EQ(paradigm.id, "M16");
  const RuleSet isolated = RuleSet::from_rules({}, {}, {paradigm}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  Trace trace;
  const std::string result =
      interpreter.inflect("M16", "PAS", "kill", /*from_language=*/true, trace);
  EXPECT_EQ(result, "killed");
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "M16");
}

// --- A homograph resolved by one of disambiguation.yaml's 13 real afr records picks the sense
// the D-rule's condition selects, proving disambiguation runs before analysis/generation. ---

TEST(rule_interpreter, AfrDRuleEightPrunesThePlaceReadingBeforeATemporalNoun) {
  // (P,rel=plc)(BLK)(N,TIM)=0; data/languages/afr/grammar/disambiguation.yaml id "8"
  // (data/archive/exports/afr/44.dgrammar.txt line 14): a preposition's place-relation reading
  // cannot stand directly before a temporal noun, so that reading is deleted; only the
  // rel=tim reading of the same preposition can survive that context.
  const GrammarRule& rule = FindRule(AfrRuleSet().disambiguation(), "8");
  ASSERT_EQ(rule.id, "8");
  const RuleSet isolated = RuleSet::from_rules({rule}, {}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  std::vector<Position> positions = {
      Position{.candidates = {Candidate{.surface = "voor",
                                        .features = {{"POS", "P"}, {"rel", "plc"}},
                                        .attributes = {}},
                              Candidate{.surface = "voor",
                                        .features = {{"POS", "P"}, {"rel", "tim"}},
                                        .attributes = {}}}},
      Position{.candidates = {Candidate{
                   .surface = " ", .features = {{"POS", "BLK"}}, .attributes = {}}}},
      Position{
          .candidates = {Candidate{
              .surface = "week", .features = {{"POS", "N"}, {"SEM", "TIM"}}, .attributes = {}}}},
  };
  Trace trace;
  interpreter.disambiguate(positions, trace);

  ASSERT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(positions[0].candidates[0], "rel", "tim"));
  EXPECT_FALSE(HasFeature(positions[0].candidates[0], "rel", "plc"));
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "8");
}

// --- The empty-list fallback (issue 21) resolves a homograph with no covering D-rule, not by
// crash or silent drop. Issue 195 test D13: hand-built, no I/O, because the real eng list is no
// longer empty. ---

TEST(rule_interpreter, D13EmptyDisambiguationListFallsBackToFirstCandidate) {
  const RuleSet empty = RuleSet::from_rules({}, {}, {}, {}, {}, {});
  const RuleInterpreter interpreter(empty);

  std::vector<Position> positions = {Position{
      .candidates = {
          Candidate{.surface = "bank", .features = {{"sense", "financial"}}, .attributes = {}},
          Candidate{.surface = "bank", .features = {{"sense", "river"}}, .attributes = {}}}}};
  Trace trace;
  EXPECT_NO_THROW(interpreter.disambiguate(positions, trace));

  ASSERT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(positions[0].candidates[0], "sense", "financial"));
  EXPECT_TRUE(trace.entries.empty());
}

// --- Disambiguation runs before analysis, not after: a purely in-memory RuleSet
// (docs/standards/testing.md: "Domain tests are pure: no file I/O"), reusing the real rule "1"
// already extracted above so its content is not re-typed. ---

TEST(rule_interpreter, DisambiguationTraceComesBeforeAnalysisTraceAndFeedsItsResult) {
  const GrammarRule real_rule_one = FindRule(EngToAfrRuleSet().analysis(), "1");
  ASSERT_EQ(real_rule_one.id, "1");

  const GrammarRule prune_singular{.id = "T1",
                                   .kind = "disambiguation",
                                   .lhs = "(N,SNG)",
                                   .rhs = "0",
                                   .comment =
                                       "test-only: a singular reading cannot stand where "
                                       "context has already fixed the word as plural"};
  const RuleSet ruleset = RuleSet::from_rules({prune_singular}, {real_rule_one}, {}, {}, {}, {});
  const RuleInterpreter interpreter(ruleset);

  // The wrong (SNG) reading sits first; if the fallback ("first wins") ran instead of the real
  // rule, the wrong reading would survive. Placing it first rules that out.
  std::vector<Position> positions = {Position{
      .candidates = {
          Candidate{
              .surface = "fish", .features = {{"LEX", "N"}, {"NUM", "SNG"}}, .attributes = {}},
          Candidate{
              .surface = "fish", .features = {{"LEX", "N"}, {"NUM", "PLR"}}, .attributes = {}}}}};

  Trace trace;
  interpreter.disambiguate(positions, trace);
  ASSERT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(positions[0].candidates[0], "NUM", "PLR"));
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "T1");

  std::vector<Candidate> survivor = {positions[0].candidates[0]};
  const std::vector<Candidate> analysed = interpreter.analyse(std::move(survivor), trace);
  ASSERT_EQ(trace.entries.size(), 2u);
  EXPECT_EQ(trace.entries[0].rule, "T1");  // disambiguation's entry is still first.
  EXPECT_EQ(trace.entries[1].rule, "1");   // analysis's entry comes after it, never before.
  ASSERT_EQ(analysed.size(), 1u);
  EXPECT_TRUE(HasAttribute(analysed[0], "@pl"));

  // Causal proof, not just call order: feeding analyse() the reading disambiguation would have
  // deleted (skipping or reordering the step) does not fire rule "1" at all -- NUM,SNG never
  // satisfies "(N,PLR,^@pl,...)". Order is not incidental; the wrong order gives a wrong result.
  std::vector<Candidate> wrong_reading = {
      Candidate{.surface = "fish", .features = {{"LEX", "N"}, {"NUM", "SNG"}}, .attributes = {}}};
  Trace trace_if_skipped;
  const std::vector<Candidate> analysed_wrong =
      interpreter.analyse(std::move(wrong_reading), trace_if_skipped);
  EXPECT_TRUE(trace_if_skipped.entries.empty());
  ASSERT_EQ(analysed_wrong.size(), 1u);
  EXPECT_FALSE(HasAttribute(analysed_wrong[0], "@pl"));
}

// --- Issue 195 (195-test-cases.md, block D): English D-rules for in, on and about. ---

const Dictionary& EngDictionary() {
  static const Dictionary dictionary = Dictionary::load(EngStoreRoot(), Lang::eng);
  return dictionary;
}

// Builds positions the way build_positions in engine/src/engine.cpp does: every dictionary entry
// one reading in shard order, a token with no entry one reading with its surface and no features.
// The `$uw` feature engine.cpp adds is added here too, so a reading is the one the engine sees.
std::vector<Position> BuildEngPositions(const std::string& text) {
  const std::vector<Token> tokens = tokenise(text);
  const std::vector<LookupEntry> lookups = EngDictionary().lookup_tokens(tokens);
  std::vector<Position> positions;
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    Position position;
    if (lookups[i].resolved()) {
      for (const DictionaryEntry& entry : lookups[i].entries) {
        std::vector<Feature> features = entry.features;
        features.emplace_back("$uw", entry.uw);
        position.candidates.push_back(Candidate{
            .surface = std::string(tokens[i].surface), .features = features, .attributes = {}});
      }
    } else {
      position.candidates.push_back(
          Candidate{.surface = std::string(tokens[i].surface), .features = {}, .attributes = {}});
    }
    positions.push_back(std::move(position));
  }
  return positions;
}

bool IsPreposition(const Candidate& c) { return HasFeature(c, "POS", "PRE"); }

bool SameReadings(const std::vector<Candidate>& a, const std::vector<Candidate>& b) {
  if (a.size() != b.size()) {
    return false;
  }
  for (std::size_t i = 0; i < a.size(); ++i) {
    if (a[i].surface != b[i].surface || a[i].features != b[i].features ||
        a[i].attributes != b[i].attributes) {
      return false;
    }
  }
  return true;
}

// The readings of `before` that carry POS=PRE, in order.
std::vector<Candidate> PrepositionReadings(const std::vector<Candidate>& before) {
  std::vector<Candidate> out;
  std::ranges::copy_if(before, std::back_inserter(out), IsPreposition);
  return out;
}

std::vector<std::string> FiredIds(const Trace& trace) {
  std::vector<std::string> ids;
  for (const TraceEntry& entry : trace.entries) {
    EXPECT_EQ(entry.event, TraceEvent::fired);
    ids.push_back(entry.rule);
  }
  return ids;
}

std::vector<std::string> Ids(std::initializer_list<const char*> ids) {
  return std::vector<std::string>(ids.begin(), ids.end());
}

// Runs the real eng rule set's disambiguate on `text`. `before` receives the lookup positions.
struct DisambiguationRun {
  std::vector<Position> before;
  std::vector<Position> after;
  Trace trace;
};

DisambiguationRun RunEng(const std::string& text) {
  DisambiguationRun run;
  run.before = BuildEngPositions(text);
  run.after = run.before;
  const RuleInterpreter interpreter(EngToAfrRuleSet());
  interpreter.disambiguate(run.after, run.trace);
  return run;
}

// Expects position `i` to hold exactly the preposition readings the lookup gave, in order.
void ExpectOnlyPreposition(const DisambiguationRun& run, std::size_t i) {
  ASSERT_LT(i, run.after.size());
  const std::vector<Candidate> expected = PrepositionReadings(run.before[i].candidates);
  ASSERT_FALSE(expected.empty());
  EXPECT_TRUE(SameReadings(run.after[i].candidates, expected))
      << "position " << i << " holds " << run.after[i].candidates.size() << " readings, expected "
      << expected.size() << " preposition readings";
}

void ExpectKept(const DisambiguationRun& run, std::size_t i) {
  ASSERT_LT(i, run.after.size());
  EXPECT_TRUE(SameReadings(run.after[i].candidates, run.before[i].candidates))
      << "position " << i << " holds " << run.after[i].candidates.size()
      << " readings, the lookup gave " << run.before[i].candidates.size();
}

void ExpectAllKept(const DisambiguationRun& run) {
  ASSERT_EQ(run.after.size(), run.before.size());
  for (std::size_t i = 0; i < run.before.size(); ++i) {
    ExpectKept(run, i);
  }
}

// Issue 199 helpers (199-test-cases.md, "How to read the rows").
bool HasFeatureKey(const Candidate& c, std::string_view key) {
  return std::ranges::any_of(c.features, [&](const Feature& f) { return f.first == key; });
}

// countable: the lookup's readings minus every reading with LEX=N and no CAR feature, in order.
void ExpectCountable(const DisambiguationRun& run, std::size_t i) {
  ASSERT_LT(i, run.after.size());
  std::vector<Candidate> expected;
  std::ranges::copy_if(run.before[i].candidates, std::back_inserter(expected), [](const Candidate& c) {
    return !(HasFeature(c, "LEX", "N") && !HasFeatureKey(c, "CAR"));
  });
  ASSERT_FALSE(expected.empty());
  EXPECT_TRUE(SameReadings(run.after[i].candidates, expected))
      << "position " << i << " holds " << run.after[i].candidates.size()
      << " readings, expected the " << expected.size() << " countable ones";
}

// `key=value` only: the lookup's readings whose feature `key` is `value`, in order.
void ExpectOnlyFeature(const DisambiguationRun& run, std::size_t i, std::string_view key,
                       std::string_view value) {
  ASSERT_LT(i, run.after.size());
  std::vector<Candidate> expected;
  std::ranges::copy_if(run.before[i].candidates, std::back_inserter(expected),
                       [&](const Candidate& c) { return HasFeature(c, key, value); });
  ASSERT_FALSE(expected.empty());
  EXPECT_TRUE(SameReadings(run.after[i].candidates, expected))
      << "position " << i << " holds " << run.after[i].candidates.size()
      << " readings, expected the " << expected.size() << " with " << key << "=" << value;
}

const char* const kA15 =
    "the beautiful book about the city of Paris without pictures and photos on the table";

// Expects position `i` to hold exactly the readings of the lookup that carry rel=plc, in order.
void ExpectOnlyPlace(const DisambiguationRun& run, std::size_t i) {
  ASSERT_LT(i, run.after.size());
  std::vector<Candidate> expected;
  std::ranges::copy_if(run.before[i].candidates, std::back_inserter(expected),
                       [](const Candidate& c) { return HasFeature(c, "rel", "plc"); });
  ASSERT_EQ(expected.size(), 4u);
  EXPECT_TRUE(SameReadings(run.after[i].candidates, expected))
      << "position " << i << " holds " << run.after[i].candidates.size()
      << " readings, expected the " << expected.size() << " place readings";
}

// R10 (198-test-cases.md, replacing 195 D01), amended by 199 (199-test-cases.md, "Existing tests"):
// rule 1 strikes the non-prepositions, rule 5 the non-place prepositions, rule 10 the uncountable
// nouns after a determiner.
TEST(rule_interpreter, D01RuleOneKeepsThePrepositionOfInInABookInABox) {
  const DisambiguationRun run = RunEng("a book in a box");
  ASSERT_EQ(run.after.size(), 5u);
  ExpectOnlyPlace(run, 2);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
  ExpectKept(run, 3);
  ExpectCountable(run, 4);
  EXPECT_EQ(FiredIds(run.trace), Ids({"1", "5", "10"}));
}

TEST(rule_interpreter, D02RuleOneLeavesTheArticleAfterInWithAllFourReadings) {
  const DisambiguationRun run = RunEng("a book in a box");
  ASSERT_EQ(run.after.size(), 5u);
  ASSERT_EQ(run.before[3].candidates.size(), 4u);
  ExpectKept(run, 3);
  EXPECT_TRUE(HasFeature(run.after[3].candidates.front(), "POS", "ART"));
  EXPECT_TRUE(HasFeature(run.after[3].candidates.front(), "att", "@indef"));
  ExpectCountable(run, 4);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
}

TEST(rule_interpreter, D03RuleFourKeepsThePrepositionOfAboutBeforeAnUnknownWord) {
  const DisambiguationRun run = RunEng("a book about Geneva");
  ASSERT_EQ(run.after.size(), 4u);
  ExpectOnlyPreposition(run, 2);
  ASSERT_EQ(run.after[3].candidates.size(), 1u);
  EXPECT_EQ(run.after[3].candidates[0].surface, "Geneva");
  EXPECT_TRUE(run.after[3].candidates[0].features.empty());
  EXPECT_EQ(FiredIds(run.trace), Ids({"4", "10"}));  // 199: rule 10 strikes `book`'s uncountable readings
}

TEST(rule_interpreter, D04RulesTwoAndThreeKeepThePrepositionsInA15) {
  const DisambiguationRun run = RunEng(kA15);
  ASSERT_EQ(run.after.size(), 15u);
  ExpectOnlyPreposition(run, 3);   // about
  ExpectOnlyPreposition(run, 12);  // on
  EXPECT_EQ(FiredIds(run.trace), Ids({"2", "3", "10"}));  // 199: rule 10 after a determiner
}

TEST(rule_interpreter, D05RulesTwoAndThreeLeaveTheArticlesAndNounsOfA15Whole) {
  const DisambiguationRun run = RunEng(kA15);
  ASSERT_EQ(run.after.size(), 15u);
  ASSERT_EQ(run.before[4].candidates.size(), 3u);
  ASSERT_EQ(run.before[13].candidates.size(), 3u);
  ExpectKept(run, 4);   // the
  ExpectKept(run, 13);  // the
  ExpectCountable(run, 5);   // city (199: rule 10)
  ExpectCountable(run, 14);  // table (199: rule 10)
}

// K28 (199-test-cases.md): the basic.yaml rows no D-rule touches. These are 195 D06's A01, A04, A08,
// A11 and A13 lines, unchanged. Must-not row for eng-dis-6 to eng-dis-10.
#define K28_ROW(NAME, TEXT)                                \
  TEST(rule_interpreter, K28##NAME##NoEnglishDRuleFires) { \
    const DisambiguationRun run = RunEng(TEXT);            \
    ExpectAllKept(run);                                    \
    EXPECT_TRUE(run.trace.entries.empty());                \
  }

K28_ROW(A01, "book")
K28_ROW(A04, "books")
K28_ROW(A08, "a beautiful book")
K28_ROW(A11, "the beautiful car")
K28_ROW(A13, "John and Mary")
#undef K28_ROW

// K20: replaces 195 D06's A06 line.
TEST(rule_interpreter, K20RulesSixAndTenOnAllTheBooks) {
  const DisambiguationRun run = RunEng("all the books");
  ASSERT_EQ(run.after.size(), 3u);
  ExpectOnlyFeature(run, 0, "att", "@all");
  ExpectKept(run, 1);
  ExpectCountable(run, 2);
  EXPECT_EQ(FiredIds(run.trace), Ids({"6", "10"}));
}

// K21: must-not row for eng-dis-6, no determiner follows.
TEST(rule_interpreter, K21RuleSixDoesNotFireOnAllBooks) {
  const DisambiguationRun run = RunEng("all books");
  ASSERT_EQ(run.after.size(), 2u);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

// K22: replaces 195 D06's A10 line.
TEST(rule_interpreter, K22RulesSevenEightAndTenOnA10) {
  const DisambiguationRun run = RunEng("some days before the summer");
  ASSERT_EQ(run.after.size(), 5u);
  ExpectOnlyFeature(run, 0, "att", "@paucal");
  ExpectCountable(run, 1);
  ExpectOnlyFeature(run, 2, "rel", "tim");
  ExpectKept(run, 3);
  ExpectCountable(run, 4);
  EXPECT_EQ(FiredIds(run.trace), Ids({"7", "8", "10"}));
}

// K23: must-not row for eng-dis-7, `of` is no noun.
TEST(rule_interpreter, K23RuleSevenDoesNotFireOnSomeOfTheseBooks) {
  const DisambiguationRun run = RunEng("some of these books");
  ASSERT_GT(run.after.size(), 0u);
  ExpectKept(run, 0);
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

// K24: must-not row for eng-dis-8, no `box` reading is SEM=TIM.
TEST(rule_interpreter, K24RuleEightDoesNotFireOnABookBeforeABox) {
  const DisambiguationRun run = RunEng("a book before a box");
  ASSERT_EQ(run.after.size(), 5u);
  ExpectKept(run, 2);
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

// K25: replaces 195 D08 and 198 R11, one body for both. Corpus line 141.
TEST(rule_interpreter, D08RuleOneKeepsThePrepositionOfInBeforeADefiniteArticle) {
  const DisambiguationRun run = RunEng("some days in the summer");
  ASSERT_EQ(run.after.size(), 5u);
  ExpectOnlyPreposition(run, 2);
  ExpectOnlyFeature(run, 0, "att", "@paucal");
  ExpectCountable(run, 1);
  ExpectKept(run, 3);
  ExpectCountable(run, 4);
  EXPECT_EQ(FiredIds(run.trace), Ids({"1", "7", "10"}));
}

TEST(rule_interpreter, R11RuleFiveLeavesInBeforeATemporalNounWhole) {
  const DisambiguationRun run = RunEng("some days in the summer");
  ASSERT_EQ(run.after.size(), 5u);
  ExpectOnlyPreposition(run, 2);
  ExpectOnlyFeature(run, 0, "att", "@paucal");
  ExpectCountable(run, 1);
  ExpectKept(run, 3);
  ExpectCountable(run, 4);
  EXPECT_EQ(FiredIds(run.trace), Ids({"1", "7", "10"}));
}

// K26: replaces 195 D06's A12 line. Rule 10 is silent: an adjective stands between `a` and `car`.
TEST(rule_interpreter, K26RuleNineOnAVeryBeautifulCar) {
  const DisambiguationRun run = RunEng("a very beautiful car");
  ASSERT_EQ(run.after.size(), 4u);
  ExpectKept(run, 0);
  ASSERT_EQ(run.after[1].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(run.after[1].candidates[0], "POS", "SAV"));
  EXPECT_TRUE(HasFeature(run.after[1].candidates[0], "att", "@plus"));
  EXPECT_TRUE(HasFeature(run.after[1].candidates[0], "$uw", "400031899"));
  ExpectOnlyFeature(run, 1, "att", "@plus");
  ExpectKept(run, 2);
  ExpectKept(run, 3);
  EXPECT_EQ(FiredIds(run.trace), Ids({"9"}));
}

// K27: replaces 195 D06's A02, A03, A05 and A14 lines, 195 D07 and 198 R12; one test per input.
TEST(rule_interpreter, K27_the_book) {
  const DisambiguationRun run = RunEng("the book");
  ASSERT_EQ(run.after.size(), 2u);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

TEST(rule_interpreter, K27_a_book) {
  const DisambiguationRun run = RunEng("a book");
  ASSERT_EQ(run.after.size(), 2u);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

TEST(rule_interpreter, K27_the_books) {
  const DisambiguationRun run = RunEng("the books");
  ASSERT_EQ(run.after.size(), 2u);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

TEST(rule_interpreter, K27_a_car_a_book_and_a_mug) {
  const DisambiguationRun run = RunEng("a car, a book and a mug");
  ASSERT_EQ(run.after.size(), 8u);
  for (std::size_t i = 0; i < run.after.size(); ++i) {
    if (i == 1 || i == 4 || i == 7) {
      ExpectCountable(run, i);
    } else {
      ExpectKept(run, i);
    }
  }
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));
}

TEST(rule_interpreter, D07RuleTwoKeepsThePrepositionOfOnInABookOnABox) {
  // K27: 195 D07 amended, trace [2, 10].
  const DisambiguationRun run = RunEng("a book on a box");
  ASSERT_EQ(run.after.size(), 5u);
  ExpectOnlyPreposition(run, 2);
  ExpectKept(run, 3);
  ExpectKept(run, 0);
  ExpectCountable(run, 1);
  ExpectCountable(run, 4);
  EXPECT_EQ(FiredIds(run.trace), Ids({"2", "10"}));
}

TEST(rule_interpreter, R12RuleFiveFiresOnALocationNoun) {
  // K27: `water in the region`, region@3 countable, trace [1, 5, 10].
  const DisambiguationRun run = RunEng("water in the region");
  ASSERT_EQ(run.after.size(), 4u);
  ExpectOnlyPlace(run, 1);
  ExpectKept(run, 0);
  ExpectKept(run, 2);
  ExpectCountable(run, 3);
  EXPECT_EQ(FiredIds(run.trace), Ids({"1", "5", "10"}));
}

TEST(rule_interpreter, R13RuleFiveLeavesInBeforeANounWithNoArtefactOrLocationReading) {
  // 198 R13 amended by 199: party@3 countable, a@2 kept, trace [1, 10].
  const DisambiguationRun run = RunEng("woman in a party");
  ASSERT_EQ(run.after.size(), 4u);
  ExpectOnlyPreposition(run, 1);
  ExpectKept(run, 2);
  ExpectCountable(run, 3);
  EXPECT_EQ(FiredIds(run.trace), Ids({"1", "10"}));
}

// R14 to R16: rule 5 alone, hand-built, no I/O. The rule is the real record, extracted by id.
Candidate Reading(const char* surface, std::vector<Feature> features) {
  return Candidate{.surface = surface, .features = std::move(features), .attributes = {}};
}

std::vector<Candidate> InReadings(const char* surface) {
  return {Reading(surface, {{"LEX", "P"}, {"POS", "PRE"}, {"rel", "tim"}}),
          Reading(surface, {{"LEX", "P"}, {"POS", "PRE"}, {"rel", "man"}}),
          Reading(surface, {{"LEX", "P"}, {"POS", "PRE"}, {"rel", "plc"}})};
}

std::vector<Candidate> ArticleReadings() {
  return {Reading("a", {{"LEX", "D"}, {"POS", "ART"}}),
          Reading("a", {{"LEX", "N"}, {"POS", "NOU"}})};
}

std::vector<Position> HandBuilt(const char* first, std::vector<Candidate> box) {
  return {Position{.candidates = InReadings(first)}, Position{.candidates = ArticleReadings()},
          Position{.candidates = std::move(box)}};
}

TEST(rule_interpreter, R14RuleFiveAloneKeepsThePlaceReadingAndBothPreferredPositions) {
  const RuleSet isolated =
      RuleSet::from_rules({FindRule(EngToAfrRuleSet().disambiguation(), "5")}, {}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);
  const std::vector<Candidate> box = {Reading("box", {{"LEX", "N"}, {"SEM", "ACT"}}),
                                      Reading("box", {{"LEX", "N"}, {"SEM", "ARF"}})};
  std::vector<Position> positions = HandBuilt("in", box);
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ASSERT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(positions[0].candidates[0], "rel", "plc"));
  EXPECT_TRUE(SameReadings(positions[1].candidates, ArticleReadings()));
  EXPECT_TRUE(SameReadings(positions[2].candidates, box));
  EXPECT_EQ(FiredIds(trace), Ids({"5"}));
}

TEST(rule_interpreter, R15RuleFiveAloneDoesNotFireWithoutAnArtefactOrLocationReading) {
  const RuleSet isolated =
      RuleSet::from_rules({FindRule(EngToAfrRuleSet().disambiguation(), "5")}, {}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);
  const std::vector<Candidate> box = {Reading("box", {{"LEX", "N"}, {"SEM", "ACT"}}),
                                      Reading("box", {{"LEX", "N"}, {"SEM", "TIM"}})};
  std::vector<Position> positions = HandBuilt("in", box);
  const std::vector<Position> before = positions;
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ASSERT_EQ(positions.size(), 3u);
  for (std::size_t i = 0; i < 3; ++i) {
    EXPECT_TRUE(SameReadings(positions[i].candidates, before[i].candidates)) << i;
  }
  EXPECT_TRUE(trace.entries.empty());
}

TEST(rule_interpreter, R16RuleFiveAloneReadsTheSurfaceInOnly) {
  const RuleSet isolated =
      RuleSet::from_rules({FindRule(EngToAfrRuleSet().disambiguation(), "5")}, {}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);
  const std::vector<Candidate> box = {Reading("box", {{"LEX", "N"}, {"SEM", "ACT"}}),
                                      Reading("box", {{"LEX", "N"}, {"SEM", "ARF"}})};
  std::vector<Position> positions = HandBuilt("on", box);
  const std::vector<Position> before = positions;
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ASSERT_EQ(positions.size(), 3u);
  for (std::size_t i = 0; i < 3; ++i) {
    EXPECT_TRUE(SameReadings(positions[i].candidates, before[i].candidates)) << i;
  }
  EXPECT_TRUE(trace.entries.empty());
}

TEST(rule_interpreter, D09AdverbialInInComeInKeepsEveryReadingAndTheAdverbFirst) {
  const DisambiguationRun run = RunEng("come in");
  ASSERT_EQ(run.after.size(), 2u);
  ExpectKept(run, 1);
  const Candidate& front = run.after[1].candidates.front();
  EXPECT_TRUE(HasFeature(front, "LEX", "A"));
  EXPECT_TRUE(HasFeature(front, "POS", "AAV"));
  EXPECT_TRUE(run.trace.entries.empty());
}

TEST(rule_interpreter, D10AdverbialOnInTheTortoiseWentOnKeepsEveryReadingAndTheAdverbFirst) {
  const DisambiguationRun run =
      RunEng("The Tortoise went on with a slow but steady pace straight to the end of the course.");
  ASSERT_GT(run.after.size(), 3u);
  EXPECT_EQ(run.after[3].candidates.front().surface, "on");
  ExpectKept(run, 3);
  const Candidate& front = run.after[3].candidates.front();
  EXPECT_TRUE(HasFeature(front, "LEX", "A"));
  EXPECT_TRUE(HasFeature(front, "POS", "AAV"));
  EXPECT_EQ(FiredIds(run.trace), Ids({"10"}));  // 199: rule 10 fires elsewhere in the sentence
}

TEST(rule_interpreter, D11AdverbialAboutBeforeAFullStopKeepsEveryReadingAndTheAdverbFirst) {
  const DisambiguationRun run = RunEng("he walked about.");
  ASSERT_EQ(run.after.size(), 4u);
  EXPECT_EQ(run.after[2].candidates.front().surface, "about");
  EXPECT_EQ(run.after[3].candidates.front().surface, ".");
  ExpectKept(run, 2);
  const Candidate& front = run.after[2].candidates.front();
  EXPECT_TRUE(HasFeature(front, "LEX", "A"));
  EXPECT_TRUE(HasFeature(front, "POS", "AAV"));
  EXPECT_TRUE(run.trace.entries.empty());
}

// D12: B1 (one deletion per reading) and B2 (a #PREFERRED node is never pruned) at the smallest
// size. Hand-built, no I/O. Today's matcher leaves position 0 with only `tim`.
TEST(rule_interpreter, D12ARuleDeletesAReadingOnceAndNeverPrunesAPreferredNode) {
  const GrammarRule rule_one{.id = "1",
                             .kind = "disambiguation",
                             .lhs = "([in],^POS=PRE)(POS=ART,#PREFERRED)",
                             .rhs = "0",
                             .comment = "test-only copy of eng-dis-1"};
  const RuleSet isolated = RuleSet::from_rules({rule_one}, {}, {}, {}, {}, {});
  const RuleInterpreter interpreter(isolated);

  const Candidate adverb{
      .surface = "in", .features = {{"LEX", "A"}, {"POS", "AAV"}}, .attributes = {}};
  const Candidate adjective{
      .surface = "in", .features = {{"LEX", "J"}, {"POS", "ADJ"}}, .attributes = {}};
  const Candidate plc{.surface = "in",
                      .features = {{"LEX", "P"}, {"POS", "PRE"}, {"rel", "plc"}},
                      .attributes = {}};
  const Candidate tim{.surface = "in",
                      .features = {{"LEX", "P"}, {"POS", "PRE"}, {"rel", "tim"}},
                      .attributes = {}};
  const Candidate art1{
      .surface = "a", .features = {{"LEX", "D"}, {"POS", "ART"}}, .attributes = {}};
  const Candidate art2{
      .surface = "a", .features = {{"LEX", "D"}, {"POS", "ART"}}, .attributes = {}};
  const Candidate noun{
      .surface = "a", .features = {{"LEX", "N"}, {"POS", "NOU"}}, .attributes = {}};

  std::vector<Position> positions = {Position{.candidates = {adverb, adjective, plc, tim}},
                                     Position{.candidates = {art1, art2, noun}}};
  Trace trace;
  interpreter.disambiguate(positions, trace);

  ASSERT_EQ(positions[0].candidates.size(), 2u);
  EXPECT_TRUE(HasFeature(positions[0].candidates[0], "rel", "plc"));
  EXPECT_TRUE(HasFeature(positions[0].candidates[1], "rel", "tim"));
  ASSERT_EQ(positions[1].candidates.size(), 3u);
  EXPECT_TRUE(SameReadings(positions[1].candidates, {art1, art2, noun}));
  EXPECT_EQ(FiredIds(trace), Ids({"1"}));
}

// --- Engine::load(RuleSet) is real: it keeps the RuleSet it was given and Engine::translate reads
// it back (issue 23, tests/unit/engine_status_test.cpp carries the full Status/Trace coverage). ---

TEST(rule_interpreter, EngineLoadAcceptsARealRuleSetAndTranslateReadsItBack) {
  const Engine engine = Engine::load(EngToAfrRuleSet());
  const Result result = engine.translate("book", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::ok);  // "book" is dictionary-resolved; no rule needs to fire.
}

// --- Issue 181, rows N43 and N56 to N60 (docs/factory/issues/181-test-cases.md). ---

TEST(rule_interpreter, N43_inflect_m7_replaces_the_last_letter_of_dag) {
  Trace trace;
  const RuleInterpreter interpreter(EngToAfrRuleSet());
  EXPECT_EQ(interpreter.inflect("M7", "PLR", "dag", /*from_language=*/false, trace), "dae");
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "M7");
  EXPECT_EQ(trace.entries[0].event, TraceEvent::fired);
}

TEST(rule_interpreter, N64_inflect_m5_leaves_an_unsupported_action_list_unchanged) {
  Trace trace;
  const RuleInterpreter interpreter(EngToAfrRuleSet());
  EXPECT_EQ(interpreter.inflect("M5", "PLR", "bestuur", /*from_language=*/false, trace), "bestuur");
  EXPECT_TRUE(trace.entries.empty());
}

TEST(rule_interpreter, N56_rule_set_load_reads_the_target_disambiguation_grammar) {
  const RuleSet& rules = EngToAfrRuleSet();
  ASSERT_EQ(rules.to_disambiguation().size(), 13u);
  for (std::size_t i = 0; i < 13; ++i) {
    EXPECT_EQ(rules.to_disambiguation()[i].id, std::to_string(i + 1));
    EXPECT_EQ(rules.to_disambiguation()[i].kind, "disambiguation");
    EXPECT_EQ(rules.to_disambiguation()[i].rhs, "0");
  }
  if (rules.to_disambiguation().size() >= 5) {
    EXPECT_EQ(rules.to_disambiguation()[4].lhs, "(D,^AFT)(BLK)({V|P|AAV})");
  }
  // Issue 199 (199-test-cases.md, K55): eng now holds ten disambiguation records.
  EXPECT_EQ(rules.disambiguation().size(), 10u);
}

TEST(rule_interpreter, N57_from_rules_keeps_all_seven_lists) {
  auto one = [](const char* id) {
    GrammarRule rule;
    rule.id = id;
    return std::vector<GrammarRule>{rule};
  };
  const RuleSet rules =
      RuleSet::from_rules(one("d"), one("a"), one("fi"), one("s"), one("g"), one("ti"), one("td"));
  ASSERT_EQ(rules.disambiguation().size(), 1u);
  EXPECT_EQ(rules.disambiguation()[0].id, "d");
  ASSERT_EQ(rules.analysis().size(), 1u);
  EXPECT_EQ(rules.analysis()[0].id, "a");
  ASSERT_EQ(rules.from_inflection().size(), 1u);
  EXPECT_EQ(rules.from_inflection()[0].id, "fi");
  ASSERT_EQ(rules.subcategorisation().size(), 1u);
  EXPECT_EQ(rules.subcategorisation()[0].id, "s");
  ASSERT_EQ(rules.generation().size(), 1u);
  EXPECT_EQ(rules.generation()[0].id, "g");
  ASSERT_EQ(rules.to_inflection().size(), 1u);
  EXPECT_EQ(rules.to_inflection()[0].id, "ti");
  ASSERT_EQ(rules.to_disambiguation().size(), 1u);
  EXPECT_EQ(rules.to_disambiguation()[0].id, "td");
}

Candidate Cand(std::string surface, std::vector<Feature> features) {
  return Candidate{std::move(surface), std::move(features), {}};
}

std::vector<Position> GeneratedList(const Candidate& determiner, std::vector<Candidate> word) {
  std::vector<Position> positions(3);
  positions[0].candidates = {determiner};
  positions[1].candidates = {Cand(" ", {{"BLK", ""}})};
  positions[2].candidates = std::move(word);
  return positions;
}

const std::vector<Candidate> kMooiReadings = {
    Cand("mooi", {{"LEX", "A"}, {"POS", "AAV"}, {"SEM", "MAN"}}),
    Cand("mooi", {{"LEX", "J"}, {"POS", "ADJ"}})};

RuleSet DisRuleFive() {
  // Record 5 of data/languages/afr/grammar/disambiguation.yaml, verbatim.
  GrammarRule rule;
  rule.id = "5";
  rule.kind = "disambiguation";
  rule.lhs = "(D,^AFT)(BLK)({V|P|AAV})";
  rule.rhs = "0";
  return RuleSet::from_rules({}, {}, {}, {}, {}, {}, {rule});
}

TEST(rule_interpreter, N58_afr_dis_5_prunes_the_adverb_reading_after_a_determiner) {
  const RuleSet isolated = DisRuleFive();
  const RuleInterpreter interpreter(isolated);
  std::vector<Position> positions =
      GeneratedList(Cand("'n", {{"LEX", "D"}, {"POS", "ART"}}), kMooiReadings);
  Trace trace;
  interpreter.disambiguate_target(positions, Lang::afr, trace);
  ASSERT_EQ(positions[2].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(positions[2].candidates[0], "POS", "ADJ"));
  EXPECT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_EQ(positions[1].candidates.size(), 1u);
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "afr-dis-5");
  EXPECT_EQ(trace.entries[0].event, TraceEvent::fired);
}

TEST(rule_interpreter, N59_afr_dis_5_leaves_a_noun_after_a_determiner) {
  const RuleSet isolated = DisRuleFive();
  const RuleInterpreter interpreter(isolated);
  std::vector<Position> positions =
      GeneratedList(Cand("die", {{"LEX", "D"}, {"POS", "ART"}}),
                    {Cand("boek", {{"LEX", "N"}, {"POS", "NOU"}}),
                     Cand("boek", {{"LEX", "N"}, {"POS", "NOU"}, {"NUM", "PLR"}})});
  Trace trace;
  interpreter.disambiguate_target(positions, Lang::afr, trace);
  EXPECT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_EQ(positions[1].candidates.size(), 1u);
  EXPECT_EQ(positions[2].candidates.size(), 2u);
  EXPECT_TRUE(trace.entries.empty());
}

TEST(rule_interpreter, N60_afr_dis_5_spares_a_determiner_that_may_stand_after) {
  const RuleSet isolated = DisRuleFive();
  const RuleInterpreter interpreter(isolated);
  std::vector<Position> positions =
      GeneratedList(Cand("'n", {{"LEX", "D"}, {"POS", "QUA"}, {"AFT", ""}}), kMooiReadings);
  Trace trace;
  interpreter.disambiguate_target(positions, Lang::afr, trace);
  EXPECT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_EQ(positions[1].candidates.size(), 1u);
  EXPECT_EQ(positions[2].candidates.size(), 2u);
  EXPECT_TRUE(trace.entries.empty());
}


// K30 to K34: rules 10 and 9 alone, hand-built, no I/O. Each rule is the real record, by id.
RuleSet IsolatedDisambiguation(const char* id) {
  return RuleSet::from_rules({FindRule(EngToAfrRuleSet().disambiguation(), id)}, {}, {}, {}, {}, {});
}

void ExpectSamePositions(const std::vector<Position>& actual, const std::vector<Position>& expected) {
  ASSERT_EQ(actual.size(), expected.size());
  for (std::size_t i = 0; i < expected.size(); ++i) {
    EXPECT_TRUE(SameReadings(actual[i].candidates, expected[i].candidates)) << i;
  }
}

std::vector<Candidate> DeterminerReadings() {
  return {Reading("a", {{"LEX", "D"}, {"POS", "ART"}}), Reading("a", {{"LEX", "N"}, {"POS", "NOU"}})};
}

TEST(rule_interpreter, K30RuleTenAloneStrikesTheNounWithNoCardinalityAfterADeterminer) {
  const RuleSet isolated = IsolatedDisambiguation("10");
  const RuleInterpreter interpreter(isolated);
  const Candidate countable = Reading("box", {{"LEX", "N"}, {"SEM", "ARF"}, {"CAR", "CTB"}});
  const Candidate verb = Reading("box", {{"LEX", "V"}, {"POS", "VER"}});
  std::vector<Position> positions = {
      Position{.candidates = DeterminerReadings()},
      Position{.candidates = {Reading("box", {{"LEX", "N"}, {"SEM", "ACT"}}), countable, verb}}};
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ExpectSamePositions(positions, {Position{.candidates = DeterminerReadings()},
                                  Position{.candidates = {countable, verb}}});
  EXPECT_EQ(FiredIds(trace), Ids({"10"}));
}

TEST(rule_interpreter, K31RuleTenAloneKeepsEveryNounReadingThatCarriesCardinality) {
  const RuleSet isolated = IsolatedDisambiguation("10");
  const RuleInterpreter interpreter(isolated);
  const std::vector<Position> before = {
      Position{.candidates = DeterminerReadings()},
      Position{.candidates = {Reading("box", {{"LEX", "N"}, {"CAR", "CTB"}}),
                              Reading("box", {{"LEX", "N"}, {"CAR", "NCTB"}})}}};
  std::vector<Position> positions = before;
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ExpectSamePositions(positions, before);
  EXPECT_TRUE(trace.entries.empty());
}

TEST(rule_interpreter, K32RuleTenAloneDoesNotFireWithoutADeterminerReading) {
  const RuleSet isolated = IsolatedDisambiguation("10");
  const RuleInterpreter interpreter(isolated);
  const std::vector<Position> before = {
      Position{.candidates = {Reading("a", {{"LEX", "P"}, {"POS", "PRE"}}),
                              Reading("a", {{"LEX", "A"}, {"POS", "AAV"}})}},
      Position{.candidates = {Reading("box", {{"LEX", "N"}, {"SEM", "ACT"}}),
                              Reading("box", {{"LEX", "N"}, {"SEM", "ARF"}, {"CAR", "CTB"}}),
                              Reading("box", {{"LEX", "V"}, {"POS", "VER"}})}}};
  std::vector<Position> positions = before;
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ExpectSamePositions(positions, before);
  EXPECT_TRUE(trace.entries.empty());
}

std::vector<Candidate> VeryReadings() {
  return {Reading("very", {{"LEX", "A"}, {"POS", "AAV"}}),
          Reading("very", {{"LEX", "J"}, {"POS", "ADJ"}}),
          Reading("very", {{"LEX", "A"}, {"POS", "SAV"}, {"att", "@plus"}})};
}

TEST(rule_interpreter, K33RuleNineAloneKeepsThePlusReadingBeforeAnAdjective) {
  const RuleSet isolated = IsolatedDisambiguation("9");
  const RuleInterpreter interpreter(isolated);
  const std::vector<Candidate> beautiful = {Reading("beautiful", {{"LEX", "J"}, {"POS", "ADJ"}}),
                                            Reading("beautiful", {{"LEX", "J"}, {"POS", "ADJ"}, {"MOR", "STE"}})};
  std::vector<Position> positions = {Position{.candidates = VeryReadings()},
                                     Position{.candidates = beautiful}};
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ExpectSamePositions(positions, {Position{.candidates = {VeryReadings()[2]}},
                                  Position{.candidates = beautiful}});
  EXPECT_EQ(FiredIds(trace), Ids({"9"}));
}

TEST(rule_interpreter, K34RuleNineAloneDoesNotFireBeforeANoun) {
  const RuleSet isolated = IsolatedDisambiguation("9");
  const RuleInterpreter interpreter(isolated);
  const std::vector<Position> before = {
      Position{.candidates = VeryReadings()},
      Position{.candidates = {Reading("book", {{"LEX", "N"}, {"POS", "NOU"}})}}};
  std::vector<Position> positions = before;
  Trace trace;
  interpreter.disambiguate(positions, trace);
  ExpectSamePositions(positions, before);
  EXPECT_TRUE(trace.entries.empty());
}

// K56: the file order rule 183 needs.
TEST(rule_interpreter, K56_analysis_rule_183_stands_directly_before_rule_10) {
  const std::vector<GrammarRule>& analysis = EngToAfrRuleSet().analysis();
  const auto at = [&](std::string_view id) {
    return std::ranges::find_if(analysis, [&](const GrammarRule& r) { return r.id == id; });
  };
  const auto r183 = at("183");
  const auto r10 = at("10");
  ASSERT_NE(r183, analysis.end());
  ASSERT_NE(r10, analysis.end());
  EXPECT_EQ(r183 + 1, r10);
}

}  // namespace
}  // namespace verstaan
