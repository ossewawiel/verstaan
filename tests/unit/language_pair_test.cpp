// The engine takes its languages from data (issue 28, ADR 0029). Rows L33 to L52, L54 to L59 and
// L75 to L78, and the trace of rows A01 to A17, from docs/factory/issues/28-test-cases.md. The
// table is the source of truth; for A01 to A17 the words come from 04-test-cases.md.
//
// A row's text alone does not prove the store rewrite: under the committed store no rule fires on
// A09, A10, A12 and A13, and they still reach their text. So each row also asserts the exact set
// of rule ids in its trace, from the table's `rule ids` column.

#include <gtest/gtest.h>

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <optional>
#include <random>
#include <set>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "verstaan/dictionary.hpp"
#include "verstaan/engine.hpp"
#include "verstaan/lang.hpp"
#include "verstaan/rule_interpreter.hpp"
#include "verstaan/rule_set.hpp"

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by tests/CMakeLists.txt"
#endif
#ifndef VERSTAAN_CLI_PATH
#error "VERSTAAN_CLI_PATH must be defined by tests/CMakeLists.txt"
#endif

namespace verstaan {
namespace {

namespace fs = std::filesystem;

fs::path Fixture(std::string_view iso3) {
  return fs::path(VERSTAAN_REPO_ROOT) / "tests/fixtures/languages" / iso3;
}
fs::path Real(std::string_view iso3) {
  return fs::path(VERSTAAN_REPO_ROOT) / "data/languages" / iso3;
}

Lang Code(std::string_view iso3) {
  const auto lang = lang_from_iso3(iso3);
  EXPECT_TRUE(lang.has_value()) << iso3;
  return lang.value_or(Lang{});
}

// A scratch folder, removed at the end of the test.
class TempDir {
 public:
  TempDir() {
    static std::atomic<int> counter{0};
    // Unique across processes without a process id: a random 64-bit value plus a clock tick, and
    // a counter for two folders made in one tick. create_directory fails on a clash, so a
    // collision retries instead of sharing a folder.
    std::random_device entropy;
    do {
      const auto tick = std::chrono::steady_clock::now().time_since_epoch().count();
      path_ =
          fs::temp_directory_path() / ("verstaan_pair_" + std::to_string(tick) + "_" +
                                       std::to_string(entropy()) + "_" + std::to_string(counter++));
    } while (!fs::create_directory(path_));
  }
  TempDir(const TempDir&) = delete;
  TempDir& operator=(const TempDir&) = delete;
  ~TempDir() {
    std::error_code ec;
    fs::remove_all(path_, ec);
  }
  [[nodiscard]] const fs::path& path() const { return path_; }

 private:
  fs::path path_;
};

const Engine& XxaToXxb() {
  static const Engine engine =
      Engine::load(RuleSet::load(Fixture("xxa").string(), Fixture("xxb").string()));
  return engine;
}
const Engine& XxbToXxa() {
  static const Engine engine =
      Engine::load(RuleSet::load(Fixture("xxb").string(), Fixture("xxa").string()));
  return engine;
}
const Engine& EngToAfr() {
  static const Engine engine =
      Engine::load(RuleSet::load(Real("eng").string(), Real("afr").string()));
  return engine;
}

Options Pair(std::string_view from, std::string_view to, Register reg = Register::neutral,
             Context ctx = Context::none) {
  return Options{.from = Code(from), .to = Code(to), .reg = reg, .ctx = ctx};
}

void ExpectNotImplemented(const Result& result) {
  EXPECT_EQ(result.text, "");
  EXPECT_EQ(result.status, Status::not_implemented);
}

// --- Part 3: the engine takes its pair from the store ---

TEST(language_pair, L33_a_fixture_ruleset_names_xxa_and_xxb) {
  const RuleSet rules = RuleSet::load(Fixture("xxa").string(), Fixture("xxb").string());
  ASSERT_TRUE(rules.from_lang().has_value());
  ASSERT_TRUE(rules.to_lang().has_value());
  EXPECT_EQ(*rules.from_lang(), Code("xxa"));
  EXPECT_EQ(*rules.to_lang(), Code("xxb"));
}

TEST(language_pair, L34_the_real_ruleset_names_eng_and_afr) {
  const RuleSet rules = RuleSet::load(Real("eng").string(), Real("afr").string());
  ASSERT_TRUE(rules.from_lang().has_value());
  ASSERT_TRUE(rules.to_lang().has_value());
  EXPECT_EQ(*rules.from_lang(), Lang::eng);
  EXPECT_EQ(*rules.to_lang(), Lang::afr);
}

TEST(language_pair, L35_the_pair_comes_from_meta_yaml_not_from_the_folder_name) {
  const TempDir tmp;
  fs::copy(Fixture("xxa"), tmp.path() / "renamed", fs::copy_options::recursive);
  const RuleSet rules = RuleSet::load((tmp.path() / "renamed").string(), Fixture("xxb").string());
  ASSERT_TRUE(rules.from_lang().has_value());
  EXPECT_EQ(*rules.from_lang(), Code("xxa"));
}

TEST(language_pair, L36_a_root_with_no_meta_yaml_names_no_language) {
  const TempDir tmp;
  const RuleSet rules = RuleSet::load(tmp.path().string(), tmp.path().string());
  EXPECT_FALSE(rules.from_lang().has_value());
  EXPECT_FALSE(rules.to_lang().has_value());
}

TEST(language_pair, L37_from_rules_names_no_language) {
  const RuleSet rules = RuleSet::from_rules({}, {}, {}, {}, {}, {});
  EXPECT_FALSE(rules.from_lang().has_value());
  EXPECT_FALSE(rules.to_lang().has_value());
}

TEST(language_pair, L38_the_pair_the_engine_did_not_load_is_not_implemented) {
  ExpectNotImplemented(
      XxaToXxb().translate("kano zuma sona", Options{.from = Lang::eng, .to = Lang::afr}));
}

TEST(language_pair, L39_the_reverse_pair_needs_its_own_ruleset) {
  ExpectNotImplemented(XxaToXxb().translate("hundo kinda vidra", Pair("xxb", "xxa")));
}

TEST(language_pair, L40_eng_afr_engine_refuses_xxa_xxb) {
  ExpectNotImplemented(EngToAfr().translate("book", Pair("xxa", "xxb")));
}

TEST(language_pair, L41_eng_afr_engine_refuses_afr_eng) {
  ExpectNotImplemented(EngToAfr().translate("book", Options{.from = Lang::afr, .to = Lang::eng}));
}

TEST(language_pair, L42_register_stays_m5s_on_a_fixture_pair) {
  ExpectNotImplemented(
      XxaToXxb().translate("kano zuma sona", Pair("xxa", "xxb", Register::formal)));
}

TEST(language_pair, L43_context_stays_m5s_on_a_fixture_pair) {
  ExpectNotImplemented(XxaToXxb().translate(
      "kano zuma sona", Pair("xxa", "xxb", Register::neutral, Context::medical)));
}

TEST(language_pair, L44_a_code_no_store_holds_is_not_implemented) {
  ExpectNotImplemented(EngToAfr().translate("book", Pair("zzz", "afr")));
}

TEST(language_pair, L45_a_store_less_engine_is_not_implemented) {
  const TempDir tmp;
  const Engine engine = Engine::load(RuleSet::load(tmp.path().string(), tmp.path().string()));
  ExpectNotImplemented(engine.translate("kano", Pair("xxa", "xxb")));
}

TEST(language_pair, L46_eng_to_afr_still_works) {
  const Result result = EngToAfr().translate("book", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.text, "boek");
  EXPECT_EQ(result.status, Status::ok);
}

std::vector<std::string> RuleIds(const Result& result) {
  std::vector<std::string> ids;
  for (const auto& entry : result.trace.entries) ids.push_back(entry.rule);
  return ids;
}

bool StartsWith(const std::string& s, std::string_view prefix) { return s.rfind(prefix, 0) == 0; }

void ExpectGenerationPrefix(const Result& result, std::string_view prefix) {
  bool any = false;
  for (const auto& id : RuleIds(result)) {
    if (id.find("-gen-") == std::string::npos) continue;
    any = true;
    EXPECT_TRUE(StartsWith(id, prefix)) << id;
    EXPECT_FALSE(StartsWith(id, "afr-")) << id;
    EXPECT_FALSE(StartsWith(id, "-gen-")) << id;
  }
  EXPECT_TRUE(any);
}

TEST(language_pair, L47_generation_ids_take_xxb_from_the_target) {
  ExpectGenerationPrefix(XxaToXxb().translate("kano zuma sona", Pair("xxa", "xxb")), "xxb-gen-");
}

TEST(language_pair, L48_inflection_ids_take_xxb_from_the_target) {
  const Result result = XxaToXxb().translate("ta kano zuma sona", Pair("xxa", "xxb"));
  const std::vector<std::string> ids = RuleIds(result);
  EXPECT_NE(std::ranges::find(ids, "xxb-inf-M1"), ids.end());
}

TEST(language_pair, L49_generation_ids_take_xxa_from_the_target) {
  ExpectGenerationPrefix(XxbToXxa().translate("hundo kinda vidra", Pair("xxb", "xxa")), "xxa-gen-");
}

TEST(language_pair, L50_a_disambiguation_id_takes_its_prefix_from_the_target) {
  GrammarRule rule;
  rule.id = "9";
  rule.kind = "disambiguation";
  rule.lhs = "(D,^AFT)(BLK)({V|P|AAV})";
  rule.rhs = "0";
  const RuleSet isolated = RuleSet::from_rules({}, {}, {}, {}, {}, {}, {rule});
  const RuleInterpreter interpreter(isolated);
  const auto cand = [](std::string surface, std::vector<Feature> features) {
    return Candidate{std::move(surface), std::move(features), {}};
  };
  std::vector<Position> positions(3);
  positions[0].candidates = {cand("ta", {{"LEX", "D"}, {"POS", "ART"}})};
  positions[1].candidates = {cand(" ", {{"BLK", ""}})};
  positions[2].candidates = {cand("mooi", {{"LEX", "A"}, {"POS", "AAV"}}),
                             cand("mooi", {{"LEX", "J"}, {"POS", "ADJ"}})};
  Trace trace;
  interpreter.disambiguate_target(positions, Code("xxb"), trace);
  ASSERT_EQ(trace.entries.size(), 1u);
  EXPECT_EQ(trace.entries[0].rule, "xxb-dis-9");
}

TEST(language_pair, L51_a_dictionary_entry_carries_the_language_it_was_loaded_for) {
  const Lang xxa = Code("xxa");
  const Dictionary dictionary = Dictionary::load(Fixture("xxa").string(), xxa);
  const auto entries = dictionary.lookup("kano");
  ASSERT_EQ(entries.size(), 1u);
  EXPECT_EQ(entries[0].lang, xxa);
}

TEST(language_pair, L52_an_unset_entry_claims_no_language) {
  EXPECT_EQ(DictionaryEntry{}.lang, Lang{});
  EXPECT_NE(DictionaryEntry{}.lang, Lang::eng);
}

// --- Part 4: the CLI ---

struct CliRun {
  int exit_code = -1;
  std::string out;
  std::string err;
};

std::string Slurp(const fs::path& path) {
  std::ifstream in(path);
  std::ostringstream buffer;
  buffer << in.rdbuf();
  return buffer.str();
}

CliRun RunCli(const std::string& args) {
  const TempDir tmp;
  const fs::path out = tmp.path() / "out.txt";
  const fs::path err = tmp.path() / "err.txt";
  std::string command = std::string("\"") + VERSTAAN_CLI_PATH + "\" " + args + " >\"" +
                        out.string() + "\" 2>\"" + err.string() + "\"";
#ifdef _WIN32
  // cmd.exe strips the outer quotes of a command that starts with one, and std::system returns
  // the exit code itself.
  command = "\"" + command + "\"";
  const int raw = std::system(command.c_str());
  const int code = raw;
#else
  // std::system returns the wait status: the exit code sits in bits 8 to 15 when the child exited
  // normally (low 7 bits zero). A signal leaves a non-zero low byte, which reads as -1.
  const int raw = std::system(command.c_str());
  constexpr int kStatusShift = 8;
  constexpr int kSignalMask = 0x7F;
  constexpr int kCodeMask = 0xFF;
  const int code = (raw & kSignalMask) == 0 ? (raw >> kStatusShift) & kCodeMask : -1;
#endif
  CliRun run;
  run.exit_code = code;
  run.out = Slurp(out);
  run.err = Slurp(err);
  return run;
}

TEST(language_pair, L54_cli_translates_eng_to_afr) {
  const CliRun run = RunCli("--from eng --to afr \"book\"");
  EXPECT_EQ(run.exit_code, 0);
  EXPECT_EQ(run.out, "boek\n");
}

void ExpectBadFlag(const std::string& args, const std::string& flag) {
  const CliRun run = RunCli(args);
  EXPECT_EQ(run.exit_code, 1) << args;
  EXPECT_EQ(run.out, "") << args;
  EXPECT_NE(run.err.find("verstaan: bad " + flag), std::string::npos)
      << args << " stderr: " << run.err;
}

TEST(language_pair, L55_cli_refuses_a_from_code_with_no_store) {
  ExpectBadFlag("--from zzz --to afr \"book\"", "--from");
}
TEST(language_pair, L56_cli_refuses_a_to_code_with_no_store) {
  ExpectBadFlag("--from eng --to zzz \"book\"", "--to");
}
TEST(language_pair, L57_cli_refuses_an_upper_case_code) {
  ExpectBadFlag("--from ENG --to afr \"book\"", "--from");
}
TEST(language_pair, L58_cli_never_reaches_the_fixture_pair) {
  ExpectBadFlag("--from xxa --to xxb \"kano zuma sona\"", "--from");
}
TEST(language_pair, L59_cli_names_nld_as_a_bad_flag_until_a_store_exists) {
  ExpectBadFlag("--from nld --to afr \"book\"", "--from");
}

void ExpectOnlyEngToAfr(const std::string& from, const std::string& to) {
  const CliRun run = RunCli("--from " + from + " --to " + to + " \"book\"");
  EXPECT_EQ(run.exit_code, 1);
  EXPECT_EQ(run.out, "");
  EXPECT_NE(run.err.find("verstaan: only eng to afr is supported, not " + from + " to " + to),
            std::string::npos)
      << run.err;
}

TEST(language_pair, L79_cli_refuses_afr_to_eng) { ExpectOnlyEngToAfr("afr", "eng"); }
TEST(language_pair, L80_cli_refuses_eng_to_eng) { ExpectOnlyEngToAfr("eng", "eng"); }
TEST(language_pair, L81_cli_refuses_afr_to_afr) { ExpectOnlyEngToAfr("afr", "afr"); }

// --- Part 9: how meta.yaml is read (F09) ---

// A store folder that holds only a `meta.yaml` with this text.
std::optional<Lang> LangOfMeta(const std::string& meta_text) {
  const TempDir tmp;
  {
    std::ofstream out(tmp.path() / "meta.yaml", std::ios::binary);
    out << meta_text;
  }
  return RuleSet::load(tmp.path().string(), tmp.path().string()).from_lang();
}

void ExpectMetaIs(const std::string& meta_text, std::string_view iso3) {
  const auto lang = LangOfMeta(meta_text);
  ASSERT_TRUE(lang.has_value()) << meta_text;
  EXPECT_EQ(*lang, Code(iso3)) << meta_text;
}

TEST(language_pair, L82_a_trailing_comment_is_not_part_of_the_code) {
  ExpectMetaIs("iso1: null\niso3: xxa  # the code\nname: Xxa\n", "xxa");
}
TEST(language_pair, L83_single_quotes_are_not_part_of_the_code) {
  ExpectMetaIs("iso3: 'xxa'\n", "xxa");
}
TEST(language_pair, L84_a_leading_bom_is_skipped) {
  ExpectMetaIs("\xEF\xBB\xBFiso3: xxa\n", "xxa");
}
TEST(language_pair, L85_a_key_without_a_space_is_not_a_mapping) {
  EXPECT_FALSE(LangOfMeta("iso3:xxa\n").has_value());
}
TEST(language_pair, L86_an_indented_iso3_in_a_block_scalar_does_not_win) {
  ExpectMetaIs("notes: |\n  iso3: yyy\niso3: xxa\n", "xxa");
}
TEST(language_pair, L87_an_indented_iso3_alone_names_no_language) {
  EXPECT_FALSE(LangOfMeta("notes: |\n  iso3: yyy\n").has_value());
}
TEST(language_pair, L87b_double_quotes_and_crlf_are_not_part_of_the_code) {
  ExpectMetaIs("iso3: \"xxa\"\r\nname: Xxa\r\n", "xxa");
}

// --- Part 7: the trace and the words of A01 to A17 ---

struct PairRow {
  const char* id;
  const char* input;
  const char* from;
  const char* to;
  const char* expected;
  Status status;
  std::vector<std::string> rule_ids;  // The exact set that fires, from the table.
};

void PrintTo(const PairRow& row, std::ostream* os) { *os << row.id; }

const std::vector<PairRow>& PairRows() {
  static const std::vector<PairRow> rows = {
      {"A01",
       "kano zuma sona",
       "xxa",
       "xxb",
       "hundo kinda vidra",
       Status::ok,
       {"xxa-ana-01", "xxb-gen-01", "xxb-gen-08", "xxb-gen-09", "xxb-gen-11"}},
      {"A02",
       "hundo kinda vidra",
       "xxb",
       "xxa",
       "kano zuma sona",
       Status::ok,
       {"xxb-ana-01", "xxa-gen-01", "xxa-gen-07", "xxa-gen-08", "xxa-gen-09"}},
      {"A03",
       "ta kano zuma sona",
       "xxa",
       "xxb",
       "hundon kinda vidra",
       Status::ok,
       {"xxa-ana-01", "xxa-ana-02", "xxb-gen-01", "xxb-gen-02", "xxb-gen-08", "xxb-gen-09",
        "xxb-gen-11", "xxb-inf-M1"}},
      {"A04",
       "hundon kinda vidra",
       "xxb",
       "xxa",
       "ta kano zuma sona",
       Status::ok,
       {"xxb-ana-01", "xxb-ana-04", "xxa-gen-01", "xxa-gen-02", "xxa-gen-06", "xxa-gen-07",
        "xxa-gen-08", "xxa-gen-09", "xxa-gen-10"}},
      {"A05",
       "kanoki zuma sona",
       "xxa",
       "xxb",
       "mo hundo kinda vidra",
       Status::ok,
       {"xxa-ana-01", "xxa-ana-04", "xxb-gen-01", "xxb-gen-04", "xxb-gen-06", "xxb-gen-08",
        "xxb-gen-09", "xxb-gen-11", "xxb-gen-12"}},
      {"A06",
       "mo hundo kinda vidra",
       "xxb",
       "xxa",
       "kanoki zuma sona",
       Status::ok,
       {"xxb-ana-01", "xxb-ana-02", "xxa-gen-01", "xxa-gen-04", "xxa-gen-07", "xxa-gen-08",
        "xxa-gen-09", "xxa-inf-M1"}},
      {"A07",
       "sona rintadu nolu bero",
       "xxa",
       "xxb",
       "kinda libru pikko da lektu",
       Status::ok,
       {"xxa-ana-01", "xxa-ana-03", "xxa-ana-05", "xxb-gen-01", "xxb-gen-03", "xxb-gen-05",
        "xxb-gen-07", "xxb-gen-08", "xxb-gen-09", "xxb-gen-10", "xxb-gen-12"}},
      {"A08",
       "kinda libru pikko da lektu",
       "xxb",
       "xxa",
       "sona rintadu nolu bero",
       Status::ok,
       {"xxb-ana-01", "xxb-ana-02", "xxb-ana-03", "xxa-gen-01", "xxa-gen-03", "xxa-gen-05",
        "xxa-gen-07", "xxa-gen-08", "xxa-gen-09", "xxa-gen-10", "xxa-inf-M2"}},
      {"A09",
       "sona zuma glimu",
       "xxa",
       "xxb",
       "kinda vidra \xE2\x9F\xA6glimu\xE2\x9F\xA7",
       Status::partial,
       {"xxa-ana-01", "xxb-gen-01", "xxb-gen-09", "xxb-gen-12"}},
      {"A10",
       "kinda glimu vidra",
       "xxb",
       "xxa",
       "sona zuma \xE2\x9F\xA6glimu\xE2\x9F\xA7",
       Status::partial,
       {"xxb-ana-01", "xxa-gen-01", "xxa-gen-08", "xxa-gen-10"}},
      {"A11",
       "sona zuma veri",
       "xxa",
       "xxb",
       "kinda \xE2\x9F\xA6veri\xE2\x9F\xA7 vidra",
       Status::partial,
       {"xxa-ana-01", "xxb-gen-01", "xxb-gen-08", "xxb-gen-09", "xxb-gen-11"}},
      {"A12", "kano", "xxa", "xxb", "hundo", Status::ok, {"xxb-gen-09"}},
      {"A13", "hundo", "xxb", "xxa", "kano", Status::ok, {"xxa-gen-08"}},
      {"A14",
       "milaki zuma ta kano",
       "xxa",
       "xxb",
       "mo katsu hundon vidra",
       Status::ok,
       {"xxa-ana-01", "xxa-ana-02", "xxa-ana-04", "xxb-gen-01", "xxb-gen-02", "xxb-gen-04",
        "xxb-gen-06", "xxb-gen-08", "xxb-gen-09", "xxb-gen-11", "xxb-gen-12", "xxb-inf-M1"}},
      {"A15",
       "mo katsu hundon vidra",
       "xxb",
       "xxa",
       "milaki zuma ta kano",
       Status::ok,
       {"xxb-ana-01", "xxb-ana-02", "xxb-ana-04", "xxa-gen-01", "xxa-gen-02", "xxa-gen-04",
        "xxa-gen-06", "xxa-gen-07", "xxa-gen-08", "xxa-gen-09", "xxa-gen-10", "xxa-inf-M1"}},
      {"A16",
       "ta sonaki pelo beroki",
       "xxa",
       "xxb",
       "mo kindan mo libru manga",
       Status::ok,
       {"xxa-ana-01", "xxa-ana-02", "xxa-ana-04", "xxb-gen-01", "xxb-gen-02", "xxb-gen-04",
        "xxb-gen-06", "xxb-gen-08", "xxb-gen-09", "xxb-gen-11", "xxb-gen-12", "xxb-inf-M1"}},
      {"A17",
       "mo kindan mo libru manga",
       "xxb",
       "xxa",
       "ta sonaki pelo beroki",
       Status::ok,
       {"xxb-ana-01", "xxb-ana-02", "xxb-ana-04", "xxa-gen-01", "xxa-gen-02", "xxa-gen-04",
        "xxa-gen-06", "xxa-gen-07", "xxa-gen-08", "xxa-gen-09", "xxa-gen-10", "xxa-inf-M1"}},
  };
  return rows;
}

std::string Describe(const std::set<std::string>& ids) {
  std::string out;
  for (const auto& id : ids) out += id + " ";
  return out;
}

class pair_row : public testing::TestWithParam<PairRow> {};

TEST_P(pair_row, TextStatusAndTrace) {
  const PairRow& row = GetParam();
  const Engine& engine = std::string_view(row.from) == "xxa" ? XxaToXxb() : XxbToXxa();
  const Result result = engine.translate(row.input, Pair(row.from, row.to));
  EXPECT_EQ(result.text, row.expected);
  EXPECT_EQ(result.status, row.status);

  const std::vector<std::string> fired_list = RuleIds(result);
  const std::set<std::string> fired(fired_list.begin(), fired_list.end());
  const std::set<std::string> wanted(row.rule_ids.begin(), row.rule_ids.end());
  EXPECT_EQ(fired, wanted) << "fired:  " << Describe(fired) << "\nwanted: " << Describe(wanted);
  for (const auto& entry : result.trace.entries) {
    EXPECT_EQ(entry.event, TraceEvent::fired) << entry.rule;
  }
}

std::string CaseName(const testing::TestParamInfo<PairRow>& info) {
  std::string name = std::string(info.param.from) + "__" + info.param.to + "_" + info.param.id;
  for (char& c : name) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return name;
}

INSTANTIATE_TEST_SUITE_P(Table, pair_row, testing::ValuesIn(PairRows()), CaseName);

// A16 and A17: one node holds @def and @pl. Attributes compare as a set, never by order.
bool SomeNodeHoldsBoth(const Graph& graph) {
  return std::ranges::any_of(graph.nodes, [](const Node& node) {
    const std::set<std::string> attributes(node.attributes.begin(), node.attributes.end());
    return attributes.contains("@def") && attributes.contains("@pl");
  });
}

TEST(language_pair, A16_a_node_holds_def_and_pl_in_either_order) {
  const Result result = XxaToXxb().translate("ta sonaki pelo beroki", Pair("xxa", "xxb"));
  EXPECT_TRUE(SomeNodeHoldsBoth(result.unl));
}

TEST(language_pair, A17_a_node_holds_def_and_pl_in_either_order) {
  const Result result = XxbToXxa().translate("mo kindan mo libru manga", Pair("xxb", "xxa"));
  EXPECT_TRUE(SomeNodeHoldsBoth(result.unl));
}

// --- Part 8: unit rows on the pair ---

TEST(language_pair, L75_an_unknown_word_alone_fires_no_rule_xxa_to_xxb) {
  const Result result = XxaToXxb().translate("glimu", Pair("xxa", "xxb"));
  EXPECT_EQ(result.text, "\xE2\x9F\xA6glimu\xE2\x9F\xA7");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_TRUE(result.trace.entries.empty());
}

TEST(language_pair, L76_an_unknown_word_alone_fires_no_rule_xxb_to_xxa) {
  const Result result = XxbToXxa().translate("glimu", Pair("xxb", "xxa"));
  EXPECT_EQ(result.text, "\xE2\x9F\xA6glimu\xE2\x9F\xA7");
  EXPECT_EQ(result.status, Status::partial);
  EXPECT_TRUE(result.trace.entries.empty());
}

TEST(language_pair, L77_empty_input_is_no_parse_xxa_to_xxb) {
  const Result result = XxaToXxb().translate("", Pair("xxa", "xxb"));
  EXPECT_EQ(result.text, "");
  EXPECT_EQ(result.status, Status::no_parse);
}

TEST(language_pair, L78_whitespace_input_is_no_parse_xxb_to_xxa) {
  const Result result = XxbToXxa().translate("   \t  ", Pair("xxb", "xxa"));
  EXPECT_EQ(result.text, "");
  EXPECT_EQ(result.status, Status::no_parse);
}

}  // namespace
}  // namespace verstaan
