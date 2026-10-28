---
issue: 199
title: "The analysis graph for A06, A07, A10 and A12 matches the corpus graph"
milestone: M3
status: open
depends_on: [181]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

Issue 181's rule-author compared the graph `Engine::translate` builds with the corpus graph in
`data/languages/afr/corpus/ugoa1.yaml`. Four fixed-set rows differ, and no generation rule can
repair a wrong graph:

- A06 `all the books`: `all` stays a node, `400008007`, beside `102870092.@pl`. The corpus has one
  node, `102870092.@all.@def`.
- A07 `a book in a box`: `box` resolves to `100135148`, issue 198's finding F1. The corpus has
  `102883344`, and no afr entry holds `100135148`.
- A10 `some days before the summer`: four loose nodes with the wrong UWs and no relation. The
  corpus has `tim(115155220.@paucal, 115237250.@def.@before)`.
- A12 `a very beautiful car`: `very` stays a node, `400510749`, with `mod 1→0`. The corpus has
  `mod(102958343.@indef, 300217728.@plus)`.

Issue 181's checkpoint review found one more: `book Geneva` builds `mod(Geneva → book)`, with the
quoted name as head. ADR 0025 expects `mod(102870092;"Geneva")`. Generation works around it under
`mod` only (ADR 0021).

The owner chose on 2026-10-28 to take these out of issue 181 and give them their own quest. After
this quest, the English analysis builds the corpus graph for all four rows, and issue 181's
generation path turns A06, A07 and A12 into their `expected` text. Under ADR 0023, A07 and A12
read `boks` and `motor` (owner decision, 2026-10-28).

## Acceptance criteria

- `Engine::translate` with `Options{Lang::eng, Lang::afr}` builds, in `Result::unl`, the corpus
  graph above for each of A06, A07, A10 and A12: the same UWs, attributes and relations.
- A06, A07 and A12 produce `text` matching their `expected` field exactly: `al die boeke`,
  `'n boek in 'n boks`, `'n baie mooi motor`.
- A10's `text` ends with ` dae voor die somer`. The leading `'n paar` is issue 182's.
- `book Geneva` builds `mod(102870092;"Geneva")`, the noun as head.
- `Result::trace` names the analysis rule that builds each attribute and relation above.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

A10's `'n paar` (afr-gen-40 writes `enkele`): issue 182. A14 and A15: the scope issue 197
decides. Generation itself: issue 181.

## Done when

- [ ] A06, A07, A10 and A12 each carry the corpus graph in `Result::unl`.
- [ ] A06, A07 and A12 match their `expected` text exactly.
- [ ] A10's text ends with ` dae voor die somer`.
- [ ] `book Geneva` builds the `mod` relation with the noun as head.
- [ ] Each attribute and relation's rule id appears in `Result::trace`.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
