---
issue: 205
title: "Run the basic tier on a Pi Zero 2 W with Argos beside it"
milestone: Post-M6
status: open
depends_on: [32]
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

ADR 0006 claims the basic tier fits a Pi Zero 2 W in 64 MB, and says Argos Translate runs beside
it as a benchmark. ADR 0027 moved that run out of M4 on 2026-11-04 (flight plan D6, owner,
2026-10-27). Quest 32 measures the budget on x86-64 only, so the claim is unproven. It needs the
owner's hardware.

The measurement is a manual step on the owner's hardware. After this quest, the same sentences go through Verstaan's basic tier and through an Argos model on
the device. The issue records peak memory and translation time for each. Either ADR 0006's budget
holds, or a finding is filed. The checkpoint is 4 because the result can reopen ADR 0006.

## Acceptance criteria

- Both figures, peak memory and translation time, are in this issue for each system.
- Each figure is measured on the Pi Zero 2 W, and the issue names the sentence set.
- The issue states whether ADR 0006's 64 MB budget holds, or links the finding.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Argos as a translation path: ADR 0001 keeps it a benchmark. The `arm-basic` cross-build: quest 32.

## Done when

- [ ] Both figures are in the issue, measured on the device.
- [ ] ADR 0006's budget holds, or a finding is filed.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
