// SPDX-License-Identifier: MPL-2.0
#include "verstaan/engine.hpp"

#include <algorithm>
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

// SPEC.md §3.4's fall-through mark: "⟦word⟧".
std::string mark_untranslated(std::string_view surface) {
  std::string marked = "⟦";
  marked += surface;
  marked += "⟧";
  return marked;
}

bool is_capitalised(std::string_view surface) {
  return !surface.empty() && surface.front() >= 'A' && surface.front() <= 'Z';
}

// A token starts a sentence when it is the first token or follows a sentence-final mark.
bool starts_sentence(const std::vector<Token>& tokens, std::size_t i) {
  if (i == 0) {
    return true;
  }
  const std::string_view previous = tokens[i - 1].surface;
  return previous == "." || previous == "!" || previous == "?";
}

bool is_noun(const DictionaryEntry& entry) {
  return std::ranges::any_of(entry.features, [](const Feature& feature) {
    return feature.first == "POS" && feature.second == "NOU";
  });
}

// Issue 196: a capitalised token is a name and enters the graph as a quoted literal, `"John"`.
// A non-initial capital is a literal whatever the dictionary holds, so `John` never takes the
// common noun `john`. A sentence-initial capital first tries its exact form, then its lower-case
// form (`The` -> `the`), and is a literal when neither resolves or the lower-case form is only
// ever a noun (`John` -> `john`). The pronoun `I` is the
// one capitalised closed-class word, so it stays a dictionary lookup.
// Rewrites `lookups[i].entries` for the lower-case retry and returns the literal flags.
std::vector<bool> apply_name_literals(const std::vector<Token>& tokens,
                                      const Dictionary& dictionary,
                                      std::vector<LookupEntry>& lookups) {
  std::vector<bool> literal(tokens.size(), false);
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    const std::string_view surface = tokens[i].surface;
    if (!is_capitalised(surface) || surface == "I") {
      continue;
    }
    if (!starts_sentence(tokens, i)) {
      literal[i] = true;
      lookups[i].entries.clear();
      continue;
    }
    if (lookups[i].resolved()) {
      continue;
    }
    std::string lower(surface);
    lower.front() = static_cast<char>(lower.front() - 'A' + 'a');
    std::vector<DictionaryEntry> retry = dictionary.lookup(lower);
    // A lower-case reading that is only ever a noun (`john`) is a name here, not a word.
    if (std::ranges::any_of(retry, [](const DictionaryEntry& entry) { return !is_noun(entry); })) {
      lookups[i].entries = std::move(retry);
    } else {
      literal[i] = true;
    }
  }
  return literal;
}

// One `Position` per token: every dictionary entry as a candidate (issue 20's homograph carry-
// forward), or, for a token with no entry, one literal-only candidate so a grammar rule matching
// on `surface` alone can still see it and so `disambiguate()` is never handed an empty position.
std::vector<Position> build_positions(const std::vector<Token>& tokens,
                                      const std::vector<LookupEntry>& lookups,
                                      const std::vector<bool>& literal) {
  std::vector<Position> positions;
  positions.reserve(tokens.size());
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    Position position;
    if (lookups[i].resolved()) {
      for (const DictionaryEntry& entry : lookups[i].entries) {
        std::vector<Feature> features = entry.features;
        features.emplace_back(std::string(kUwFeatureKey), entry.uw);
        position.candidates.push_back(Candidate{
            .surface = std::string(tokens[i].surface),
            .features = std::move(features),
            .attributes = {},
        });
      }
    } else if (literal[i]) {
      std::string quoted = "\"";
      quoted += tokens[i].surface;
      quoted += '"';
      Candidate name{.surface = std::string(tokens[i].surface), .features = {}, .attributes = {}};
      name.features.emplace_back(std::string(kUwFeatureKey), std::move(quoted));
      position.candidates.push_back(std::move(name));
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
// against the `from` dictionary (issue 20, `rules_.from_store_root()`), disambiguates, runs the
// tree pass (issue 180, ADR 0017: make_forest, analyse_tree, read_graph) and reports a real Status.
// `data/languages/afr/grammar/generation.yaml` is a UNL relational tree grammar and no method
// applies it yet (docs/factory/issues/181 owns generation). Until then, `text` echoes each resolved
// token's own surface form and marks every unresolved one with SPEC.md §3.4's `⟦word⟧`, so
// Status::partial's contract holds without claiming a generation step it does not implement.
Result Engine::translate(std::string_view text, Options options) const {
  Result result;

  // Engine::generated (the compiled-tables back end, M4, ADR 0007) keeps its M0 stub status:
  // "Not in scope" on docs/factory/issues/23-options-result-status-and-trace.md names it
  // explicitly, and only Engine::load sets is_runtime_backed_. `result` was just constructed, so
  // its `status` field still carries Result's own default (SPEC.md §3.4, engine.hpp) -- returning
  // it here needs no further assignment.
  if (!is_runtime_backed_) {
    return result;
  }

  // SPEC.md §3.4's fourth Status value is reserved for a Lang/Register/Context combination no
  // store covers yet. Only eng-to-afr, neutral register, no context is wired by this issue -- the
  // one direction RuleSet::load and issue 22's stores name. `result.status` still holds its
  // just-constructed default, the same value this fourth Status member names, so returning it
  // unmodified reports the gap correctly.
  if (options.from != Lang::eng || options.to != Lang::afr || options.reg != Register::neutral ||
      options.ctx != Context::none) {
    return result;
  }

  const std::vector<Token> tokens = tokenise(text);
  if (tokens.empty()) {
    // Nothing to segment into a graph, not even a partial one: SPEC.md §3.4's no_parse.
    result.status = Status::no_parse;
    return result;
  }

  const Dictionary from_dictionary = Dictionary::load(rules_.from_store_root(), options.from);
  std::vector<LookupEntry> lookups = from_dictionary.lookup_tokens(tokens);
  const std::vector<bool> literal = apply_name_literals(tokens, from_dictionary, lookups);

  std::vector<Position> positions = build_positions(tokens, lookups, literal);

  const RuleInterpreter interpreter(rules_);
  interpreter.disambiguate(positions, result.trace);

  std::vector<Candidate> nodes;
  nodes.reserve(positions.size());
  for (Position& position : positions) {
    nodes.push_back(std::move(position.candidates.front()));
  }
  TreeResult tree = interpreter.analyse_tree(make_forest(std::move(nodes)), result.trace);
  // Unreachable today: make_forest builds a readable forest. Guards a later change to the tree
  // pass.
  const bool no_parse =
      tree.status == Status::no_parse || read_graph(tree.forest, result.unl) == Status::no_parse;

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
  if (no_parse) {
    result.status = Status::no_parse;
    result.unl = Graph{};
  } else {
    result.status = any_unresolved ? Status::partial : Status::ok;
  }
  return result;
}

}  // namespace verstaan
