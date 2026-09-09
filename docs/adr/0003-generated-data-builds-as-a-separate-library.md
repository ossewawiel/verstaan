# 0003 — Generated data builds as a separate library

Date: 2026-09-08 · Status: Accepted

## Context

The compiler turns CC BY-SA dictionaries and grammars into C++ tables. Under CC BY-SA, that
output is an adaptation of the data and carries the data licence, whatever licence the engine has.
If generated code were pasted into engine source, the boundary between MPL-2.0 and CC BY-SA
would blur inside one compilation unit.

## Decision

The compiler emits one static library per tier, `verstaan_data_<tier>`, under
`engine/generated/<tier>/`, with a licence header naming CC BY-SA 4.0. Each tier carries its own
generated `tables.hpp` (SPEC.md §3.5); there is no single fixed header under `engine/include/` —
the engine links against whichever tier's library `Engine::generated(Tier)` selects and never
copies generated content into engine source. Generated files are never edited by hand.

## Consequences

- The engine builds and its tests run against a tiny fixture data library, so engine work does
  not wait on the compiler.
- A shipped binary carries two licences, and a `NOTICE` file in each app names both.
- `.gitignore` does not exclude `engine/generated/`; committed generated output is how a tier
  build is reproducible without Python. The compiler's full gate check regenerates and diffs.
