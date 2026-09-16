---
issue: 175
title: "Ship systems: a read-only room that shows the factory's own agents, skills, hooks and encounter path"
milestone: M7
status: open
depends_on: [173]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 260
---
## What

The party the console already shows (quest 164's Console room) names the five agents by their
loadout, but nothing in the console shows how an encounter actually runs: which skills exist,
which commands an owner can type, which hooks fire on which event, or the order a checkpoint and
a gate follow through `playbook.md`. The console-as-CIC brief asks for a ship-systems room that
makes the factory's own machinery visible, the same way a bridge makes a starship's status
visible to its crew.

After this quest a new room reads, read-only, four sources already on disk: `.claude/agents/*.md`
front matter (name, description, model, effort, tools, colour), `.claude/skills/*/SKILL.md` front
matter (name, description, argument-hint), `.claude/commands/*.md`, and `.claude/hooks/*` cross-
referenced against the hook events named in `.claude/settings.json`. A fifth panel renders
`docs/factory/playbook.md`'s encounter path (the sequence an encounter, a checkpoint, a gate and
a level follow) as one lane, station to station. Nothing here writes anything; the room is
instrumentation, not control. Adding a new agent or skill file needs no console change: the room
lists whatever the four folders currently hold on next page load.

## Acceptance criteria

- The server parses `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/commands/*.md`
  front matter with the same YAML-front-matter parser the issue-file reader already uses, no new
  dependency.
- `.claude/hooks/*` files are listed against the hook events named in `.claude/settings.json`
  (`PreToolUse`, `PostToolUse`, or whatever events that file currently registers); an event with
  no matching hook file, or a hook file matching no event, renders as a visible gap, not silently
  dropped.
- The playbook lane renders `playbook.md`'s encounter → checkpoint → gate → level sequence as
  a horizontal lane of stations, station names taken from the file's own headings.
- A test adds a fixture agent file under a scratch `.claude/agents/` fixture (or stubs the read
  path) and asserts it appears in the room's response on the next load, with no code change.
- The room makes no `POST`, `PUT`, `DELETE` or job-runner call; a Playwright test asserts no
  network write request fires when the room loads.
- `/gate` and CI green.

## Not in scope

Editing any agent, skill, command or hook file from the console. The codex (quest 176). Any
change to `kinds.ts`.

## Done when

- [ ] Room lists every `.claude/agents/*.md` entry with name, description, model, effort and
      tools.
- [ ] Room lists every `.claude/skills/*/SKILL.md` entry and every `.claude/commands/*.md`
      entry.
- [ ] Room lists `.claude/hooks/*` cross-referenced against `settings.json` events, with gaps
      visible.
- [ ] The playbook's encounter → checkpoint → gate → level path renders as one lane.
- [ ] Adding an agent file appears on next load with no console code change.
- [ ] `/gate` and CI green.

Source: `docs/decisions/2026-09-16-console-as-cic/handoff.md`, quest table row 3.
