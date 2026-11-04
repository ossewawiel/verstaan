---
issue: 32
title: "Three tiers build, their budgets are measured, and arm-basic cross-builds"
milestone: M4
status: open
depends_on: [29, 30, 212]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

SPEC §7 gives each tier a budget: basic 64 MB, phone 256 MB, connected unbounded. Nothing builds
the tiers apart, nothing measures memory, and no `arm-basic` preset exists, though gate step 2
requires one from M4. `tests/tier/` holds a placeholder. `tools/factory/hooks/gate_full.sh:24`
hard-codes its presets, so it does not know `arm-basic` either.

After this quest, the three tiers configure and build, each in the way quest 27's ADR says. Tests
under the label `tier` measure peak resident memory after load and across the golden rows, and
fail over budget. `arm-basic` cross-builds, and `gate_full.sh:24` lists it. ADR 0027 records that
the budget is measured on x86-64 only, so a Pi's allocator and page size are not in the figure.
Quest 212 comes first because finding F8 tied the cost bound to the budget work. The checkpoint
is 4 because the presets are a build contract.

## Acceptance criteria

- Three tiers configure and build, each as quest 27's ADR says.
- `tests/tier/` under label `tier` replaces the placeholder and fails over budget.
- Red proof: a budget set below the measured figure fails the test. Paste the failure.
- `arm-basic` cross-builds, and `file` on the binary prints `ARM aarch64`.
- `tools/factory/hooks/gate_full.sh` lists `arm-basic`.
- The budget figures are recorded under `## Verifier` in this issue.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Running on a Pi: quest 205. The CI leg: quest 203.

## Done when

- [ ] The three tiers configure and build.
- [ ] `tier` tests measure and enforce each budget.
- [ ] The red proof is pasted.
- [ ] `arm-basic` cross-builds and `file` prints `ARM aarch64`.
- [ ] `gate_full.sh` lists `arm-basic`.
- [ ] The budget figures are recorded under `## Verifier`.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
