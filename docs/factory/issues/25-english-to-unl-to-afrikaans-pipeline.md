---
issue: 25
title: "Wire the English to UNL to Afrikaans pipeline for the fixed sentence set"
milestone: M3
status: open
depends_on: [22, 23, 24]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 248
---
## What

`Engine::translate` (issue 23) already returns real `Status` values against the runtime-tables
back end (issue 22); this issue is the integration pass that runs the full pipeline — tokenise
(19), look up (20), disambiguate and apply grammar (22) — end to end for `Options{Lang::eng,
Lang::afr}` on every row issue 24 wrote, and fixes whichever stage drops a row that issue 24
expected to pass.

This issue reads the same store files issues 19–22 each name, plus
`tests/fixtures/languages/eng/tests/basic.yaml` (issue 24) as its own acceptance fixture — it does
not read the corpus files directly, since issue 24 already extracted the fifteen rows from them.

## Acceptance criteria

- Every row in `tests/fixtures/languages/eng/tests/basic.yaml` marked `status: ok` and `review:
  confirmed` translates through `Engine::translate` to a `text` that matches its `expected` field
  exactly.
- Every row marked `status: partial` returns `Status::partial` with the word named in its `note`
  column wrapped `⟦word⟧`.
- A row marked `review: pending` still runs (per issue 26's loader rule) and is reported as
  pending, not silently skipped, in this issue's own test output ahead of issue 26 landing the
  shared loader.
- `ctest -R pipeline_fixed_set` runs green for every `confirmed` row.

## Not in scope

The golden loader itself (issue 26, which generalises this issue's one-off harness into the
shared `ctest -L golden` mechanism). Afrikaans → English (not in the fixed set, per issue 24).
The generated-tables back end (M4).

## Done when

- [ ] Every `confirmed` row in `tests/fixtures/languages/eng/tests/basic.yaml` passes end to end.
- [ ] `ctest -R pipeline_fixed_set` is green.
