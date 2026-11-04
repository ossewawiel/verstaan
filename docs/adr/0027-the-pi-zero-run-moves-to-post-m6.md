# 0027 — The Pi Zero run moves to Post-M6

Date: 2026-11-04 · Status: Accepted

## Context

ADR 0006 says M4 must cross-build the `basic` tier for ARM and run it on a real Pi Zero, with
Argos Translate beside it. The run needs the owner's hardware and a benchmark harness for Argos.
Neither is part of the compiler or the tier tables, which are M4's work. Gate step 2 still
requires an `arm-basic` preset from M4 on.

## Decision

Flight plan D6 (owner, 2026-10-27) holds. The Pi Zero run and the Argos benchmark move to
Post-M6, as quest 205. M4 still cross-builds `arm-basic`, because gate step 2 needs that preset.
M4 measures the 64 MB budget on x86-64 only.

## Consequences

- M4 closes with the budget measured on x86-64. A Pi Zero 2 W has a different allocator and a
  different page size, so that figure is a proxy.
- ADR 0006's claim that the basic tier fits a Pi stays unproven until quest 205 runs.
- Argos stays a benchmark and never a path (ADR 0001). Its first measurement waits for 205.
- PLAN §7 moves the run from the M4 row to the Post-M6 row.
