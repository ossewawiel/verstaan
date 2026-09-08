# 0007 — One engine, two rule back ends, identical output

Date: 2026-09-08 · Status: Accepted

## Context

The owner wants rules scripted and tuned live, then "embedded and part of the source code so it
can really be as fast as C++ can deliver". Two separate implementations, an interpreter and a
compiled engine, would drift, and the tuning loop would then lie about what ships.

## Decision

There is one engine and one rule semantics. Rules reach it two ways: runtime tables built from
the YAML store (used for authoring, tests and the management tools), or generated code and
tables from the compiler (used for shipping). `tests/equivalence/` runs every corpus sentence
through both and diffs the text, the UNL graph and the rule trace. A difference is a gate
failure.

## Consequences

- Authoring never waits for a compile. Shipping never depends on a YAML parser.
- The rule interpreter is the reference implementation. The compiler's job is to reproduce it,
  faster and smaller, never to extend it.
- Checkpoint 3 in `PLAN.md` §6.3 is the first time generated tables replace runtime tables in a
  build, because that is where a silent divergence would start.
