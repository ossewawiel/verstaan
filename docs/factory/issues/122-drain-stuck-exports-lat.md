---
issue: 122
title: "Drain the stuck exports one language at a time: Latin next"
milestone: Side
status: done
depends_on: [121]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: 8d1b40a
worktree: null
github_issue: 99
---
## What

Issue 121 drained French: `python -m tools.mirror retry --language fre` landed every `fre`
export the archive would give up in a single pass. That run also drained the last name in
`mirror.toml`'s `[retry]` priority list, `["eng", "dut", "ger", "fre"]` — every priority
language now has zero `timeout` paths. `python -m tools.mirror stuck --next` no longer answers
from that list; its fallback rule, the stuck language with the most base forms, now names `lat`
(Latin). The developer's ask from 2026-09-12 still holds: work through whatever `stuck --next`
names, one language, one quest, one PR at a time, until no language has a stuck export left —
the chain was never bounded to the four priority names, only started there.

After this quest, Latin is drained the same way French was: `python -m tools.mirror retry
--language lat --passes 3 --pause-seconds 600` runs against the live archive until `lat` has no
`timeout` path left or the passes run out, its landed zips and manifest lines are in the work
commit, and the report carries every pass's summary line and the Latin `stuck` count before and
after. At its close, `/quest` writes issue 123 for whatever language `stuck --next` names next,
in this same shape, or the report says `stuck --next` printed nothing and the chain has ended.

## Acceptance criteria

- `python -m tools.mirror stuck --next`, run before the live retry, prints `lat`.
- One live `retry --language lat` run, using the `stuck --next`, `retry --language`,
  `--passes` and `--pause-seconds` machinery issue 118 built, with the report giving every
  pass's summary line and the Latin `stuck` count before and after.
- The zips that landed and their manifest lines are in the work commit.
- Issue 123 exists for the language `stuck --next` names after the live run, written with
  `/quest`, with this quest in its `depends_on` and this section's shape — or the report
  records that `stuck --next` printed nothing and the chain has ended.
- `/gate` and CI green.

## Not in scope

Retrying `error` paths. Any language other than Latin in this quest's live run. Changing the
`stuck --next` or `retry` machinery itself; issue 118 built it and this quest only runs it.
Running the chain unattended from CI or a schedule; each quest is one `/factory-run`. Showing
the chain in the console.

## Done when

- [x] Latin is drained as far as three passes allow: each pass's summary line and the Latin
      `stuck` count before and after are in the report, and the landed zips are in the work
      commit.
- [ ] Issue 123 for the next language is on `main`, or the report records that `stuck --next`
      printed nothing and the chain has ended.
- [ ] PR merged through the gate check.
