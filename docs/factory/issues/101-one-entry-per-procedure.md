---
issue: 101
title: "One entry per procedure: the factory-run and factory-retro wrappers fold into their skills"
milestone: Side
status: done
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: b6cf14d
worktree: null
github_issue: null
---
## What

`/factory-run` and `/factory-retro` each lived twice: a thin wrapper under `.claude/commands/`
that said "run the skill", and the skill itself under `.claude/skills/`. Claude Code now lists
commands and skills in one namespace, so the picker showed each procedure twice. The owner,
2026-09-10: "it seems some of the local skills were duplicated, can you fix that?"

The wrappers go. Whatever they carried that the skill did not is now in the skill: the
`argument-hint` and the argument line for `factory-run`, the "propose only, one commit per
approved change" rule for `factory-retro`. `/factory-status` and `/gate` had no skill twin and
stay as commands.

## Acceptance

- `.claude/commands/` holds only `factory-status.md` and `gate.md`.
- `/factory-run 07` still reads the issue number: the skill's frontmatter carries
  `argument-hint` and its body names `$ARGUMENTS`.
- Both consoles' library lists (`apps/console/server/src/model/read.ts`,
  `tools/console/src/read.mjs`) no longer point at the deleted files.
- `docs/factory/PLAN.md` §6.1 names one location per procedure.
