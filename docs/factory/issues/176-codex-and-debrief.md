---
issue: 176
title: "Codex and debrief: issue files as briefings, lessons grouped for promotion"
milestone: M7
status: done
depends_on: [175]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: 31dfc8d
worktree: null
github_issue: 261
---
## What

The Quests room (quest 99, restyled by quest 164) reads an issue file as a table row: number,
title, status, loadout. The console-as-CIC brief wants that same file read at a higher density,
as a briefing an owner reads before a run and an after-action report an owner reads after one.
Density here follows `docs/standards/writing.md`'s table: the codex is human-facing and carries
the mechanism, not a terse status line.

After this quest, opening a quest from the codex renders its issue file as a briefing: an
objective (the `## What` section's second paragraph, the outcome sentence), intel (the ADRs and
glossary terms the file cites, linked), a loadout (agent, model, effort, checkpoint, the same
fields the Quests room already has), orders (`## Acceptance criteria` and `## Not in scope`, read
as instructions), and an after-action section that fills in once the quest closes (`## Done when`
against the closing commit, and the `## Verifier` section if one exists). A companion Debrief
room reads `lessons.jsonl` (written by `/factory-retro`) and groups entries by their `sig` field,
newest group first, so a repeated failure signature is visible as a group, not forty scattered
rows. A Promote job kind runs `/factory-retro`'s promotion path and writes nothing to any rule or
standards file until the owner approves the specific group on screen; approval is the only write
trigger.

## Acceptance criteria

- The codex page for a quest renders five named sections (objective, intel, loadout, orders,
  after-action) sourced from the issue file's existing headings and front matter; no new file
  format, no field invented that the issue schema does not already carry.
- Intel links resolve: an ADR citation in `## What` renders as a link to that ADR file; a
  glossary term renders as a link into `docs/glossary.md` if the term is a heading there.
- The Debrief room reads `lessons.jsonl`, groups rows by `sig`, sorts groups by most recent entry
  first, and shows each group's count.
- A `lesson-promote` job kind exists in `kinds.ts`, behind the Host check, `validateArgs` refuses
  a `sig` not present in `lessons.jsonl`; running it invokes `/factory-retro`'s promotion path and
  a test asserts no file under `docs/standards/` or `docs/adr/` changes until the job completes
  with an explicit owner-approved flag set.
- `/gate` and CI green.

## Not in scope

The atlas (quest 177). Editing an issue file's body from the codex — read-only, same as ship
systems. Any new lesson-writing path; `/factory-retro` already writes `lessons.jsonl`.

## Done when

- [ ] Codex briefing view: objective, intel (linked ADRs and glossary), loadout, orders,
      after-action.
- [ ] Debrief groups `lessons.jsonl` by `sig`, newest group first, with a count per group.
- [ ] Promote is a job kind that runs `/factory-retro`'s promotion path.
- [ ] Promote writes nothing until the owner approves the group.
- [ ] `/gate` and CI green.

Source: `docs/decisions/2026-09-16-console-as-cic/handoff.md`, quest table row 4.
