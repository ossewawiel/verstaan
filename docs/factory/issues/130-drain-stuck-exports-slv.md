---
issue: 130
title: "Drain the stuck exports one language at a time: Slovenian next"
milestone: Side
status: open
depends_on: [129]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

Issue 129 drained Persian: `python -m tools.mirror retry --language per` landed every `per`
export the archive would give up in a single pass. `python -m tools.mirror stuck --next` now
names `slv` (Slovenian), the next answer from its fallback rule once the stuck language ahead of
it drains. The developer's ask from 2026-09-12 still holds: work through whatever `stuck --next`
names, one language, one quest, one PR at a time, until no language has a stuck export left —
the chain is not bounded to any fixed list, only to what the manifest says is stuck right now.

After this quest, Slovenian is drained the same way Persian was: `python -m tools.mirror retry
--language slv --passes 3 --pause-seconds 600` runs against the live archive until `slv` has no
`timeout` path left or the passes run out, its landed zips and manifest lines are in the work
commit, and the report carries every pass's summary line and the Slovenian `stuck` count before
and after. At its close, `/quest` writes issue 131 for whatever language `stuck --next` names
next, in this same shape, or the report says `stuck --next` printed nothing and the chain has
ended.

## Acceptance criteria

- `python -m tools.mirror stuck --next`, run before the live retry, prints `slv`.
- One live `retry --language slv` run, using the `stuck --next`, `retry --language`,
  `--passes` and `--pause-seconds` machinery issue 118 built, with the report giving every
  pass's summary line and the Slovenian `stuck` count before and after.
- The zips that landed and their manifest lines are in the work commit.
- Issue 131 exists for the language `stuck --next` names after the live run, written with
  `/quest`, with this quest in its `depends_on` and this section's shape — or the report
  records that `stuck --next` printed nothing and the chain has ended.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths. Any language other than Slovenian in this quest's live run. Changing
the `stuck --next` or `retry` machinery itself; issue 118 built it and this quest only runs it.
Editing `tools/mirror/tests/test_cli.py`'s `stuck --next` wiring test; issue 122 already made it
tolerant of the answer moving, so it needs no more updates as the chain continues. Running the
chain unattended from CI or a schedule; each quest is one `/factory-run`. Showing the chain in
the console.

## Done when

- [ ] Slovenian is drained as far as three passes allow: each pass's summary line and the
      Slovenian `stuck` count before and after are in the report, and the landed zips are in
      the work commit.
- [ ] Issue 131 for the next language is on `main`, or the report records that `stuck --next`
      printed nothing and the chain has ended.
- [ ] PR merged through the gate check.
