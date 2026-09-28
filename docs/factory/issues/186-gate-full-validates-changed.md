---
issue: 186
title: "gate_full.sh validates the stores the branch changed, not every store"
milestone: Side
status: open
depends_on: [168]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 287
---
## What

Issue 168 changed the gate to validate only the stores a branch touches:
`python -m tools.validate --changed --base origin/main`. `/gate` step 3 and `gate.yml` follow that
rule. `tools/factory/hooks/gate_full.sh` line 80 still runs `python -m tools.validate --all`. A
branch that changes one console file therefore sweeps all 175 MB of archive data. It also fails
on mirrored data that ADR 0013 says never blocks a merge. The 2026-09-16 engine-test-data brief
names this as a repair.

After this quest, `gate_full.sh` runs the same validate command as `/gate` step 3.

## Acceptance criteria

- `tools/factory/hooks/gate_full.sh` runs `python -m tools.validate --changed --base origin/main`
  and no longer runs `--all`.
- A test under `tools/factory/` fails if `gate_full.sh` names `--all` again.
- `/gate`, `gate.yml` and `gate_full.sh` name one validate command. `docs/standards/testing.md`
  names it once, if it names it at all.

## Not in scope

The `--all` flag itself, which stays for deliberate data work. The carved engine-test fixtures
from the same brief, which the M3 close-out (issue 188) decides.

## Done when

- [ ] `gate_full.sh` validates changed stores only.
- [ ] A test pins the command.
