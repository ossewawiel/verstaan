---
issue: 183
title: "Wire the English to UNL to Afrikaans pipeline for the fixed sentence set"
milestone: M3
status: open
depends_on: [180, 181, 182]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

Issue 25 assumed `Engine::translate` (issue 23) already ran the full pipeline against the
runtime-tables back end (issue 22) and only needed row-level fixes. The implementer routed to
issue 25 found that was not true: relation extraction and Afrikaans generation did not exist at
all. Issues 180, 181 and 182 build those missing stages. This issue is the integration pass issue
25 was meant to be, now that the stages it wires together are real: it runs tokenise → look up →
disambiguate → apply grammar → extract relations → generate, end to end, for
`Options{Lang::eng, Lang::afr}`, on every row in `tests/fixtures/languages/eng/tests/basic.yaml`,
and fixes whichever stage still drops a row that issue 24 expected to pass.

This issue supersedes issue 25, which is closed with a pointer here rather than carried forward,
since its "What" no longer describes the engine's state.

## Acceptance criteria

- Every row marked `status: ok` and `review: confirmed` translates through `Engine::translate` to
  a `text` that matches its `expected` field exactly.
- Every row marked `status: partial` returns `Status::partial` with the word named in its `note`
  column wrapped `⟦word⟧`.
- A row marked `review: pending` still runs and is reported as pending, not silently skipped, in
  this issue's own test output ahead of issue 26 landing the shared loader.
- `ctest -R pipeline_fixed_set` runs green for every `confirmed` row.

## Not in scope

The golden loader itself (issue 26). Afrikaans → English (not in the fixed set, per issue 24). The
generated-tables back end (M4). Any remaining `generation.yaml` divergence not already listed in
issue 182 — if one turns up here, it is a new quest, not a silent patch.

## Done when

- [ ] Every `confirmed` row in `tests/fixtures/languages/eng/tests/basic.yaml` passes end to end.
- [ ] `ctest -R pipeline_fixed_set` is green.
