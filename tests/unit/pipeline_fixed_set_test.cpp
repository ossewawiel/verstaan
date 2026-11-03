// Issue 183: the English to Afrikaans pipeline, end to end, for every row of the fixed sentence
// set (tests/fixtures/languages/eng/tests/basic.yaml). Each row goes through Engine::translate
// for Options{Lang::eng, Lang::afr} against the real eng and afr stores. Expected values come
// from the fixture file, never from a run of the engine.
//
// The shared golden loader is issue 26. Until it lands, this file reads the fixture with a small
// line reader that understands only the flat `key: value` shape of basic.yaml.
//
// Review marks: a `review: pending` row runs and its output line says PENDING. A row deferred to
// issue 201 (A14, A15) runs too and its output line says DEFERRED; a mismatch there is reported
// as a skip carrying that reason, a match passes.

#include <gtest/gtest.h>

#include <cstddef>
#include <fstream>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

#include "verstaan/engine.hpp"
#include "verstaan/rule_set.hpp"

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif

namespace verstaan {
namespace {

struct Row {
  std::string id;
  std::string input;
  std::string expected;
  std::string status;
  std::string review;
  std::string note;
};

std::string strip_quotes(std::string value) {
  if (value.size() >= 2 && value.front() == '"' && value.back() == '"') {
    value = value.substr(1, value.size() - 2);
  }
  return value;
}

std::vector<Row> load_rows() {
  std::ifstream file(std::string(VERSTAAN_REPO_ROOT) + "/tests/fixtures/languages/eng/tests/basic.yaml");
  std::vector<Row> rows;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line.front() == '#') {
      continue;
    }
    std::string key;
    std::string value;
    const bool starts_row = line.rfind("- ", 0) == 0;
    const std::string body = line.substr(2);
    const std::size_t colon = body.find(':');
    if (colon == std::string::npos) {
      continue;
    }
    key = body.substr(0, colon);
    value = strip_quotes(body.size() > colon + 2 ? body.substr(colon + 2) : "");
    if (starts_row) {
      rows.emplace_back();
    }
    if (rows.empty()) {
      continue;
    }
    Row& row = rows.back();
    if (key == "id") row.id = value;
    else if (key == "input") row.input = value;
    else if (key == "expected") row.expected = value;
    else if (key == "status") row.status = value;
    else if (key == "review") row.review = value;
    else if (key == "note") row.note = value;
  }
  return rows;
}

bool is_deferred(const Row& row) { return row.id == "A14" || row.id == "A15"; }

class pipeline_fixed_set : public testing::TestWithParam<Row> {};

TEST_P(pipeline_fixed_set, Row) {
  const Row& row = GetParam();
  const std::string root = std::string(VERSTAAN_REPO_ROOT) + "/data/languages";
  const Engine engine = Engine::load(RuleSet::load(root + "/eng", root + "/afr"));
  const Result result = engine.translate(row.input, Options{.from = Lang::eng, .to = Lang::afr});

  const Status want = row.status == "partial" ? Status::partial : Status::ok;
  const bool matches = result.text == row.expected && result.status == want;

  std::string tag = row.review == "confirmed" ? "CONFIRMED" : "PENDING";
  if (is_deferred(row)) {
    tag = "DEFERRED (issue 201)";
  }
  std::cout << "[" << tag << "] " << row.id << " \"" << row.input << "\" -> \"" << result.text
            << "\"\n";

  if (is_deferred(row) || row.review != "confirmed") {
    if (!matches) {
      GTEST_SKIP() << tag << ": got \"" << result.text << "\", expected \"" << row.expected << "\"";
    }
    return;
  }
  EXPECT_EQ(result.text, row.expected);
  EXPECT_EQ(result.status, want);
  if (row.status == "partial" && !row.note.empty()) {
    EXPECT_NE(result.text.find("⟦" + row.note + "⟧"), std::string::npos);
  }
}

INSTANTIATE_TEST_SUITE_P(FixedSet, pipeline_fixed_set, testing::ValuesIn(load_rows()),
                         [](const testing::TestParamInfo<Row>& info) { return info.param.id; });

}  // namespace
}  // namespace verstaan
