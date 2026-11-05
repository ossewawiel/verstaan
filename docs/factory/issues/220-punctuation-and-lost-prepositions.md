---
issue: 220
title: "A preposition keeps its word before punctuation and at the start of a sentence"
milestone: Side
status: open
depends_on: [207]
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

The engine gives a punctuation token no features, so `eng-ana-15` cannot fire before a full stop. A
preposition with no relation has no node, and the word leaves the text. `a book in a box.` loses `in`,
and `a book about Brisbane.` loses `about`. Quest 207's capital rule sends the same fault to ordinary
capitals: `On the table.` gives `die tafel`, exit 0, where main gave `aan die tafel`. `In a box.` gives
`'n boks`, exit 0, where main gave `⟦In⟧ 'n boks`.

Quest 207 built a fix and the owner moved it here on 2026-11-05, after a verifier measured its width.
The state is on local branch `wip-207-put-fix`, `a710727`. It tags every punctuation token `PUT`, and 22
analysis lines read that tag. 16,251 of 38,136 matrix sentences change, and 24 of 248 corpus sentences
change, 14 of them going exit 0 to exit 2. Some changes are gains: `the old book.` gives `die ou boek`.
Some are not: `John Smith.` went from right to `Smith ⟦John⟧`, and `a book about cars or books` lost `of`
at exit 0. So this quest keeps the gains and answers for the rest, row by row. It decides whether
`eng-dis-11` widens again from 207's `(N,CAP,#PREFERRED)`, and whether the bare `CAP` tag stays.

The branch's parts: `PUT` on a punctuation token in `build_positions`, `append_live_prepositions`,
`eng-dis-12`, `eng-dis-13`, `afr-gen-237`, `afr-gen-238`, and `-@about` on `afr-gen-4`. Its rows are C70 to
C79 and C86 to C92, as they stood before the split, in `git show a710727:docs/factory/issues/207-test-cases.md`.
Those ids stay retired in 207; give them new ids here.

## Acceptance criteria

- `$V "a book in a box."` keeps a word for `in`, and `$V "a book about Brisbane."` keeps a word for `about`.
- `$V "On the table."`, `$V "In a box."`, `$V "Before the summer."` and `$V "About the car"` each keep a
  word for the preposition, or mark it. None loses it at exit 0.
- `$V "John Smith."` still prints `John Smith`, and `$V "a book about cars or books."` keeps a word for `or`.
- A pass over a sentence matrix compares `main` with the branch, and the comparison's result is in the
  hand-off. No input loses a word at exit 0 without a row that names it.
- A test holds the punctuation tag on every mark the tag covers, not only the full stop.
- `ctest --preset linux-gcc -L fast` passes, and `python -m tools.validate --changed` exits 0.

## Not in scope

An abbreviation's full stop: quest 221. A capital with a non-noun reading after a preposition, `a book
about Afrikaans`: quest 222. A two-word name: quest 217 asks that for `Atlantic Ocean` and `New
York`. Cardinals after a preposition, `about five books` as `ongeveer vyf boeke`: a later quest. `and` across
a preposition, `a book about cars and books` as `oor motors en boeke`: quest 201's shape.

## Done when

- [ ] A preposition before punctuation keeps its word or a mark, in a test.
- [ ] A sentence-initial preposition keeps its word or a mark, in a test.
- [ ] `John Smith.` stays right, in a test.
- [ ] The `main`-against-branch matrix result is in the hand-off, and every change that loses a word has a row.
- [ ] An ADR states the tag's width and the outcome for `eng-dis-11` and `CAP`.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
