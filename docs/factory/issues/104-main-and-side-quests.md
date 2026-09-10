---
issue: 104
title: "Main quests and side quests apart, and a block that crosses the line is marked on both cards"
milestone: Side
status: done
depends_on: [103]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: e1c123f
worktree: null
github_issue: 40
---
## What

The quests room listed every quest in one column, main line and side quests mixed, and showed
`depends_on` as bare numbers with no word on whether they still block. The owner, 2026-09-10:
"can the quest screen be split between main quests and side quests. also side quests might block
main quests and vice versa, this needs to be clearly indicated. the skills for creating quests
should be aware of this."

## What changed

- The quests room is two halves: Main quests, grouped by milestone in first-seen order, and Side
  quests (`Side` and `Post-M6`, the server's own rule). The filters apply to both.
- Every card shows, under its loadout, `blocked by` (its own dependencies that are not done) and
  `blocks` (every open quest that lists it). Each link names the other quest's number, whether it
  is a main or side quest, and its status. A link that crosses the main/side line is marked ⚔ in
  the in-progress colour on both cards it joins. A done dependency blocks nothing and is not
  listed. The detail adds the same two rows with titles.
- `python -m tools.validate --all` gained `check_issue_dependencies`: every `depends_on` number
  must name an existing quest file, and never the quest itself. A dangling number would draw a
  block nothing can lift.
- Guidance for whoever writes a quest: `docs/factory/SPEC.md` §6 says `depends_on` may cross
  the line; `docs/factory/playbook.md` "The quest giver" says when it should; the factory-run
  skill gained "Writing a quest", which says to put a side quest's number into the main quest's
  `depends_on` when the main quest is the one waiting.

## Acceptance

- `/quests` has a Main quests region and a Side quests region; no quest appears in both.
- In the e2e fixture, side quest 10 waits on main quest 7 and main quest 8 waits on side quest
  9: all four cards show the ⚔ line in the right direction.
- `python -m tools.validate --all` exits 1 naming the file and the number for a dangling
  `depends_on`, and 0 on this repository.
- Playwright: `apps/console/e2e/main-and-side.spec.ts`. Pytest:
  `tools/validate/tests/test_dependencies.py`.
