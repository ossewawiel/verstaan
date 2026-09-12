---
issue: 119
title: "Drain the stuck exports one language at a time: Dutch next"
milestone: Side
status: open
depends_on: [118]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 89
---
## What

Issue 118 drained English: `python -m tools.mirror retry --language eng` landed every `eng`
export the archive would give up, and `python -m tools.mirror stuck --next` now prints `dut`,
the next language in `mirror.toml`'s `[retry]` priority list, `["eng", "dut", "ger", "fre"]`.
The developer's ask from 2026-09-12 still holds: work through the priority list one language,
one quest, one PR at a time, then whatever `stuck --next` names once the list is drained, until
no language has a stuck export left.

After this quest, Dutch is drained the same way English was: `python -m tools.mirror retry
--language dut --passes 3 --pause-seconds 600` runs against the live archive until `dut` has no
`timeout` path left or the passes run out, its landed zips and manifest lines are in the work
commit, and the report carries every pass's summary line and the Dutch `stuck` count before and
after. At its close, `/quest` writes issue 120 for whatever language `stuck --next` names next,
in this same shape, or the report says `stuck --next` printed nothing and the chain has ended.

## Acceptance criteria

- `python -m tools.mirror stuck --next`, run before the live retry, prints `dut`.
- One live `retry --language dut` run, using the `stuck --next`, `retry --language`,
  `--passes` and `--pause-seconds` machinery issue 118 built, with the report giving every
  pass's summary line and the Dutch `stuck` count before and after.
- The zips that landed and their manifest lines are in the work commit.
- Issue 120 exists for the language `stuck --next` names after the live run, written with
  `/quest`, with this quest in its `depends_on` and this section's shape — or the report
  records that `stuck --next` printed nothing and the chain has ended.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths. Any language other than Dutch in this quest's live run; each later
language is its own quest in the chain. Changing the `stuck --next` or `retry` machinery itself;
issue 118 built it and this quest only runs it. Running the chain unattended from CI or a
schedule; each quest is one `/factory-run`. Showing the chain in the console.

## Done when

- [ ] Dutch is drained as far as three passes allow: each pass's summary line and the Dutch
      `stuck` count before and after are in the report, and the landed zips are in the work
      commit.
- [ ] Issue 120 for the next language is on `main`, or the report records that `stuck --next`
      printed nothing and the chain has ended.
- [ ] PR merged through the gate check.
