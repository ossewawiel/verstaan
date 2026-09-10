---
name: create-map
description: Plans a new map, a new line of main quests that PLAN.md §7 does not cover yet, through interrogation, ADRs, new §7 milestone rows and their planning quests. Use when the owner proposes a new direction PLAN.md §7 does not name, wants a new milestone line, or says something like "this needs a new map" or "a new dictionary app". Never starts the work itself.
argument-hint: [a sentence naming the new map's seed]
---

Seed: `$ARGUMENTS`. Empty means ask what the new map is for.

## What this skill is for

`PLAN.md` §7 has one map: the milestones the interrogation brief under `docs/decisions/` produced.
`/quest` (issue 105) writes one quest at a time and is forbidden to touch §7, so a new line of
main quests has no path into the project except a person editing `PLAN.md` by hand. This skill is
that path. It is the one skill allowed to extend §7, and it earns that by never reaching the table
before the thinking is on disk.

It runs four stages. Each stage writes one kind of file to one place. The skill stops after every
stage and waits for the owner's yes before it starts the next one. It never writes a `PLAN.md` §7
row or an issue file without that yes, shown to the owner first.

## 0. Check the dependency

Before stage 1, check these three paths exist:

- `~/.claude/skills/investigation-time`
- `~/.claude/skills/system-critique`
- `~/.claude/commands/interrogation-time.md`

If any is missing, print:

```
git clone https://github.com/ossewawiel/ai-skills && bash ai-skills/install.sh
```

then say to append `CLAUDE-snippet.md` to `~/.claude/CLAUDE.md`, and stop. These are a dependency
of this machine, not of the repository; every developer running `/create-map` installs them once.

## 1. Interrogate

Run `/interrogation-time` (global skill) on the seed. It grills the seed until the map's goal,
its boundaries and its options are written down, the same way the original interrogation produced
the whole plan.

Writes: a living brief under `docs/decisions/<map-slug>/`, the slug from the seed, kebab-case.

Stop. Show the brief. Wait for the owner's yes before stage 2.

## 2. Decide

Every architecture choice the brief settled becomes one ADR under `docs/adr/`, in the shape of
`docs/adr/0001-*.md`: Context, Decision, Consequences, half a page, title is the decision.

Where a choice is still open, `/investigation-time` (global skill) writes the decision brief
first, before an ADR is written from it. `/system-critique` (global skill) runs when the map
changes an existing part of the project, not just adds a new one.

Writes: one or more files under `docs/adr/`.

Stop. Show every ADR title and its one-line decision. Wait for the owner's yes before stage 3.

## 3. Map

Propose new rows for `PLAN.md` §7: name, branch, goal, issue range. One row per milestone.
Default placement is appended after the last milestone; interleaving an earlier position needs
the owner's explicit yes on that row, not just on the stage.

Each new milestone gets its own planning quest, the shape issue 12 has for M2: one issue file
that, when run, writes the milestone's main quest issue files in turn.

Writes: nothing yet. This stage produces a proposed diff to `PLAN.md` §7 and shows it.

Stop. Show the proposed rows, unapplied. Wait for the owner's yes, per row if rows are
interleaved, before the row is written and before stage 4 starts.

## 4. Quest

Inside the new planning quest, call `/quest` once per issue file the milestone needs, with the
loadout and the cross-line `depends_on` that `/quest` already works out and enforces (its own
"Plan: ask only what cannot be inferred" step). This skill does not write issue files directly;
`/quest` does, one call at a time.

Writes: one issue file per call, through `/quest`'s own path to `main` (SKILL.md §4 of `/quest`).

## Dry run

A dry run on a throwaway seed stops after stage 3: it leaves a brief under
`docs/decisions/<slug>/`, at least one ADR under `docs/adr/`, and a proposed §7 row shown for
approval, and it stops there. It never writes the row and never calls `/quest`. Every throwaway
file a dry run creates is removed once the reviewer has seen the shape.

## What this skill never does

- Write a `PLAN.md` §7 row without the owner's yes on that row.
- Write an issue file itself. Only `/quest`, called from stage 4, does that.
- Start the work. That is `/factory-run`.
- Edit `/quest`, the routing table, or any `.claude/agents/*.md` file. If a map needs a new
  party member, the map's own ADR says so and a later quest adds it.
- Mirror `docs/decisions/` or an ADR to GitHub. Only issue files are mirrored.
