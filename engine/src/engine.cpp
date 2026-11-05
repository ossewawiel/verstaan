// SPDX-License-Identifier: MPL-2.0
#include "verstaan/engine.hpp"

#include <algorithm>
#include <cstddef>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "unicode_lu.hpp"
#include "unicode_utf8.hpp"
#include "verstaan/dictionary.hpp"
#include "verstaan/lang.hpp"
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

bool has_noun_lex(const DictionaryEntry& entry) {
  return std::ranges::any_of(entry.features, [](const Feature& feature) {
    return feature.first == "LEX" && feature.second == "N";
  });
}

int best_priority(const std::vector<DictionaryEntry>& entries) {
  int best = 0;
  for (const DictionaryEntry& entry : entries) {
    best = std::max(best, entry.priority);
  }
  return best;
}

// ADR 0030, step 1: a form that is noun-only with `priority` 0 on every entry counts as no word.
bool counts_as_no_word(const std::vector<DictionaryEntry>& entries) {
  return std::ranges::all_of(
      entries, [](const DictionaryEntry& entry) { return is_noun(entry) && entry.priority == 0; });
}

// What the name pass decided: which tokens are name literals, and the surface each candidate
// carries (the lower-case form when that form won, the token otherwise).
struct NameDecision {
  std::vector<bool> literal;
  std::vector<std::string> surface;
  std::vector<bool> later_capital;  // capitalised, not sentence-initial
};

// ADR 0030 (issues 196, 207). A token is capitalised when its first character is Unicode `Lu`.
// A later capital reads its exact form only: a record, else a name. A sentence-initial capital
// reads the lower-case form first, and the exact form wins only on a strictly higher priority.
// Rewrites `lookups[i].entries` and returns the literal flags and candidate surfaces.
NameDecision apply_name_literals(const std::vector<Token>& tokens, const Dictionary& dictionary,
                                 std::vector<LookupEntry>& lookups) {
  NameDecision decision;
  decision.literal.assign(tokens.size(), false);
  decision.later_capital.assign(tokens.size(), false);
  for (const Token& token : tokens) {
    decision.surface.emplace_back(token.surface);
  }
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    const std::string_view surface = tokens[i].surface;
    const Utf8CodePoint lead = decode_leading_code_point(surface);
    if (lead.length == 0 || !is_upper_case(lead.code)) {
      continue;
    }
    if (!starts_sentence(tokens, i)) {
      decision.later_capital[i] = true;
      decision.literal[i] = !lookups[i].resolved();
      continue;
    }
    std::vector<DictionaryEntry> lower_entries;
    std::string lower;
    const char32_t lower_code = simple_lower_case(lead.code);
    if (lower_code != 0) {
      append_utf8(lower, lower_code);
      lower.append(surface.substr(lead.length));
      lower_entries = dictionary.lookup(lower);
      if (counts_as_no_word(lower_entries)) {
        lower_entries.clear();
      }
    }
    const bool has_exact = lookups[i].resolved();
    const bool has_lower = !lower_entries.empty();
    if (!has_exact && !has_lower) {
      decision.literal[i] = true;
    } else if (has_lower &&
               (!has_exact || best_priority(lookups[i].entries) <= best_priority(lower_entries))) {
      lookups[i].entries = std::move(lower_entries);
      decision.surface[i] = std::move(lower);
    }
  }
  return decision;
}

// One `Position` per token: every dictionary entry as a candidate (issue 20's homograph carry-
// forward), or, for a token with no entry, one literal-only candidate so a grammar rule matching
// on `surface` alone can still see it and so `disambiguate()` is never handed an empty position.
std::vector<Position> build_positions(const std::vector<Token>& tokens,
                                      const std::vector<LookupEntry>& lookups,
                                      const std::vector<bool>& literal,
                                      const std::vector<std::string>& surfaces,
                                      const std::vector<bool>& later_capital) {
  std::vector<Position> positions;
  positions.reserve(tokens.size());
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    Position position;
    if (lookups[i].resolved()) {
      // Bare tag: lets eng-dis-11's (CAP) test find a later capital that only reads as a noun
      // (ADR 0030). A reading that is no noun, as in `English` or `I`, keeps the tag off.
      const bool all_nouns = std::ranges::all_of(lookups[i].entries, has_noun_lex);
      for (const DictionaryEntry& entry : lookups[i].entries) {
        std::vector<Feature> features = entry.features;
        features.emplace_back(std::string(kUwFeatureKey), entry.uw);
        if (later_capital[i] && all_nouns) {
          features.emplace_back("CAP", "");
        }
        position.candidates.push_back(Candidate{
            .surface = surfaces[i],
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
      // Bare tag: lets a grammar rule's (TEMP) test find a name literal (issue 198, rule 182).
      name.features.emplace_back("TEMP", "");
      position.candidates.push_back(std::move(name));
    } else {
      position.candidates.push_back(
          Candidate{.surface = std::string(tokens[i].surface), .features = {}, .attributes = {}});
    }
    positions.push_back(std::move(position));
  }
  return positions;
}

bool has_uw(const TreeNode& node) {
  const auto uw = std::ranges::find_if(
      node.features, [](const Feature& feature) { return feature.first == kUwFeatureKey; });
  return uw != node.features.end() && !uw->second.empty();
}

// nodes[1..n] are the n tokens in order (make_forest); every node a rule creates sits after them.
bool is_token_node(std::size_t index, std::size_t token_count) {
  return index >= 1 && index <= token_count;
}

// One source surface per graph node, in `read_graph`'s order (ADR 0025). A token node shows the
// word as typed, even when the lower-case form won the candidate (ADR 0030).
std::vector<std::string> graph_surfaces(const Forest& forest, const std::vector<Token>& tokens) {
  std::vector<std::string> surfaces;
  for (std::size_t k = 0; k < forest.nodes.size(); ++k) {
    const TreeNode& node = forest.nodes[k];
    if (node.deleted || !has_uw(node)) {
      continue;
    }
    surfaces.push_back(is_token_node(k, tokens.size()) ? std::string(tokens[k - 1].surface)
                                                       : node.surface);
  }
  return surfaces;
}

}  // namespace

// Runtime-tables back end (issue 22's RuleInterpreter). Tokenises (issue 19), looks every token up
// against the `from` dictionary (issue 20, `rules_.from_store_root()`), disambiguates, runs the
// tree pass (issue 180, ADR 0017: make_forest, analyse_tree, read_graph) and then the generation
// pass (issue 181, ADR 0021: `RuleInterpreter::generate`) against the `to` dictionary
// (`rules_.to_store_root()`). `text` is the generated text, then SPEC.md §3.4's `⟦word⟧` mark for
// every source token that has no dictionary entry and is no name (ADR 0025); `Status::partial`
// when `text` holds a mark.
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
  // store covers. The loaded RuleSet names its pair (ADR 0029); anything else, and any register
  // or context before M5, is not implemented. `result.status` still holds its just-constructed
  // default, the same value this fourth Status member names, so returning it unmodified reports
  // the gap correctly.
  const std::optional<Lang> loaded_from = rules_.from_lang();
  const std::optional<Lang> loaded_to = rules_.to_lang();
  if (!loaded_from.has_value() || !loaded_to.has_value() || options.from != *loaded_from ||
      options.to != *loaded_to || options.reg != Register::neutral ||
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
  const NameDecision names = apply_name_literals(tokens, from_dictionary, lookups);
  const std::vector<bool>& literal = names.literal;

  std::vector<Position> positions =
      build_positions(tokens, lookups, literal, names.surface, names.later_capital);

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

  if (no_parse) {
    result.status = Status::no_parse;
    result.unl = Graph{};
    return result;
  }

  const std::vector<std::string> surfaces = graph_surfaces(tree.forest, tokens);
  const Dictionary to_dictionary = Dictionary::load(rules_.to_store_root(), options.to);
  GenerationResult generated =
      interpreter.generate(result.unl, to_dictionary, surfaces, options.to, result.trace);

  result.text = std::move(generated.text);
  for (std::size_t i = 0; i < tokens.size(); ++i) {
    if (lookups[i].resolved() || literal[i] || is_punctuation_token(tokens[i].surface)) {
      continue;
    }
    if (!result.text.empty()) {
      result.text += ' ';
    }
    result.text += mark_untranslated(tokens[i].surface);
  }
  result.status = result.text.find("⟦") != std::string::npos ? Status::partial : Status::ok;
  return result;
}

}  // namespace verstaan
