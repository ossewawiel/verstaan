---
issue: 222
title: "A capital with a non-noun reading keeps its preposition, and a capital verb or tag keeps its sentence"
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

Quest 207's capital rule makes a capital with a record use that record. ADR 0030 names what that costs,
and the owner accepted the ADR on 2026-11-05 on condition that this quest tracks the rows with no owner. A
user types `a book about Afrikaans`, the project's own language. Main gave `'n boek oor Afrikaans`. The
branch gives `'n boek ⟦Afrikaans⟧ ⟦about⟧`, partial. 973 of the 984 capitals with a non-noun reading do the
same, including `English`, `French`, `Dutch`, `American` and `Christian`. Corpus line 126, `a book in
English`, went from `'n boek aan English` to `'n boek Engels ⟦in⟧`. Main's `aan` was wrong and `Engels` is
right, but the preposition has no word. The fix needs `afr-gen-4` to take an adjective under `cnt`, or the
noun reading chosen after a preposition. Quest 220 does not reach this: these words have a head.

Four smaller rows wait here too, each a named row in ADR 0030. A capital verb record gives wrong text with
no mark: `a book about Ask` gives `'n boek vra om`, exit 0. A capital that spells a grammar tag loses
`about`: `a book about D` gives `'n boek D`, exit 0, and `DP`, `PB` and `PP` mark. The `CAP` tag from 207
causes this one. The `Paris` record reorders its sentence: `as beautiful as Paris` gives `⟦Paris⟧ ⟦as⟧
⟦beautiful⟧ ⟦as⟧`. The determiner widening on `afr-gen-35` and `afr-gen-36` reaches verbs: `the book runs`
gives `die ⟦runs⟧ van boek`, on 258 of 38,136 matrix sentences.

## Acceptance criteria

- `$V "a book about Afrikaans"` holds a word for `about` and no `⟦about⟧`, in a test.
- `$V "a book in English"` holds `Engels` and a word for `in`, and no `⟦in⟧`, in a test.
- `$V "a book about Ask"` and `$V "a book about D"` do not read wrong at exit 0: each either keeps a word
  for `about` or shows a mark, in a test.
- `$V "as beautiful as Paris"` keeps its word order, or the ADR says why not.
- `$V "the book runs"` puts no determiner on a marked verb, in a test.
- A census over every capitalised single-token headword after `a book about` compares `main` with the
  branch, and the result is in the hand-off.
- `ctest --preset linux-gcc -L fast` passes, and `python -m tools.validate --changed` exits 0.

## Not in scope

A preposition before punctuation or at the start of a sentence: quest 220. An abbreviation's full stop:
quest 221. A two-word name: quest 217. The records of the corpus's places: quest 217.

## Done when

- [ ] `a book about Afrikaans` and `a book in English` keep a word for the preposition, in a test.
- [ ] `Ask` and `D` no longer read wrong at exit 0, in a test.
- [ ] The `Paris` row and the determiner row read as the acceptance criteria state.
- [ ] The census result is in the hand-off.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
