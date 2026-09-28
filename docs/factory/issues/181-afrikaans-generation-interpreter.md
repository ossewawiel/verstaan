---
issue: 181
title: "Tree-based generation interpreter for Afrikaans, wired into Engine::translate"
milestone: M3
status: open
depends_on: [22, 180]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 281
---
## What

`data/languages/afr/grammar/generation.yaml` holds 233 rules spanning several rule kinds the
engine has no interpreter for: network rewriting (`cnt(%x,N;%y,N)` → `NA(%x;PC(...))`), tree
normalisation (`kind: default`, for example id 124 `NA(%x;%y) → NB(%x;%y)`), inflection triggers
(id 227, keys off `FLX`), and block-based linearisation (id 231, spacing from `BLK`/`PUT` flags).
None of the tree node types it operates on — `NA`, `NS`, `NB`, `NP`, `PC`, `PB`, `JS`, `VS`, `VP`,
`VC`, `XA` — exist anywhere in `engine/`. `Engine::translate` today never looks anything up in the
Afrikaans dictionary and never calls `RuleInterpreter::inflect`, which exists and is reusable but
unwired.

After this quest, `Engine::translate` takes the UNL graph issue 180 builds (UWs plus relations),
resolves each UW against the Afrikaans dictionary, runs it through the `NN → NT → TT → TL` passes
`generation.yaml` encodes, applies Afrikaans disambiguation (`afr-dis-5`, the `mooi` ADJ/AAV
homograph), applies inflection through the existing `RuleInterpreter::inflect`, and linearises the
result into `Result::text`.

## Acceptance criteria

- `Engine::translate` with `Options{Lang::eng, Lang::afr}` resolves every UW in the graph against
  `data/languages/afr/dictionary/`, not the English one.
- `afr-dis-5` fires on A08 and A11 (the `mooi` homograph) and does not fire on A02 or A07 (the
  must-not-fire rows issue 24 names).
- Inflection paradigms M2, M3, M7 and M16 apply where the fixture rows require them (A02–A05,
  A10, A15).
- `A01` through `A08`, `A10` through `A14` (the rows with no documented `generation.yaml`
  divergence) produce `text` matching their `expected` field exactly.

## Not in scope

Fixing the three documented divergences between `generation.yaml` and the corpus (afr-gen-4,
afr-gen-40, afr-gen-22, the missing `nam` handler) — issue 182. Relation extraction on the English
side — issue 180, a dependency of this quest. Closing issue 25 — issue 183.

## Done when

- [ ] `Engine::translate` looks up the Afrikaans dictionary and applies `generation.yaml`'s
      `NN`/`NT`/`TT`/`TL` passes.
- [ ] `afr-dis-5` fires correctly on the homograph rows and not on the must-not-fire rows.
- [ ] Inflection paradigms M2, M3, M7, M16 apply where the fixture rows require them.
- [ ] Every row named in "Acceptance criteria" above matches its `expected` field exactly.
