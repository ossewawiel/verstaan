// Lang and its iso3 mapping (issue 28, ADR 0029). Rows L18 to L32 and L53 of
// docs/factory/issues/28-test-cases.md. The table is the source of truth.

#include <gtest/gtest.h>

#include <filesystem>
#include <fstream>
#include <regex>
#include <sstream>
#include <string>
#include <vector>

#include "verstaan/lang.hpp"

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

namespace verstaan {
namespace {

TEST(lang, L18_eng_maps_to_the_eng_member) {
  const auto lang = lang_from_iso3("eng");
  ASSERT_TRUE(lang.has_value());
  EXPECT_EQ(*lang, Lang::eng);
}

TEST(lang, L19_afr_maps_to_the_afr_member) {
  const auto lang = lang_from_iso3("afr");
  ASSERT_TRUE(lang.has_value());
  EXPECT_EQ(*lang, Lang::afr);
}

TEST(lang, L20_nld_maps_with_no_store) {
  const auto lang = lang_from_iso3("nld");
  ASSERT_TRUE(lang.has_value());
  EXPECT_EQ(*lang, Lang::nld);
}

TEST(lang, L21_xxa_is_none_of_the_three_members_and_comes_back_as_xxa) {
  const auto lang = lang_from_iso3("xxa");
  ASSERT_TRUE(lang.has_value());
  EXPECT_NE(*lang, Lang::eng);
  EXPECT_NE(*lang, Lang::afr);
  EXPECT_NE(*lang, Lang::nld);
  EXPECT_EQ(iso3_of(*lang), "xxa");
}

TEST(lang, L22_xxb_differs_from_xxa) {
  const auto a = lang_from_iso3("xxa");
  const auto b = lang_from_iso3("xxb");
  ASSERT_TRUE(a.has_value());
  ASSERT_TRUE(b.has_value());
  EXPECT_NE(*a, *b);
  EXPECT_EQ(iso3_of(*b), "xxb");
}

TEST(lang, L23_eng_member_and_mapping_agree) { EXPECT_EQ(iso3_of(Lang::eng), "eng"); }

TEST(lang, L24_afr_member_and_mapping_agree) { EXPECT_EQ(iso3_of(Lang::afr), "afr"); }

TEST(lang, L25_a_code_no_store_holds_still_maps) {
  const auto lang = lang_from_iso3("zzz");
  ASSERT_TRUE(lang.has_value());
  EXPECT_EQ(iso3_of(*lang), "zzz");
}

TEST(lang, L26_the_empty_string_is_not_a_code) { EXPECT_FALSE(lang_from_iso3("").has_value()); }

TEST(lang, L27_iso1_is_not_a_code) { EXPECT_FALSE(lang_from_iso3("en").has_value()); }

TEST(lang, L28_upper_case_is_not_a_code) { EXPECT_FALSE(lang_from_iso3("ENG").has_value()); }

TEST(lang, L29_four_letters_are_not_a_code) { EXPECT_FALSE(lang_from_iso3("engl").has_value()); }

TEST(lang, L30_a_digit_is_not_a_letter) { EXPECT_FALSE(lang_from_iso3("e1g").has_value()); }

TEST(lang, L31_two_characters_in_three_bytes_are_not_a_code) {
  EXPECT_FALSE(lang_from_iso3("\xC3\xA9" "a").has_value());
}

TEST(lang, L32_a_value_with_no_code_gives_an_empty_string) {
  EXPECT_TRUE(iso3_of(Lang{}).empty());
}

// L53: a source check. No branch of engine/src names a member or switches on a language.
// Comments that mention eng or afr may stay, so each line loses its `//` tail first.
TEST(lang, L53_engine_src_names_no_lang_member_and_has_no_switch_on_lang) {
  namespace fs = std::filesystem;
  const std::regex pattern(R"(Lang::(eng|afr|nld)|switch \(lang)");
  std::vector<std::string> hits;
  for (const auto& entry : fs::recursive_directory_iterator(fs::path(VERSTAAN_REPO_ROOT) / "engine/src")) {
    if (!entry.is_regular_file()) continue;
    const auto ext = entry.path().extension();
    if (ext != ".cpp" && ext != ".hpp") continue;
    std::ifstream file(entry.path());
    std::string line;
    int n = 0;
    while (std::getline(file, line)) {
      ++n;
      const auto comment = line.find("//");
      if (comment != std::string::npos) line.erase(comment);
      if (std::regex_search(line, pattern)) {
        hits.push_back(entry.path().filename().string() + ":" + std::to_string(n));
      }
    }
  }
  std::ostringstream where;
  for (const auto& h : hits) where << h << " ";
  EXPECT_TRUE(hits.empty()) << "engine/src still names a language: " << where.str();
}

}  // namespace
}  // namespace verstaan
