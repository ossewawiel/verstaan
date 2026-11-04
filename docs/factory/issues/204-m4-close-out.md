---
issue: 204
title: "M4 close-out: retro, verifier, tag m4, write the next quests"
milestone: M4
status: open
depends_on: [27, 28, 29, 30, 31, 32, 203]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: null
worktree: null
github_issue: 330
---
## What

M1, M2 and M3 each closed with a quest that tagged `main` and wrote the next milestone's quests
(issue 188 is the latest). M4 needs the same, or nothing tags `m4` and M5 has no issue files.

After this quest, `/factory-retro` has run and its proposals sit under `## Verifier` with the
owner's answers. The verifier has read `git diff m3...main` and its findings are listed, each
fixed or given its own quest. M5's quests wait on the desktop UI technology (`verstaan.md` open
question 6), so this quest writes the M5 quests that do not need it, and asks the owner about that
one. It takes the shape of issue 188. `main` is tagged `m4` after this issue's commit merges.

## Acceptance criteria

- `/factory-retro` has run, and each proposal has the owner's answer under `## Verifier`.
- The verifier report covers `git diff m3...main`, and each finding is fixed or has a quest.
- The M5 quests that do not need the UI technology exist, each with a tile in `map.yaml`.
- The owner's answer on the UI technology is recorded.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Starting any M5 quest. Quest 205, the Pi run, which is Post-M6.

## Done when

- [ ] The retro and verifier results are under `## Verifier`.
- [ ] The M5 quests exist, with a tile each.
- [ ] The UI-technology question is answered or recorded as open.
- [ ] `main` carries the tag `m4`.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
