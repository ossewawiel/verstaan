// CLI trace line tests, issue 180 (docs/factory/issues/180-test-cases.md, rows G40 to G43).
// One TEST per row. Expected strings come from that table.

#include <gtest/gtest.h>

#include "trace_line.hpp"
#include "verstaan/engine.hpp"

namespace verstaan {
namespace {

TEST(cli_trace_line, G40_a_fired_entry_prints_the_rule_id_alone) {
  EXPECT_EQ(cli::trace_line(TraceEntry{"172", TraceEvent::fired}), "172");
}

TEST(cli_trace_line, G41_a_capped_entry_prints_the_event_name) {
  EXPECT_EQ(cli::trace_line(TraceEntry{"1", TraceEvent::capped}), "1 capped");
}

TEST(cli_trace_line, G42_an_unsupported_entry_prints_the_event_name) {
  EXPECT_EQ(cli::trace_line(TraceEntry{"26", TraceEvent::unsupported}), "26 unsupported");
}

TEST(cli_trace_line, G43_an_entry_with_the_default_event_prints_the_rule_id_alone) {
  EXPECT_EQ(cli::trace_line(TraceEntry{"loop"}), "loop");
}

}  // namespace
}  // namespace verstaan
