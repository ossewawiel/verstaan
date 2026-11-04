---
issue: 201
title: "The graph carries scopes, and A14 and A15 build their corpus graphs"
milestone: M3
status: open
depends_on: [182, 197, 198, 199]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: xhigh
checkpoint: 4
commit: null
worktree: null
github_issue: 322
---
## What

`Relation` in `engine/include/verstaan/engine.hpp` has no scope. ADR 0026 proposes one, and no
quest builds it, so issues 183 and 198 defer A14 and A15. Issue 182's rule-author found more for
A15 on 2026-11-03 (blocker B1). For A15 the analysis builds only `plc(photos;table)`. It builds
no `cnt`, `nam`, `mod` or `@top.@contact`, puts no `@def` on `book`, and picks `skilderye` for
"pictures". Issue 182's generation rules turn the A15 corpus graph into its expected text up to
`die stad`, but `Engine::translate` never builds that graph.

The owner chose on 2026-11-03 to split this out of issue 182 and to cover A14 with it, because
both rows need the same scope. After this quest, `Graph` holds ADR 0026's scopes. The English
analysis builds the corpus graph for both rows:

- A14 `a car, a book and a mug`: `and(102958343.@indef, :01) and:01(102870092.@indef,
  103797390.@indef)`.
- A15: `plc(102870092.@def, 104379243.@def.@top.@contact) mod(102870092.@def, 300217728)
  cnt(102870092.@def, 108524735.@def) nam(108524735.@def, 500003943) mod(102870092.@def,
  :01.@without) and:01(106999436.@generic, 103925226.@generic)`.

The effort is `xhigh`, one step above the rule-author's default, and the checkpoint is 4, because
the scope changes the public `Graph` type in `engine/include/`. ADR 0026 is `Proposed`. The
rule-author confirms the owner has accepted it before any engine change.

## Acceptance criteria

- `Relation` carries a scope id and `Graph` lists its scopes, as ADR 0026 states. A unit test
  builds a graph with `:01` and reads the scope back.
- `Engine::translate` with `Options{Lang::eng, Lang::afr}` builds the corpus graph above in
  `Result::unl` for A14 and for A15: the same UWs, attributes, relations and scopes.
- A14's `text` matches its `expected` field exactly: `'n kar, 'n boek en 'n beker`.
- A15's `text` matches its `expected` field, with `⟦Paris⟧` marked and `status: partial`.
- Issue 182's skipped end-to-end A15 test runs and passes.
- `Result::trace` names the analysis rule that builds each attribute, relation and scope.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

The generation rules A15 needs up to `die stad`: issue 182. The words after it, `sonder` for
`@without`, and `by` for `@contact` alone: issue 182's findings F1 and F3, not quests yet. Accepting
ADR 0026: the owner.

## Done when

- [ ] `Graph` carries ADR 0026's scopes, with a unit test.
- [ ] A14 and A15 each carry the corpus graph in `Result::unl`.
- [ ] A14 matches its `expected` text exactly.
- [ ] A15 matches its `expected` text, `⟦Paris⟧` marked, status partial.
- [ ] Issue 182's end-to-end A15 test is no longer skipped, and it passes.
- [ ] Each attribute, relation and scope's rule id appears in `Result::trace`.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
- [ ] The `deferred: 201` key is removed from A14 and A15 in both `tests/fixtures/languages/eng/tests/basic.yaml` and `data/languages/eng/tests/basic.yaml`.
