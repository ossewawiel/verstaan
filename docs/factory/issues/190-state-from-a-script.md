---
issue: 190
title: "/factory-status computes STATE.md with a script, not a model"
milestone: Side
status: open
depends_on: [189]
agent: implementer
agents: [implementer]
model: haiku
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

`.claude/commands/factory-status.md` tells the model to read every issue file's frontmatter and
pick "last completed" and "next up" by hand. `/factory-run` runs those steps twice per quest, and
the merge path runs them once more. Each run reads 125 frontmatter blocks. The same calculation
already exists in code: `lastCompleted` and `nextIssue` in `tools/console/src/parse.mjs`. When the
model and the console disagree on "next up", the console shows one quest and the session boards
another. The owner accepted this as finding 07 of the flight plan on 2026-10-27.

After this quest, `python -m tools.factory.status` prints the four STATE.md fields and the
`Resume with:` line, and `--write` writes `docs/factory/STATE.md` for the merge path. The command
calls the script, so `/factory-status` costs no model reading. The loadout is Haiku at medium,
one step above the repeat-quest tier: this is new code, the gate catches what Haiku misses, and
medium is Haiku 5.5's own default. It is the first Haiku quest on fresh tooling, and the D4 lane
ships it.

## Acceptance criteria

- `python -m tools.factory.status` prints `Last completed:`, `Next up:`, `Branch / PR:` and
  `Resume with:`, in STATE.md's current layout. It exits 0 and writes nothing.
- `python -m tools.factory.status --write` writes `docs/factory/STATE.md`, and only that file.
- On the fixture repo under `tools/console/test/fixtures/`, the script and `parse.mjs` name the
  same last-completed and next-up issues. A pytest runs both and compares them; it skips with one
  line when `node` is missing.
- The script reports, before anything else, a `done` issue with `commit: null` and an open
  issue whose `depends_on` names a missing issue, as the command's step 7 does today.
- `.claude/commands/factory-status.md` steps 1 to 4 become one call to the script. Steps 5 to 7
  keep their meaning. `factory-run` and `git-workflow.md` name the script where they now name the
  steps.
- `python -m pytest tools/factory/tests -q` and `python -m tools.validate --changed` exit 0.

## Not in scope

The web console's own "next" logic in `apps/console/server/`, which reads the same files and keeps
its own code. Rendering `docs/factory/console/index.html`, which `generate.mjs` still does.

## Done when

- [ ] `tools.factory.status` prints the STATE fields and writes them with `--write`.
- [ ] A test proves the script and `parse.mjs` agree on the fixture repo.
- [ ] The script reports the two data faults the command reports today.
- [ ] `/factory-status`, `factory-run` and `git-workflow.md` call the script.
