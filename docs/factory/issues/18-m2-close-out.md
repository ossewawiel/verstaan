---
issue: 18
title: "M2 close-out: gate, verifier, tag m2"
milestone: M2
status: open
depends_on: [17, 166]
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

This issue also waits on side quest 166, which stops the gate's build job importing the real
archive, so this issue's own pull request merges through a gate that can pass.

Once issues 13 to 17 have each merged on their own branch (issue 165), run `/factory-retro`,
then tag `main` with `m2`. This close-out merges nothing: every issue in M2 already merged
through its own pull request. Write the M3 issue files (19 to 26, per `PLAN.md` §7's "M3 Engine
slice" row) from what M2's importer and validator found in the real `afr` and `eng` stores — in
particular, which grammar gaps issue 15 logged (`disambiguation.yaml` empty, the
`44`/`47.tgrammar.txt` direction guess for Afrikaans) that a rule-author should resolve before M3
writes engine-facing rules against them.

## Acceptance criteria

- `data/languages/afr/` and `data/languages/eng/` each hold a complete store per `SPEC.md` §3.3's
  tree: dictionary shards, five grammar files, `tagset.yaml`, `corpus/ugoa1.yaml`, `meta.yaml`.
- `python -m tools.validate --all` runs clean (exit 0, warnings only) and its report is attached
  under this issue's `## Verifier` section.
- Each M3 issue has acceptance criteria a test can check and names the store files it reads.
- `main` is tagged `m2`: `git tag m2 main && git push origin m2`.
- This issue's own branch and tree merge and close the normal way (`docs/factory/git-workflow.md`
  "Pull requests"); no other branch or tree is touched here.

## Not in scope

Starting any M3 issue. Merging any other branch or tree — every M2 issue already merged on its
own.

## Done when

- [ ] Eight new issue files (19-26), `STATE.md` shows #19 as next.
- [ ] `main` carries the tag `m2`.
