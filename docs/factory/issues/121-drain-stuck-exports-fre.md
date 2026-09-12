---
issue: 121
title: "Drain the stuck exports one language at a time: French next"
milestone: Side
status: done
depends_on: [120]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: 15d9ed0
worktree: null
github_issue: 96
---
## What

Issue 120 drained German: `python -m tools.mirror retry --language ger` landed every `ger`
export the archive would give up in a single pass, and `python -m tools.mirror stuck --next`
now prints `fre`, the last language in `mirror.toml`'s `[retry]` priority list,
`["eng", "dut", "ger", "fre"]`. The developer's ask from 2026-09-12 still holds: work through
the priority list one language, one quest, one PR at a time, then whatever `stuck --next` names
once the list is drained, until no language has a stuck export left.

After this quest, French is drained the same way German was: `python -m tools.mirror retry
--language fre --passes 3 --pause-seconds 600` runs against the live archive until `fre` has no
`timeout` path left or the passes run out, its landed zips and manifest lines are in the work
commit, and the report carries every pass's summary line and the French `stuck` count before and
after. At its close, `/quest` writes issue 122 for whatever language `stuck --next` names next,
in this same shape, or the report says `stuck --next` printed nothing and the chain has ended —
`fre` is the last name in `[retry]`'s priority list, so this quest may be the one that ends it.

## Acceptance criteria

- `python -m tools.mirror stuck --next`, run before the live retry, prints `fre`.
- One live `retry --language fre` run, using the `stuck --next`, `retry --language`,
  `--passes` and `--pause-seconds` machinery issue 118 built, with the report giving every
  pass's summary line and the French `stuck` count before and after.
- The zips that landed and their manifest lines are in the work commit.
- Issue 122 exists for the language `stuck --next` names after the live run, written with
  `/quest`, with this quest in its `depends_on` and this section's shape — or the report
  records that `stuck --next` printed nothing and the chain has ended.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths. Any language other than French in this quest's live run. Changing the
`stuck --next` or `retry` machinery itself; issue 118 built it and this quest only runs it.
Running the chain unattended from CI or a schedule; each quest is one `/factory-run`. Showing
the chain in the console.

## Done when

- [x] French is drained as far as three passes allow: each pass's summary line and the French
      `stuck` count before and after are in the report, and the landed zips are in the work
      commit.
- [ ] Issue 122 for the next language is on `main`, or the report records that `stuck --next`
      printed nothing and the chain has ended.
- [ ] PR merged through the gate check.
