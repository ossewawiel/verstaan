// The golden loader (issue 26): one CTest case per row id, from every
// tests/fixtures/languages/*/tests/*.yaml and tests/golden/<tier>/*.txt. The table is the test.
// `ctest -R A09` runs one row. Rules in row_loader.hpp.

#include "row_loader.hpp"

namespace verstaan::golden {
namespace {

class golden_row : public testing::TestWithParam<Row> {};

TEST_P(golden_row, Row) { run_row(GetParam()); }

INSTANTIATE_TEST_SUITE_P(Table, golden_row, testing::ValuesIn(load_golden_rows()),
                         [](const testing::TestParamInfo<Row>& info) { return golden_case_id(info.param); });

}  // namespace
}  // namespace verstaan::golden
