---
issue: 125
title: "Drain the stuck exports one language at a time: Russian next"
milestone: Side
status: open
depends_on: [124]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 108
---
## What

Issue 124 drained Portuguese: `python -m tools.mirror retry --language por` landed every `por`
export the archive would give up in a single pass. `python -m tools.mirror stuck --next` now
names `rus` (Russian), the next answer from its fallback rule once the stuck language ahead of
it drains. The developer's ask from 2026-09-12 still holds: work through whatever `stuck --next`
names, one language, one quest, one PR at a time, until no language has a stuck export left —
the chain is not bounded to any fixed list, only to what the manifest says is stuck right now.

After this quest, Russian is drained the same way Portuguese was: `python -m tools.mirror retry
--language rus --passes 3 --pause-seconds 600` runs against the live archive until `rus` has no
`timeout` path left or the passes run out, its landed zips and manifest lines are in the work
commit, and the report carries every pass's summary line and the Russian `stuck` count before
and after. At its close, `/quest` writes issue 126 for whatever language `stuck --next` names
next, in this same shape, or the report says `stuck --next` printed nothing and the chain has
ended.

## Acceptance criteria

- `python -m tools.mirror stuck --next`, run before the live retry, prints `rus`.
- One live `retry --language rus` run, using the `stuck --next`, `retry --language`,
  `--passes` and `--pause-seconds` machinery issue 118 built, with the report giving every
  pass's summary line and the Russian `stuck` count before and after.
- The zips that landed and their manifest lines are in the work commit.
- Issue 126 exists for the language `stuck --next` names after the live run, written with
  `/quest`, with this quest in its `depends_on` and this section's shape — or the report
  records that `stuck --next` printed nothing and the chain has ended.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths. Any language other than Russian in this quest's live run. Changing the
`stuck --next` or `retry` machinery itself; issue 118 built it and this quest only runs it.
Editing `tools/mirror/tests/test_cli.py`'s `stuck --next` wiring test; issue 122 already made it
tolerant of the answer moving, so it needs no more updates as the chain continues. Running the
chain unattended from CI or a schedule; each quest is one `/factory-run`. Showing the chain in
the console.

## Done when

- [ ] Russian is drained as far as three passes allow: each pass's summary line and the Russian
      `stuck` count before and after are in the report, and the landed zips are in the work
      commit.
- [ ] Issue 126 for the next language is on `main`, or the report records that `stuck --next`
      printed nothing and the chain has ended.
- [ ] PR merged through the gate check.
