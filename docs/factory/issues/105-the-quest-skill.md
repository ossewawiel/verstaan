---
issue: 105
title: "The quest giver as a skill: /quest plans one quest with the developer and writes its issue file"
milestone: Side
status: done
depends_on: [104]
agent: docs-writer
agents: [docs-writer]
model: sonnet
effort: low
checkpoint: null
commit: 579c3e2
worktree: null
github_issue: null
---
## What

A quest entered the project by whoever was at the keyboard writing an issue file from memory of
`SPEC.md` §6. The four side quests of 2026-09-10 each came out a slightly different shape, and
nothing helped decide the number, the milestone, the loadout or the dependencies before the file
existed. The playbook's quest giver had no tool. The owner, 2026-09-10: "this is basically the
place where new features and work is planned and added."

`/quest` is that tool. It reads STATE.md, PLAN.md §7 and every issue's frontmatter, proposes
the number, kind, milestone, loadout, dependencies and checkpoint with reasons, asks only what
the files cannot answer, writes the file in the house voice with a counted Done when list, runs
`tools.validate --all`, and hands over the command to start it. It never starts the work.

## Acceptance criteria

- `.claude/skills/quest/SKILL.md` exists, with `argument-hint`, and `/quest` appears once in
  the picker.
- The skill's decision table names a source for every frontmatter field and says when to ask.
- The file reaches `main` before the work starts, and the skill says why: on its own through
  a `quest-NN-<slug>` branch, gate and PR, or inside a running planning quest's work commit.
- `docs/factory/PLAN.md` §6.1 lists `/quest`; the playbook's quest giver names it; the
  factory-run skill's "Writing a quest" points to it; both consoles' library lists include it.

## Not in scope

- Editing PLAN.md §7 milestone ranges, ADRs or agent files from the skill. It stops and says so.
- A batch mode. A milestone's issues are written inside their planning quest (issue 12's shape),
  one `/quest` per file.

## Done when

- [x] The skill file is written and loads.
- [x] PLAN.md §6.1, the playbook and the factory-run skill point at it.
- [x] Both consoles list it in the Library.
- [x] `python -m tools.validate --all` and both consoles' tests pass.
