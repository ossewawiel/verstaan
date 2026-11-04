---
issue: 206
title: "An include-boundary lint and a coverage floor join the gate"
milestone: Side
status: open
depends_on: []
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

Issue 115 promised sensors once M3 had engine code. M3 has it, and the gate has none of them. The
owner chose two on 2026-11-04 and wrote "no" to mutation testing. The reason sits under issue
188's `## Verifier`: the 2026-09-11 brief says mutation score tracks real faults only weakly, and
no C++ mutation tool is verified on our legs.

After this quest, a lint refuses a direct include of `engine/generated/` from engine source
(ADR 0003), with an error text that names the fix. Coverage is measured for `verstaan_core` on one
Linux leg, recorded as a floor in a tracked file, and may not drop. `docs/standards/testing.md`
regains a coverage line that names the floor file, not a fixed percentage. M4 starts to stress the
boundary, which is why quest 30 waits on this one.

## Acceptance criteria

- The lint fails on an added `#include` of a generated file from `engine/src` or `engine/include`.
  Paste the failure; its text names the fix.
- The coverage floor fails when a test is deleted. Paste the failure.
- Both run in `/gate` and in `gate.yml`.
- The floor sits in a tracked file, and the hand-off states its first figure.
- `docs/standards/testing.md` names the floor file.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Mutation testing, written "no" under issue 188.

## Done when

- [ ] Both sensors run in `/gate` and `gate.yml`.
- [ ] Both red proofs are pasted.
- [ ] The first floor figure is stated.
- [ ] `docs/standards/testing.md` names the floor file.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
