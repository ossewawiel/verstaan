// Proves the golden loader's stale-key, deferred and pending paths (issue 202).
// Rows are built in memory; no fixture file is read. run_row raises its failures through
// GoogleTest, so each call runs under a ScopedFakeTestPartResultReporter that records the results
// instead of failing this test.

#include <gtest/gtest-spi.h>
#include <gtest/gtest.h>

#include <filesystem>
#include <map>
#include <string>
#include <string_view>
#include <vector>

#include "row_loader.hpp"
#include "verstaan/lang.hpp"

namespace verstaan::golden {
namespace {

struct Outcome {
  std::vector<testing::TestPartResult> parts;
  std::string out;
  int failures() const {
    int n = 0;
    for (const auto& p : parts) n += p.failed() ? 1 : 0;
    return n;
  }
};

Outcome run_captured(const Row& row) {
  testing::TestPartResultArray results;
  testing::internal::CaptureStdout();
  {
    testing::ScopedFakeTestPartResultReporter scope(
        testing::ScopedFakeTestPartResultReporter::INTERCEPT_ONLY_CURRENT_THREAD, &results);
    run_row(row);
  }
  Outcome o;
  o.out = testing::internal::GetCapturedStdout();
  for (int i = 0; i < results.size(); ++i) o.parts.push_back(results.GetTestPartResult(i));
  return o;
}

// Owner-written pair from the eng fixture (row A09): not derived from a run of the engine.
Row matching_row() {
  Row row;
  row.id = "mem_match";
  row.input = "a book about Geneva";
  row.expected = "'n boek oor Geneva";
  row.status = "ok";
  row.file = "memory";
  return row;
}

Row mismatching_row() {
  Row row = matching_row();
  row.id = "mem_mismatch";
  row.expected = "'n verkeerde sin";
  return row;
}

TEST(golden_loader, deferred_row_that_matches_fails_with_remove_key_message) {
  Row row = matching_row();
  row.deferred = "201";
  const Outcome o = run_captured(row);
  ASSERT_EQ(o.failures(), 1);
  EXPECT_NE(std::string(o.parts.front().message()).find("Remove the `deferred` key"),
            std::string::npos);
}

TEST(golden_loader, deferred_row_that_mismatches_does_not_fail) {
  Row row = mismatching_row();
  row.deferred = "201";
  const Outcome o = run_captured(row);
  EXPECT_EQ(o.failures(), 0);
  EXPECT_NE(o.out.find("DEFERRED (issue 201)"), std::string::npos);
}

TEST(golden_loader, pending_row_that_mismatches_does_not_fail_and_says_pending) {
  Row row = mismatching_row();
  row.review = "pending";
  const Outcome o = run_captured(row);
  EXPECT_EQ(o.failures(), 0);
  EXPECT_NE(o.out.find("PENDING"), std::string::npos);
}

TEST(golden_loader, confirmed_row_that_mismatches_fails) {
  const Outcome o = run_captured(mismatching_row());
  EXPECT_EQ(o.failures(), 1);
  EXPECT_NE(o.out.find("CONFIRMED"), std::string::npos);
}

// --- Issue 28: the runner takes its pair from the row's direction (docs/factory/issues/
// 28-test-cases.md, rows L01 to L17 and L60 to L72). ---

void ExpectDirection(std::string_view text, std::string_view from, std::string_view to) {
  const auto direction = parse_direction(text);
  ASSERT_TRUE(direction.has_value()) << text;
  const auto want_from = lang_from_iso3(from);
  const auto want_to = lang_from_iso3(to);
  ASSERT_TRUE(want_from.has_value());
  ASSERT_TRUE(want_to.has_value());
  EXPECT_EQ(direction->from, *want_from) << text;
  EXPECT_EQ(direction->to, *want_to) << text;
}

TEST(golden_loader, L01_parse_direction_reads_the_fixture_spelling) {
  ExpectDirection("xxa->xxb", "xxa", "xxb");
}
TEST(golden_loader, L02_parse_direction_swaps_the_codes) { ExpectDirection("xxb->xxa", "xxb", "xxa"); }
TEST(golden_loader, L03_parse_direction_reads_the_eng_spelling) {
  ExpectDirection("eng-afr", "eng", "afr");
}
TEST(golden_loader, L04_either_spelling_takes_the_eng_pair) { ExpectDirection("eng->afr", "eng", "afr"); }
TEST(golden_loader, L05_either_spelling_takes_the_fixture_pair) {
  ExpectDirection("xxa-xxb", "xxa", "xxb");
}

TEST(golden_loader, L06_to_L16_parse_direction_refuses_a_malformed_direction) {
  for (const char* bad :
       {"", "xxa", "xxa->", "->xxb", "xxa->xxb->xxa", "xxa-xxb-xxa", "XXA->XXB", "xxb<-xxa",
        "eng_afr", "xxa -> xxb", "en-af"}) {
    EXPECT_FALSE(parse_direction(bad).has_value()) << "'" << bad << "'";
  }
}

TEST(golden_loader, L17_a_row_with_a_bad_direction_fails_and_is_not_skipped) {
  Row row = matching_row();
  row.id = "mem_bad";
  row.direction = "xxa to xxb";
  const Outcome o = run_captured(row);
  ASSERT_EQ(o.failures(), 1);
  const std::string message(o.parts.front().message());
  EXPECT_NE(message.find("mem_bad"), std::string::npos);
  EXPECT_NE(message.find("xxa to xxb"), std::string::npos);
  EXPECT_FALSE(o.parts.front().skipped());
}

TEST(golden_loader, L60_the_fixture_store_wins_when_it_holds_a_meta_yaml) {
  const auto root = store_root_for("xxa");
  ASSERT_TRUE(root.has_value());
  EXPECT_EQ(std::filesystem::path(*root),
            std::filesystem::path(VERSTAAN_REPO_ROOT) / "tests/fixtures/languages/xxa");
}

TEST(golden_loader, L61_a_fixture_folder_with_tests_only_loses_to_the_real_store) {
  const auto root = store_root_for("eng");
  ASSERT_TRUE(root.has_value());
  EXPECT_EQ(std::filesystem::path(*root), std::filesystem::path(VERSTAAN_REPO_ROOT) / "data/languages/eng");
}

TEST(golden_loader, L62_a_code_with_no_store_has_no_root) {
  EXPECT_FALSE(store_root_for("zzz").has_value());
}

TEST(golden_loader, L63_a_row_with_no_store_fails_and_is_not_skipped) {
  Row row = matching_row();
  row.id = "mem_nostore";
  row.direction = "zzz->xxb";
  const Outcome o = run_captured(row);
  ASSERT_EQ(o.failures(), 1);
  const std::string message(o.parts.front().message());
  EXPECT_NE(message.find("mem_nostore"), std::string::npos);
  EXPECT_NE(message.find("zzz"), std::string::npos);
  EXPECT_FALSE(o.parts.front().skipped());
}

Row InDirection(const char* id, const char* direction) {
  Row row;
  row.id = id;
  row.direction = direction;
  return row;
}

TEST(golden_loader, L64_a_fixture_row_keeps_the_prefix_issue_202_gave_it) {
  EXPECT_EQ(golden_case_id(InDirection("A01", "xxa->xxb")), "xxa__xxb_a01");
}
TEST(golden_loader, L65_the_reverse_direction_prefixes_its_own_spelling) {
  EXPECT_EQ(golden_case_id(InDirection("A02", "xxb->xxa")), "xxb__xxa_a02");
}
TEST(golden_loader, L66_the_eng_spelling_stays_bare) {
  EXPECT_EQ(golden_case_id(InDirection("A01", "eng-afr")), "A01");
}
TEST(golden_loader, L67_the_id_is_lower_cased_after_the_prefix) {
  const std::string id = golden_case_id(InDirection("A09", "xxa->xxb"));
  EXPECT_EQ(id, "xxa__xxb_a09");
  EXPECT_EQ(id.find("A09"), std::string::npos);
}

TEST(golden_loader, L68_the_same_id_in_two_directions_collides_nowhere) {
  EXPECT_TRUE(duplicate_ids({InDirection("A01", "eng-afr"), InDirection("A01", "xxa->xxb")}).empty());
}
TEST(golden_loader, L69_the_same_fixture_id_twice_is_reported) {
  const auto dup = duplicate_ids({InDirection("A01", "xxa->xxb"), InDirection("A01", "xxa->xxb")});
  EXPECT_EQ(dup, std::vector<std::string>{"xxa__xxb_a01"});
}
TEST(golden_loader, L70_the_same_eng_id_twice_is_reported) {
  const auto dup = duplicate_ids({InDirection("A01", "eng-afr"), InDirection("A01", "eng-afr")});
  EXPECT_EQ(dup, std::vector<std::string>{"A01"});
}

TEST(golden_loader, L71_every_real_row_has_a_unique_case_id) {
  EXPECT_TRUE(duplicate_ids(load_golden_rows()).empty());
}

TEST(golden_loader, L72_the_loader_holds_the_fixture_rows_by_direction) {
  std::map<std::string, int> counts;
  for (const Row& row : load_golden_rows()) ++counts[row.direction];
  EXPECT_EQ(counts["xxa->xxb"], 9);
  EXPECT_EQ(counts["xxb->xxa"], 8);
}

}  // namespace
}  // namespace verstaan::golden
