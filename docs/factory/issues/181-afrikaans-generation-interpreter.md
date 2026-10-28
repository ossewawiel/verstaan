---
issue: 181
title: "Tree-based generation interpreter for Afrikaans, wired into Engine::translate"
milestone: M3
status: in-progress
depends_on: [22, 180, 184, 198]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: .worktrees/m3-181-afrikaans-generation-interpreter
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

On 2026-10-27 the owner split issue 180, so the graph this quest reads comes from issue 180
(`mod`) and issue 198 (`plc`, `cnt`, `and`). A14 needs a scoped `and`, which issue 197 only
decides, so A14 leaves this quest's exact-match list.

On 2026-10-28 the owner ruled on the rule-author's scope conflicts (`181-test-cases.md`):

- The analysis graph differs from the corpus graph on A06, A07, A10 and A12. Issue 199 now owns
  those fixes and the exact match for A06, A07 and A12. A10's `'n paar` stays with issue 182. This
  quest proves generation on those four corpus graphs through generator rows.
- Generation picks a word by UW, so the `mooi` AAV reading never reaches the list on A08 or A11.
  `afr-dis-5` is proven on hand-built generated lists instead.
- Lexical choice follows the archive's priority field (ADR 0023). A07, A11 and A12 now read
  `boks` and `motor`, and issue 24's rows are amended to match.

## Acceptance criteria

- `Engine::translate` with `Options{Lang::eng, Lang::afr}` resolves every UW in the graph against
  `data/languages/afr/dictionary/`, not the English one.
- `afr-dis-5` fires on the hand-built generated lists in `181-test-cases.md` (a determiner before
  the `mooi` AAV reading). It does not fire on A02, A03 or A07.
- Inflection paradigms M3 (A04, A05), and M2, M7 and M16 (generator rows `somers`, `dae`,
  `foto's`) apply as `181-test-cases.md` names.
- A01–A05, A08, A11 and A13 produce `text` matching their `expected` field exactly.
- The generator rows on the corpus graphs for A06, A07, A10 and A12 produce the text
  `181-test-cases.md` names.

## Not in scope

Fixing the three documented divergences between `generation.yaml` and the corpus (afr-gen-4,
afr-gen-40, afr-gen-22, the missing `nam` handler) — issue 182. Relation extraction on the English
side — issue 180, a dependency of this quest. Closing issue 25 — issue 183.
A14 and A15, which need the scope issue 197 decides. The analysis graph for A06, A07, A10 and
A12 — issue 199.

## Done when

- [ ] `Engine::translate` looks up the Afrikaans dictionary and applies `generation.yaml`'s
      `NN`/`NT`/`TT`/`TL` passes.
- [ ] `afr-dis-5` fires on the hand-built generated lists and not on A02, A03 or A07.
- [ ] Inflection paradigms M2, M3, M7, M16 apply on the rows `181-test-cases.md` names.
- [ ] Every row named in "Acceptance criteria" above matches its `expected` field exactly.
- [ ] `die`, `'n` and `en` come from the Afrikaans closed-class records issue 184 imports, not
      from string literals in engine code.
- [ ] No comment in `engine/` names issue 25 as the place future work lands
      (`engine/src/engine.cpp`, `engine/include/verstaan/dictionary.hpp`,
      `engine/include/verstaan/rule_set.hpp`). Each names the issue that owns the work now.
