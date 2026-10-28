// Generation tests (docs/standards/testing.md: "fast"), `ctest -R generation`
// (docs/factory/issues/181-test-cases.md, rows N20 to N54, N61, N62 and N63). Reads the real
// `data/languages/eng` and `data/languages/afr` stores (`VERSTAAN_REPO_ROOT`). Every expected
// value is transcribed from that table, never from running the engine. A trace is asserted by
// containment of `fired` entries (the table's preamble).

#include <gtest/gtest.h>

#include <algorithm>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <initializer_list>
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

std::string EngStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/eng"; }
std::string AfrStoreRoot() { return std::string(VERSTAAN_REPO_ROOT) + "/data/languages/afr"; }

const RuleSet& Rules() {
  static const RuleSet rules = RuleSet::load(EngStoreRoot(), AfrStoreRoot());
  return rules;
}

const Dictionary& AfrDictionary() {
  static const Dictionary dictionary = Dictionary::load(AfrStoreRoot(), Lang::afr);
  return dictionary;
}

struct Generated {
  GenerationResult result;
  Trace trace;
};

Generated Generate(const Graph& graph, const std::vector<std::string>& surfaces,
                   const RuleSet& rules = Rules()) {
  Generated out;
  out.result =
      RuleInterpreter(rules).generate(graph, AfrDictionary(), surfaces, Lang::afr, out.trace);
  return out;
}

Graph MakeGraph(std::vector<Node> nodes, std::vector<Relation> relations = {}) {
  Graph graph;
  graph.nodes = std::move(nodes);
  graph.relations = std::move(relations);
  return graph;
}

std::size_t Count(const Trace& trace, std::string_view id) {
  return static_cast<std::size_t>(std::ranges::count_if(trace.entries, [&](const TraceEntry& e) {
    return e.rule == id && e.event == TraceEvent::fired;
  }));
}

void ExpectFired(const Trace& trace, std::initializer_list<std::string_view> ids) {
  for (std::string_view id : ids) {
    EXPECT_GT(Count(trace, id), 0u) << "missing " << id;
  }
}

void ExpectNotFired(const Trace& trace, std::initializer_list<std::string_view> ids) {
  for (std::string_view id : ids) {
    EXPECT_EQ(Count(trace, id), 0u) << "unexpected " << id;
  }
}

std::size_t Words(const std::string& text) {
  if (text.empty()) {
    return 0;
  }
  return static_cast<std::size_t>(std::ranges::count(text, ' ')) + 1;
}

void ExpectText(const Generated& g, std::string_view text, Status status = Status::ok) {
  EXPECT_EQ(g.result.text, text);
  EXPECT_EQ(g.result.status, status);
}

// The live node of the final list whose surface is `surface`, or null.
const TreeNode* ListNode(const GenerationResult& result, std::string_view surface) {
  for (std::size_t index : result.forest.list) {
    const TreeNode& node = result.forest.nodes[index];
    if (!node.deleted && node.surface == surface) {
      return &node;
    }
  }
  return nullptr;
}

bool HasFeature(const TreeNode& node, std::string_view key, std::string_view value) {
  return std::ranges::any_of(node.features,
                             [&](const Feature& f) { return f.first == key && f.second == value; });
}

bool HasKey(const TreeNode& node, std::string_view key) {
  return std::ranges::any_of(node.features, [&](const Feature& f) { return f.first == key; });
}

// Corpus graphs.
Graph Book() { return MakeGraph({{"102870092", {}}}); }
Graph CorpusA07() {
  return MakeGraph({{"102870092", {"@indef"}}, {"102883344", {"@indef"}}}, {{"plc", 0, 1}});
}
Graph CorpusA10() {
  return MakeGraph({{"115155220", {"@paucal"}}, {"115237250", {"@def", "@before"}}},
                   {{"tim", 0, 1}});
}
Graph CarMod(std::vector<std::string> car, std::vector<std::string> adj) {
  return MakeGraph({{"102958343", std::move(car)}, {"300217728", std::move(adj)}}, {{"mod", 0, 1}});
}

TEST(generation, N20_line_1_book) {
  const Generated g = Generate(Book(), {"book"});
  ExpectText(g, "boek");
  ExpectFired(g.trace, {"afr-gen-227", "afr-inf-M3"});
}

TEST(generation, N21_line_2_the_book) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@def"}}}), {"book"});
  ExpectText(g, "die boek");
  ExpectFired(g.trace, {"afr-gen-35", "afr-gen-195", "afr-gen-231"});
}

TEST(generation, N22_line_3_a_book) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@indef"}}}), {"book"});
  ExpectText(g, "'n boek");
  ExpectFired(g.trace, {"afr-gen-36"});
}

TEST(generation, N23_line_10_books) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@pl"}}}), {"books"});
  ExpectText(g, "boeke");
  ExpectFired(g.trace, {"afr-gen-56", "afr-inf-M3"});
}

TEST(generation, N24_line_31_the_books) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@def", "@pl"}}}), {"books"});
  ExpectText(g, "die boeke");
  ExpectFired(g.trace, {"afr-gen-35", "afr-gen-56", "afr-inf-M3"});
}

TEST(generation, N25_line_35_all_the_books) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@all", "@def"}}}), {"books"});
  ExpectText(g, "al die boeke");
  ExpectFired(g.trace, {"afr-gen-35", "afr-gen-37", "afr-gen-60", "afr-gen-191"});
  ExpectNotFired(g.trace, {"afr-gen-56"});
}

TEST(generation, N26_line_91_a_book_in_a_box) {
  const Generated g = Generate(CorpusA07(), {"book", "box"});
  ExpectText(g, "'n boek in 'n boks");
  ExpectFired(g.trace, {"afr-gen-234", "afr-gen-36"});
}

TEST(generation, N27_rule_234_places_the_phrase_after_the_noun) {
  const Generated g = Generate(CorpusA07(), {"book", "box"});
  EXPECT_TRUE(g.result.text.starts_with("'n boek in 'n "));
  EXPECT_EQ(Words(g.result.text), 5u);
  ExpectFired(g.trace, {"afr-gen-234", "afr-gen-67", "afr-gen-129", "afr-gen-160"});
  ExpectNotFired(g.trace, {"afr-gen-18", "afr-gen-22"});
}

TEST(generation, N28_line_121_a_beautiful_book) {
  const Generated g =
      Generate(MakeGraph({{"102870092", {"@indef"}}, {"300217728", {}}}, {{"mod", 0, 1}}),
               {"book", "beautiful"});
  ExpectText(g, "'n mooi boek");
  ExpectFired(g.trace, {"afr-gen-8", "afr-gen-36", "afr-gen-67", "afr-gen-196"});
}

TEST(generation, N30_line_143_some_days_before_the_summer) {
  const Generated g = Generate(CorpusA10(), {"days", "summer"});
  EXPECT_TRUE(g.result.text.ends_with(" dae voor die somer")) << g.result.text;
  ExpectFired(g.trace, {"afr-gen-26", "afr-gen-40", "afr-inf-M7", "afr-inf-M2"});
  ExpectNotFired(g.trace, {"afr-gen-30"});
}

TEST(generation, N31_line_209_the_beautiful_car) {
  const Generated g = Generate(CarMod({"@def"}, {}), {"car", "beautiful"});
  ExpectText(g, "die mooi motor");
  ExpectFired(g.trace, {"afr-gen-8", "afr-gen-35", "afr-gen-196"});
}

TEST(generation, N32_the_beautiful_car_word_order) {
  const Generated g = Generate(CarMod({"@def"}, {}), {"car", "beautiful"});
  EXPECT_TRUE(g.result.text.starts_with("die mooi "));
  EXPECT_EQ(Words(g.result.text), 3u);
  ExpectFired(g.trace, {"afr-gen-8", "afr-gen-35", "afr-gen-67", "afr-gen-196"});
}

TEST(generation, N33_line_210_a_very_beautiful_car) {
  const Generated g = Generate(CarMod({"@indef"}, {"@plus"}), {"car", "beautiful"});
  ExpectText(g, "'n baie mooi motor");
  ExpectFired(g.trace, {"afr-gen-8", "afr-gen-36", "afr-gen-42", "afr-gen-201"});
}

TEST(generation, N34_a_very_beautiful_car_word_order) {
  const Generated g = Generate(CarMod({"@indef"}, {"@plus"}), {"car", "beautiful"});
  EXPECT_TRUE(g.result.text.starts_with("'n baie mooi "));
  EXPECT_EQ(Words(g.result.text), 4u);
  ExpectFired(g.trace, {"afr-gen-42", "afr-gen-113", "afr-gen-201"});
}

TEST(generation, N35_john_and_mary) {
  const Generated g =
      Generate(MakeGraph({{"\"John\"", {}}, {"\"Mary\"", {}}}, {{"and", 1, 0}}), {"John", "Mary"});
  ExpectText(g, "John en Mary");
  ExpectFired(g.trace, {"afr-gen-33", "afr-gen-229"});
}

TEST(generation, N40_foto_s_takes_the_m16_paradigm) {
  const Generated g = Generate(MakeGraph({{"103925226", {"@pl"}}}), {"photos"});
  ExpectText(g, "foto's");
  ExpectFired(g.trace, {"afr-gen-56", "afr-inf-M16"});
}

TEST(generation, N41_dae_takes_the_m7_replacement) {
  const Generated g = Generate(MakeGraph({{"115155220", {"@pl"}}}), {"days"});
  ExpectText(g, "dae");
  ExpectFired(g.trace, {"afr-gen-56", "afr-inf-M7"});
}

TEST(generation, N42_somers_takes_the_m2_plural) {
  const Generated g = Generate(MakeGraph({{"115237250", {"@pl"}}}), {"summers"});
  ExpectText(g, "somers");
  ExpectFired(g.trace, {"afr-gen-56", "afr-inf-M2"});
}

TEST(generation, N44_the_article_die_takes_the_closed_class_record) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@def"}}}), {"book"});
  const TreeNode* die = ListNode(g.result, "die");
  ASSERT_NE(die, nullptr);
  EXPECT_TRUE(HasFeature(*die, "LEMMA", "die"));
  EXPECT_TRUE(HasFeature(*die, "BF", "die"));
  EXPECT_TRUE(HasFeature(*die, "LEX", "D"));
  EXPECT_TRUE(HasFeature(*die, "POS", "ART"));
  EXPECT_TRUE(Count(g.trace, "afr-gen-35") > 0);
}

TEST(generation, N45_the_article_n_takes_the_closed_class_record) {
  const Generated g = Generate(MakeGraph({{"102870092", {"@indef"}}}), {"book"});
  const TreeNode* n = ListNode(g.result, "'n");
  ASSERT_NE(n, nullptr);
  EXPECT_TRUE(HasFeature(*n, "LEMMA", "'n"));
  EXPECT_TRUE(HasFeature(*n, "LEX", "D"));
  EXPECT_TRUE(HasFeature(*n, "POS", "ART"));
}

TEST(generation, N46_in_has_no_closed_class_record_and_takes_no_lemma) {
  const Generated g = Generate(CorpusA07(), {"book", "box"});
  const TreeNode* in = ListNode(g.result, "in");
  ASSERT_NE(in, nullptr);
  EXPECT_TRUE(HasFeature(*in, "LEX", "P"));
  EXPECT_TRUE(HasFeature(*in, "POS", "PRE"));
  EXPECT_FALSE(HasKey(*in, "LEMMA"));
  EXPECT_FALSE(HasFeature(*in, "LEX", "A"));
}

TEST(generation, N47_a_literal_with_no_record_carries_the_rule_edits_only) {
  GrammarRule rule;
  rule.id = "1";
  rule.kind = "generation";
  rule.lhs = "(%x,N,@def)";
  rule.rhs = "(NS(%x,-@def;%y,[qqq],+LEX=D,+POS=ART),+LEX=N)";
  const RuleSet rules = RuleSet::from_rules({}, {}, {}, {}, {rule}, {}, {});
  const Generated g = Generate(MakeGraph({{"102870092", {"@def"}}}), {"book"}, rules);
  const auto& nodes = g.result.forest.nodes;
  const auto live = std::ranges::count_if(
      nodes, [](const TreeNode& n) { return !n.deleted && n.surface == "qqq"; });
  EXPECT_EQ(live, 1);
  const auto found = std::ranges::find_if(
      nodes, [](const TreeNode& n) { return !n.deleted && n.surface == "qqq"; });
  ASSERT_NE(found, nodes.end());
  const TreeNode* qqq = &*found;
  EXPECT_EQ(qqq->features.size(), 2u);
  EXPECT_TRUE(HasFeature(*qqq, "LEX", "D"));
  EXPECT_TRUE(HasFeature(*qqq, "POS", "ART"));
  EXPECT_GT(Count(g.trace, "afr-gen-1"), 0u);
}

std::vector<std::int64_t> Ids(const std::vector<DictionaryEntry>& entries) {
  std::vector<std::int64_t> ids;
  for (const DictionaryEntry& entry : entries) {
    ids.push_back(entry.id);
  }
  return ids;
}

TEST(generation, N48_lookup_uw_of_beautiful_is_in_store_order) {
  EXPECT_EQ(Ids(AfrDictionary().lookup_uw("300217728")),
            (std::vector<std::int64_t>{20866, 24584, 22017, 26086, 23039, 27524}));
}

TEST(generation, N49_lookup_uw_of_car_is_in_store_order) {
  EXPECT_EQ(Ids(AfrDictionary().lookup_uw("102958343")),
            (std::vector<std::int64_t>{15462, 15473, 15475, 15464, 15477, 15480}));
}

TEST(generation, N50_lookup_uw_finds_nothing_for_an_unknown_or_empty_uw) {
  EXPECT_TRUE(AfrDictionary().lookup_uw("100135148").empty());
  EXPECT_TRUE(AfrDictionary().lookup_uw("").empty());
}

TEST(generation, N51_lexical_choice_takes_the_base_form_dag) {
  ExpectText(Generate(MakeGraph({{"115155220", {}}}), {"day"}), "dag");
}

TEST(generation, N52_lexical_choice_takes_mooi_on_a_priority_tie) {
  ExpectText(Generate(MakeGraph({{"300217728", {}}}), {"beautiful"}), "mooi");
}

TEST(generation, N53_a_node_with_no_entry_is_marked_once) {
  ExpectText(Generate(MakeGraph({{"100135148", {"@indef"}}}), {"box"}), "⟦box⟧", Status::partial);
}

TEST(generation, N54_an_empty_graph_gives_empty_ok_text) {
  const Generated g = Generate(Graph{}, {});
  EXPECT_TRUE(g.result.text.empty());
  EXPECT_EQ(g.result.status, Status::ok);
  EXPECT_FALSE(std::ranges::any_of(g.trace.entries, [](const TraceEntry& e) {
    return e.rule.starts_with("afr-gen-") && e.event == TraceEvent::fired;
  }));
}

TEST(generation, N61_a_plc_on_a_non_noun_head_falls_through_to_rule_22) {
  const Generated g = Generate(MakeGraph({{"300217728", {}}, {"102883344", {}}}, {{"plc", 0, 1}}),
                               {"beautiful", "box"});
  ExpectFired(g.trace, {"afr-gen-22"});
  ExpectNotFired(g.trace, {"afr-gen-234"});
}

TEST(generation, N62_plc_on_table_keeps_rule_18) {
  const Generated g = Generate(
      MakeGraph({{"102870092", {}}, {"104379243", {"@on"}}}, {{"plc", 0, 1}}), {"book", "table"});
  ExpectText(g, "boek op tafel");
  ExpectFired(g.trace, {"afr-gen-18"});
  ExpectNotFired(g.trace, {"afr-gen-234", "afr-gen-22"});
}

TEST(generation, N63_no_engine_comment_names_issue_25) {
  namespace fs = std::filesystem;
  std::vector<std::string> hits;
  for (const auto& entry :
       fs::recursive_directory_iterator(fs::path(VERSTAAN_REPO_ROOT) / "engine")) {
    const std::string ext = entry.path().extension().string();
    if (!entry.is_regular_file() || (ext != ".cpp" && ext != ".hpp")) {
      continue;
    }
    if (entry.path().string().find("/generated/") != std::string::npos) {
      continue;
    }
    std::ifstream in(entry.path());
    std::string line;
    while (std::getline(in, line)) {
      if (line.find("issue 25") != std::string::npos) {
        hits.push_back(entry.path().string() + ": " + line);
      }
    }
  }
  EXPECT_TRUE(hits.empty()) << hits.front();
}

}  // namespace
}  // namespace verstaan
