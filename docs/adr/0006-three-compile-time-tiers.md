# 0006 — Three compile-time tiers, the first two rules-only

Date: 2026-09-08 · Status: Accepted

## Context

The owner wants "basic comms" on a Raspberry Pi Zero, a bigger vocabulary and rule set on
phones, and everything available online, choosing languages per device to keep it small. A Pi
Zero 2 W has 512 MB, which a distilled neural model also fits, so the size claim must be measured,
not assumed.

## Decision

Three tiers, selected at build time by `tiers.toml`: `basic` (two languages, top-N dictionary,
64 MB budget, ARMv8), `phone` (any language set, full dictionary, 256 MB), `connected` (all
languages and corpora, unbounded). `basic` and `phone` are rules-only. A neural fallback, if it
ever exists, is a `connected`-tier feature in `apps/service/`, switched on by a trigger that will
be defined no earlier than M5 and recorded as its own ADR.

## Consequences

- M4 must cross-build `basic` for ARM and run it on a real Pi Zero, with Argos beside it.
- Every tier build produces its own golden test set from the same corpus.
- "Last resort" stays honest because nothing below `connected` can call out.
