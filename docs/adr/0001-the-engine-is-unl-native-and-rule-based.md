# 0001 — The engine is UNL-native and rule-based

Date: 2026-09-08 · Status: Accepted

## Context

Four engine shapes were on the table: a UNL-native rule engine, an Apertium port, an offline
neural model, and a domain-narrow phrasebook. The owner's answer to "why deterministic" was that
determinism is fast, that it is the one thing this project may have over the rest, and that the
point is to see how far rules can go and to keep the UNL initiative alive.

## Decision

The engine is a deterministic, UNL-based rule engine, and the engine is the product. Apertium's
shallow transfer drops the interlingua and is struck. Neural translation is struck as the engine;
it may return as a last-resort layer in the connected tier only, behind a measured trigger (ADR
0006). The phrasebook is struck as a product but its shape, a closed vocabulary with full
coverage, is the right first build of the basic tier.

## Consequences

- Every output traces to a rule. The CLI's `--trace` flag is a first-class feature.
- Time to a convincing demo is set by rule capture speed. The first slice must be narrow.
- Argos Translate runs beside the engine in M4 as a benchmark, never as a path.
