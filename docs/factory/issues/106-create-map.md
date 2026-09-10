---
issue: 106
title: "The create-map skill: a new map is a new line of main quests, planned through interrogation, ADRs and PLAN §7 before any quest is written"
milestone: Side
status: open
depends_on: [105]
agent: docs-writer
agents: [docs-writer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 44
---
## What

The project has one map: the six milestones in `PLAN.md` §7, written once from the interrogation
brief under `docs/decisions/`. Nothing since has added a milestone. `/quest` (issue 105) writes one
quest at a time and is forbidden to touch the milestone table, so a new line of main quests, a
dictionary and word-management app for UNL for one, has no path into the project except a person
editing `PLAN.md` by hand. The owner, 2026-09-10: "this is like in the game a new map is created
with different main quests. this will probably result into multiple milestones like a new
dictionary word management app for unl etc. so it needs rigorous planning and A&D artifacts and
docs to get it done."

`/create-map` is that path. It is the one skill allowed to extend `PLAN.md` §7, and it earns
that by never reaching the table before the thinking is on disk. It runs in four stages, each
producing a file a reviewer can read, and it stops for the owner's yes between every stage:

1. **Interrogate.** `/interrogation-time` (a global skill from `ossewawiel/ai-skills`, in the
   house style) grills the seed until the map's goal, its boundaries and its options are written.
   The living brief lands under `docs/decisions/<map-slug>/` as the record of why, the same shape
   `docs/decisions/` has for the whole plan.
2. **Decide.** Every architecture choice the brief settled becomes one ADR under `docs/adr/`,
   title is the decision. Where a choice is still open, `/investigation-time` (same repo) writes
   the decision brief first; `/system-critique` is used when the map changes an existing part.
3. **Map.** New milestone rows in `PLAN.md` §7: name, branch, goal, issue range, one row per
   milestone, appended after M6 or interleaved only with the owner's explicit yes per row. A
   milestone gets its own planning quest, the shape issue 12 has for M2.
4. **Quest.** Inside that planning quest, `/quest` writes each main quest's issue file, one call
   per file, with the loadout and the cross-line dependencies the quest skill already enforces.

The global skills are a dependency of this machine, not of the repository: install them with
`git clone https://github.com/ossewawiel/ai-skills && bash ai-skills/install.sh`, then append
`CLAUDE-snippet.md` to `~/.claude/CLAUDE.md`. The skill checks they exist before stage 1 and says
how to install them if not.

## Acceptance criteria

- `.claude/skills/create-map/SKILL.md` exists with an `argument-hint`, and `/create-map` appears
  once in the picker.
- The skill names its four stages, the file each stage writes and where, and the owner's yes
  between them. It never writes a `PLAN.md` §7 row or an issue file without that yes.
- The skill checks for `~/.claude/skills/investigation-time`, `~/.claude/skills/system-critique`
  and `~/.claude/commands/interrogation-time.md`, and prints the install lines above when any is
  missing, then stops.
- `docs/factory/PLAN.md` §6.1 lists `/create-map`; `docs/factory/playbook.md` "The quest giver"
  says a new map goes through it; `.claude/skills/quest/SKILL.md` "What this skill never does"
  points at it for milestone changes; both consoles' Library lists include it.
- A dry run on a throwaway seed produces a brief under `docs/decisions/<slug>/`, at least one
  ADR, and a proposed §7 row, and stops before writing the row, showing it for approval.

## Not in scope

- Any actual new map. The first real run, the UNL dictionary and word-management app, is its
  own `/create-map` session after this quest merges.
- Changing `/quest`, the routing table or the agent files. If a map needs a new party member,
  the map's own ADR says so and a later quest adds it.
- Mirroring `docs/decisions/` or ADRs to GitHub. Only issue files are mirrored.

## Done when

- [ ] The skill file is written and loads.
- [ ] The dependency check on the three global skills works both ways: present and absent.
- [ ] PLAN.md §6.1, the playbook, the quest skill and both consoles point at it.
- [ ] The dry run leaves a brief, an ADR and an unapplied §7 row, and its files are removed.
- [ ] `python -m tools.validate --all` and both consoles' tests pass.
