# 0013 — Mirrored archive data never blocks a merge

Date: 2026-09-15 · Status: Accepted

## Context

`python -m tools.validate --all` validated all 69 tracked files under `data/languages/` in every
gate step and every CI job, whatever an issue's branch actually touched. On `dd2bdea` that sweep
reported about 49,000 errors across the `afr` and `eng` stores, all real (issue 169), none of them
caused by the branch open at the time. A docs-only branch failed the gate on rows it never read;
quest #167, two commits and no data, could not open a pull request. The developer, 2026-09-15:
"the dictionaries are data. they are not involved in a side quest or in any other code generation.
why are they involved now?"

`--changed` already existed and finds the files git reports as touched, but it reads
`git status --porcelain`, the uncommitted working tree. On a CI runner, or on any branch whose
work is already committed, that list is empty: swapping `--all` for `--changed` outright would
validate nothing and report success, a false green harder to catch than the failure it replaces.

## Decision

The gate validates only the data a branch touched, against the data on `main`, never the whole
archive. `tools.validate` gains `--changed --base <ref>`, reading `git diff <ref>...HEAD`
(committed history, not the working tree) so it works on an already-committed branch and on a CI
runner with nothing uncommitted. `gate.yml` and `/gate` step 3 both call it: CI diffs against the
pull request's recorded base SHA, so a later unrelated merge into `main` cannot land in an old
run's diff; the local `/gate` diffs against `origin/main`. `--changed` still validates a touched
store whole, not the touched file alone — the store checks are unchanged, only which stores run
changes. `--all` stays in the CLI, run by hand for deliberate data work such as issue 169, and
appears in no workflow and no gate step. The push-to-main leg of `gate.yml` skips the data step
entirely: `HEAD` there is already `origin/main`, so the diff is always empty and a step that
cannot fail is not coverage.

**Rejected: a scheduled or milestone-gated full sweep.** Running `--all` on a timer, or once per
milestone close-out, would keep the archive's own errors off the merge path while still surfacing
drift on a schedule. The developer turned this down on 2026-09-15: no cadence was named, no owner
for the resulting failures, and the 49,000 errors already have an owner, issue 169, opened in the
same session. A scheduled sweep would duplicate that issue's job without doing it. `--all` run on
demand, when someone is doing data work, is the whole mechanism.

## Consequences

- A branch that touches no file under `data/languages/` validates no store and pays nothing for
  the archive's condition.
- A branch that edits one file in a store validates that store whole; the 49,000 pre-existing
  errors in `afr` and `eng` are quest #169's business, and #169 cannot land in pieces against a
  store it leaves partly broken (docs/factory/issues/169-store-feature-values.md).
- Nothing polls the archive's condition on a timer. It surfaces only when a branch touches it, or
  when `--all` is run by hand.
- CI on `main` after a merge no longer reports a green data step that checked nothing; the step
  itself does not run there.
