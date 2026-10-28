// SPDX-License-Identifier: MPL-2.0
#include "trace_line.hpp"

#include <string>

namespace verstaan::cli {

std::string trace_line(const TraceEntry& entry) {
  switch (entry.event) {
    case TraceEvent::fired:
      return entry.rule;
    case TraceEvent::capped:
      return entry.rule + " capped";
    case TraceEvent::unsupported:
      return entry.rule + " unsupported";
  }
  return entry.rule;
}

}  // namespace verstaan::cli
