// SPDX-License-Identifier: MPL-2.0
//
// engine/src/rule_interpreter.cpp -- SPEC.md §3.4's runtime-tables back end (issue 22). Two
// things live here: `RuleSet::load`/`RuleSet::from_rules` (verstaan/rule_set.hpp), reading the
// five grammar kinds SPEC.md §3.3 names into `GrammarRule` records, and `RuleInterpreter`
// (verstaan/rule_interpreter.hpp), which parses one rule's `lhs`/`rhs` archive syntax
// (docs/unl-reference/formats/transformation-grammar.md, disambiguation.md, inflection.md) and
// applies it to hand-built input.

#include "verstaan/rule_interpreter.hpp"

#include <algorithm>
#include <charconv>
#include <cstdint>
#include <fstream>
#include <ios>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "verstaan/rule_set.hpp"

namespace verstaan {
namespace {

// --- Small string helpers, deliberately duplicated from dictionary_lookup.cpp's own local copies
// rather than shared: both files are single translation units with no third header worth adding
// just to hold four one-line functions (docs/standards/cpp.md names no shared-utility header). ---

std::optional<std::string> read_file(const std::string& path) {
  std::ifstream file(path, std::ios::binary | std::ios::ate);
  if (!file.is_open()) {
    return std::nullopt;
  }
  const std::streamoff size = file.tellg();
  if (size < 0) {
    return std::nullopt;
  }
  std::string content(static_cast<std::size_t>(size), '\0');
  file.seekg(0, std::ios::beg);
  file.read(content.data(), size);
  if (!file) {
    return std::nullopt;
  }
  return content;
}

std::string_view strip_cr(std::string_view line) {
  if (!line.empty() && line.back() == '\r') {
    line.remove_suffix(1);
  }
  return line;
}

std::string_view next_line(std::string_view& remaining) {
  const std::size_t eol = remaining.find('\n');
  const std::string_view line =
      strip_cr(eol == std::string_view::npos ? remaining : remaining.substr(0, eol));
  remaining = (eol == std::string_view::npos) ? std::string_view() : remaining.substr(eol + 1);
  return line;
}

std::string_view trim(std::string_view s) {
  while (!s.empty() && (s.front() == ' ' || s.front() == '\t')) {
    s.remove_prefix(1);
  }
  while (!s.empty() && (s.back() == ' ' || s.back() == '\t')) {
    s.remove_suffix(1);
  }
  return s;
}

// Un-escapes a double-quoted YAML scalar, `raw` including its surrounding quotes. The grammar
// export format only ever uses `\"`; anything else is kept literal rather than invented (same
// choice dictionary_lookup.cpp's own `unquote` makes).
std::string unquote(std::string_view raw) {
  std::string out;
  if (raw.size() < 2) {
    return out;
  }
  out.reserve(raw.size() - 2);
  for (std::size_t i = 1; i + 1 <= raw.size() - 1;) {
    const char c = raw[i];
    if (c == '\\' && i + 1 < raw.size() - 1) {
      out.push_back(raw[i + 1]);
      i += 2;
    } else {
      out.push_back(c);
      ++i;
    }
  }
  return out;
}

// Parses one scalar value: a double-quoted string (unescaped) or a bare token, trimmed.
std::string parse_scalar(std::string_view raw) {
  raw = trim(raw);
  if (!raw.empty() && raw.front() == '"') {
    return unquote(raw);
  }
  return std::string(raw);
}

// --- Grammar record reading. Every `data/languages/<iso3>/grammar/*.yaml` file is a flat list of
// seven-line records -- `- id:`, `  kind:`, `  lhs:`, `  rhs:`, `  conditions:`, `  comment:`,
// `  source:`, always in that order (verified against every real eng/afr grammar file, 2026-09-19:
// line count == 7 * record count + 1 header line in every case but eng's disambiguation.yaml,
// which is the literal scalar `[]`). Reading a fixed field count per record, the same choice
// dictionary_lookup.cpp's shard reader makes, means this module never special-cases a `-` byte
// inside a quoted `lhs`/`rhs`/`comment` value. `conditions` and `source` are skipped: SPEC.md
// §3.2 says `conditions` is always `[]` at M3, and `source` is provenance `tools/validate`
// already reports on (verstaan/rule_set.hpp's own comment on `GrammarRule`). ---

constexpr int kFieldsAfterId = 6;

void apply_grammar_field(GrammarRule& rule, std::string_view field_line) {
  static constexpr std::string_view kKindPrefix = "  kind: ";
  static constexpr std::string_view kLhsPrefix = "  lhs: ";
  static constexpr std::string_view kRhsPrefix = "  rhs: ";
  static constexpr std::string_view kCommentPrefix = "  comment: ";

  if (field_line.starts_with(kKindPrefix)) {
    rule.kind = parse_scalar(field_line.substr(kKindPrefix.size()));
  } else if (field_line.starts_with(kLhsPrefix)) {
    rule.lhs = parse_scalar(field_line.substr(kLhsPrefix.size()));
  } else if (field_line.starts_with(kRhsPrefix)) {
    rule.rhs = parse_scalar(field_line.substr(kRhsPrefix.size()));
  } else if (field_line.starts_with(kCommentPrefix)) {
    rule.comment = parse_scalar(field_line.substr(kCommentPrefix.size()));
  }
  // "  conditions: " and "  source: " carry no field this module reads (see the block comment).
}

// Reads every record out of `path`. A missing file, or a file holding only the empty-list scalar
// `[]`, returns an empty list -- never an error, matching `Dictionary::load`'s contract for a
// missing shard (verstaan/dictionary.hpp).
std::vector<GrammarRule> read_grammar_file(const std::string& path) {
  std::vector<GrammarRule> rules;
  const auto content = read_file(path);
  if (!content) {
    return rules;
  }

  static constexpr std::string_view kIdPrefix = "- id: ";

  std::string_view remaining = *content;
  while (!remaining.empty()) {
    const std::string_view line = next_line(remaining);
    if (!line.starts_with(kIdPrefix)) {
      continue;
    }
    GrammarRule rule;
    rule.id = parse_scalar(line.substr(kIdPrefix.size()));
    for (int field = 0; field < kFieldsAfterId && !remaining.empty(); ++field) {
      apply_grammar_field(rule, next_line(remaining));
    }
    rules.push_back(std::move(rule));
  }
  return rules;
}

// `store_root` and `file_name` are never interchangeable in practice -- every call site passes a
// `data/languages/<iso3>` path and a grammar-file literal ("analysis.yaml", ...) -- but they share
// a type, so clang-tidy cannot see that; NOLINT rather than a single-use wrapper type for two
// call-site-only parameters.
// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
std::string grammar_path(std::string_view store_root, std::string_view file_name) {
  std::string path(store_root);
  path += "/grammar/";
  path += file_name;
  return path;
}

}  // namespace

RuleSet RuleSet::load(std::string_view from_store_root, std::string_view to_store_root) {
  return {read_grammar_file(grammar_path(from_store_root, "disambiguation.yaml")),
          read_grammar_file(grammar_path(from_store_root, "analysis.yaml")),
          read_grammar_file(grammar_path(from_store_root, "inflection.yaml")),
          read_grammar_file(grammar_path(from_store_root, "subcategorisation.yaml")),
          read_grammar_file(grammar_path(to_store_root, "generation.yaml")),
          read_grammar_file(grammar_path(to_store_root, "inflection.yaml"))};
}

RuleSet RuleSet::from_rules(std::vector<GrammarRule> disambiguation,
                            std::vector<GrammarRule> analysis,
                            std::vector<GrammarRule> from_inflection,
                            std::vector<GrammarRule> subcategorisation,
                            std::vector<GrammarRule> generation,
                            std::vector<GrammarRule> to_inflection) {
  return {std::move(disambiguation),    std::move(analysis),   std::move(from_inflection),
          std::move(subcategorisation), std::move(generation), std::move(to_inflection)};
}

namespace {

// --- LHS pattern parsing. One `<LL RULE>` left side (transformation-grammar.md) is a sequence of
// parenthesised nodes, `(term,term,...)(term,...)...`. One term is:
//   `%x`                a capture: binds this node's position to the name `x` for the right side.
//   `^TAG` / `TAG`       a tag test, negated or not: TAG must (not) appear as a feature key, a
//                         feature value, or an attribute on the node (dictionary_lookup.cpp's own
//                         "flat namespace" reading of tagset mnemonics, reused here).
//   `KEY=VALUE`           a feature-pair test: the node must carry exactly this key/value pair.
//   `[word]`              a literal surface-form test.
//   `{alt|alt|...}`       a disjunction: each `alt` is itself a comma-separated AND of the above
//                         (never nested further in the archive's own analysis/disambiguation
//                         files, 2026-09-19); the node matches if any one `alt` fully matches. ---

struct SimpleTerm {
  enum class Kind : std::uint8_t { Tag, FeatureValue, Literal } kind = Kind::Tag;
  bool negate = false;
  std::string key;
  std::string value;  // FeatureValue only
};

struct Term {
  bool is_capture = false;
  std::string capture_name;                           // is_capture only
  std::vector<std::vector<SimpleTerm>> alternatives;  // OR of AND-groups; one group when no `{}`
};

using NodePattern = std::vector<Term>;

// Splits `content` on every top-level occurrence of `delim`, treating `{`/`[` as opening a nested
// span `}`/`]` closes (so a comma inside a disjunction's braces, or a literal's brackets, never
// splits the outer list). No nesting of the same kind occurs in the archive's own grammar files,
// so a flat depth counter across both bracket kinds together is enough.
std::vector<std::string_view> split_top_level(std::string_view content, char delim) {
  std::vector<std::string_view> parts;
  int depth = 0;
  std::size_t start = 0;
  for (std::size_t i = 0; i < content.size(); ++i) {
    const char c = content[i];
    if (c == '{' || c == '[') {
      ++depth;
    } else if (c == '}' || c == ']') {
      --depth;
    } else if (c == delim && depth == 0) {
      parts.push_back(trim(content.substr(start, i - start)));
      start = i + 1;
    }
  }
  parts.push_back(trim(content.substr(start)));
  return parts;
}

SimpleTerm parse_simple_term(std::string_view raw) {
  raw = trim(raw);
  SimpleTerm term;
  if (raw.starts_with('^')) {
    term.negate = true;
    raw = trim(raw.substr(1));
  }
  if (raw.size() >= 2 && raw.front() == '[' && raw.back() == ']') {
    term.kind = SimpleTerm::Kind::Literal;
    term.key = std::string(raw.substr(1, raw.size() - 2));
    return term;
  }
  const std::size_t eq = raw.find('=');
  if (eq != std::string_view::npos) {
    term.kind = SimpleTerm::Kind::FeatureValue;
    term.key = std::string(trim(raw.substr(0, eq)));
    term.value = std::string(trim(raw.substr(eq + 1)));
    return term;
  }
  term.kind = SimpleTerm::Kind::Tag;
  term.key = std::string(raw);
  return term;
}

Term parse_term(std::string_view raw) {
  raw = trim(raw);
  Term term;
  if (raw.starts_with('%')) {
    term.is_capture = true;
    term.capture_name = std::string(raw.substr(1));
    return term;
  }
  if (raw.size() >= 2 && raw.front() == '{' && raw.back() == '}') {
    const std::string_view inner = raw.substr(1, raw.size() - 2);
    for (const std::string_view alt : split_top_level(inner, '|')) {
      std::vector<SimpleTerm> and_group;
      for (const std::string_view sub : split_top_level(alt, ',')) {
        and_group.push_back(parse_simple_term(sub));
      }
      term.alternatives.push_back(std::move(and_group));
    }
    return term;
  }
  term.alternatives.push_back({parse_simple_term(raw)});
  return term;
}

// Splits an LHS or RHS string into its parenthesised groups' inner content, one entry per
// `(...)`. Parens do not nest inside one node in any rule this module reads (2026-09-19), so a
// plain depth counter on `(`/`)` alone is enough.
std::vector<std::string_view> split_groups(std::string_view text) {
  std::vector<std::string_view> groups;
  int depth = 0;
  std::size_t start = 0;
  for (std::size_t i = 0; i < text.size(); ++i) {
    if (text[i] == '(') {
      if (depth == 0) {
        start = i + 1;
      }
      ++depth;
    } else if (text[i] == ')') {
      --depth;
      if (depth == 0) {
        groups.push_back(text.substr(start, i - start));
      }
    }
  }
  return groups;
}

std::vector<NodePattern> parse_lhs(std::string_view lhs) {
  std::vector<NodePattern> pattern;
  for (const std::string_view group : split_groups(lhs)) {
    NodePattern node;
    for (const std::string_view raw_term : split_top_level(group, ',')) {
      if (!raw_term.empty()) {
        node.push_back(parse_term(raw_term));
      }
    }
    pattern.push_back(std::move(node));
  }
  return pattern;
}

bool simple_term_matches(const SimpleTerm& term, const Candidate& node) {
  bool result = false;
  switch (term.kind) {
    case SimpleTerm::Kind::Literal:
      result = (node.surface == term.key);
      break;
    case SimpleTerm::Kind::FeatureValue:
      result = std::ranges::any_of(node.features, [&](const Feature& f) {
        return f.first == term.key && f.second == term.value;
      });
      break;
    case SimpleTerm::Kind::Tag:
      result = std::ranges::any_of(
                   node.features,
                   [&](const Feature& f) { return f.first == term.key || f.second == term.key; }) ||
               std::ranges::find(node.attributes, term.key) != node.attributes.end();
      break;
  }
  return term.negate ? !result : result;
}

bool term_matches(const Term& term, const Candidate& node) {
  if (term.is_capture) {
    return true;
  }
  return std::ranges::any_of(term.alternatives, [&](const std::vector<SimpleTerm>& alt) {
    return std::ranges::all_of(
        alt, [&](const SimpleTerm& simple) { return simple_term_matches(simple, node); });
  });
}

bool node_matches(const NodePattern& pattern, const Candidate& node) {
  return std::ranges::all_of(pattern, [&](const Term& term) { return term_matches(term, node); });
}

// --- RHS application (analysis kind). One RHS group's content is a comma-separated item list:
//   `%x`              this group's base node is the one bound to capture `x` on the left side.
//   `+att=@literal`   append the literal UNL attribute (kept with its leading `@`).
//   `+att=%x`         append every attribute the node bound to `x` currently carries.
// A group with no `%x` item defaults to the left-side node at its own position (rule 1's
// `(+att=@pl)`, matching `(N,PLR,...)`  positionally, one node, one group). A left-side node no
// RHS group ever names -- by capture or by position -- is dropped
// (docs/unl-reference/formats/transformation-grammar.md: "conservation" the other way). ---

struct RhsItem {
  enum class Kind : std::uint8_t { CaptureRef, AddLiteralAttribute, AddCapturedAttributes } kind;
  std::string name;  // capture name, or the literal attribute for AddLiteralAttribute
};

RhsItem parse_rhs_item(std::string_view raw) {
  raw = trim(raw);
  static constexpr std::string_view kAttPrefix = "+att=";
  if (raw.starts_with(kAttPrefix)) {
    const std::string_view value = raw.substr(kAttPrefix.size());
    if (value.starts_with('%')) {
      return RhsItem{.kind = RhsItem::Kind::AddCapturedAttributes,
                     .name = std::string(value.substr(1))};
    }
    return RhsItem{.kind = RhsItem::Kind::AddLiteralAttribute, .name = std::string(value)};
  }
  if (raw.starts_with('%')) {
    return RhsItem{.kind = RhsItem::Kind::CaptureRef, .name = std::string(raw.substr(1))};
  }
  return RhsItem{.kind = RhsItem::Kind::CaptureRef,
                 .name = std::string()};  // unrecognised: ignored
}

using Captures = std::vector<std::pair<std::string, std::size_t>>;

// The node bound to capture `name`, or nullptr when no capture in this window used that name.
const Candidate* find_capture(const Captures& captures, const std::vector<Candidate>& nodes,
                              std::string_view name) {
  for (const auto& [capture_name, index] : captures) {
    if (capture_name == name) {
      return &nodes[index];
    }
  }
  return nullptr;
}

// One RHS group's base node: the node a bare `%x` item in `items` names, or (with no such item)
// the left-side node at this group's own position -- rule 1's `(+att=@pl)`, matching
// `(N,PLR,...)` positionally, one node, one group.
const Candidate* find_rhs_group_base(const std::vector<std::string_view>& items,
                                     const Captures& captures, const std::vector<Candidate>& nodes,
                                     std::size_t start, std::size_t group_index,
                                     const std::vector<NodePattern>& pattern) {
  for (const std::string_view raw_item : items) {
    if (raw_item.empty()) {
      continue;
    }
    const RhsItem item = parse_rhs_item(raw_item);
    if (item.kind == RhsItem::Kind::CaptureRef && !item.name.empty()) {
      if (const Candidate* base = find_capture(captures, nodes, item.name)) {
        return base;
      }
    }
  }
  if (group_index < pattern.size()) {
    return &nodes[start + group_index];
  }
  return nullptr;
}

// Applies every `+att=...` item in `items` to `result`, in item order.
void apply_rhs_group_attributes(Candidate& result, const std::vector<std::string_view>& items,
                                const Captures& captures, const std::vector<Candidate>& nodes) {
  for (const std::string_view raw_item : items) {
    if (raw_item.empty()) {
      continue;
    }
    const RhsItem item = parse_rhs_item(raw_item);
    if (item.kind == RhsItem::Kind::AddLiteralAttribute) {
      result.attributes.push_back(item.name);
    } else if (item.kind == RhsItem::Kind::AddCapturedAttributes) {
      if (const Candidate* source = find_capture(captures, nodes, item.name)) {
        result.attributes.insert(result.attributes.end(), source->attributes.begin(),
                                 source->attributes.end());
      }
    }
  }
}

// Applies one rule's RHS to the window `nodes[start, start+pattern.size())`, given the captures
// that matching `pattern` against that window recorded (name -> absolute node index). Returns the
// replacement sequence for the window, in RHS group order.
std::vector<Candidate> apply_rhs(std::string_view rhs, const std::vector<Candidate>& nodes,
                                 std::size_t start, const std::vector<NodePattern>& pattern,
                                 const Captures& captures) {
  std::vector<Candidate> output;
  std::size_t group_index = 0;
  for (const std::string_view group : split_groups(rhs)) {
    const std::vector<std::string_view> items = split_top_level(group, ',');
    const Candidate* base =
        find_rhs_group_base(items, captures, nodes, start, group_index, pattern);
    if (base != nullptr) {
      Candidate result = *base;
      apply_rhs_group_attributes(result, items, captures, nodes);
      output.push_back(std::move(result));
    }
    ++group_index;
  }
  return output;
}

// One non-overlapping left-to-right pass of `rule` over `nodes`. Every window that matches is
// replaced by its RHS output (possibly fewer nodes -- a deletion) and scanning resumes right after
// the replacement, so a rule cannot re-fire on its own output within the same pass. Appends one
// `TraceEntry{rule.id}` per window that matched.
void apply_analysis_rule(const GrammarRule& rule, std::vector<Candidate>& nodes, Trace& trace) {
  const std::vector<NodePattern> pattern = parse_lhs(rule.lhs);
  if (pattern.empty()) {
    return;
  }
  std::size_t start = 0;
  while (start + pattern.size() <= nodes.size()) {
    std::vector<std::pair<std::string, std::size_t>> captures;
    bool matched = true;
    for (std::size_t offset = 0; offset < pattern.size(); ++offset) {
      const std::size_t index = start + offset;
      if (!node_matches(pattern[offset], nodes[index])) {
        matched = false;
        break;
      }
      for (const Term& term : pattern[offset]) {
        if (term.is_capture) {
          captures.emplace_back(term.capture_name, index);
        }
      }
    }
    if (!matched) {
      ++start;
      continue;
    }
    std::vector<Candidate> replacement = apply_rhs(rule.rhs, nodes, start, pattern, captures);
    trace.entries.push_back(TraceEntry{rule.id});
    const auto first = nodes.begin() + static_cast<std::ptrdiff_t>(start);
    const auto last = first + static_cast<std::ptrdiff_t>(pattern.size());
    nodes.erase(first, last);
    nodes.insert(nodes.begin() + static_cast<std::ptrdiff_t>(start), replacement.begin(),
                 replacement.end());
    start += replacement.size();
  }
}

// --- Disambiguation. A D-rule's RHS is always the literal "0" (delete the match); the only
// position(s) actually pruned are the ones the caller left with more than one candidate -- a
// `Position` with exactly one candidate is fixed context the D-rule reads but never rewrites. ---

// Recursively tries every combination of candidate choices across `positions[start,
// start+pattern.size())`, testing each combination's whole window against `pattern`. Every
// combination that matches marks its choice at every free (multi-candidate) offset for deletion.
void collect_disambiguation_deletions(const std::vector<NodePattern>& pattern,
                                      const std::vector<Position>& positions, std::size_t start,
                                      std::size_t offset, std::vector<std::size_t>& chosen,
                                      std::vector<std::pair<std::size_t, std::size_t>>& to_delete) {
  if (offset == pattern.size()) {
    for (std::size_t i = 0; i < pattern.size(); ++i) {
      const Candidate& node = positions[start + i].candidates[chosen[i]];
      if (!node_matches(pattern[i], node)) {
        return;
      }
    }
    for (std::size_t i = 0; i < pattern.size(); ++i) {
      if (positions[start + i].candidates.size() > 1) {
        to_delete.emplace_back(start + i, chosen[i]);
      }
    }
    return;
  }
  const std::size_t count = positions[start + offset].candidates.size();
  if (count == 0) {
    return;
  }
  if (count == 1) {
    chosen[offset] = 0;
    collect_disambiguation_deletions(pattern, positions, start, offset + 1, chosen, to_delete);
    return;
  }
  for (std::size_t c = 0; c < count; ++c) {
    chosen[offset] = c;
    collect_disambiguation_deletions(pattern, positions, start, offset + 1, chosen, to_delete);
  }
}

void apply_disambiguation_rule(const GrammarRule& rule, std::vector<Position>& positions,
                               Trace& trace) {
  const std::vector<NodePattern> pattern = parse_lhs(rule.lhs);
  if (pattern.empty()) {
    return;
  }
  std::vector<std::pair<std::size_t, std::size_t>> to_delete;
  for (std::size_t start = 0; start + pattern.size() <= positions.size(); ++start) {
    std::vector<std::size_t> chosen(pattern.size(), 0);
    collect_disambiguation_deletions(pattern, positions, start, 0, chosen, to_delete);
  }
  if (to_delete.empty()) {
    return;
  }
  trace.entries.push_back(TraceEntry{rule.id});

  // Group deletions by position, highest candidate index first, so erasing does not shift an
  // index still pending deletion at the same position.
  std::ranges::sort(to_delete, [](const auto& a, const auto& b) {
    return a.first != b.first ? a.first < b.first : a.second > b.second;
  });
  for (const auto& [position_index, candidate_index] : to_delete) {
    std::vector<Candidate>& candidates = positions[position_index].candidates;
    if (candidate_index < candidates.size() && candidates.size() > 1) {
      candidates.erase(candidates.begin() + static_cast<std::ptrdiff_t>(candidate_index));
    }
  }
}

// --- Inflection. `<VALUE>:=<a-rule>` branches, `;`-separated (docs/unl-reference/formats/
// inflection.md). `<a-rule>` is one of:
//   `POS>"suffix"`       remove `POS` characters from the end of the base form, then append.
//   `"find">"replace"`   replace a trailing `find` with `replace`.
//   `"find":"replace"`   the same, the archive's other spelling for it (seen on M7's `"man":
//                         "men"`; both operators behave the same way here, undistinguished, since
//                         no rule this module is asked to run needs them told apart).
//   `"literal"`           replace the whole form with `literal` (no operator at all, e.g. M256's
//                         `1PS&PRS:="am"`). ---

struct AffixSpec {
  enum class Kind : std::uint8_t { AppendAtPosition, Replace, WholeForm } kind = Kind::WholeForm;
  int position = 0;
  std::string find;
  std::string replace;
};

int parse_position(std::string_view raw) {
  raw = trim(raw);
  if (!raw.empty() && raw.front() == '[') {
    const std::size_t close = raw.find(']');
    if (close != std::string_view::npos) {
      raw = raw.substr(1, close - 1);
    }
  }
  int value = 0;
  std::from_chars(raw.data(), raw.data() + raw.size(), value);
  return value;
}

AffixSpec parse_affix(std::string_view spec) {
  spec = trim(spec);
  bool in_quotes = false;
  std::size_t op_pos = std::string_view::npos;
  for (std::size_t i = 0; i < spec.size(); ++i) {
    const char c = spec[i];
    if (c == '"') {
      in_quotes = !in_quotes;
    } else if (!in_quotes && (c == '>' || c == ':')) {
      op_pos = i;
      break;
    }
  }
  if (op_pos == std::string_view::npos) {
    return AffixSpec{.kind = AffixSpec::Kind::WholeForm,
                     .position = 0,
                     .find = {},
                     .replace = parse_scalar(spec)};
  }
  const std::string_view lhs_part = trim(spec.substr(0, op_pos));
  const std::string replace_value = parse_scalar(trim(spec.substr(op_pos + 1)));
  if (!lhs_part.empty() && lhs_part.front() == '"') {
    return AffixSpec{.kind = AffixSpec::Kind::Replace,
                     .position = 0,
                     .find = parse_scalar(lhs_part),
                     .replace = replace_value};
  }
  return AffixSpec{.kind = AffixSpec::Kind::AppendAtPosition,
                   .position = parse_position(lhs_part),
                   .find = {},
                   .replace = replace_value};
}

std::string apply_affix(const AffixSpec& spec, std::string_view base) {
  switch (spec.kind) {
    case AffixSpec::Kind::WholeForm:
      return spec.replace;
    case AffixSpec::Kind::Replace:
      if (!spec.find.empty() && base.size() >= spec.find.size() &&
          base.substr(base.size() - spec.find.size()) == spec.find) {
        return std::string(base.substr(0, base.size() - spec.find.size())) + spec.replace;
      }
      return std::string(base);
    case AffixSpec::Kind::AppendAtPosition: {
      const std::size_t remove =
          spec.position > 0 ? std::min(static_cast<std::size_t>(spec.position), base.size()) : 0;
      return std::string(base.substr(0, base.size() - remove)) + spec.replace;
    }
  }
  return std::string(base);
}

// Splits a paradigm's rhs, `VALUE:=a-rule;VALUE:=a-rule;...`, into (VALUE, a-rule) pairs, quote-
// aware so a `;` or `:=` inside a quoted find/replace string never splits early.
std::vector<std::pair<std::string_view, std::string_view>> split_inflection_branches(
    std::string_view rhs) {
  std::vector<std::pair<std::string_view, std::string_view>> branches;
  bool in_quotes = false;
  std::size_t start = 0;
  std::size_t assign_pos = std::string_view::npos;
  for (std::size_t i = 0; i < rhs.size(); ++i) {
    const char c = rhs[i];
    if (c == '"') {
      in_quotes = !in_quotes;
    } else if (!in_quotes && assign_pos == std::string_view::npos && c == ':' &&
               i + 1 < rhs.size() && rhs[i + 1] == '=') {
      assign_pos = i;
    } else if (!in_quotes && c == ';') {
      if (assign_pos != std::string_view::npos) {
        branches.emplace_back(trim(rhs.substr(start, assign_pos - start)),
                              trim(rhs.substr(assign_pos + 2, i - assign_pos - 2)));
      }
      start = i + 1;
      assign_pos = std::string_view::npos;
    }
  }
  return branches;
}

}  // namespace

void RuleInterpreter::disambiguate(std::vector<Position>& positions, Trace& trace) const {
  const std::vector<GrammarRule>& rules = rules_.disambiguation();
  if (rules.empty()) {
    // Issue 21's eng-empty fallback (docs/unl-reference/formats/disambiguation.md, "Where eng has
    // no export"): first candidate wins, in the caller's own order.
    for (Position& position : positions) {
      if (position.candidates.size() > 1) {
        position.candidates.resize(1);
      }
    }
    return;
  }
  for (const GrammarRule& rule : rules) {
    apply_disambiguation_rule(rule, positions, trace);
  }
}

std::vector<Candidate> RuleInterpreter::analyse(std::vector<Candidate> nodes, Trace& trace) const {
  for (const GrammarRule& rule : rules_.analysis()) {
    apply_analysis_rule(rule, nodes, trace);
  }
  return nodes;
}

// `paradigm_id`, `attribute` and `base_form` are all std::string_view but never interchangeable in
// practice (a paradigm id like "M2", a tag like "PLR", and a word); the public header
// (verstaan/rule_interpreter.hpp) already names and documents each parameter, so a wrapper type
// here would duplicate that without adding real safety.
// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
std::string RuleInterpreter::inflect(std::string_view paradigm_id, std::string_view attribute,
                                     std::string_view base_form, bool from_language,
                                     Trace& trace) const {
  const std::vector<GrammarRule>& paradigms =
      from_language ? rules_.from_inflection() : rules_.to_inflection();
  for (const GrammarRule& paradigm : paradigms) {
    if (paradigm.id != paradigm_id) {
      continue;
    }
    for (const auto& [value, a_rule] : split_inflection_branches(paradigm.rhs)) {
      if (value != attribute) {
        continue;
      }
      const std::string result = apply_affix(parse_affix(a_rule), base_form);
      trace.entries.push_back(TraceEntry{std::string(paradigm_id)});
      return result;
    }
    return std::string(base_form);
  }
  return std::string(base_form);
}

}  // namespace verstaan
