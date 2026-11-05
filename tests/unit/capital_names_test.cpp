// Issue 207 (docs/factory/issues/207-test-cases.md, block C): a capital with a record uses it, a
// sentence-initial capital tries the lower-case word first, and a capital with no record is a bare
// name (ADR 0030). Reads the real `data/languages/eng` and `data/languages/afr` stores. Every
// expected value is transcribed from that table, never from running the engine. A trace is
// asserted by containment of `fired` entries.

#include <gtest/gtest.h>

#include <algorithm>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <string>
#include <string_view>
#include <vector>

#include "verstaan/engine.hpp"
#include "unicode_utf8.hpp"
#include "verstaan/rule_set.hpp"

namespace verstaan {
namespace {

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

const Engine& EngToAfr() {
  static const Engine engine =
      Engine::load(RuleSet::load(std::string(VERSTAAN_REPO_ROOT) + "/data/languages/eng",
                                 std::string(VERSTAAN_REPO_ROOT) + "/data/languages/afr"));
  return engine;
}

Result T(const std::string& text) {
  return EngToAfr().translate(text, Options{.from = Lang::eng, .to = Lang::afr});
}

std::size_t Fired(const Result& result, std::string_view rule) {
  return static_cast<std::size_t>(std::ranges::count_if(
      result.trace.entries,
      [&](const TraceEntry& e) { return e.rule == rule && e.event == TraceEvent::fired; }));
}

bool HasUw(const Result& result, std::string_view uw) {
  return std::ranges::any_of(result.unl.nodes, [&](const Node& n) { return n.uw == uw; });
}

bool HasQuotedUw(const Result& result) {
  return std::ranges::any_of(result.unl.nodes,
                             [](const Node& n) { return n.uw.starts_with('"'); });
}

void ExpectOut(const std::string& input, std::string_view text, Status status) {
  const Result result = T(input);
  EXPECT_EQ(result.text, text) << input;
  EXPECT_EQ(result.status, status) << input;
}

// "same as": text, unl and status agree.
void ExpectSameAs(const std::string& a, const std::string& b) {
  const Result ra = T(a);
  const Result rb = T(b);
  EXPECT_EQ(ra.text, rb.text) << a << " vs " << b;
  EXPECT_EQ(ra.status, rb.status) << a << " vs " << b;
  ASSERT_EQ(ra.unl.nodes.size(), rb.unl.nodes.size()) << a << " vs " << b;
  for (std::size_t i = 0; i < ra.unl.nodes.size(); ++i) {
    EXPECT_EQ(ra.unl.nodes[i].uw, rb.unl.nodes[i].uw);
    EXPECT_EQ(ra.unl.nodes[i].attributes, rb.unl.nodes[i].attributes);
  }
  ASSERT_EQ(ra.unl.relations.size(), rb.unl.relations.size());
  for (std::size_t i = 0; i < ra.unl.relations.size(); ++i) {
    EXPECT_EQ(ra.unl.relations[i].label, rb.unl.relations[i].label);
    EXPECT_EQ(ra.unl.relations[i].from, rb.unl.relations[i].from);
    EXPECT_EQ(ra.unl.relations[i].to, rb.unl.relations[i].to);
  }
}

// --- F2's inputs, every one in the issue's table ---

TEST(capital_names, C01_a_book_is_n_boek) {
  const Result result = T("A book");
  EXPECT_EQ(result.text, "'n boek");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_GE(Fired(result, "afr-gen-36"), 1U);
}

TEST(capital_names, C02_all_the_books_is_al_die_boeke) {
  ExpectOut("All the books", "al die boeke", Status::ok);
}

TEST(capital_names, C03_car_is_motor) { ExpectOut("Car", "motor", Status::ok); }

TEST(capital_names, C04_cars_is_motors) { ExpectOut("Cars", "motors", Status::ok); }

TEST(capital_names, C05_children_is_the_same_as_lower_case_children) {
  ExpectSameAs("Children", "children");
}

TEST(capital_names, C06_the_book_keeps_the_determiner_on_a_name) {
  const Result result = T("The Book");
  EXPECT_EQ(result.text, "die Book");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_GE(Fired(result, "afr-gen-35"), 1U);
}

TEST(capital_names, C07_the_car_is_die_car_not_die_motor) {
  const Result result = T("the Car");
  EXPECT_EQ(result.text, "die Car");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_GE(Fired(result, "afr-gen-35"), 1U);
}

TEST(capital_names, C08_help_is_a_name_first_character_only) {
  const Result result = T("HELP");
  EXPECT_EQ(result.text, "HELP");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C09_xyzzy_capitalised_is_a_name) {
  const Result result = T("Xyzzy");
  EXPECT_EQ(result.text, "Xyzzy");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C10_xyzzy_lower_case_is_marked_and_takes_no_name_path) {
  const Result result = T("xyzzy");
  EXPECT_EQ(result.text, "⟦xyzzy⟧");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_EQ(Fired(result, "182"), 0U);
}

TEST(capital_names, C11_emile_is_a_bare_name) {
  const Result result = T("\xC3\x89mile");
  EXPECT_EQ(result.text, "\xC3\x89mile");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_TRUE(HasUw(result, "\"\xC3\x89mile\""));
  EXPECT_EQ(Fired(result, "182"), 1U);
}

// --- Places and people ---

TEST(capital_names, C13_geneva_alone_is_marked) {
  ExpectOut("Geneva", "⟦Geneva⟧", Status::partial);
}

TEST(capital_names, C14_paris_alone_is_marked_with_its_record) {
  const Result result = T("Paris");
  EXPECT_EQ(result.text, "⟦Paris⟧");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_TRUE(HasUw(result, "112469372"));
}

TEST(capital_names, C15_a_later_paris_consults_the_dictionary) {
  const Result result = T("a book about Paris");
  EXPECT_EQ(result.text, "'n boek oor ⟦Paris⟧");
  EXPECT_EQ(result.status, Status::partial);
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[1].uw, "112469372");
}

TEST(capital_names, C16_a_book_about_brisbane_is_bare_and_ok) {
  const Result result = T("a book about Brisbane");
  EXPECT_EQ(result.text, "'n boek oor Brisbane");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_TRUE(HasUw(result, "\"Brisbane\""));
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C17_brisbane_alone_is_bare) {
  const Result result = T("Brisbane");
  EXPECT_EQ(result.text, "Brisbane");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
  EXPECT_EQ(Fired(result, "afr-gen-35"), 0U);
  EXPECT_EQ(Fired(result, "afr-gen-36"), 0U);
}

TEST(capital_names, C18_a_later_john_is_a_name) {
  const Result result = T("a book about John");
  EXPECT_EQ(result.text, "'n boek oor John");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C19_mary_and_john) { ExpectOut("Mary and John", "Mary en John", Status::ok); }

TEST(capital_names, C20_john_and_mary) {
  const Result result = T("John and Mary");
  EXPECT_EQ(result.text, "John en Mary");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "\"John\"");
  EXPECT_EQ(result.unl.nodes[1].uw, "\"Mary\"");
}

TEST(capital_names, C21_john_alone_is_a_name_not_the_common_noun) {
  const Result result = T("John");
  EXPECT_EQ(result.text, "John");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
  EXPECT_EQ(result.text.find("kleinhuisie"), std::string::npos);
}

TEST(capital_names, C22_a15_holds_the_paris_record_and_no_paris_name_node) {
  const Result result = T(
      "the beautiful book about the city of Paris without pictures and photos on the table");
  EXPECT_TRUE(HasUw(result, "112469372"));
  EXPECT_FALSE(HasUw(result, "\"Paris\""));
  EXPECT_NE(result.text.find("⟦Paris⟧"), std::string::npos);
  EXPECT_EQ(result.status, Status::partial);
}

TEST(capital_names, C23_lyon_with_no_record_is_bare_until_it_has_one) {
  const Result result = T("a book about Lyon");
  EXPECT_EQ(result.text, "'n boek oor Lyon");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C24_shakespeare_with_no_record_is_bare) {
  const Result result = T("a book about Shakespeare");
  EXPECT_EQ(result.text, "'n boek oor Shakespeare");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C25_einstein_with_a_record_is_marked) {
  ExpectOut("a book about Einstein", "'n boek oor ⟦Einstein⟧", Status::partial);
}

TEST(capital_names, C27_a_later_non_ascii_capital_with_no_record_is_bare) {
  ExpectOut("a book about \xC3\x89mile", "'n boek oor \xC3\x89mile", Status::ok);
}

TEST(capital_names, C28_a_non_ascii_capital_with_a_record_stays_a_record) {
  const Result result = T("a book about \xC3\x81ine");
  EXPECT_EQ(result.text, "'n boek oor ⟦\xC3\x81ine⟧");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_FALSE(HasUw(result, "\"\xC3\x81ine\""));
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[1].uw, "115669073");
}

// --- The capital test and the lookup order ---

TEST(capital_names, C29_comrade_keeps_its_exact_record) {
  const Result result = T("Comrade");
  EXPECT_EQ(result.text, "⟦Comrade⟧");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_TRUE(HasUw(result, "109951524"));
  EXPECT_FALSE(HasQuotedUw(result));
}

TEST(capital_names, C30_i_keeps_its_records_and_makes_no_quoted_node) {
  const Result result = T("I");
  EXPECT_FALSE(HasQuotedUw(result));
  EXPECT_EQ(result.status, Status::partial);
}

TEST(capital_names, C31_no_engine_source_file_holds_a_string_literal_i) {
  namespace fs = std::filesystem;
  std::vector<std::string> hits;
  for (const auto& entry :
       fs::recursive_directory_iterator(fs::path(VERSTAAN_REPO_ROOT) / "engine" / "src")) {
    const std::string ext = entry.path().extension().string();
    if (!entry.is_regular_file() || (ext != ".cpp" && ext != ".hpp")) {
      continue;
    }
    std::ifstream in(entry.path());
    std::string line;
    while (std::getline(in, line)) {
      if (line.find("\"I\"") != std::string::npos) {
        hits.push_back(entry.path().string() + ": " + line);
      }
    }
  }
  EXPECT_TRUE(hits.empty()) << (hits.empty() ? "" : hits.front());
}

TEST(capital_names, C32_new_book_is_the_same_as_new_book_lower_case) {
  ExpectSameAs("New book", "new book");
}

TEST(capital_names, C54_media_exact_form_wins_on_priority) {
  const Result result = T("Media");
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "115668874");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C33_a_capital_after_a_full_stop_reads_like_lower_case) {
  ExpectSameAs("A book. A car.", "a book. a car.");
}

TEST(capital_names, C34_a_later_capital_a_with_a_record_takes_it) {
  const Result result = T("book A");
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[1].uw, "113637376");
  EXPECT_FALSE(HasQuotedUw(result));
}

TEST(capital_names, C35_slumbrous_is_marked_as_typed) {
  ExpectOut("Slumbrous", "⟦Slumbrous⟧", Status::partial);
}

TEST(capital_names, C36_a_greek_capital_is_a_name) {
  const Result result = T("\xCE\xA9mega");
  EXPECT_EQ(result.text, "\xCE\xA9mega");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C37_a_titlecase_letter_is_no_capital) {
  ExpectOut("\xC7\x85x", "⟦\xC7\x85x⟧", Status::partial);
}

TEST(capital_names, C38_a_lower_case_non_ascii_word_takes_no_name_path) {
  ExpectOut("\xC3\xA9mile", "⟦\xC3\xA9mile⟧", Status::partial);
}

TEST(capital_names, C39_a_cut_utf8_byte_is_no_capital) {
  ExpectOut("\xC3", "⟦\xC3⟧", Status::partial);
}

// --- The drafted rules ---

TEST(capital_names, C41_a_book_about_the_car) {
  ExpectOut("a book about the car", "'n boek oor die motor", Status::ok);
}

TEST(capital_names, C46_glass_mug_fires_rule_ten_and_not_183) {
  const Result result = T("glass mug");
  EXPECT_GE(Fired(result, "10"), 1U);
  EXPECT_EQ(Fired(result, "183"), 0U);
}

TEST(capital_names, C47_book_xyzzy_marks_the_lower_case_word_and_fires_no_183) {
  const Result result = T("book xyzzy");
  EXPECT_EQ(result.text, "boek ⟦xyzzy⟧");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_EQ(Fired(result, "183"), 0U);
}

TEST(capital_names, C48_a_car_keeps_the_article_on_a_name) {
  ExpectOut("a Car", "'n Car", Status::ok);
}

TEST(capital_names, C45_book_geneva_marks_the_place) {
  const Result result = T("book Geneva");
  EXPECT_EQ(result.text, "boek ⟦Geneva⟧");
  EXPECT_EQ(result.status, Status::partial);
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[0].uw, "102870092");
  EXPECT_EQ(result.unl.nodes[1].uw, "500004419");
  EXPECT_GE(Fired(result, "183"), 1U);
  EXPECT_EQ(Fired(result, "182"), 0U);
}

TEST(capital_names, C50_a_name_literal_carries_temp_so_182_and_183_each_fire_once) {
  const Result result = T("book Brisbane");
  EXPECT_EQ(Fired(result, "182"), 1U);
  EXPECT_EQ(Fired(result, "183"), 1U);
}

// --- The owner's lower-case test ---

TEST(capital_names, C60_peter_counts_as_no_word) {
  const Result result = T("Peter");
  EXPECT_EQ(result.text, "Peter");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C61_dad_is_the_accepted_cost) {
  const Result result = T("Dad");
  EXPECT_EQ(result.text, "Dad");
  EXPECT_EQ(result.status, Status::ok);
  EXPECT_EQ(Fired(result, "182"), 1U);
}

TEST(capital_names, C62_teacher_is_a_word_marked_as_typed) {
  const Result result = T("Teacher");
  EXPECT_EQ(result.text, "⟦Teacher⟧");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_EQ(Fired(result, "182"), 0U);
}

// --- Malformed UTF-8 is no capital (C55 to C57) ---

void ExpectMarkedBytes(const std::string& bytes) {
  const Result result = T(bytes);
  EXPECT_EQ(result.text, "\xE2\x9F\xA6" + bytes + "\xE2\x9F\xA7");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_EQ(Fired(result, "afr-gen-36"), 0U);
}

TEST(capital_names, C55_an_overlong_three_byte_form_of_a_is_marked_not_the_article) {
  ExpectMarkedBytes("\xE0\x81\x81");
}

TEST(capital_names, C56_an_overlong_four_byte_form_of_a_is_marked) {
  ExpectMarkedBytes("\xF0\x80\x81\x81");
}

// C57: the strict decoder's contract. `length` 0 means malformed, so a returned `code` is always a
// scalar value. Through `translate` the branch has no effect, because neither is `Lu`.
TEST(capital_names, C57_the_decoder_refuses_a_surrogate_and_a_value_above_u10ffff) {
  EXPECT_EQ(decode_leading_code_point("\xED\xA0\x80").length, 0U);
  EXPECT_EQ(decode_leading_code_point("\xF4\x90\x80\x80").length, 0U);
}

// --- `eng-dis-11` does no new damage (C96 to C103, C110, C111) ---
// Each input is one the wide rule damaged. A row asserts that no word is lost and that rule 11 stays
// silent. The text is not pinned as right: `oor` is the correct word, and a later quest owns it.

void ExpectNoRuleEleven(const Result& result, const std::string& input) {
  EXPECT_EQ(Fired(result, "11"), 0U) << input;
}

TEST(capital_names, C96_a_book_about_cars_with_a_full_stop_keeps_about) {
  const Result result = T("a book about cars.");
  EXPECT_NE(result.text, "'n boek motors");
  ExpectNoRuleEleven(result, "a book about cars.");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C97_many_books_about_cars_with_a_full_stop_keeps_about) {
  const Result result = T("many books about cars.");
  EXPECT_NE(result.text, "talle boeke motors");
  ExpectNoRuleEleven(result, "many books about cars.");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C98_about_cars_keeps_about) {
  const Result result = T("about cars");
  EXPECT_NE(result.text, "motors");
  ExpectNoRuleEleven(result, "about cars");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C99_about_five_books_keeps_about) {
  const Result result = T("about five books");
  EXPECT_NE(result.text, "vyf boeke");
  ExpectNoRuleEleven(result, "about five books");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C100_a_book_about_five_cars_keeps_about) {
  const Result result = T("a book about five cars");
  EXPECT_NE(result.text, "'n boek vyf motors");
  ExpectNoRuleEleven(result, "a book about five cars");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C101_a_book_about_cars_and_books_keeps_the_and) {
  const Result result = T("a book about cars and books");
  EXPECT_NE(result.text.find("motors en boeke"), std::string::npos) << result.text;
  ExpectNoRuleEleven(result, "a book about cars and books");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C102_a_book_about_cars_or_books_keeps_the_or) {
  const Result result = T("a book about cars or books");
  EXPECT_NE(result.text.find("motors of boeke"), std::string::npos) << result.text;
  ExpectNoRuleEleven(result, "a book about cars or books");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C103_the_book_is_about_cars_marks_nothing) {
  const Result result = T("the book is about cars");
  EXPECT_EQ(result.text.find("\xE2\x9F\xA6"), std::string::npos) << result.text;
  ExpectNoRuleEleven(result, "the book is about cars");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C110_about_i_carries_no_cap_so_rule_eleven_stays_silent) {
  ExpectNoRuleEleven(T("about I"), "about I");
}

TEST(capital_names, C111_a_book_about_english_keeps_about_visible) {
  const Result result = T("a book about English");
  ExpectNoRuleEleven(result, "a book about English");
  EXPECT_NE(result.text.find("\xE2\x9F\xA6" "about\xE2\x9F\xA7"), std::string::npos)
      << result.text;
}

TEST(capital_names, C40_a_book_about_cars_fires_no_rule_eleven) {
  const Result result = T("a book about cars");
  ExpectNoRuleEleven(result, "a book about cars");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C109_the_article_alone_is_empty_text) {
  for (const char* input : {"A", "A.", "A?"}) {
    const Result result = T(input);
    EXPECT_EQ(result.text, "") << input;
    EXPECT_EQ(result.status, Status::ok) << input;
  }
}

// --- The owner's records and the months (C80 to C85, C93, C94) ---

TEST(capital_names, C80_march_is_the_month) {
  const Result result = T("March");
  EXPECT_EQ(result.text, "Maart");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "115210870");
}

TEST(capital_names, C81_may_is_the_month) {
  const Result result = T("May");
  EXPECT_EQ(result.text, "Mei");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "115211484");
}

// The row names no text: afr holds `Aug` and `Augustus` at one priority, and the tie is not pinned.
TEST(capital_names, C82_august_is_the_month_node) {
  const Result result = T("August");
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "115212455");
  EXPECT_EQ(result.status, Status::ok);
}

TEST(capital_names, C83_march_on_reads_the_month) {
  const Result result = T("March on");
  ASSERT_FALSE(result.unl.nodes.empty());
  EXPECT_EQ(result.unl.nodes[0].uw, "115210870");
  EXPECT_TRUE(result.text.starts_with("Maart")) << result.text;
}

TEST(capital_names, C84_god_is_a_record_with_a_quoted_uw) {
  const Result result = T("God");
  EXPECT_EQ(result.text, "God");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "\"God\"");
  EXPECT_EQ(Fired(result, "182"), 0U);
}

TEST(capital_names, C85_march_in_lower_case_is_the_verb) {
  ExpectOut("march", "loop", Status::ok);
}

TEST(capital_names, C93_god_in_lower_case_is_beeld) {
  const Result result = T("god");
  EXPECT_EQ(result.text, "beeld");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 1U);
  EXPECT_EQ(result.unl.nodes[0].uw, "103560161");
}

TEST(capital_names, C94_a_book_about_god_reads_the_exact_record) {
  const Result result = T("a book about God");
  EXPECT_EQ(result.text, "'n boek oor God");
  EXPECT_EQ(result.status, Status::ok);
  ASSERT_EQ(result.unl.nodes.size(), 2U);
  EXPECT_EQ(result.unl.nodes[1].uw, "\"God\"");
  EXPECT_EQ(Fired(result, "182"), 0U);
}

}  // namespace
}  // namespace verstaan
