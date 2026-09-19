// SPDX-License-Identifier: MPL-2.0
#include <algorithm>
#include <array>
#include <charconv>
#include <fstream>
#include <ios>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "verstaan/dictionary.hpp"

namespace verstaan {
namespace {

// Attributes whose value is a literal (a lemma, a base form, a paradigm/frame reference, an
// inline inflection or subcategorisation rule, a digit string) rather than a member of
// tagset.yaml's closed tag list. Kept identical to `tools/validate/store.py`'s
// `REFERENCE_VALUED_ATTRIBUTES` (issue 17/169) so a lookup-time warning and a validate-time error
// agree on what counts as a violation.
constexpr std::array<std::string_view, 8> kReferenceValuedAttributes = {
    "LEMMA", "BF", "PAR", "FRA", "SFR", "FLX", "DIGIT", "GOV",
};

bool is_reference_valued(std::string_view attribute) {
  return std::ranges::find(kReferenceValuedAttributes, attribute) !=
         kReferenceValuedAttributes.end();
}

// Reads a whole file into a string. Returns nullopt for a missing or unopenable file -- not an
// error, a `dictionary/<letter>.yaml` shard legitimately does not exist for every letter, and
// SPEC.md §3.3 does not require `tagset.yaml` to exist for a store this module can still shard.
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

// Strips one trailing '\r', for a file that carries CRLF line endings.
std::string_view strip_cr(std::string_view line) {
  if (!line.empty() && line.back() == '\r') {
    line.remove_suffix(1);
  }
  return line;
}

// Splits `content` into lines without copying it; `visit` runs once per line, in order.
template <typename Visit>
void for_each_line(std::string_view content, Visit visit) {
  std::size_t pos = 0;
  const std::size_t size = content.size();
  while (pos < size) {
    const std::size_t eol = content.find('\n', pos);
    const std::string_view line =
        (eol == std::string_view::npos) ? content.substr(pos) : content.substr(pos, eol - pos);
    visit(strip_cr(line));
    pos = (eol == std::string_view::npos) ? size : eol + 1;
  }
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

// Un-escapes a double-quoted YAML scalar, `raw` including its surrounding quotes (dictionary.md's
// export format only ever uses `\"` and `\\`; anything else is kept literally rather than
// invented -- see g.yaml's FLX values, which are the one field this module does not interpret,
// only carries through unchanged).
std::string unquote(std::string_view raw) {
  std::string out;
  if (raw.size() < 2) {
    return out;
  }
  out.reserve(raw.size() - 2);
  for (std::size_t i = 1; i + 1 <= raw.size() - 1;) {
    const char c = raw[i];
    if (c == '\\' && i + 1 < raw.size() - 1) {
      const char next = raw[i + 1];
      if (next == 'n') {
        out.push_back('\n');
      } else if (next == 't') {
        out.push_back('\t');
      } else {
        // Covers the two escapes dictionary.md's export format actually uses, `\"` and `\\`, and
        // keeps anything else literal rather than inventing an escape (see the function comment).
        out.push_back(next);
      }
      i += 2;
    } else {
      out.push_back(c);
      ++i;
    }
  }
  return out;
}

// Parses one scalar value, the remainder of a `key: value` line after the prefix. Either a
// double-quoted string (dictionary.md's `uw` and, sometimes, `headword`) or a bare token.
std::string parse_scalar(std::string_view raw) {
  raw = trim(raw);
  if (!raw.empty() && raw.front() == '"') {
    return unquote(raw);
  }
  return std::string(raw);
}

int parse_int(std::string_view raw) {
  raw = trim(raw);
  int value = 0;
  std::from_chars(raw.data(), raw.data() + raw.size(), value);
  return value;
}

std::int64_t parse_id(std::string_view raw) {
  raw = trim(raw);
  std::int64_t value = 0;
  std::from_chars(raw.data(), raw.data() + raw.size(), value);
  return value;
}

// Advances `i` past any run of spaces/tabs in `body`.
void skip_flow_spaces(std::string_view body, std::size_t& i) {
  const std::size_t size = body.size();
  while (i < size && (body[i] == ' ' || body[i] == '\t')) {
    ++i;
  }
}

// Reads one `KEY:` up to (and past) its colon, starting at `i`.
std::string parse_flow_key(std::string_view body, std::size_t& i) {
  const std::size_t size = body.size();
  const std::size_t key_start = i;
  while (i < size && body[i] != ':') {
    ++i;
  }
  std::string key(trim(body.substr(key_start, i - key_start)));
  if (i < size) {
    ++i;  // skip ':'
  }
  return key;
}

// Reads one double-quoted value starting at `body[i]` (the opening `"`), respecting `\"` so a
// quote inside the value does not end it early.
std::string parse_flow_quoted_value(std::string_view body, std::size_t& i) {
  const std::size_t size = body.size();
  const std::size_t value_start = i;
  ++i;
  while (i < size) {
    const char c = body[i];
    if (c == '\\' && i + 1 < size) {
      i += 2;
      continue;
    }
    ++i;
    if (c == '"') {
      break;
    }
  }
  return unquote(body.substr(value_start, i - value_start));
}

// Reads one bare (unquoted) value, up to the next ','.
std::string parse_flow_bare_value(std::string_view body, std::size_t& i) {
  const std::size_t size = body.size();
  const std::size_t value_start = i;
  while (i < size && body[i] != ',') {
    ++i;
  }
  return std::string(trim(body.substr(value_start, i - value_start)));
}

std::string parse_flow_value(std::string_view body, std::size_t& i) {
  if (i < body.size() && body[i] == '"') {
    return parse_flow_quoted_value(body, i);
  }
  return parse_flow_bare_value(body, i);
}

// Parses a single-line YAML flow mapping, `{KEY: value, KEY: "quoted, value", ...}`, respecting
// quoted values that themselves hold a comma (real data: `LEMMA: "Bok, bok, staan styf"` in
// data/languages/afr/dictionary/b.yaml) so the split does not happen inside a quoted string.
std::vector<Feature> parse_flow_map(std::string_view raw) {
  std::vector<Feature> result;
  raw = trim(raw);
  if (raw.size() < 2 || raw.front() != '{' || raw.back() != '}') {
    return result;
  }
  const std::string_view body = raw.substr(1, raw.size() - 2);
  const std::size_t size = body.size();

  std::size_t i = 0;
  while (i < size) {
    skip_flow_spaces(body, i);
    if (i >= size) {
      break;
    }
    std::string key = parse_flow_key(body, i);
    skip_flow_spaces(body, i);
    std::string value = parse_flow_value(body, i);
    result.emplace_back(std::move(key), std::move(value));

    while (i < size && (body[i] == ',' || body[i] == ' ' || body[i] == '\t')) {
      ++i;
    }
  }
  return result;
}

// tagset.yaml is a flat block mapping keyed by tag mnemonic (`NOU:`, `POS:`, `1PER:`, ...), each
// value an indented nested mapping this module never needs to read (SPEC.md §3.3: lookup only
// needs the set of legal keys, per tools/validate/store.py `_tagset_keys`). A top-level key line
// starts at column 0, holds no internal space, and ends with exactly one ':' and nothing after it
// (its value sits on the following, indented lines).
std::vector<std::string> parse_tagset_keys(std::string_view content) {
  std::vector<std::string> keys;
  for_each_line(content, [&](std::string_view line) {
    if (line.empty() || line.front() == ' ' || line.front() == '\t' || line.front() == '#') {
      return;
    }
    if (line.back() != ':') {
      return;
    }
    if (line.find(' ') != std::string_view::npos || line.find('\t') != std::string_view::npos) {
      return;
    }
    const std::string_view key = line.substr(0, line.size() - 1);
    if (!key.empty()) {
      keys.emplace_back(key);
    }
  });
  std::ranges::sort(keys);
  keys.erase(std::ranges::unique(keys).begin(), keys.end());
  return keys;
}

bool tagset_has(const std::vector<std::string>& sorted_keys, std::string_view key) {
  return std::ranges::binary_search(sorted_keys, key);
}

// A dictionary shard's entries are eight fields long, always in this order (verified against the
// real eng/afr stores, 2026-09-19: every shard file has an equal count of `- headword:`, `  id:`,
// `  uw:`, `  features:`, `  lang:`, `  frequency:`, `  priority:` and `  source:` lines). Reading
// a fixed field count per entry, rather than scanning for the next `- ` line, means this module
// never needs to special-case a `-` byte inside a quoted value.
constexpr int kFieldsAfterHeadword = 7;

// One shard per lower-case letter, 'a' through 'z' (SPEC.md §3.3).
constexpr int kShardCount = 26;

int shard_index(std::string_view surface) {
  if (surface.empty()) {
    return -1;
  }
  const char first = surface.front();
  if (first >= 'a' && first <= 'z') {
    return first - 'a';
  }
  if (first >= 'A' && first <= 'Z') {
    return first - 'A';
  }
  return -1;
}

std::string shard_path(const std::string& store_root, int index) {
  std::string path = store_root;
  path += "/dictionary/";
  path += static_cast<char>('a' + index);
  path += ".yaml";
  return path;
}

std::string tagset_path(const std::string& store_root) {
  std::string path = store_root;
  path += "/tagset.yaml";
  return path;
}

// Reads the next line out of `remaining`, advancing it past the line and its newline. Returns an
// empty view once `remaining` is exhausted (the caller's loop condition, `!remaining.empty()`,
// stops before that happens for a well-formed shard, but a truncated one still terminates).
std::string_view next_line(std::string_view& remaining) {
  const std::size_t eol = remaining.find('\n');
  const std::string_view line =
      strip_cr(eol == std::string_view::npos ? remaining : remaining.substr(0, eol));
  remaining = (eol == std::string_view::npos) ? std::string_view() : remaining.substr(eol + 1);
  return line;
}

// Sets the one field `field_line` names on `entry`, or does nothing for a prefix this module does
// not track. "  lang: " is not parsed back out: the caller already told `load()` which language
// `store_root` holds. "  source: " carries archive provenance this module never reads (issue 17's
// validator is the one place that report matters).
void apply_shard_field(DictionaryEntry& entry, std::string_view field_line) {
  static constexpr std::string_view kIdPrefix = "  id: ";
  static constexpr std::string_view kUwPrefix = "  uw: ";
  static constexpr std::string_view kFeaturesPrefix = "  features: ";
  static constexpr std::string_view kFrequencyPrefix = "  frequency: ";
  static constexpr std::string_view kPriorityPrefix = "  priority: ";

  if (field_line.starts_with(kIdPrefix)) {
    entry.id = parse_id(field_line.substr(kIdPrefix.size()));
  } else if (field_line.starts_with(kUwPrefix)) {
    entry.uw = parse_scalar(field_line.substr(kUwPrefix.size()));
  } else if (field_line.starts_with(kFeaturesPrefix)) {
    entry.features = parse_flow_map(field_line.substr(kFeaturesPrefix.size()));
  } else if (field_line.starts_with(kFrequencyPrefix)) {
    entry.frequency = parse_int(field_line.substr(kFrequencyPrefix.size()));
  } else if (field_line.starts_with(kPriorityPrefix)) {
    entry.priority = parse_int(field_line.substr(kPriorityPrefix.size()));
  }
}

// Reads the `kFieldsAfterHeadword` lines following a `- headword:` line, advancing `remaining`
// past all of them regardless of `match` (every entry's fields must be skipped to reach the next
// one), applying each to `entry` only when `match` is true.
void read_entry_fields(std::string_view& remaining, bool match, DictionaryEntry& entry) {
  for (int field = 0; field < kFieldsAfterHeadword && !remaining.empty(); ++field) {
    const std::string_view field_line = next_line(remaining);
    if (match) {
      apply_shard_field(entry, field_line);
    }
  }
}

// Records a tagset warning for each of `entry`'s `features` pairs that use an attribute or a
// value `tagset_keys` does not define, the first time `entry.id` is seen (`warned_ids`).
void record_tagset_warnings(const DictionaryEntry& entry,
                            const std::vector<std::string>& tagset_keys,
                            std::vector<std::int64_t>& warned_ids,
                            std::vector<TagsetWarning>& warnings) {
  if (std::ranges::find(warned_ids, entry.id) != warned_ids.end()) {
    return;
  }
  warned_ids.push_back(entry.id);
  for (const auto& [attribute, value] : entry.features) {
    if (is_reference_valued(attribute)) {
      continue;
    }
    if (!tagset_has(tagset_keys, attribute)) {
      warnings.push_back(TagsetWarning{.headword = entry.headword,
                                       .id = entry.id,
                                       .attribute = attribute,
                                       .value = std::string()});
    }
    if (!tagset_has(tagset_keys, value)) {
      warnings.push_back(TagsetWarning{
          .headword = entry.headword, .id = entry.id, .attribute = attribute, .value = value});
    }
  }
}

}  // namespace

Dictionary::Dictionary(std::string store_root, Lang lang, std::vector<std::string> tagset_keys)
    : store_root_(std::move(store_root)),
      lang_(lang),
      tagset_keys_(std::move(tagset_keys)),
      shard_cache_(kShardCount),
      shard_loaded_(kShardCount, false) {}

Dictionary Dictionary::load(std::string_view store_root, Lang lang) {
  std::vector<std::string> tagset_keys;
  if (const auto content = read_file(tagset_path(std::string(store_root)))) {
    tagset_keys = parse_tagset_keys(*content);
  }
  return {std::string(store_root), lang, std::move(tagset_keys)};
}

std::vector<DictionaryEntry> Dictionary::lookup(std::string_view surface) const {
  std::vector<DictionaryEntry> results;
  const int index = shard_index(surface);
  if (index < 0) {
    return results;
  }

  const auto shard = static_cast<std::size_t>(index);
  if (!shard_loaded_[shard]) {
    shard_cache_[shard] = read_file(shard_path(store_root_, index)).value_or(std::string());
    shard_loaded_[shard] = true;
  }
  const std::string& content = shard_cache_[shard];
  if (content.empty()) {
    return results;
  }

  static constexpr std::string_view kHeadwordPrefix = "- headword: ";

  std::string_view remaining = content;
  while (!remaining.empty()) {
    const std::string_view line = next_line(remaining);
    if (!line.starts_with(kHeadwordPrefix)) {
      continue;
    }
    const std::string headword = parse_scalar(line.substr(kHeadwordPrefix.size()));
    const bool match = (headword == surface);

    DictionaryEntry entry;
    if (match) {
      entry.headword = headword;
      entry.lang = lang_;
    }

    read_entry_fields(remaining, match, entry);

    if (!match) {
      continue;
    }

    record_tagset_warnings(entry, tagset_keys_, warned_ids_, warnings_);
    results.push_back(std::move(entry));
  }

  return results;
}

std::vector<LookupEntry> Dictionary::lookup_tokens(const std::vector<Token>& tokens) const {
  std::vector<LookupEntry> results;
  results.reserve(tokens.size());
  for (const Token& token : tokens) {
    results.push_back(LookupEntry{.surface = token.surface, .entries = lookup(token.surface)});
  }
  return results;
}

}  // namespace verstaan
