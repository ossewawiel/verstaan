---
issue: 182
title: "Fix three afr/grammar/generation.yaml divergences from the fixed sentence set"
milestone: M3
status: open
depends_on: [181]
agent: rule-author
agents: [rule-author, test-writer]
model: opus
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: 282
---
## What

Issue 24 found three places where `data/languages/afr/grammar/generation.yaml`'s comment does not
match the corpus's Afrikaans text, and one relation with no generation rule at all:

- `afr-gen-4` (`cnt(%x,N;%y,N)`) writes `omtrent`; the corpus writes `oor` for A09 and A15.
- `afr-gen-40` (`(%x,N,@paucal)`) writes `enkele`; the corpus writes `'n paar` for A10.
- `afr-gen-22` (`plc(%x;%y,N)`) writes `in`; A15's corpus line needs `op`, because the graph
  carries `@top.@contact` and no generation rule keys on that attribute pair.
- No generation rule handles the `nam` relation at all, needed by A15.

After this quest, `generation.yaml`'s output matches the corpus for A09, A10 and A15, and a
`nam` relation produces the name it attaches, unquoted, in its Afrikaans position.

## Acceptance criteria

- Translating A09, A10 and A15 (`Options{Lang::eng, Lang::afr}`, once issue 181 lands) produces
  `text` matching each row's `expected` field in `tests/fixtures/languages/eng/tests/basic.yaml`,
  modulo the `⟦word⟧` marks their `status: partial` rows keep for the undictionaried proper nouns.
- A new generation rule fires on `nam` relations and is exercised by a test sentence, per
  `tools/validate`'s rule-coverage check.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The generation interpreter itself — issue 181, a dependency of this quest. The undictionaried
`Geneva`/`Paris` proper nouns that keep A09 and A15 `partial` regardless of this fix — out of
scope for the fixed sentence set (issue 24's "Not in scope").

## Done when

- [ ] `afr-gen-4` produces `oor`, not `omtrent`.
- [ ] `afr-gen-40` produces `'n paar`, not `enkele`.
- [ ] `afr-gen-22` or a new rule produces `op` when the graph carries `@top.@contact`.
- [ ] A generation rule handles the `nam` relation, with a test sentence exercising it.
- [ ] `python -m tools.validate --changed` is green.
