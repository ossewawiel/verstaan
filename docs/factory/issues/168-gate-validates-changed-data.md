---
issue: 168
title: "The gate validates the data the branch changed, not the whole archive"
milestone: Side
status: open
depends_on: [17, 94]
agent: implementer
agents: [implementer, docs-writer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 240
---
## What

The gate validates all 69 tracked data files on every branch, whatever the branch changed. A
quest file that adds one markdown document is checked against 49,000 dictionary rows. That is
why `main` is red today, and why quest #167 — two docs commits, no data — could not open a pull
request.

The CI step records the intent it does not carry out. `.github/workflows/gate.yml` line 299 names
the step `Validate changed/all data`, and its body runs `python -m tools.validate --all`
unconditionally, in all three build jobs. `/gate` step 3 ends the same way. The `--changed` mode
exists already: `list_changed_language_files` in `tools/validate/cli.py` line 79 keeps only the
paths under `data/languages/` that git reports as touched. Nothing in the gate calls it.

The developer's instruction, 2026-09-15: "the dictionaries are data. they are not involved in a
side quest or in any other code generation. why are they involved now?"

After this quest, the gate validates the data the branch touched and nothing else. A docs branch
validates no data. A branch that edits `data/languages/eng/dictionary/e.yaml` validates that
file, and its store's tagset with it. The full sweep stops being automatic: `--all` stays in the
CLI, and it is run deliberately during data work, never as a merge blocker. The 49,000 errors in
the `afr` and `eng` stores are real and are quest #169's business; they stop standing between a
commit and `main` today.

**The trap this quest must not fall into.** `git_changed_paths` at `tools/validate/cli.py` line
59 reads `git status --porcelain` — the uncommitted working tree. On a CI runner, and on any
branch whose work is already committed, that list is empty. Swapping `--all` for `--changed` in
`gate.yml` would therefore validate nothing at all and report success. That is worse than the
present failure, because it looks like coverage. The gate needs the files this branch changed
*against its merge base*, so the mode this quest adds compares against a base ref and the
existing working-tree behaviour stays available for a local run.

Checkpoint 4: this changes the merge path.

## Acceptance criteria

- `python -m tools.validate` gains a way to validate the data files a branch changed against a
  base ref, and `--help` names it.
- On a branch that touches no file under `data/languages/`, the gate's data step validates zero
  files and exits 0. A docs-only branch passes the gate with `main` in its current state.
- On a branch that edits one dictionary file, the data step validates that file, and a
  deliberately broken value in it fails the gate. Prove the failure before the fix, per
  `docs/standards/testing.md`.
- The working-tree behaviour of `--changed` is unchanged, and its existing tests still pass.
- `gate.yml` and `.claude/skills/gate/SKILL.md` step 3 say the same thing, so CI and the local
  gate cannot drift (issue 94).
- `python -m tools.validate --all` still exists, still validates every store, and is run by no
  workflow and no gate step.
- `python -m pytest tools/` passes.

## Not in scope

- Fixing any of the 49,000 feature-value errors, the 326 UW errors, or the uncovered-rule
  warnings. That is quest #169. This quest changes no file under `data/languages/`.
- Loosening, skipping or deleting any check in `tools/validate/store.py`. The checks are right;
  only when they run changes.
- A scheduled or milestone-gated full sweep. The developer chose on 2026-09-15 that `--all` is
  run on demand during data work, not on a timer.
- The `mirror-check` job, which failed on `main` on 2026-09-14 for its own unrelated reason.

## Done when

- [ ] `tools/validate` can list the changed data files against a base ref, not only the
      uncommitted working tree.
- [ ] `gate.yml`'s data step and `/gate` step 3 both validate only what the branch changed.
- [ ] A test proves the empty case validates nothing and exits 0.
- [ ] A test proves a broken value in a touched file still fails, and it was seen to fail first.
- [ ] `--all` is absent from every workflow and every gate step, and present in the CLI.
- [ ] `docs/standards/testing.md` or `.claude/skills/gate/SKILL.md` records in one line that
      archive data is not a merge blocker, and why.
- [ ] `python -m pytest tools/` passes and CI on this branch is green.
