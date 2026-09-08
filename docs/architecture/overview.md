# Architecture overview

Status: planned. Nothing in this page exists as code yet except the folders. Issue 06 brings it in
line with what M0 built; each later milestone updates its own section.

## The flow

Source text goes in one end and target text comes out the other, and every step in between is
either data or a rule that reads data:

1. **Tokenise.** Split the input into tokens using the source language's tagset rules. Planned
   for M3.
2. **Look up.** Each token finds its dictionary entries, with features and candidate UWs.
3. **Analyse.** The source language's analysis transformation grammar rewrites the token
   sequence, step by step, into a UNL graph. Disambiguation rules choose between candidates.
   The trace records every rule that fires.
4. **Generate.** The target language's generation transformation grammar rewrites the UNL graph
   into a token sequence. Subcategorisation frames place the arguments.
5. **Inflect.** The target's inflectional paradigms produce the surface word forms.
6. **Select.** Register, context and dialect tags on dictionary entries choose between
   synonyms at steps 2 and 4.

The engine is one C++ library that runs steps 1 to 6 against a rule set. The rule set reaches it
either as runtime tables (for authoring and tests) or as generated code (for shipping), and the
two must agree (ADR 0007).

## Components

| Component | Language | Depends on | Produces |
|---|---|---|---|
| `tools/mirror` | Python | the archive, credentials from env | `data/archive/` + manifest |
| `tools/importer` | Python | `data/archive/` | `data/languages/<iso3>/` |
| `tools/validate` | Python | the store | pass / fail, one line per problem |
| `tools/compiler` | Python | the store, `tiers.toml` | `engine/generated/<tier>/`, golden tests |
| `engine/` `verstaan_core` | C++20 | nothing at runtime | the API in `SPEC.md` §3.4 |
| `engine/generated/<tier>` `verstaan_data_<tier>` | generated C++ | compiler | tables the core links to |
| `apps/cli` | C++20 | core + one data lib | the `verstaan` command |

## Tiers

See ADR 0006. The compiler decides what goes into a tier; the engine never knows which tier it is
running except through the size of its tables and the `Engine::generated(Tier)` entry point.

## What is deliberately not here

- A neural model. See ADR 0001 and 0006.
- A database. The store is YAML in git. An SQLite index for the management UI is a later
  convenience built from the YAML, never the other way round.
- A network call in the engine.

## Related pages

- `docs/architecture/archive-inventory.md`, produced by issue 11.
- `docs/unl-reference/`, produced by issues 09 and 10.
