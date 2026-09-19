// SPDX-License-Identifier: MPL-2.0
#include "verstaan/engine.hpp"

#include <cstddef>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "verstaan/dictionary.hpp"
#include "verstaan/rule_interpreter.hpp"
#include "verstaan/rule_set.hpp"
#include "verstaan/tokeniser.hpp"

namespace verstaan {

Engine Engine::load(const RuleSet& rules) { return Engine(rules); }

Engine Engine::generated(Tier /*tier*/) { return {}; }

namespace {

// Tokeniser rules 2 and 3 (docs/factory/issues/19-test-cases.md) emit one split-punctuation mark
// or one boundary apostrophe as its own one-byte token; neither ever carries a dictionary entry
// by design (SPEC.md §3.3 shards `a`-`z` only), so neither counts toward Status::partial's "no
// dictionary entry" test.
bool is_punctuation_token(std::string_view surface) {
  if (surface.size() != 1) {
    return false;
  }
  static constexpr std::string_view kPunctuationBytes = ".,!?;:'";
  return kPunctuationBytes.find(surface.front()) != std::string_view::npos;
}

// The UW attached to a resolved candidate, carried through `features` under a reserved key
// (Candidate's shape, verstaan/rule_interpreter.hpp, has no dedicated UW field) rather than a new
// public struct member.
constexpr std::string_view kUwFeatureKey = "$uw";

std::string find_uw(const std::vector<Feature>& features) {
  for (const Feature& feature : features) {
    if (feature.first == kUwFeatureKey) {
      return feature.second;
    }
  }
  return {};
}

// SPEC.md §3.4's fall-through mark: "⟦word⟧".
std::string mark_untranslated(std::string_view surface) {
  std::string marked = "⟦";
  marked += surface;
  marked += "⟧";
  return marked;
}

// One `Position` per token: every dictionary entry as a candidate (issue 20's homograph carry-
// forward), or, for a token with no entry, one literal-only candidate so a grammar rule matching
// on `surface` alone can still see it and so `disambiguate()` is never handed an empty position.
std::vector<Position> build_positions(const std::vector<Token>& tokens,
                                      const std::vector<LookupEntry>& lookups) {
  std::vector<Position> positions;
  positions.reserve(tokens.size());
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    Position position;
    if (lookups[i].resolved()) {
      for (const DictionaryEntry& entry : lookups[i].entries) {
        std::vector<Feature> features = entry.features;
        features.emplace_back(std::string(kUwFeatureKey), entry.uw);
        position.candidates.push_back(Candidate{.surface = std::string(tokens[i].surface),
                                                .features = std::move(features),
                                                .attributes = {}});
      }
    } else {
      position.candidates.push_back(
          Candidate{.surface = std::string(tokens[i].surface), .features = {}, .attributes = {}});
    }
    positions.push_back(std::move(position));
  }
  return positions;
}

}  // namespace

// Runtime-tables back end (issue 22's RuleInterpreter). Tokenises (issue 19), looks every token up
// against the `from` dictionary (issue 20, `rules_.from_store_root()`), disambiguates and analyses
// (issue 22) and reports a real Status. `data/languages/afr/grammar/generation.yaml` is a UNL
// relational tree grammar -- a different shape from the LL-rule sequences RuleInterpreter::analyse
// applies to a flat node list -- and RuleInterpreter carries no method that applies it
// (docs/factory/issues/25-english-to-unl-to-afrikaans-pipeline.md is where that back end lands).
// Until then, `text` echoes each resolved token's own surface form and marks every unresolved one
// with SPEC.md §3.4's `⟦word⟧`, so Status::partial's contract holds without this issue claiming a
// generation step it does not implement.
Result Engine::translate(std::string_view text, Options options) const {
  Result result;

  // Engine::generated (the compiled-tables back end, M4, ADR 0007) keeps its M0 stub status:
  // "Not in scope" on docs/factory/issues/23-options-result-status-and-trace.md names it
  // explicitly, and only Engine::load sets is_runtime_backed_.
  if (!is_runtime_backed_) {
    return result;  // Status::not_implemented, Result's own default (SPEC.md §3.4).
  }

  // SPEC.md §3.4: not_implemented is reserved for a Lang/Register/Context combination no store
  // covers yet. Only eng-to-afr, neutral register, no context is wired by this issue -- the one
  // direction RuleSet::load and issue 22's stores name.
  if (options.from != Lang::eng || options.to != Lang::afr || options.reg != Register::neutral ||
      options.ctx != Context::none) {
    result.status = Status::not_implemented;
    return result;
  }

  const std::vector<Token> tokens = tokenise(text);
  if (tokens.empty()) {
    // Nothing to segment into a graph, not even a partial one: SPEC.md §3.4's no_parse.
    result.status = Status::no_parse;
    return result;
  }

  const Dictionary from_dictionary = Dictionary::load(rules_.from_store_root(), options.from);
  const std::vector<LookupEntry> lookups = from_dictionary.lookup_tokens(tokens);

  std::vector<Position> positions = build_positions(tokens, lookups);

  const RuleInterpreter interpreter(rules_);
  interpreter.disambiguate(positions, result.trace);

  std::vector<Candidate> nodes;
  nodes.reserve(positions.size());
  for (Position& position : positions) {
    nodes.push_back(std::move(position.candidates.front()));
  }
  const std::vector<Candidate> analysed = interpreter.analyse(std::move(nodes), result.trace);

  bool any_unresolved = false;
  std::string rendered;
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    if (!rendered.empty()) {
      rendered += ' ';
    }
    if (lookups[i].resolved() || is_punctuation_token(tokens[i].surface)) {
      rendered += tokens[i].surface;
    } else {
      any_unresolved = true;
      rendered += mark_untranslated(tokens[i].surface);
    }
  }

  result.text = std::move(rendered);
  result.status = any_unresolved ? Status::partial : Status::ok;
  result.unl.nodes.reserve(analysed.size());
  for (const Candidate& node : analysed) {
    result.unl.nodes.push_back(Node{.uw = find_uw(node.features), .attributes = node.attributes});
  }
  return result;
}

}  // namespace verstaan
