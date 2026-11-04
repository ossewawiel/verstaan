// Proves the golden loader's stale-key, deferred and pending paths (issue 202).
// Rows are built in memory; no fixture file is read. run_row raises its failures through
// GoogleTest, so each call runs under a ScopedFakeTestPartResultReporter that records the results
// instead of failing this test.

#include <gtest/gtest-spi.h>
#include <gtest/gtest.h>

#include <string>
#include <vector>

#include "row_loader.hpp"

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

}  // namespace
}  // namespace verstaan::golden
