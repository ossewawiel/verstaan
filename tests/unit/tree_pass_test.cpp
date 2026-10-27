// Tree pass tests, issue 194 (docs/factory/issues/194-test-cases.md, block T). One TEST per row,
// the row id in the test name. Every expected value is transcribed from that table (the UNL graph
// on T01 to T10 from data/languages/eng/corpus/ugoa1.yaml), never from running the engine.
// Every row asserts `status == Status::ok`, so the stub, which reports `not_implemented`, fails
// each one. T01 to T13 read the real eng dictionary and analysis.yaml through VERSTAAN_REPO_ROOT,
// as rule_interpreter_test.cpp does; T14 to T19 use in-memory rules (docs/standards/testing.md).

#include <gtest/gtest.h>

#include <algorithm>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "verstaan/dictionary.hpp"
#include "verstaan/engine.hpp"
#include "verstaan/rule_interpreter.hpp"
#include "verstaan/rule_set.hpp"

namespace verstaan {
namespace {

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

using Ids = std::vector<std::string>;

std::string EngStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/eng"; }
std::string AfrStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/afr"; }

const RuleSet& RealRules() {
  static const RuleSet rules = RuleSet::load(EngStoreRoot(), AfrStoreRoot());
  return rules;
}

const Dictionary& EngDictionary() {
  static const Dictionary dictionary = Dictionary::load(EngStoreRoot(), Lang::eng);
  return dictionary;
}

// The word's candidate: the dictionary entry with this headword and id, its features exactly,
// plus `$uw` as Engine::translate adds it.
Candidate Word(std::string_view headword, std::int64_t id) {
  for (const DictionaryEntry& entry : EngDictionary().lookup(headword)) {
    if (entry.id == id) {
      Candidate candidate;
      candidate.surface = std::string(headword);
      candidate.features = entry.features;
      candidate.features.emplace_back("$uw", entry.uw);
      return candidate;
    }
  }
  ADD_FAILURE() << "dictionary entry not found: " << headword << " " << id;
  return {};
}

Candidate Bare(std::string surface, std::vector<Feature> features) {
  Candidate candidate;
  candidate.surface = std::move(surface);
  candidate.features = std::move(features);
  return candidate;
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

// The real analysis list cut to records "1" to "<last>".
RuleSet RealRulesUpTo(int last) {
  std::vector<GrammarRule> cut;
  for (const GrammarRule& rule : RealRules().analysis()) {
    if (std::stoi(rule.id) <= last) {
      cut.push_back(rule);
    }
  }
  return RuleSet::from_rules({}, std::move(cut), {}, {}, {}, {});
}

RuleSet OnlyRules(std::vector<GrammarRule> analysis) {
  return RuleSet::from_rules({}, std::move(analysis), {}, {}, {}, {});
}

GrammarRule Rule(std::string id, std::string lhs, std::string rhs) {
  GrammarRule rule;
  rule.id = std::move(id);
  rule.kind = "analysis";
  rule.lhs = std::move(lhs);
  rule.rhs = std::move(rhs);
  return rule;
}

bool HasFeature(const TreeNode& node, std::string_view key, std::string_view value) {
  return std::ranges::any_of(node.features,
                             [&](const Feature& f) { return f.first == key && f.second == value; });
}

bool HasKey(const TreeNode& node, std::string_view key) {
  return std::ranges::any_of(node.features, [&](const Feature& f) { return f.first == key; });
}

std::string FeatureValue(const TreeNode& node, std::string_view key) {
  for (const Feature& f : node.features) {
    if (f.first == key) {
      return f.second;
    }
  }
  return {};
}

std::size_t CountFeature(const TreeNode& node, std::string_view key, std::string_view value) {
  return static_cast<std::size_t>(std::ranges::count_if(
      node.features, [&](const Feature& f) { return f.first == key && f.second == value; }));
}

// Rule ids of every `fired` entry, in order.
Ids Fired(const Trace& trace) {
  Ids ids;
  for (const TraceEntry& entry : trace.entries) {
    if (entry.event == TraceEvent::fired) {
      ids.push_back(entry.rule);
    }
  }
  return ids;
}

bool AnyEvent(const Trace& trace, TraceEvent event) {
  return std::ranges::any_of(trace.entries, [&](const TraceEntry& e) { return e.event == event; });
}

bool Fires(const Trace& trace, std::string_view id) {
  return std::ranges::any_of(trace.entries, [&](const TraceEntry& e) { return e.rule == id; });
}

bool SameForest(const Forest& a, const Forest& b) {
  if (a.nodes.size() != b.nodes.size() || a.list != b.list || a.links.size() != b.links.size()) {
    return false;
  }
  for (std::size_t i = 0; i < a.nodes.size(); ++i) {
    const TreeNode& x = a.nodes[i];
    const TreeNode& y = b.nodes[i];
    if (x.surface != y.surface || x.features != y.features || x.attributes != y.attributes ||
        x.deleted != y.deleted) {
      return false;
    }
  }
  for (std::size_t i = 0; i < a.links.size(); ++i) {
    const Link& x = a.links[i];
    const Link& y = b.links[i];
    if (x.label != y.label || x.from != y.from || x.to != y.to || x.scope != y.scope ||
        x.built_by != y.built_by || x.labelled_by != y.labelled_by) {
      return false;
    }
  }
  return true;
}

struct Outcome {
  TreeResult result;
  Trace trace;
};

Outcome RunTree(const RuleSet& rules, Forest forest) {
  Outcome run;
  const RuleInterpreter interpreter(rules);
  run.result = interpreter.analyse_tree(std::move(forest), run.trace);
  return run;
}

Link L(std::string label, std::size_t from, std::size_t to, std::size_t scope, std::string built,
       std::string labelled) {
  Link link;
  link.label = std::move(label);
  link.from = from;
  link.to = to;
  link.scope = scope;
  link.built_by = std::move(built);
  link.labelled_by = std::move(labelled);
  return link;
}

void ExpectLink(const Link& link, const Link& expected) {
  EXPECT_EQ(link.label, expected.label);
  EXPECT_EQ(link.from, expected.from);
  EXPECT_EQ(link.to, expected.to);
  EXPECT_EQ(link.scope, expected.scope);
  EXPECT_EQ(link.built_by, expected.built_by);
  EXPECT_EQ(link.labelled_by, expected.labelled_by);
}

const Ids kFullA08 = {"70", "60", "71", "61", "72", "50", "12", "62", "80", "82", "100", "172"};
const Ids kUpTo79 = {"70", "60", "71", "61", "72", "50", "12", "62"};

Forest A08Forest() {
  return make_forest({Word("a", 275311), Word("beautiful", 286581), Word("book", 408062)});
}
Forest A11Forest() {
  return make_forest({Word("the", 275357), Word("beautiful", 286581), Word("car", 328185)});
}

// Shared checks for T01 and T03: the full run ends in rule 172's mod edge.
void ExpectModRun(const Outcome& run, std::string_view attribute, std::string_view noun_uw) {
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), kFullA08);
  EXPECT_FALSE(AnyEvent(run.trace, TraceEvent::capped));
  EXPECT_FALSE(AnyEvent(run.trace, TraceEvent::unsupported));
  const Forest& forest = run.result.forest;
  ASSERT_EQ(forest.links.size(), 1U);
  ExpectLink(forest.links[0], L("mod", 3, 2, 5, "50", "172"));
  ASSERT_GE(forest.nodes.size(), 6U);
  EXPECT_EQ(forest.nodes[3].attributes, std::vector<std::string>{std::string(attribute)});
  EXPECT_TRUE(forest.nodes[5].attributes.empty());
  EXPECT_TRUE(forest.nodes[1].deleted);
  EXPECT_EQ(forest.list, (std::vector<std::size_t>{0, 5, 4}));
  // The corpus graph: mod(<noun uw>.<attribute>, 300217728).
  EXPECT_EQ(FeatureValue(forest.nodes[forest.links[0].from], "$uw"), noun_uw);
  EXPECT_EQ(FeatureValue(forest.nodes[forest.links[0].to], "$uw"), "300217728");
}

// Shared checks for T02 and T04: the run cut at record 79 stops at rule 50's NB link.
void ExpectNbRun(const Outcome& run, std::string_view attribute) {
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), kUpTo79);
  const Forest& forest = run.result.forest;
  ASSERT_EQ(forest.links.size(), 1U);
  ExpectLink(forest.links[0], L("NB", 3, 2, 5, "50", "50"));
  ASSERT_GE(forest.nodes.size(), 6U);
  EXPECT_TRUE(HasFeature(forest.nodes[5], "LEX", "N"));
  EXPECT_TRUE(HasFeature(forest.nodes[5], "XP", "NP"));
  EXPECT_TRUE(HasFeature(forest.nodes[5], "proj", ""));
  EXPECT_FALSE(HasKey(forest.nodes[5], "XB"));
  EXPECT_EQ(forest.nodes[5].attributes, std::vector<std::string>{std::string(attribute)});
  EXPECT_TRUE(forest.nodes[3].attributes.empty());
}

TEST(tree_pass, T01_a08_ends_in_rule_172_mod_edge) {
  const Outcome run = RunTree(RealRules(), A08Forest());
  ExpectModRun(run, "@indef", "102870092");
}

TEST(tree_pass, T02_a08_cut_at_79_holds_the_nb_link_of_rule_50) {
  const Outcome run = RunTree(RealRulesUpTo(79), A08Forest());
  ExpectNbRun(run, "@indef");
}

TEST(tree_pass, T03_a11_ends_in_rule_172_mod_edge) {
  const Outcome run = RunTree(RealRules(), A11Forest());
  ExpectModRun(run, "@def", "102958343");
}

TEST(tree_pass, T04_a11_cut_at_79_holds_the_nb_link_of_rule_50) {
  const Outcome run = RunTree(RealRulesUpTo(79), A11Forest());
  ExpectNbRun(run, "@def");
}

TEST(tree_pass, T05_rule_54_never_fires_on_a08_or_a11) {
  const Outcome a08 = RunTree(RealRules(), A08Forest());
  const Outcome a11 = RunTree(RealRules(), A11Forest());
  ASSERT_EQ(a08.result.status, Status::ok);
  ASSERT_EQ(a11.result.status, Status::ok);
  EXPECT_FALSE(Fires(a08.trace, "54"));
  EXPECT_FALSE(Fires(a11.trace, "54"));
}

TEST(tree_pass, T06_rule_176_and_the_specifier_rules_never_fire) {
  for (const Forest& input : {A08Forest(), A11Forest()}) {
    const Outcome run = RunTree(RealRules(), input);
    ASSERT_EQ(run.result.status, Status::ok);
    for (const char* id : {"81", "86", "91", "124", "176"}) {
      EXPECT_FALSE(Fires(run.trace, id)) << id;
    }
    for (const Link& link : run.result.forest.links) {
      EXPECT_FALSE(!link.label.empty() && link.label.back() == 'S') << link.label;
    }
  }
}

TEST(tree_pass, T07_a01_bare_noun_projects_straight_to_a_noun_phrase) {
  const Outcome run = RunTree(RealRules(), make_forest({Word("book", 408062)}));
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"72", "62"}));
  const Forest& forest = run.result.forest;
  EXPECT_TRUE(forest.links.empty());
  ASSERT_GE(forest.nodes.size(), 3U);
  EXPECT_TRUE(HasFeature(forest.nodes[1], "XP", "NP"));
  EXPECT_TRUE(HasFeature(forest.nodes[1], "proj", ""));
  EXPECT_FALSE(HasKey(forest.nodes[1], "XB"));
  EXPECT_TRUE(forest.nodes[1].attributes.empty());
  EXPECT_EQ(forest.list, (std::vector<std::size_t>{0, 1, 2}));
  EXPECT_EQ(FeatureValue(forest.nodes[1], "$uw"), "102870092");
}

TEST(tree_pass, T08_a02_the_book_folds_the_article_into_an_attribute) {
  const Outcome run =
      RunTree(RealRules(), make_forest({Word("the", 275357), Word("book", 408062)}));
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"70", "60", "72", "12", "62"}));
  const Forest& forest = run.result.forest;
  EXPECT_TRUE(forest.links.empty());
  ASSERT_GE(forest.nodes.size(), 4U);
  EXPECT_EQ(forest.nodes[2].attributes, std::vector<std::string>{"@def"});
  EXPECT_TRUE(forest.nodes[1].deleted);
  EXPECT_EQ(forest.list, (std::vector<std::size_t>{0, 2, 3}));
  EXPECT_EQ(FeatureValue(forest.nodes[2], "$uw"), "102870092");
}

TEST(tree_pass, T09_a03_a_book_folds_the_article_into_an_attribute) {
  const Outcome run = RunTree(RealRules(), make_forest({Word("a", 275311), Word("book", 408062)}));
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"70", "60", "72", "12", "62"}));
  const Forest& forest = run.result.forest;
  EXPECT_TRUE(forest.links.empty());
  ASSERT_GE(forest.nodes.size(), 4U);
  EXPECT_EQ(forest.nodes[2].attributes, std::vector<std::string>{"@indef"});
  EXPECT_TRUE(forest.nodes[1].deleted);
  EXPECT_EQ(FeatureValue(forest.nodes[2], "$uw"), "102870092");
}

TEST(tree_pass, T10_possible_changes_ends_in_rule_172_mod_edge) {
  const Outcome run =
      RunTree(RealRules(), make_forest({Word("possible", 287192), Word("changes", 503595)}));
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"1", "71", "61", "72", "50", "62", "80", "100", "172"}));
  const Forest& forest = run.result.forest;
  ASSERT_EQ(forest.links.size(), 1U);
  ExpectLink(forest.links[0], L("mod", 2, 1, 4, "50", "172"));
  ASSERT_GE(forest.nodes.size(), 5U);
  EXPECT_EQ(forest.nodes[2].attributes, std::vector<std::string>{"@pl"});
  EXPECT_TRUE(forest.nodes[4].attributes.empty());
  EXPECT_EQ(FeatureValue(forest.nodes[2], "$uw"), "100191142");
  EXPECT_EQ(FeatureValue(forest.nodes[1], "$uw"), "301821266");
}

TEST(tree_pass, T11_make_forest_wraps_the_words_in_sentinels) {
  const Candidate a = Word("a", 275311);
  const Candidate beautiful = Word("beautiful", 286581);
  const Candidate book = Word("book", 408062);
  const Forest forest = make_forest({a, beautiful, book});
  ASSERT_EQ(forest.nodes.size(), 5U);
  EXPECT_EQ(forest.nodes[0].surface, "");
  EXPECT_TRUE(HasFeature(forest.nodes[0], "SHEAD", ""));
  EXPECT_EQ(forest.nodes[4].surface, "");
  EXPECT_TRUE(HasFeature(forest.nodes[4], "STAIL", ""));
  EXPECT_EQ(forest.nodes[1].surface, "a");
  EXPECT_EQ(forest.nodes[1].attributes, std::vector<std::string>{"@indef"});
  EXPECT_FALSE(HasKey(forest.nodes[1], "att"));
  EXPECT_EQ(forest.nodes[2].surface, "beautiful");
  EXPECT_EQ(forest.nodes[3].surface, "book");
  // Every other feature of each word is unchanged.
  const Candidate* words[] = {&a, &beautiful, &book};
  for (std::size_t i = 0; i < 3; ++i) {
    std::vector<Feature> expected;
    for (const Feature& f : words[i]->features) {
      if (f.first != "att") {
        expected.push_back(f);
      }
    }
    EXPECT_EQ(forest.nodes[i + 1].features, expected) << i;
  }
  EXPECT_EQ(forest.list, (std::vector<std::size_t>{0, 1, 2, 3, 4}));
  EXPECT_TRUE(forest.links.empty());
  for (const TreeNode& node : forest.nodes) {
    EXPECT_FALSE(node.deleted);
  }
}

TEST(tree_pass, T12_empty_sentence_matches_no_rule) {
  const Outcome run = RunTree(RealRules(), make_forest({}));
  ASSERT_EQ(run.result.status, Status::ok);
  const Forest& forest = run.result.forest;
  ASSERT_EQ(forest.nodes.size(), 2U);
  EXPECT_TRUE(HasFeature(forest.nodes[0], "SHEAD", ""));
  EXPECT_TRUE(HasFeature(forest.nodes[1], "STAIL", ""));
  EXPECT_EQ(forest.list, (std::vector<std::size_t>{0, 1}));
  EXPECT_TRUE(run.trace.entries.empty());
}

TEST(tree_pass, T13_a_second_pass_over_a_finished_forest_does_nothing) {
  const Outcome first = RunTree(RealRules(), A08Forest());
  ASSERT_EQ(first.result.status, Status::ok);
  ASSERT_EQ(first.result.forest.links.size(), 1U);  // guards against comparing two stub outputs
  const Outcome second = RunTree(RealRules(), first.result.forest);
  ASSERT_EQ(second.result.status, Status::ok);
  EXPECT_TRUE(second.trace.entries.empty());
  EXPECT_TRUE(SameForest(second.result.forest, first.result.forest));
}

Forest OneWordA() { return make_forest({Bare("x", {{"LEX", "A"}})}); }

TEST(tree_pass, T14_a_self_matching_rule_stops_at_the_cap) {
  const Outcome run = RunTree(OnlyRules({Rule("loop", "(%x,A)", "(%x,+B)")}), OneWordA());
  ASSERT_EQ(run.result.status, Status::ok);
  ASSERT_EQ(run.trace.entries.size(), kTreePassRuleCap + 1);
  for (std::size_t i = 0; i < kTreePassRuleCap; ++i) {
    EXPECT_EQ(run.trace.entries[i].rule, "loop");
    EXPECT_EQ(run.trace.entries[i].event, TraceEvent::fired);
  }
  EXPECT_EQ(run.trace.entries.back().rule, "loop");
  EXPECT_EQ(run.trace.entries.back().event, TraceEvent::capped);
  ASSERT_GE(run.result.forest.nodes.size(), 2U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "B", ""), 1U);
}

TEST(tree_pass, T15_a_guarded_rule_fires_once_and_never_caps) {
  const Outcome run = RunTree(OnlyRules({Rule("guarded", "(%x,A,^B)", "(%x,+B)")}), OneWordA());
  ASSERT_EQ(run.result.status, Status::ok);
  ASSERT_EQ(run.trace.entries.size(), 1U);
  EXPECT_EQ(run.trace.entries[0].rule, "guarded");
  EXPECT_EQ(run.trace.entries[0].event, TraceEvent::fired);
  EXPECT_FALSE(AnyEvent(run.trace, TraceEvent::capped));
  ASSERT_GE(run.result.forest.nodes.size(), 2U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "B", ""), 1U);
}

TEST(tree_pass, T16_the_cap_retires_one_rule_and_the_pass_goes_on) {
  const Outcome run =
      RunTree(OnlyRules({Rule("loop", "(%x,A)", "(%x,+B)"), Rule("after", "(%x,A,^C)", "(%x,+C)")}),
              OneWordA());
  ASSERT_EQ(run.result.status, Status::ok);
  ASSERT_EQ(run.trace.entries.size(), kTreePassRuleCap + 2);
  for (std::size_t i = 0; i < kTreePassRuleCap; ++i) {
    EXPECT_EQ(run.trace.entries[i].rule, "loop");
    EXPECT_EQ(run.trace.entries[i].event, TraceEvent::fired);
  }
  EXPECT_EQ(run.trace.entries[kTreePassRuleCap].rule, "loop");
  EXPECT_EQ(run.trace.entries[kTreePassRuleCap].event, TraceEvent::capped);
  EXPECT_EQ(run.trace.entries[kTreePassRuleCap + 1].rule, "after");
  EXPECT_EQ(run.trace.entries[kTreePassRuleCap + 1].event, TraceEvent::fired);
  ASSERT_GE(run.result.forest.nodes.size(), 2U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "B", ""), 1U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "C", ""), 1U);
}

TEST(tree_pass, T17_a_merge_right_side_is_reported_unsupported) {
  const GrammarRule& rule21 = FindRule(RealRules().analysis(), "21");
  const std::vector<Candidate> words = {Bare("x", {{"TEMP", ""}}), Bare(" ", {{"BLK", ""}}),
                                        Bare("y", {{"TEMP", ""}})};
  const Forest input = make_forest(words);
  const Outcome run = RunTree(OnlyRules({rule21}), input);
  ASSERT_EQ(run.result.status, Status::ok);
  ASSERT_EQ(run.trace.entries.size(), 1U);
  EXPECT_EQ(run.trace.entries[0].rule, "21");
  EXPECT_EQ(run.trace.entries[0].event, TraceEvent::unsupported);
  EXPECT_TRUE(SameForest(run.result.forest, make_forest(words)));
}

TEST(tree_pass, T18_rule_86_dearborises_a_specifier) {
  Forest forest;
  forest.nodes.resize(7);
  forest.nodes[0].features = {{"SHEAD", ""}};
  forest.nodes[1].surface = "x";
  forest.nodes[1].features = {{"N", ""}};
  forest.nodes[2].surface = "y";
  forest.nodes[3].surface = "z";
  forest.nodes[4].features = {{"STAIL", ""}};
  forest.links = {L("XB", 1, 2, 5, "seed", "seed"), L("XP", 5, 3, 6, "seed", "seed")};
  forest.list = {0, 6, 4};
  const Outcome run = RunTree(OnlyRules({FindRule(RealRules().analysis(), "86")}), forest);
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"86"}));
  const Forest& out = run.result.forest;
  ASSERT_EQ(out.links.size(), 2U);
  ExpectLink(out.links[0], L("XB", 1, 2, 6, "seed", "seed"));
  ExpectLink(out.links[1], L("XS", 1, 3, 6, "86", "86"));
  ASSERT_GE(out.nodes.size(), 7U);
  EXPECT_FALSE(out.nodes[5].deleted);
  for (const Link& link : out.links) {
    EXPECT_NE(link.scope, 5U);
  }
}

TEST(tree_pass, T19_rules_92_and_94_delete_an_empty_category) {
  Forest forest;
  forest.nodes.resize(5);
  forest.nodes[0].features = {{"SHEAD", ""}};
  forest.nodes[1].surface = "x";
  forest.nodes[2].features = {{"e", ""}};
  forest.nodes[3].features = {{"STAIL", ""}};
  forest.links = {L("XB", 1, 2, 4, "seed", "seed")};
  forest.list = {0, 4, 3};
  const Outcome run = RunTree(
      OnlyRules({FindRule(RealRules().analysis(), "92"), FindRule(RealRules().analysis(), "94")}),
      forest);
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"92", "94"}));
  const Forest& out = run.result.forest;
  EXPECT_TRUE(out.links.empty());
  ASSERT_GE(out.nodes.size(), 5U);
  EXPECT_FALSE(out.nodes[1].deleted);
  EXPECT_TRUE(out.nodes[2].deleted);
  EXPECT_FALSE(out.nodes[4].deleted);
}

// ---- Rows T20 to T47 (round 2) ----

TreeNode Node(std::string surface, std::vector<Feature> features) {
  TreeNode node;
  node.surface = std::move(surface);
  node.features = std::move(features);
  return node;
}

Forest Hand(std::vector<TreeNode> nodes, std::vector<Link> links, std::vector<std::size_t> list) {
  Forest forest;
  forest.nodes = std::move(nodes);
  forest.links = std::move(links);
  forest.list = std::move(list);
  return forest;
}

TreeNode Head() { return Node("", {{"SHEAD", ""}}); }
TreeNode Tail() { return Node("", {{"STAIL", ""}}); }
TreeNode Hyper() { return Node("", {}); }

// F1 to F5 of the table.
Forest F1() {
  return Hand({Head(), Node("x", {{"N", ""}}), Node("y", {{"J", ""}}), Tail(), Hyper()},
              {L("NB", 1, 2, 4, "seed", "seed")}, {0, 4, 3});
}
Forest F2() {
  return Hand({Head(), Node("a", {{"A", ""}}), Node("b", {{"B", ""}}), Tail(), Hyper()},
              {L("agt", 1, 2, 4, "seed", "seed")}, {0, 4, 3});
}
Forest F3() {
  return Hand({Head(), Node("x", {}), Node("y", {}), Tail(), Hyper()},
              {L("XB", 1, 2, 4, "seed", "seed")}, {0, 4, 3});
}
Forest F4() {
  return Hand(
      {Head(), Node("x", {{"N", ""}}), Node("y", {}), Node("z", {}), Tail(), Hyper(), Hyper()},
      {L("XB", 1, 2, 5, "seed", "seed"), L("XP", 5, 3, 6, "seed", "seed")}, {0, 6, 4});
}
Forest F5() {
  return Hand({Head(), Node("x", {{"N", ""}}), Node("y", {}), Node("z", {}), Tail(), Hyper()},
              {L("XB", 1, 2, 5, "seed", "seed"), L("XP", 3, 2, 5, "seed", "seed")}, {0, 5, 4});
}

void ExpectOneEntry(const Outcome& run, std::string_view rule, TraceEvent event) {
  ASSERT_EQ(run.trace.entries.size(), 1U);
  EXPECT_EQ(run.trace.entries[0].rule, rule);
  EXPECT_EQ(run.trace.entries[0].event, event);
}

void ExpectUnchanged(const Outcome& run, const Forest& input) {
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_TRUE(SameForest(run.result.forest, input));
}

std::vector<Candidate> ClockWords(std::string middle_surface, std::vector<Feature> middle) {
  return {Bare("12", {{"DIGIT", ""}}), Bare(std::move(middle_surface), std::move(middle)),
          Bare("30", {{"DIGIT", ""}})};
}

const GrammarRule& Real(std::string_view id) { return FindRule(RealRules().analysis(), id); }

TEST(tree_pass, T20_rule_30_reads_a_quoted_string_as_the_surface) {
  const Outcome run = RunTree(OnlyRules({Real("30")}), make_forest(ClockWords(":", {})));
  ASSERT_EQ(run.result.status, Status::ok);
  ExpectOneEntry(run, "30", TraceEvent::fired);
  const Forest& out = run.result.forest;
  ASSERT_EQ(out.nodes.size(), 5U);
  EXPECT_EQ(CountFeature(out.nodes[1], "DIGIT", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[1], "HOUR", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[3], "DIGIT", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[3], "MINUTE", ""), 1U);
  EXPECT_TRUE(out.nodes[2].features.empty());
  for (const TreeNode& node : out.nodes) {
    EXPECT_FALSE(node.deleted);
  }
  EXPECT_EQ(out.list, (std::vector<std::size_t>{0, 1, 2, 3, 4}));
}

TEST(tree_pass, T21_rule_30_needs_the_whole_surface_to_equal_the_string) {
  const std::vector<Candidate> words = ClockWords(".", {});
  const Outcome run = RunTree(OnlyRules({Real("30")}), make_forest(words));
  EXPECT_TRUE(run.trace.entries.empty());
  ExpectUnchanged(run, make_forest(words));
}

TEST(tree_pass, T22_a_quoted_string_never_tests_a_feature) {
  const std::vector<Candidate> words = ClockWords("colon", {{":", ""}});
  const Outcome run = RunTree(OnlyRules({Real("30")}), make_forest(words));
  EXPECT_TRUE(run.trace.entries.empty());
  ExpectUnchanged(run, make_forest(words));
}

TEST(tree_pass, T23_rule_29_marks_hour_minute_and_second) {
  const std::vector<Candidate> words = {Bare("12", {{"DIGIT", ""}}), Bare(":", {}),
                                        Bare("30", {{"DIGIT", ""}}), Bare(":", {}),
                                        Bare("00", {{"DIGIT", ""}})};
  const Outcome run = RunTree(OnlyRules({Real("29")}), make_forest(words));
  ASSERT_EQ(run.result.status, Status::ok);
  ExpectOneEntry(run, "29", TraceEvent::fired);
  const Forest& out = run.result.forest;
  ASSERT_EQ(out.nodes.size(), 7U);
  EXPECT_EQ(CountFeature(out.nodes[1], "HOUR", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[3], "MINUTE", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[5], "SECOND", ""), 1U);
  EXPECT_TRUE(out.nodes[2].features.empty());
  EXPECT_TRUE(out.nodes[4].features.empty());
  for (const TreeNode& node : out.nodes) {
    EXPECT_FALSE(node.deleted);
  }
  EXPECT_EQ(out.list, (std::vector<std::size_t>{0, 1, 2, 3, 4, 5, 6}));
}

TEST(tree_pass, T24_rule_29_needs_five_nodes_starting_on_a_digit) {
  const std::vector<Candidate> words = ClockWords(":", {});
  const Outcome run = RunTree(OnlyRules({Real("29")}), make_forest(words));
  EXPECT_TRUE(run.trace.entries.empty());
  ExpectUnchanged(run, make_forest(words));
}

TEST(tree_pass, T25_rule_26_with_a_regex_test_is_unsupported) {
  const std::vector<Candidate> words = {Bare("12:30:00", {{"TIME", ""}})};
  const Outcome run = RunTree(OnlyRules({Real("26")}), make_forest(words));
  ExpectOneEntry(run, "26", TraceEvent::unsupported);
  ExpectUnchanged(run, make_forest(words));
  ASSERT_GE(run.result.forest.nodes.size(), 2U);
  EXPECT_FALSE(HasKey(run.result.forest.nodes[1], "TEMP"));
}

TEST(tree_pass, T26_rule_26_is_false_where_time_is_absent) {
  const std::vector<Candidate> words = {Bare("12", {{"DIGIT", ""}})};
  const Outcome run = RunTree(OnlyRules({Real("26")}), make_forest(words));
  EXPECT_TRUE(run.trace.entries.empty());
  ExpectUnchanged(run, make_forest(words));
}

GrammarRule EitherRule() { return Rule("either", "({\"/\\d/\"|DIGIT},W,^SEEN,%x)", "(%x,+SEEN)"); }

TEST(tree_pass, T27_a_disjunction_with_a_true_alternative_is_true) {
  const Outcome run =
      RunTree(OnlyRules({EitherRule()}), make_forest({Bare("12", {{"DIGIT", ""}, {"W", ""}})}));
  ASSERT_EQ(run.result.status, Status::ok);
  ExpectOneEntry(run, "either", TraceEvent::fired);
  ASSERT_GE(run.result.forest.nodes.size(), 2U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "SEEN", ""), 1U);
}

TEST(tree_pass, T28_a_disjunction_of_unknown_and_false_is_unknown) {
  const std::vector<Candidate> words = {Bare("x", {{"W", ""}})};
  const Outcome run = RunTree(OnlyRules({EitherRule()}), make_forest(words));
  ExpectOneEntry(run, "either", TraceEvent::unsupported);
  ExpectUnchanged(run, make_forest(words));
}

TEST(tree_pass, T29_rule_80_matches_a_class_then_a_literal) {
  const Outcome run = RunTree(OnlyRules({Real("80")}), F1());
  ASSERT_EQ(run.result.status, Status::ok);
  ExpectOneEntry(run, "80", TraceEvent::fired);
  ASSERT_EQ(run.result.forest.links.size(), 1U);
  ExpectLink(run.result.forest.links[0], L("XB", 1, 2, 4, "seed", "80"));
}

TEST(tree_pass, T30_rule_80_matches_the_whole_label_only) {
  Forest input = F1();
  input.links = {L("XB", 1, 2, 4, "seed", "seed"), L("NBB", 1, 2, 4, "seed", "seed")};
  const Outcome run = RunTree(OnlyRules({Real("80")}), input);
  EXPECT_TRUE(run.trace.entries.empty());
  ExpectUnchanged(run, input);
}

TEST(tree_pass, T31_a_regex_group_is_unsupported) {
  const Outcome run =
      RunTree(OnlyRules({Rule("alt", "/(agt|obj|aoj)/(A,%a;B,%b)", "VS(%a;%b)")}), F2());
  ExpectOneEntry(run, "alt", TraceEvent::unsupported);
  ExpectUnchanged(run, F2());
  ASSERT_EQ(run.result.forest.links.size(), 1U);
  ExpectLink(run.result.forest.links[0], L("agt", 1, 2, 4, "seed", "seed"));
}

TEST(tree_pass, T32_a_regex_range_and_quantifier_are_unsupported) {
  const Outcome run =
      RunTree(OnlyRules({Rule("range", "/[a-z]{2,3}/(A,%a;B,%b)", "VS(%a;%b)")}), F2());
  ExpectOneEntry(run, "range", TraceEvent::unsupported);
  ExpectUnchanged(run, F2());
}

TEST(tree_pass, T33_a_false_head_test_makes_the_link_term_false) {
  Forest input = F2();
  input.nodes[1].features = {{"C", ""}};
  const Outcome run =
      RunTree(OnlyRules({Rule("alt", "/(agt|obj|aoj)/(A,%a;B,%b)", "VS(%a;%b)")}), input);
  EXPECT_TRUE(run.trace.entries.empty());
  ExpectUnchanged(run, input);
}

GrammarRule Relabel() { return Rule("relabel", "XB(%x;%y)", "NA(%x;%y)"); }

TEST(tree_pass, T34_a_link_to_a_node_out_of_range_is_no_parse) {
  Forest input = F3();
  input.links[0].to = 100000;
  const Outcome run = RunTree(OnlyRules({Relabel()}), input);
  EXPECT_EQ(run.result.status, Status::no_parse);
  EXPECT_TRUE(run.trace.entries.empty());
  EXPECT_TRUE(SameForest(run.result.forest, input));
}

TEST(tree_pass, T35_a_list_entry_out_of_range_is_no_parse) {
  const Forest input = Hand({Head(), Node("x", {}), Tail()}, {}, {0, 1, 7, 2});
  const Outcome run = RunTree(OnlyRules({Rule("mark", "(%x,^F)", "(%x,+F)")}), input);
  EXPECT_EQ(run.result.status, Status::no_parse);
  EXPECT_TRUE(run.trace.entries.empty());
  EXPECT_TRUE(SameForest(run.result.forest, input));
}

TEST(tree_pass, T36_a_link_naming_a_deleted_node_is_no_parse) {
  Forest input = F3();
  input.nodes[2].deleted = true;
  const Outcome run = RunTree(OnlyRules({Relabel()}), input);
  EXPECT_EQ(run.result.status, Status::no_parse);
  EXPECT_TRUE(run.trace.entries.empty());
  EXPECT_TRUE(SameForest(run.result.forest, input));
}

TEST(tree_pass, T37_an_unnamed_deleted_node_leaves_the_forest_readable) {
  Forest input = F3();
  input.nodes.push_back(Node("z", {}));
  input.nodes[5].deleted = true;
  const Outcome run = RunTree(OnlyRules({Relabel()}), input);
  ASSERT_EQ(run.result.status, Status::ok);
  ExpectOneEntry(run, "relabel", TraceEvent::fired);
  ASSERT_EQ(run.result.forest.links.size(), 1U);
  ExpectLink(run.result.forest.links[0], L("NA", 1, 2, 4, "seed", "relabel"));
  ASSERT_GE(run.result.forest.nodes.size(), 6U);
  EXPECT_TRUE(run.result.forest.nodes[5].deleted);
}

TEST(tree_pass, T38_an_unbound_index_on_the_right_applies_nothing) {
  const Outcome run = RunTree(OnlyRules({Rule("partial", "XB(%x;%y)", "NA(%x,+Q;%z)")}), F3());
  ExpectOneEntry(run, "partial", TraceEvent::unsupported);
  ExpectUnchanged(run, F3());
  EXPECT_FALSE(HasKey(run.result.forest.nodes[1], "Q"));
  ExpectLink(run.result.forest.links[0], L("XB", 1, 2, 4, "seed", "seed"));
  EXPECT_EQ(run.result.forest.nodes.size(), 5U);
}

TEST(tree_pass, T39_a_new_head_node_is_not_left_behind_by_an_unsupported_rule) {
  const Outcome run = RunTree(OnlyRules({Rule("grow", "XB(%x;%y)", "NA(+e;%z)")}), F3());
  ExpectOneEntry(run, "grow", TraceEvent::unsupported);
  ExpectUnchanged(run, F3());
  EXPECT_EQ(run.result.forest.nodes.size(), 5U);
}

TEST(tree_pass, T40_a_group_index_the_left_side_does_not_bind_is_unsupported) {
  const std::vector<Candidate> words = {Bare("p", {{"P", ""}})};
  const Outcome run = RunTree(OnlyRules({Rule("stray", "(P,%p)", "(%q,+F)")}), make_forest(words));
  ExpectOneEntry(run, "stray", TraceEvent::unsupported);
  ExpectUnchanged(run, make_forest(words));
  ASSERT_EQ(run.result.forest.nodes.size(), 3U);
  EXPECT_FALSE(run.result.forest.nodes[1].deleted);
  EXPECT_FALSE(HasKey(run.result.forest.nodes[1], "F"));
  EXPECT_EQ(run.result.forest.list, (std::vector<std::size_t>{0, 1, 2}));
}

TEST(tree_pass, T41_a_right_side_with_every_index_bound_applies_whole) {
  const Outcome run = RunTree(OnlyRules({Rule("whole", "XB(%x;%y)", "NA(%x,+Q;%y)")}), F3());
  ASSERT_EQ(run.result.status, Status::ok);
  ExpectOneEntry(run, "whole", TraceEvent::fired);
  ASSERT_EQ(run.result.forest.links.size(), 1U);
  ExpectLink(run.result.forest.links[0], L("NA", 1, 2, 4, "seed", "whole"));
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "Q", ""), 1U);
  EXPECT_EQ(run.result.forest.nodes.size(), 5U);
}

std::vector<GrammarRule> VisitOrderRules() {
  return {Rule("mk", "(P,%p)(Q,%q)", "(XB(%p;%q),+Z,%new)"),
          Rule("L", "(T,^M,%a)(Z,^T,%b)", "(%a,+M)(%b)"),
          Rule("R", "(Z,^T,%a)(T,^M,%b)", "(%a)(%b,+M)"), Rule("tag", "(Z,^T,%x)", "(%x,+T)")};
}

Outcome RunT42() {
  return RunTree(
      OnlyRules(VisitOrderRules()),
      make_forest({Bare("p", {{"P", ""}}), Bare("q", {{"Q", ""}}), Bare("z", {{"Z", ""}})}));
}

TEST(tree_pass, T42_a_list_is_visited_left_to_right_after_a_rule_rebuilds_it) {
  const Outcome run = RunT42();
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"mk", "tag", "L", "tag"}));
  EXPECT_EQ(run.trace.entries.size(), 4U);
  const Forest& out = run.result.forest;
  ASSERT_GE(out.nodes.size(), 6U);
  EXPECT_EQ(CountFeature(out.nodes[5], "Z", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[5], "T", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[5], "M", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[3], "Z", ""), 1U);
  EXPECT_EQ(CountFeature(out.nodes[3], "T", ""), 1U);
  EXPECT_FALSE(HasKey(out.nodes[3], "M"));
  ASSERT_EQ(out.links.size(), 1U);
  ExpectLink(out.links[0], L("XB", 1, 2, 5, "mk", "mk"));
  EXPECT_EQ(out.list, (std::vector<std::size_t>{0, 5, 3, 4}));
}

TEST(tree_pass, T43_arena_order_is_not_the_visit_order) {
  const Outcome run = RunT42();
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_FALSE(Fires(run.trace, "R"));
  ASSERT_GE(run.result.forest.nodes.size(), 4U);
  EXPECT_FALSE(HasKey(run.result.forest.nodes[3], "M"));
}

TEST(tree_pass, T44_a_graph_is_visited_top_down) {
  const Outcome run =
      RunTree(OnlyRules({Rule("mk", "(P,%p)(Q,%q)", "(XB(%p;%q),+Z,%new)"),
                         Rule("in", "XB(%x,T,^M;%y)", "XB(%x,+M;%y)"),
                         Rule("out", "(XB(%a;%b),T,^M,%x)", "(%x,+M)"),
                         Rule("tag", "(Z,^T,%x)", "(%x,+T)")}),
              make_forest({Bare("p", {{"P", ""}, {"Z", ""}}), Bare("q", {{"Q", ""}})}));
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"mk", "tag", "out", "tag", "in"}));
  EXPECT_EQ(run.trace.entries.size(), 5U);
  const Forest& out = run.result.forest;
  ASSERT_GE(out.nodes.size(), 5U);
  for (const char* key : {"Z", "T", "M"}) {
    EXPECT_EQ(CountFeature(out.nodes[4], key, ""), 1U) << key;
  }
  for (const char* key : {"P", "Z", "T", "M"}) {
    EXPECT_EQ(CountFeature(out.nodes[1], key, ""), 1U) << key;
  }
  ASSERT_EQ(out.links.size(), 1U);
  ExpectLink(out.links[0], L("XB", 1, 2, 4, "mk", "in"));
  EXPECT_EQ(out.list, (std::vector<std::size_t>{0, 4, 3}));
}

std::vector<GrammarRule> LinkOrderRules() {
  return {Rule("inZ", "Z(%x,N;%y)", "IN(%x;%y)"), Rule("outZ", "Z(%x,^N;%y)", "OUT(%x;%y)"),
          Rule("pick", "/X[BP]/(%x;%y)", "Z(%x;%y)")};
}

TEST(tree_pass, T45_links_are_visited_scope_by_scope_in_visit_order) {
  const Outcome run = RunTree(OnlyRules(LinkOrderRules()), F4());
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"pick", "outZ", "pick", "inZ"}));
  EXPECT_EQ(run.trace.entries.size(), 4U);
  const Forest& out = run.result.forest;
  ASSERT_EQ(out.links.size(), 2U);
  ExpectLink(out.links[0], L("IN", 1, 2, 5, "seed", "inZ"));
  ExpectLink(out.links[1], L("OUT", 5, 3, 6, "seed", "outZ"));
}

TEST(tree_pass, T46_two_links_in_one_scope_keep_graph_order) {
  const Outcome run = RunTree(OnlyRules(LinkOrderRules()), F5());
  ASSERT_EQ(run.result.status, Status::ok);
  EXPECT_EQ(Fired(run.trace), (Ids{"pick", "inZ", "pick", "outZ"}));
  EXPECT_EQ(run.trace.entries.size(), 4U);
  const Forest& out = run.result.forest;
  ASSERT_EQ(out.links.size(), 2U);
  ExpectLink(out.links[0], L("IN", 1, 2, 5, "seed", "inZ"));
  ExpectLink(out.links[1], L("OUT", 3, 2, 5, "seed", "outZ"));
}

TEST(tree_pass, T47_a_rule_that_does_not_parse_retires_as_unsupported) {
  const Outcome run =
      RunTree(OnlyRules({Rule("first", "(A,^B,%x)", "(%x,+B)"), Rule("broken", "(A", "(%x)")}),
              make_forest({Bare("x", {{"A", ""}})}));
  ASSERT_EQ(run.result.status, Status::ok);
  ASSERT_EQ(run.trace.entries.size(), 2U);
  EXPECT_EQ(run.trace.entries[0].rule, "first");
  EXPECT_EQ(run.trace.entries[0].event, TraceEvent::fired);
  EXPECT_EQ(run.trace.entries[1].rule, "broken");
  EXPECT_EQ(run.trace.entries[1].event, TraceEvent::unsupported);
  ASSERT_GE(run.result.forest.nodes.size(), 2U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "A", ""), 1U);
  EXPECT_EQ(CountFeature(run.result.forest.nodes[1], "B", ""), 1U);
}

}  // namespace
}  // namespace verstaan
