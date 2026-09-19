// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API. SPEC.md §3.4. Changing this file needs an ADR (engine/CLAUDE.md).
//
// M0 status: every Engine method returns Status::not_implemented (docs/standards/testing.md).
// No translation behaviour lands until later issues make these bodies real.

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "verstaan/rule_set.hpp"

namespace verstaan {

// Every public enum fixes its base type at std::uint8_t. These travel inside Options and Result,
// and a tier build packs them into generated tables, so the width is part of the shape, not an
// accident of the compiler's default (docs/standards/cpp.md: performance-* warnings are errors).

// Source/target language, by ISO 639-3 code. SPEC.md §1: eng and afr at M3, nld seeded at M6.
enum class Lang : std::uint8_t { eng, afr, nld };

// Word-choice tag on dictionary entries (docs/glossary.md: Register).
enum class Register : std::uint8_t { neutral, formal, informal, technical };

// Domain tag on dictionary entries (docs/glossary.md: Context). `none` is the default; the open
// set of domain values (medical, rescue, ...) is defined by the store, not the engine, so this
// enum grows as tiers need it.
enum class Context : std::uint8_t { none, medical, rescue };

// Compile-time build profile (ADR 0006).
enum class Tier : std::uint8_t { basic, phone, connected };

// SPEC.md §3.4. `not_implemented` is the M0 stub value; every real Engine method retires it.
enum class Status : std::uint8_t { ok, partial, no_parse, not_implemented };

struct Options {
  Lang from;
  Lang to;
  Register reg = Register::neutral;
  Context ctx = Context::none;
};

// One edge of a UNL graph: a relation label between two nodes, by index into Graph::nodes.
struct Relation {
  std::string label;
  std::size_t from = 0;
  std::size_t to = 0;
};

// One UW (Universal Word) with its attributes, e.g. "@past", "@def".
struct Node {
  std::string uw;
  std::vector<std::string> attributes;
};

// The interlingua form (docs/glossary.md: UNL graph).
struct Graph {
  std::vector<Node> nodes;
  std::vector<Relation> relations;
};

// One rule firing, in order. SPEC.md §3.4: the audit trail behind the CLI `--trace` flag.
struct TraceEntry {
  std::string rule;
};

struct Trace {
  std::vector<TraceEntry> entries;
};

struct Result {
  std::string text;
  Graph unl;
  Trace trace;
  Status status = Status::not_implemented;
};

// Runtime rule table (verstaan/rule_set.hpp, issue 22). `Engine::load` takes it by reference and
// keeps its own copy.

// Const after construction and safe to call from many threads (docs/standards/cpp.md).
class Engine {
 public:
  // Load runtime tables (interpreted rules, no compile step).
  static Engine load(const RuleSet& rules);

  // Load compiled tables for one tier (engine/generated/<tier>, SPEC.md §3.5).
  static Engine generated(Tier tier);

  [[nodiscard]] Result translate(std::string_view text, Options options) const;

 private:
  Engine() = default;
  explicit Engine(RuleSet rules) : rules_(std::move(rules)) {}

  // The runtime tables this Engine was built from (empty for Engine::generated and the M0
  // default). Not read by `translate()` yet -- issue 23 wires `Engine::translate` against it,
  // per SPEC.md §3.4's `not_implemented` note ("every real Engine method retires it").
  RuleSet rules_;
};

}  // namespace verstaan
