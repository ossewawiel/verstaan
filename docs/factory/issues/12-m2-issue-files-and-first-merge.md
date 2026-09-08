---
issue: 12
title: "Write the M2 issue files from the inventory, gate and merge M1"
milestone: M1
status: open
depends_on: [11]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: null
github_issue: 12
---
## What

Using `PLAN.md` §7 and the inventory, write issues 13 to 18 for M2 in the shape of these files:
the canonical data model as a schema, the dictionary importer, the grammar importer, the tagset
and corpus importers, the validator, and the M2 close-out. Then `/factory-retro`, `/gate`, the
verifier, and merge `m1-mirror`.

## Acceptance criteria

- Each M2 issue has acceptance criteria a test can check and names the export files it parses.
- The data-model issue lists every field in `SPEC.md` §3.2 and §3.3 and marks any the inventory
  shows the archive does not have.
- `/gate` passes with the stamp; verifier report attached under `## Verifier`.
- The merge runs from the `m1-mirror` worktree, and once it lands, that worktree is removed from
  the root tree: `git worktree remove .worktrees/m1-mirror && git branch -d m1-mirror`.

## Not in scope

Starting any M2 issue.

## Done when

- [ ] Six new issue files, `STATE.md` shows #13 as next.
- [ ] `main` contains the M1 merge.
- [ ] `.worktrees/m1-mirror` removed and the branch deleted after the merge.
