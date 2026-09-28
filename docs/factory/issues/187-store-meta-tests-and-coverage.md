---
issue: 187
title: "Complete the afr and eng stores: meta.yaml, tests/, and rule references that must resolve"
milestone: M3
status: open
depends_on: [17, 185]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 288
---
## What

SPEC.md §3.3 gives every store a `meta.yaml` and a `tests/<name>.yaml`. Neither `afr` nor `eng`
has either one. The M2 close-out (issue 18) listed `meta.yaml` in its acceptance criteria, and it
did not land. SPEC §3.3 also says the validator's rule-coverage check turns from a warning into an
error at M3. It still prints a warning. `test_check_rule_coverage_never_fails_the_exit_code_at_m2`
locks that in. Taken literally, the error would fail on about 430 `afr` rules and 440 `eng` rules
that no test sentence exercises yet.

The owner chose the scope on 2026-09-28: a test that names a rule id that does not exist is an
error; a rule that no test names stays a warning. After this quest, each store has a `meta.yaml`.
The `eng` store has a `tests/basic.yaml` holding the fixed sentence set, with each row's `rules`
list. The validator fails when any `rules` entry names no rule in the store its prefix points at
(`eng-ana-12` in `eng`, `afr-gen-4` in `afr`).

## Acceptance criteria

- `data/languages/afr/meta.yaml` and `data/languages/eng/meta.yaml` carry `iso1`, `iso3`, `name`,
  `licence`, `counts` and `last_import`. A `tools.importer` step computes `counts` from the store
  as it stands, without a re-import, and the importers call that step at the end of a run.
- `data/languages/eng/tests/basic.yaml` holds the fifteen fixed-set rows with `rules` and
  `review`. The fixture under `tests/fixtures/languages/eng/tests/basic.yaml` stays, and a test
  fails when the two drift apart row for row.
- `python -m tools.validate` exits nonzero when a `rules` entry names a missing rule. A test
  proves it with a deliberately wrong rule id.
- Uncovered rules still print as a warning. The M2 test that pins this is renamed to say M3, and
  keeps its assertion.
- `SPEC.md` §3.3 states the chosen scope in place of "error from M3".

## Not in scope

Writing test sentences for the uncovered archive rules; that is M6's rule-author workflow. Coverage
per tier, which needs `tiers.toml` from M4. A `tests/` directory for `afr` before any `afr → eng`
row exists.

## Done when

- [ ] Both stores have `meta.yaml`, and the importers keep it current.
- [ ] `eng/tests/basic.yaml` exists, and a test catches drift from the fixture.
- [ ] A missing rule id fails validation; an uncovered rule warns.
- [ ] `SPEC.md` §3.3 names the scope.
