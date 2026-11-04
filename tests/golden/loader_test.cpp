// The golden loader (issue 26): one CTest case per row id, from every
// tests/fixtures/languages/*/tests/*.yaml and tests/golden/<tier>/*.txt. The table is the test.
// `ctest -R A09` runs one row. Rules in row_loader.hpp.

#include "row_loader.hpp"

namespace verstaan::golden {
namespace {

class golden_row : public testing::TestWithParam<Row> {};

TEST_P(golden_row, Row) { run_row(GetParam()); }

INSTANTIATE_TEST_SUITE_P(Table, golden_row, testing::ValuesIn(load_golden_rows()),
                         [](const testing::TestParamInfo<Row>& info) { return info.param.id; });

// Rows in a direction the engine has no Lang for: counted as skipped, not dropped (issue 202).
class skipped_row : public testing::TestWithParam<Row> {};

TEST_P(skipped_row, Row) {
  GTEST_SKIP() << "no Lang for direction " << GetParam().direction
               << "; issue 28 runs these rows";
}

INSTANTIATE_TEST_SUITE_P(Table, skipped_row, testing::ValuesIn(load_skipped_rows()),
                         [](const testing::TestParamInfo<Row>& info) { return info.param.id; });

}  // namespace
}  // namespace verstaan::golden
