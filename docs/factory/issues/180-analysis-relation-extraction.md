---
issue: 180
title: "Extract UNL relations from the flat analysed node list"
milestone: M3
status: open
depends_on: [22]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

`RuleInterpreter::analyse` (issue 22) rewrites a flat list of nodes with attributes, `@pl`,
`@def`, `@plus`, and the like. It never builds a relation. `Graph::relations` is declared in
`engine/include/verstaan/engine.hpp` and never written: no code anywhere assigns to it. The
implementer working issue 25 confirmed this by grep, zero hits, before stopping issue 25 as
unbuildable without this quest.

Five of the fifteen rows in `tests/fixtures/languages/eng/tests/basic.yaml` (issue 24) need real
relations to translate at all: `mod` (A08, A11, A12), `plc` (A07, A15), `cnt` (A09, A15), `nam`
(A15), `and` (A15). After this quest, `Engine::translate` populates `Graph::relations` with these
edges for English input, built from the archive's `NN`/`TN` network-construction rules the same
way `RuleInterpreter::analyse` already reads the archive's `LL` attribute rules.

## Acceptance criteria

- `Result::unl.relations` is non-empty for A07 through A15 when translated with
  `Options{Lang::eng, Lang::afr}`, one entry per relation named in issue 24's rule-id column for
  that row.
- Every relation carries the UW pair and the relation label (`agt`, `obj`, `mod`, `plc`, `cnt`,
  `nam`, `and`) it was built from, so `--trace` can show why it fired.
- `ctest -L fast` and the existing `pipeline_fixed_set` harness (issue 25's one-off runner, or its
  successor) still pass for every row that passed before this quest.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Generation from these relations into Afrikaans surface text — issue 181. Afrikaans-side
disambiguation or inflection — issue 181. Closing issue 25 itself — issue 183, once this quest,
181 and 182 have landed.

## Done when

- [ ] `Graph::relations` is populated for `agt`, `obj`, `mod`, `plc`, `cnt`, `nam`, `and` from
      English input.
- [ ] A test exercises each relation kind against a row from `tests/fixtures/languages/eng/tests/basic.yaml`.
- [ ] `ctest -L fast` is green.
- [ ] `python -m tools.validate --changed` is green.
