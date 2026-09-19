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
#include <string>
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
  // eng's disambiguation.yaml is the literal "[]" (docs/unl-reference/formats/disambiguation.md,
  // "Where eng has no export"): reading it correctly means an empty list, not a missing one.
  EXPECT_TRUE(rules.disambiguation().empty());
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

// --- The eng-empty fallback (issue 21) resolves a homograph with no covering D-rule, not by
// crash or silent drop. ---

TEST(rule_interpreter, EngEmptyDisambiguationFallsBackToFirstCandidate) {
  // data/languages/eng/grammar/disambiguation.yaml is "[]": no D-rule exists to cover any eng
  // homograph, so RuleInterpreter::disambiguate must fall back rather than leave the position
  // untouched or crash (docs/unl-reference/formats/disambiguation.md, "Where eng has no export").
  ASSERT_TRUE(EngToAfrRuleSet().disambiguation().empty());
  const RuleInterpreter interpreter(EngToAfrRuleSet());

  std::vector<Position> positions = {Position{
      .candidates = {
          Candidate{.surface = "bank", .features = {{"sense", "financial"}}, .attributes = {}},
          Candidate{.surface = "bank", .features = {{"sense", "river"}}, .attributes = {}}}}};
  Trace trace;
  EXPECT_NO_THROW(interpreter.disambiguate(positions, trace));

  ASSERT_EQ(positions[0].candidates.size(), 1u);
  EXPECT_TRUE(HasFeature(positions[0].candidates[0], "sense", "financial"));
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

// --- Engine::load(RuleSet) is real: it keeps the RuleSet it was given rather than discarding it
// (issue 23 is the one that wires Engine::translate to read it back). ---

TEST(rule_interpreter, EngineLoadAcceptsARealRuleSetAndStillReturnsAResult) {
  const Engine engine = Engine::load(EngToAfrRuleSet());
  const Result result = engine.translate("book", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::not_implemented);  // translate() itself is issue 23's job.
}

}  // namespace
}  // namespace verstaan
