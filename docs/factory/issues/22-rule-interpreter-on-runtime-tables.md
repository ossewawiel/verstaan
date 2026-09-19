---
issue: 22
title: "Rule interpreter on runtime tables"
milestone: M3
status: done
depends_on: [20, 21]
agent: implementer
agents: [rule-author, implementer]
model: sonnet
effort: high
checkpoint: null
commit: 197c7fe
worktree: null
github_issue: 245
---
## What

`engine/src/rule_interpreter.cpp` implements `Engine::load(RuleSet)`, the runtime-tables back end
`SPEC.md` §3.4 names (the generated/compiled back end via `Engine::generated(Tier)` is M4, per
ADR 0007 — not this issue). It applies, in order, the grammar files a language store holds:
`grammar/disambiguation.yaml` (pick one sense per homograph the dictionary lookup, issue 20, left
with more than one candidate; apply the fallback issue 21 decided when the file is empty),
`grammar/analysis.yaml` (English → UNL direction), `grammar/inflection.yaml` (surface-form
affixation both directions), `grammar/subcategorisation.yaml` (argument-frame checks), and
`grammar/generation.yaml` (UNL → Afrikaans direction). Every rule fired is appended to a `Trace`
list in firing order, per `SPEC.md` §3.4 ("`Trace` lists every rule fired, in order").

## Acceptance criteria

- `engine/src/rule_interpreter.cpp` reads `data/languages/eng/grammar/{disambiguation,analysis,
  inflection,subcategorisation}.yaml` and `data/languages/afr/grammar/{generation,inflection}.yaml`.
- The three worked rules from `docs/unl-reference/formats/transformation-grammar.md`, already
  present field for field in `data/languages/eng/grammar/analysis.yaml` (issue 15), each fire on a
  hand-built sentence containing their trigger pattern; a GoogleTest checks the `Trace` names each
  rule's `id`.
- The `M2`, `M7` and `M16` inflection paradigms (present in `grammar/inflection.yaml` per issue 15)
  each apply to a hand-built word form; the affixed output matches the paradigm's right-hand
  string verbatim.
- A homograph resolved by `grammar/disambiguation.yaml`'s 13 `afr` records picks the sense the
  D-rule's condition selects, proving the disambiguation step runs before analysis/generation, not
  after.
- The `eng`-empty fallback issue 21 decided is implemented and tested: an English homograph with
  no covering D-rule resolves per that fallback, not by crash or silent drop.
- `ctest -R rule_interpreter` runs green.

## Not in scope

The generated-tables back end (`Engine::generated(Tier)`) and `tests/equivalence/` — both M4, per
ADR 0007. Deciding the disambiguation format (issue 21, already closed by the time this runs).

## Done when

- [x] `engine/src/rule_interpreter.cpp` implements `Engine::load(RuleSet)` against all five
      grammar files per language.
- [x] `ctest -R rule_interpreter` is green, including the disambiguation and fallback cases.
