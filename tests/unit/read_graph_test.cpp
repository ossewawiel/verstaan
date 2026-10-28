// read_graph tests, issue 180 (docs/factory/issues/180-test-cases.md, rows G20 to G30). One TEST
// per row, the row id in the test name. Forests H1 and H2 are the table's hand-built forests.
// Every expected value is transcribed from the table, never from running the engine.

#include <gtest/gtest.h>

#include <string>
#include <vector>

#include "verstaan/engine.hpp"
#include "verstaan/rule_interpreter.hpp"

namespace verstaan {
namespace {

TreeNode Sentinel(const char* tag) {
  TreeNode node;
  node.features.emplace_back(tag, "");
  return node;
}

TreeNode Word(std::string surface, std::string uw, std::vector<std::string> attributes = {}) {
  TreeNode node;
  node.surface = std::move(surface);
  node.features.emplace_back(std::string(kUwFeatureKey), std::move(uw));
  node.attributes = std::move(attributes);
  return node;
}

Link ModLink(std::string label, std::size_t from, std::size_t to, std::size_t scope) {
  Link link;
  link.label = std::move(label);
  link.from = from;
  link.to = to;
  link.scope = scope;
  link.built_by = "50";
  link.labelled_by = "172";
  return link;
}

// H1: n0 SHEAD, n1 beautiful, n2 book.@indef, n3 STAIL, n4 hyper-node; mod(n2;n1)@n4.
Forest H1() {
  Forest f;
  f.nodes = {Sentinel("SHEAD"), Word("beautiful", "300217728"),
             Word("book", "102870092", {"@indef"}), Sentinel("STAIL"), TreeNode{}};
  f.links = {ModLink("mod", 2, 1, 4)};
  f.list = {0, 4, 3};
  return f;
}

// H2: n0 SHEAD, n1 a (closed class), n2 beautiful, n3 book.@indef, n4 STAIL, n5 hyper-node;
// mod(n3;n2)@n5.
Forest H2() {
  Forest f;
  f.nodes = {Sentinel("SHEAD"),
             Word("a", "", {"@indef"}),
             Word("beautiful", "300217728"),
             Word("book", "102870092", {"@indef"}),
             Sentinel("STAIL"),
             TreeNode{}};
  f.links = {ModLink("mod", 3, 2, 5)};
  f.list = {0, 1, 5, 4};
  return f;
}

void ExpectNodes(const Graph& g, const std::vector<Node>& expected) {
  ASSERT_EQ(g.nodes.size(), expected.size());
  for (std::size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(g.nodes[i].uw, expected[i].uw) << "node " << i;
    EXPECT_EQ(g.nodes[i].attributes, expected[i].attributes) << "node " << i;
  }
}

struct Rel {
  std::string label;
  std::size_t from;
  std::size_t to;
};

void ExpectRelations(const Graph& g, const std::vector<Rel>& expected) {
  ASSERT_EQ(g.relations.size(), expected.size());
  for (std::size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(g.relations[i].label, expected[i].label) << "relation " << i;
    EXPECT_EQ(g.relations[i].from, expected[i].from) << "relation " << i;
    EXPECT_EQ(g.relations[i].to, expected[i].to) << "relation " << i;
  }
}

const std::vector<Node> kBeautifulBook = {Node{"300217728", {}}, Node{"102870092", {"@indef"}}};

void ExpectBeautifulBook(const Graph& g, const std::vector<Rel>& relations) {
  ExpectNodes(g, kBeautifulBook);
  ExpectRelations(g, relations);
}

TEST(read_graph, G20_h1_gives_the_a08_graph) {
  Graph g;
  ASSERT_EQ(read_graph(H1(), g), Status::ok);
  ExpectBeautifulBook(g, {{"mod", 1, 0}});
}

TEST(read_graph, G21_a_syntactic_link_is_not_a_relation) {
  Forest f = H1();
  f.links[0].label = "NA";
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectBeautifulBook(g, {});
}

TEST(read_graph, G22_a_closed_class_word_is_not_a_node_and_indices_skip_it) {
  Graph g;
  ASSERT_EQ(read_graph(H2(), g), Status::ok);
  ExpectBeautifulBook(g, {{"mod", 1, 0}});
}

TEST(read_graph, G23_a_deleted_word_is_not_a_node_whatever_its_uw) {
  Forest f = H2();
  f.nodes[1].deleted = true;
  f.nodes[1].features = {{std::string(kUwFeatureKey), "102870092"}};
  f.list = {0, 5, 4};
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectBeautifulBook(g, {{"mod", 1, 0}});
}

TEST(read_graph, G24_a_word_with_no_uw_is_not_a_node) {
  Forest f = H1();
  TreeNode unknown;
  unknown.surface = "xyzzy";
  f.nodes.push_back(unknown);  // n5
  f.list = {0, 4, 5, 3};
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectBeautifulBook(g, {{"mod", 1, 0}});
}

TEST(read_graph, G25_a_link_ending_on_a_hyper_node_is_not_copied) {
  Forest f = H1();
  f.links[0] = ModLink("mod", 4, 1, 4);
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectBeautifulBook(g, {});
}

TEST(read_graph, G26_a_link_ending_on_a_closed_class_word_is_not_copied) {
  Forest f = H2();
  f.links[0] = ModLink("mod", 3, 1, 5);
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectBeautifulBook(g, {});
}

TEST(read_graph, G27_two_letter_labels_count_and_graph_order_is_kept) {
  Forest f = H1();
  f.links = {ModLink("to", 2, 1, 4), ModLink("XB", 2, 1, 4), ModLink("or", 1, 2, 4)};
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectRelations(g, {{"to", 1, 0}, {"or", 0, 1}});
}

TEST(read_graph, G28_an_unreadable_forest_is_no_parse_and_leaves_the_graph_empty) {
  Forest f = H1();
  f.links[0].to = 100000;
  Graph g;
  g.nodes.push_back(Node{"stale", {}});
  g.relations.push_back(Relation{"stale", 0, 0});
  EXPECT_EQ(read_graph(f, g), Status::no_parse);
  EXPECT_TRUE(g.nodes.empty());
  EXPECT_TRUE(g.relations.empty());
}

TEST(read_graph, G29_read_graph_replaces_the_graph_and_never_appends) {
  Graph g;
  g.nodes.push_back(Node{"stale", {}});
  g.relations.push_back(Relation{"stale", 0, 0});
  ASSERT_EQ(read_graph(H1(), g), Status::ok);
  ExpectBeautifulBook(g, {{"mod", 1, 0}});
}

TEST(read_graph, G30_a_name_literal_is_a_graph_node) {
  Forest f = H1();
  f.nodes[1] = Word("John", "\"John\"");
  Graph g;
  ASSERT_EQ(read_graph(f, g), Status::ok);
  ExpectNodes(g, {Node{"\"John\"", {}}, Node{"102870092", {"@indef"}}});
  ExpectRelations(g, {{"mod", 1, 0}});
}

}  // namespace
}  // namespace verstaan
