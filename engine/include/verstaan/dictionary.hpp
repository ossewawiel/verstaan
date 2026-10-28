// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API. SPEC.md §3.3, §3.4. New file, not a change to engine.hpp/tokeniser.hpp's existing
// shape, so it follows the same precedent tokeniser.hpp set at issue 19 rather than needing its
// own ADR (engine/CLAUDE.md: an ADR guards a *change* to the public API, not every addition to it).
//
// Loads one language's dictionary store, `data/languages/<iso3>/dictionary/<a-z>.yaml` (sharded
// by first letter, SPEC.md §3.3) and looks up tokeniser output (issue 19, `verstaan/tokeniser.hpp`)
// against it. A token with more than one matching entry (a homograph) carries every entry
// forward; picking one sense is issue 22's job (the rule interpreter reads
// `grammar/disambiguation.yaml`), not this file's. A token with zero matching entries carries no
// entry and is not an error -- `Engine::translate` marks it with
// `⟦word⟧` and reports `Status::partial` (issues 23 and 181).

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

#include "verstaan/engine.hpp"     // Lang
#include "verstaan/tokeniser.hpp"  // Token

namespace verstaan {

// One `features` attribute=value pair, e.g. {"POS", "NOU"}. Store order preserved; lookup does
// not care about order, but a trace that prints an entry later will want it.
using Feature = std::pair<std::string, std::string>;

// One dictionary record, `data/languages/<iso3>/dictionary/<a-z>.yaml`'s shape (SPEC.md §3.3).
struct DictionaryEntry {
  std::string headword;
  std::int64_t id = 0;
  std::string uw;
  std::vector<Feature> features;
  Lang lang = Lang::eng;
  int frequency = 0;
  int priority = 0;
};

// One token's lookup outcome. `entries` holds every dictionary entry whose headword equals
// `surface` exactly -- case-sensitive, because the store shards by the lower-cased first letter
// only, not a case fold of the whole word: a capitalised token such as "John" never matches the
// lower-case common-noun entry "john" that sits in the same shard (docs/factory/issues/
// 24-test-cases.md, row A13). An empty `entries` marks the token unresolved: not an error, just
// nothing to carry forward (issue 20's "Not in scope"; `Engine::translate` turns this into
// `Status::partial`, issues 23 and 181).
struct LookupEntry {
  std::string_view surface;
  std::vector<DictionaryEntry> entries;

  [[nodiscard]] bool resolved() const { return !entries.empty(); }
};

// A dictionary entry's `features` pair using an attribute or a value `tagset.yaml` does not
// define. SPEC.md §3.3: a lookup-time warning, not a crash, the same severity `tools/validate`
// (issue 17) already gives this at M2 and M3.
struct TagsetWarning {
  std::string headword;
  std::int64_t id = 0;
  std::string attribute;
  std::string value;
};

// One language's dictionary store. `load()` reads `tagset.yaml` once; `lookup()` reads a
// `dictionary/<letter>.yaml` shard the first time a surface form needs it and keeps that shard's
// text cached for the rest of this instance's life (the real `eng` store is ~170 MB across 26
// shards -- reading only the shards a call site actually asks for, once each, is the difference
// between a lookup and a full-store load). Not thread-safe: the shard cache and the warning list
// are mutable state `lookup()` writes to. `Engine` (SPEC.md §3.4) is the type that promises
// thread safety; this helper does not make that promise.
class Dictionary {
 public:
  // `store_root` is `data/languages/<iso3>` (no trailing slash). `lang` names the language the
  // caller already knows `store_root` holds -- SPEC.md §3.3's `lang` field on every entry repeats
  // it, so `load()` does not need to parse that field back out. Never throws: a missing shard or
  // a missing `tagset.yaml` leaves lookups emptier, not broken.
  static Dictionary load(std::string_view store_root, Lang lang);

  // Every entry whose headword exactly matches `surface`, from the shard keyed by `surface`'s
  // first ASCII letter, lower-cased (`tools/importer`'s `shard_letter`, so `'n` is in `n.yaml`).
  // Empty when `surface` holds no ASCII letter (for example punctuation) or when nothing in that
  // shard matches.
  [[nodiscard]] std::vector<DictionaryEntry> lookup(std::string_view surface) const;

  // One `LookupEntry` per token, in the same order, each `LookupEntry::surface` the matching
  // `Token::surface` (SPEC.md §3.4, issue 19's `verstaan/tokeniser.hpp`).
  [[nodiscard]] std::vector<LookupEntry> lookup_tokens(const std::vector<Token>& tokens) const;

  // Issue 181, ADR 0023: every entry whose `uw` equals `uw` exactly, across every shard, in store
  // order -- shard `a` to `z`, file order within a shard. Generation's lexical choice reads this
  // (docs/factory/issues/181-test-cases.md, rows N48 to N50). Empty for an empty `uw`: a
  // closed-class record is found by headword, never by UW.
  [[nodiscard]] std::vector<DictionaryEntry> lookup_uw(std::string_view uw) const;

  // Every `features` pair a looked-up entry carried that used an attribute or a value
  // `tagset.yaml` does not define, one entry the first time `lookup()` returns it. Grows as
  // `lookup()` is called; empty until something is looked up.
  [[nodiscard]] const std::vector<TagsetWarning>& warnings() const { return warnings_; }

 private:
  Dictionary(std::string store_root, Lang lang, std::vector<std::string> tagset_keys);

  // One entry's place in the store: shard 0-25 and the byte offset of its `- headword:` line.
  struct UwLocation {
    int shard = 0;
    std::size_t offset = 0;
  };

  // The shard's text, read the first time it is asked for and cached.
  [[nodiscard]] const std::string& shard_text(int index) const;

  std::string store_root_;
  Lang lang_;
  std::vector<std::string> tagset_keys_;  // sorted; every key tagset.yaml defines, flat (SPEC.md
                                          // §3.3: the store's own attribute mnemonics and value
                                          // mnemonics share one namespace, tools/validate/store.py
                                          // `_tagset_keys`).

  mutable std::vector<std::string> shard_cache_;  // index 0-25 ('a'-'z'); empty string means "not
                                                  // loaded yet", not "shard is empty" (an absent
                                                  // shard file also caches as "" so it is not
                                                  // re-opened on every call).
  mutable std::vector<bool> shard_loaded_;        // index 0-25; true once shard_cache_[i] is set,
                                                  // whether or not the file existed.
  mutable std::vector<std::int64_t> warned_ids_;  // entry ids already counted in warnings_, so a
                                                  // word looked up twice does not warn twice.
  mutable std::vector<TagsetWarning> warnings_;

  mutable std::unordered_map<std::string, std::vector<UwLocation>> uw_index_;  // built by the
  mutable bool uw_indexed_ = false;  // first lookup_uw(); every entry with a non-empty uw.
};

}  // namespace verstaan
