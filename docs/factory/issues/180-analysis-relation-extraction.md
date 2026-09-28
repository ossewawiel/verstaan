---
issue: 180
title: "Extract UNL relations from the flat analysed node list"
milestone: M3
status: open
depends_on: [22, 184]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 280
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

This quest waits on issue 184, which imports the closed-class words (`the`, `of`, `on`, `and`,
`without`). Those records carry features and no UW. They reach analysis as nodes that the
attribute rules fold away (`eng-ana-12` turns `the` into `@def`) and never become graph nodes of
their own. The `eng` grammar holds one rule each for `cnt`, `plc` and `nam`. If a row needs a rule
the store lacks, the rule-author pass writes it here, with a test sentence.

## Acceptance criteria

- `Result::unl.relations` is non-empty for A07 through A15 when translated with
  `Options{Lang::eng, Lang::afr}`, one entry per relation named in issue 24's rule-id column for
  that row.
- Every relation carries the UW pair and the relation label (`agt`, `obj`, `mod`, `plc`, `cnt`,
  `nam`, `and`) it was built from, so `--trace` can show why it fired.
- A closed-class node from issue 184 never appears in `Result::unl` as a UW node.
- `ctest -L fast` still passes. No end-to-end harness exists yet; issue 183 writes it.
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
