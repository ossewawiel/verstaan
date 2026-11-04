// Held-out rows (issue 26): the same row shape as the golden table, run under the `held-out`
// label. Rules in ../golden/row_loader.hpp.

#include "../golden/row_loader.hpp"

namespace verstaan::golden {
namespace {

class held_out_row : public testing::TestWithParam<Row> {};

TEST_P(held_out_row, Row) { run_row(GetParam()); }

INSTANTIATE_TEST_SUITE_P(HeldOut, held_out_row, testing::ValuesIn(load_held_out_rows()),
                         [](const testing::TestParamInfo<Row>& info) { return info.param.id; });

}  // namespace
}  // namespace verstaan::golden
