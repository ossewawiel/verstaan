---
issue: 201
title: "The graph carries scopes, and A14 and A15 build their corpus graphs"
milestone: Side
status: open
depends_on: [182, 197, 198, 199, 207]
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

- A14 `a car, a book and a mug`, which reads `'n motor, 'n boek en 'n beker`: `and(102958343.@indef, :01) and:01(102870092.@indef,
  103797390.@indef)`.
- A15: `plc(102870092.@def, 104379243.@def.@top.@contact) mod(102870092.@def, 300217728)
  cnt(102870092.@def, 108524735.@def) nam(108524735.@def, 500003943) mod(102870092.@def,
  :01.@without) and:01(106999436.@generic, 103925226.@generic)`.

The effort is `xhigh`, one step above the rule-author's default, and the checkpoint is 4, because
the scope changes the public `Graph` type in `engine/include/`. The owner accepted ADR 0026, as amended, on 2026-11-04. Its amendment is what lets a relation end on a scope, as both corpus graphs above do.

A15 ends `sonder beelde en foto's`. `pictures` follows the corpus UW 106999436, which the afr store
maps to `beeld` and `beelde`. Today the engine picks `skilderye`. The name's node in A15's graph
comes from quest 207's ADR: UW `500003943` appears only in the two corpus files, while the eng store
holds `Paris` as `112469372` with `SEM: PLA`, and afr has no record.

Owner rulings, 2026-11-04: this quest moved to Side so `m3` could close. Quest 31 waits on it. The
quest also splits. It keeps the scopes, A14 end to end, and A15's graph. Quest 215 writes A15's
generation rules and takes A15's `deferred` key.

## Acceptance criteria

- `Relation` carries a scope id and `Graph` lists its scopes, as ADR 0026 states. A unit test
  builds a graph with `:01` and reads the scope back.
- `Engine::translate` with `Options{Lang::eng, Lang::afr}` builds the corpus graph above in
  `Result::unl` for A14 and for A15: the same UWs, attributes, relations and scopes.
- A14's `text` matches its `expected` field exactly: `'n motor, 'n boek en 'n beker`.
- A15's `Result::unl` equals the corpus graph above, except the name's node. By owner ruling of
  2026-11-04 a capitalised word with an English record uses that record, so the node is
  `112469372`, not the corpus's `500003943`, which is in no dictionary.
- `Result::trace` names the analysis rule that builds each attribute, relation and scope.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

The generation rules A15 needs up to `die stad`: issue 182. The words after it, `sonder` for
`@without`, and `by` for `@contact` alone: issue 182's findings F1 and F3, now quest 215. A15's
words, its `text`, its `deferred` key and issue 182's skipped P17 test: quest 215.

## Done when

- [ ] `Graph` carries ADR 0026's scopes, with a unit test.
- [ ] A14 and A15 each carry the corpus graph in `Result::unl`.
- [ ] A14 matches its `expected` text exactly.
- [ ] A15's `Result::unl` equals the corpus graph, except the name's node, which follows quest 207's ADR.
- [ ] Each attribute, relation and scope's rule id appears in `Result::trace`.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
- [ ] The `deferred: 201` key is removed from A14 in both `tests/fixtures/languages/eng/tests/basic.yaml` and `data/languages/eng/tests/basic.yaml`.
