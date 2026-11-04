---
issue: 216
title: "Next up names the lowest open blocker, and Last completed names the latest close"
milestone: Side
status: open
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 342
---
## What

`next_issue` in `tools/factory/status.py:105-110` and `nextIssue` in
`tools/console/src/parse.mjs:65-68` never pick a `Side` issue. M4 waits on Side quests 201, 207,
208, 210 and 211. So after 27 and 28, `STATE.md` says "none, no open quest has every dependency
done" while 211 is ready to run, and the console's `next` is empty. Separately, `last_completed`
takes the highest done number, so after quest 27 merges it still says #202.

After this quest, when the lowest open main quest is blocked, both name its lowest open blocker
that has every dependency done, walking through blockers of blockers. The rule exists in more than
one place, so the implementer finds every copy, including any under `apps/console/`, and changes
them together. Last completed takes the done issue whose `commit:` has the latest commit date. The
fallback is the highest number when a commit is missing or unreadable.

## Acceptance criteria

- A pytest and a console test each prove a main quest blocked by a side quest gives the blocker.
- The same walk through this repository's real issue files names 27 today.
- In the test fixture, with 27 and 28 done, the walk names a side quest.
- The same pytest proves Last completed takes the latest commit date, and falls back to the highest
  number when a commit is missing or unreadable.
- `grep -rn "next_issue\|nextIssue" tools apps` lists no copy of the old rule.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Changing how a quest's status is stored. The console's layout.

## Done when

- [ ] A pytest proves a main quest blocked by a side quest gives the blocker.
- [ ] A console test proves the same.
- [ ] The real issue files name 27 today, and a side quest once 27 and 28 are done in the fixture.
- [ ] A pytest proves Last completed and its fallback.
- [ ] Every copy of the rule changes together (`grep` above).
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
