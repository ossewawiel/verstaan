#pragma once

// Public API. SPEC.md §3.4. Changing this file needs an ADR (engine/CLAUDE.md).
//
// M0 status: every Engine method returns Status::not_implemented (docs/standards/testing.md).
// No translation behaviour lands until later issues make these bodies real.

#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

namespace verstaan {

// Source/target language, by ISO 639-3 code. SPEC.md §1: eng and afr at M3, nld seeded at M6.
enum class Lang { eng, afr, nld };

// Word-choice tag on dictionary entries (docs/glossary.md: Register).
enum class Register { neutral, formal, informal, technical };

// Domain tag on dictionary entries (docs/glossary.md: Context). `none` is the default; the open
// set of domain values (medical, rescue, ...) is defined by the store, not the engine, so this
// enum grows as tiers need it.
enum class Context { none, medical, rescue };

// Compile-time build profile (ADR 0006).
enum class Tier { basic, phone, connected };

// SPEC.md §3.4. `not_implemented` is the M0 stub value; every real Engine method retires it.
enum class Status { ok, partial, no_parse, not_implemented };

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

// Runtime rule table, built by a later issue. Forward-declared here: `Engine::load` takes it by
// reference without needing its definition.
class RuleSet;

// Const after construction and safe to call from many threads (docs/standards/cpp.md).
class Engine {
 public:
  // Load runtime tables (interpreted rules, no compile step).
  static Engine load(const RuleSet& rules);

  // Load compiled tables for one tier (engine/generated/<tier>, SPEC.md §3.5).
  static Engine generated(Tier tier);

  Result translate(std::string_view text, Options options) const;

 private:
  Engine() = default;
};

}  // namespace verstaan
