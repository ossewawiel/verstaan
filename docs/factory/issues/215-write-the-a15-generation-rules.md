---
issue: 215
title: "Write the A15 generation rules"
milestone: Side
status: open
depends_on: [201, 207]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: 341
---
## What

A15 expects `die mooi boek op die tafel oor ⟦Paris⟧ die stad sonder beelde en foto's`, status
partial. Quest 201 builds A15's graph. Three parts of that text have no generation rule today:

- `sonder` for `@without`. `182-test-cases.md:122` says no afr rule writes it.
- `by` for `@contact` alone.
- `beelde`. The corpus graph has `106999436.@generic` and no `@pl`, and `grep generic
  data/languages/afr/grammar/generation.yaml` finds nothing.

The rule-author reads issue 182's findings F1 and F3 first. After this quest, A15 passes end to
end. This split comes from the owner's 2026-11-04 ruling on quest 201: 201 keeps the scopes, A14
and A15's graph, and this quest takes A15's words and its `deferred` key.

## Acceptance criteria

- A15's `text` and `status` match its `expected` field, in both `basic.yaml` copies, with no
  `deferred` key.
- P17 at `tests/unit/engine_status_test.cpp:543` runs and passes.
- Every new rule carries its `source`, per ADR 0020.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The scopes and the graph: quest 201. Marking `Paris`: quest 207.

## Done when

- [ ] A15 passes with no `deferred` key, in both `basic.yaml` copies.
- [ ] P17 at `tests/unit/engine_status_test.cpp:543` runs and passes.
- [ ] Every new rule carries its `source`.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
