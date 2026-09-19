// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API addition, not a change to Engine's existing shape (engine/CLAUDE.md: an ADR guards a
// change to the public API, not every addition to it -- the same precedent verstaan/dictionary.hpp
// set at issue 20). Gives `class RuleSet;` (forward-declared for `Engine::load`, SPEC.md §3.4) a
// real shape: one language pair's grammar, loaded the way `Dictionary::load` loads a store
// (verstaan/dictionary.hpp).
//
// `RuleSet::load(from_store_root, to_store_root)` reads `from_store_root`'s
// `grammar/{disambiguation,analysis,inflection,subcategorisation}.yaml` (the analysis-direction
// grammar, docs/factory/issues/22-rule-interpreter-on-runtime-tables.md) and `to_store_root`'s
// `grammar/{generation,inflection}.yaml` (the generation-direction grammar). Never throws: a
// missing or empty grammar file (SPEC.md §3.3, `data/languages/eng/grammar/disambiguation.yaml`
// is `[]`, docs/unl-reference/formats/disambiguation.md "Where eng has no export") leaves that
// rule list empty, not broken -- exactly `Dictionary::load`'s contract for a missing shard.

#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace verstaan {

// One grammar record, `data/languages/<iso3>/grammar/*.yaml`'s shape (SPEC.md §3.2, §3.3):
// `{id, kind, lhs, rhs, conditions, comment, source}`. `conditions` is always `[]` at M3
// (SPEC.md §3.2: "the archive embeds every condition inside lhs"), so this struct does not carry
// it; `source` is provenance `tools/validate` (issue 17) already reports on, not something the
// interpreter reads at runtime -- the same choice `DictionaryEntry` made for its own `source`
// field (verstaan/dictionary.hpp).
struct GrammarRule {
  std::string id;
  std::string kind;  // analysis | generation | inflection | subcategorisation | disambiguation
  std::string lhs;
  std::string rhs;
  std::string comment;
};

// One language pair's grammar, runtime tables (SPEC.md §3.4, ADR 0007). `load()` does file I/O;
// once built, every rule list is fixed, so reading a built `RuleSet` from many threads is safe.
class RuleSet {
 public:
  RuleSet() = default;

  // `from_store_root` and `to_store_root` are `data/languages/<iso3>` (no trailing slash), e.g.
  // "data/languages/eng" and "data/languages/afr" for the eng-to-afr pipeline SPEC.md §3.4 and
  // issue 25 target.
  static RuleSet load(std::string_view from_store_root, std::string_view to_store_root);

  // Programmatic construction, skipping the store-reading `load()` path: a domain test builds a
  // `RuleSet` this way, in memory, per docs/standards/testing.md ("Domain tests are pure: no file
  // I/O"); `load()` stays the only production path, the same split `dictionary_lookup_test.cpp`
  // draws between real-store tests and pure ones, mirrored here for the interpreter's own tests.
  static RuleSet from_rules(std::vector<GrammarRule> disambiguation,
                            std::vector<GrammarRule> analysis,
                            std::vector<GrammarRule> from_inflection,
                            std::vector<GrammarRule> subcategorisation,
                            std::vector<GrammarRule> generation,
                            std::vector<GrammarRule> to_inflection);

  [[nodiscard]] const std::vector<GrammarRule>& disambiguation() const { return disambiguation_; }
  [[nodiscard]] const std::vector<GrammarRule>& analysis() const { return analysis_; }
  [[nodiscard]] const std::vector<GrammarRule>& from_inflection() const { return from_inflection_; }
  [[nodiscard]] const std::vector<GrammarRule>& subcategorisation() const {
    return subcategorisation_;
  }
  [[nodiscard]] const std::vector<GrammarRule>& generation() const { return generation_; }
  [[nodiscard]] const std::vector<GrammarRule>& to_inflection() const { return to_inflection_; }

 private:
  RuleSet(std::vector<GrammarRule> disambiguation, std::vector<GrammarRule> analysis,
          std::vector<GrammarRule> from_inflection, std::vector<GrammarRule> subcategorisation,
          std::vector<GrammarRule> generation, std::vector<GrammarRule> to_inflection)
      : disambiguation_(std::move(disambiguation)),
        analysis_(std::move(analysis)),
        from_inflection_(std::move(from_inflection)),
        subcategorisation_(std::move(subcategorisation)),
        generation_(std::move(generation)),
        to_inflection_(std::move(to_inflection)) {}

  std::vector<GrammarRule> disambiguation_;
  std::vector<GrammarRule> analysis_;
  std::vector<GrammarRule> from_inflection_;
  std::vector<GrammarRule> subcategorisation_;
  std::vector<GrammarRule> generation_;
  std::vector<GrammarRule> to_inflection_;
};

}  // namespace verstaan
