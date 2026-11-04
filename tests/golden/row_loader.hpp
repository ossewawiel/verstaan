// Shared row loader and runner for the `golden` and `held-out` CTest labels (issue 26).
//
// A row is one test. Expected text and status come from the file only, never from a run of the
// engine (docs/standards/testing.md). Two file shapes:
//   - YAML, the fixture-pair shape: a list of flat `key: value` rows with `id`, `input`,
//     `expected`, `direction`, `status`, `review`, `note`.
//   - Golden text: `input ⇒ expected` one per line, `# source:` line above. The id is
//     `<file stem>_L<line>`. An optional `# direction: eng-afr` comment sets the direction
//     (default eng-afr). Status is `partial` when expected holds a ⟦ mark, else `ok`.
// Only directions the engine's Lang enum can express run (eng-afr). Rows of other directions,
// such as the invented xxa/xxb pair, are registered as skipped cases (issue 202; issue 28 runs
// these rows).

#pragma once

#include <gtest/gtest.h>

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "verstaan/engine.hpp"
#include "verstaan/rule_set.hpp"

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

namespace verstaan::golden {

struct Row {
  std::string id;
  std::string input;
  std::string expected;
  std::string status = "ok";
  std::string review = "confirmed";
  std::string direction = "eng-afr";
  std::string note;
  std::string deferred;
  std::string file;
};

// Issue 28 (ADR 0029). Test-writer stubs: the implementer replaces each body. The rows that name
// them are L01 to L17 and L60 to L72 of docs/factory/issues/28-test-cases.md.
struct Direction {
  Lang from;
  Lang to;
};

// "xxa->xxb", "xxa-xxb": two iso3 codes joined by "->" or "-". No value for anything else.
// Stub: no value for every input.
inline std::optional<Direction> parse_direction(std::string_view /*direction*/) {
  return std::nullopt;
}

// `<repo>/tests/fixtures/languages/<iso3>` when it holds a `meta.yaml`, else
// `<repo>/data/languages/<iso3>` when it does, else no value. Stub: no value for every code.
inline std::optional<std::filesystem::path> store_root_for(std::string_view /*iso3*/) {
  return std::nullopt;
}

// The CTest case name of a row: the bare id for `eng-afr`, else the direction with each
// non-alphanumeric byte as `_`, `_`, then the id in lower case. Stub: the bare id.
inline std::string golden_case_id(const Row& row) { return row.id; }

// Case ids held more than once, each listed once. Stub: none.
inline std::vector<std::string> duplicate_ids(const std::vector<Row>& /*rows*/) { return {}; }

inline void PrintTo(const Row& row, std::ostream* os) { *os << row.id; }

inline std::string strip_quotes(std::string value) {
  if (value.size() >= 2 && value.front() == '"' && value.back() == '"') {
    value = value.substr(1, value.size() - 2);
  }
  return value;
}

inline std::string trim(const std::string& s) {
  const auto b = s.find_first_not_of(" \t\r");
  if (b == std::string::npos) return "";
  const auto e = s.find_last_not_of(" \t\r");
  return s.substr(b, e - b + 1);
}

inline void load_yaml(const std::filesystem::path& path, std::vector<Row>& rows) {
  std::ifstream file(path);
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line.front() == '#') continue;
    const bool starts_row = line.rfind("- ", 0) == 0;
    const std::string body = trim(starts_row ? line.substr(2) : line);
    const std::size_t colon = body.find(':');
    if (colon == std::string::npos) continue;
    const std::string key = body.substr(0, colon);
    const std::string value = strip_quotes(trim(body.substr(colon + 1)));
    if (starts_row) {
      rows.emplace_back();
      rows.back().file = path.filename().string();
    }
    if (rows.empty()) continue;
    Row& row = rows.back();
    if (key == "id") row.id = value;
    else if (key == "input") row.input = value;
    else if (key == "expected") row.expected = value;
    else if (key == "status") row.status = value;
    else if (key == "review") row.review = value;
    else if (key == "direction") row.direction = value;
    else if (key == "note") row.note = value;
    else if (key == "deferred") row.deferred = value;
  }
}

inline void load_text(const std::filesystem::path& path, std::vector<Row>& rows) {
  static const std::string arrow = "\xE2\x87\x92";  // ⇒
  std::ifstream file(path);
  std::string line;
  std::string direction = "eng-afr";
  std::size_t n = 0;
  while (std::getline(file, line)) {
    ++n;
    line = trim(line);
    if (line.empty()) continue;
    if (line.front() == '#') {
      const std::string tag = "# direction:";
      if (line.rfind(tag, 0) == 0) direction = trim(line.substr(tag.size()));
      continue;
    }
    const std::size_t at = line.find(arrow);
    if (at == std::string::npos) continue;
    Row row;
    row.id = path.stem().string() + "_L" + std::to_string(n);
    row.input = trim(line.substr(0, at));
    row.expected = trim(line.substr(at + arrow.size()));
    row.status = row.expected.find("\xE2\x9F\xA6") != std::string::npos ? "partial" : "ok";
    row.direction = direction;
    row.file = path.filename().string();
    rows.push_back(row);
  }
}

inline std::vector<std::filesystem::path> files_with(const std::filesystem::path& dir,
                                                     const std::string& ext) {
  std::vector<std::filesystem::path> out;
  if (!std::filesystem::exists(dir)) return out;
  for (const auto& e : std::filesystem::recursive_directory_iterator(dir)) {
    if (e.is_regular_file() && e.path().extension() == ext) out.push_back(e.path());
  }
  std::sort(out.begin(), out.end());
  return out;
}

inline bool runs_in_engine(const Row& r) { return r.direction == "eng-afr" && !r.id.empty(); }

// Keep only the rows the engine can run.
inline std::vector<Row> runnable(std::vector<Row> rows) {
  std::vector<Row> out;
  for (auto& r : rows) {
    if (runs_in_engine(r)) out.push_back(std::move(r));
  }
  return out;
}

// The rows the engine has no Lang for. Each id is prefixed with its language pair, lower-cased
// after the prefix, so it collides with no eng id and `ctest -R A09` still selects one row.
inline std::vector<Row> skipped(std::vector<Row> rows) {
  std::vector<Row> out;
  for (auto& r : rows) {
    if (runs_in_engine(r) || r.id.empty()) continue;
    std::string pair = r.direction;
    for (char& c : pair) {
      if (!std::isalnum(static_cast<unsigned char>(c))) c = '_';
    }
    std::string id = r.id;
    for (char& c : id) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    r.id = pair + "_" + id;
    out.push_back(std::move(r));
  }
  return out;
}

inline std::vector<Row> read_golden_rows() {
  namespace fs = std::filesystem;
  const fs::path root = VERSTAAN_REPO_ROOT;
  std::vector<Row> rows;
  for (const auto& p : files_with(root / "tests/fixtures/languages", ".yaml")) {
    if (p.parent_path().filename() == "tests") load_yaml(p, rows);
  }
  for (const auto& p : files_with(root / "tests/golden", ".txt")) load_text(p, rows);
  return rows;
}

inline std::vector<Row> load_golden_rows() { return runnable(read_golden_rows()); }

inline std::vector<Row> load_skipped_rows() { return skipped(read_golden_rows()); }

inline std::vector<Row> load_held_out_rows() {
  std::vector<Row> rows;
  for (const auto& p : files_with(std::filesystem::path(VERSTAAN_REPO_ROOT) / "tests/held-out",
                                  ".yaml")) {
    load_yaml(p, rows);
  }
  return runnable(std::move(rows));
}

inline const char* status_name(Status s) {
  switch (s) {
    case Status::ok: return "ok";
    case Status::partial: return "partial";
    case Status::no_parse: return "no_parse";
    case Status::not_implemented: return "not_implemented";
  }
  return "?";
}

inline std::string trace_text(const Trace& trace) {
  std::ostringstream out;
  for (const auto& e : trace.entries) {
    out << "    " << e.rule
        << (e.event == TraceEvent::capped ? " (capped)"
            : e.event == TraceEvent::unsupported ? " (unsupported)" : "")
        << "\n";
  }
  return trace.entries.empty() ? "    (empty)\n" : out.str();
}

inline void run_row(const Row& row) {
  const std::string root = std::string(VERSTAAN_REPO_ROOT) + "/data/languages";
  const Engine engine = Engine::load(RuleSet::load(root + "/eng", root + "/afr"));
  const Result result = engine.translate(row.input, Options{.from = Lang::eng, .to = Lang::afr});

  const bool pending = row.review == "pending";
  const bool deferred = !row.deferred.empty();
  std::cout << "[" << (deferred ? "DEFERRED (issue " + row.deferred + ")"
                              : pending ? "PENDING" : "CONFIRMED") << "] " << row.id << " \"" << row.input
            << "\" -> \"" << result.text << "\"\n";

  const bool matches = result.text == row.expected && status_name(result.status) == row.status;
  if (matches) {
    if (deferred) {
      ADD_FAILURE() << "row " << row.id << " (" << row.file << ") is marked deferred: "
                    << row.deferred << " but now matches. Remove the `deferred` key.";
    }
    return;
  }

  std::ostringstream msg;
  msg << "row " << row.id << " (" << row.file << ")\n"
      << "  input:    " << row.input << "\n"
      << "  expected: " << row.expected << "\n"
      << "  actual:   " << result.text << "\n"
      << "  status:   expected " << row.status << ", actual " << status_name(result.status) << "\n"
      << "  trace:\n" << trace_text(result.trace);
  if (deferred) {
    std::cout << "DEFERRED (issue " << row.deferred << ") mismatch, not a failure\n" << msg.str();
    return;
  }
  if (pending) {
    GTEST_SKIP() << "PENDING review, mismatch\n" << msg.str();
  }
  ADD_FAILURE() << msg.str();
}

}  // namespace verstaan::golden
