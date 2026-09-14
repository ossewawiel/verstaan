---
issue: 18
title: "M2 close-out: gate, verifier, merge m2-store"
milestone: M2
status: open
depends_on: [17]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: null
worktree: null
github_issue: 227
---
## What

Once issues 13 to 17 land on `m2-store`, run `/factory-retro`, then `/gate`, then the verifier, and
merge `m2-store` into `main`, following the shape of issue 12's own close-out. Write the M3 issue
files (19 to 26, per `PLAN.md` §7's "M3 Engine slice" row) from what M2's importer and validator
found in the real `afr` and `eng` stores — in particular, which grammar gaps issue 15 logged
(`disambiguation.yaml` empty, the `44`/`47.tgrammar.txt` direction guess for Afrikaans) that a
rule-author should resolve before M3 writes engine-facing rules against them.

## Acceptance criteria

- `data/languages/afr/` and `data/languages/eng/` each hold a complete store per `SPEC.md` §3.3's
  tree: dictionary shards, five grammar files, `tagset.yaml`, `corpus/ugoa1.yaml`, `meta.yaml`.
- `python -m tools.validate --all` runs clean (exit 0, warnings only) and its report is attached
  under this issue's `## Verifier` section.
- Each M3 issue has acceptance criteria a test can check and names the store files it reads.
- `/gate` passes with the stamp; verifier report attached under `## Verifier`.
- The merge runs from the `m2-store` worktree, and once it lands, that worktree is removed from
  the root tree: `git worktree remove .worktrees/m2-store && git branch -d m2-store`.

## Not in scope

Starting any M3 issue.

## Done when

- [ ] Eight new issue files (19-26), `STATE.md` shows #19 as next.
- [ ] `main` contains the M2 merge.
- [ ] `.worktrees/m2-store` removed and the branch deleted after the merge.
