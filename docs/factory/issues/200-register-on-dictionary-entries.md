---
issue: 200
title: "Dictionary entries carry a register, and doos is never the default"
milestone: Side
status: open
depends_on: [181, 199]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: xhigh
checkpoint: 4
commit: null
worktree: null
github_issue: 320
---
## What

The glossary defines register as a tag on dictionary entries that steers word choice. No afr entry
carries one. `Options::reg` exists, but `Engine::translate` returns at once for any value but
`neutral`: `verstaan --register formal "a book in a box"` prints nothing and exits 1. Lexical choice
(ADR 0023) takes the highest-priority lemma for a UW and reads nothing else. So the engine cannot
keep a risk word out of a neutral sentence. English `case`, `102974697`, prints `doos` today: `doos`
has priority 4, ahead of `boks` 3, `trommel` 2 and `tas` 1.

The owner ruled on 2026-10-29: "in Afrikaans specifically 'doos' can also be a derogatory term for
a womens vagina and obvously kalling people that as a swear word. this is not the case for the same
word in dutch." And for box: "most cases the inglish refer to a cardboard box. so in formal setting
kartondoos, in neutral/informal boks." The owner chose the same day to mark `doos`, not delete it,
and to take `boks` for `case` for now. After this quest, a dictionary entry carries a register and
an avoid mark. Lexical choice never picks an avoid-marked entry. It prefers an entry that matches
`Options::reg`. `a book in a box` reads `'n boek in 'n kartondoos` in formal register and `'n boek
in 'n boks` in neutral and informal register. `a case` never reads `doos`.

The loadout is raised from the rule-author's `high` to `xhigh` because the quest changes engine
core and a public API: `DictionaryEntry` gains fields, and `translate` accepts a register it
refuses today.

## Acceptance criteria

- An ADR records the register and avoid fields, their values, and how lexical choice reads them.
  It amends ADR 0023 and does not replace it.
- `data/languages/afr/dictionary/` entries may carry `register` and `avoid`.
  `python -m tools.validate` refuses an unknown register value. An entry with neither field reads
  as before.
- Every `doos` and `dose` entry carries the avoid mark, with the owner's 2026-10-29 ruling as source.
- An owner-sourced `kartondoos` entry for `102883344` carries `register: formal`.
- `Engine::translate` with `Options{Lang::eng, Lang::afr, Register::formal}` on A07 returns
  `'n boek in 'n kartondoos`, status `ok`. Neutral and informal return `'n boek in 'n boks`.
- `a case`, in every register, returns no `doos`.
- `verstaan --register formal "a book in a box"` prints the formal text and exits 0.
- The fixed-set rows in `data/languages/eng/tests/basic.yaml` keep their outputs in neutral
  register.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

Material compounds: `houtkis`, `kissie`, `staalkis` (a later quest). Afrikaans place names,
Genève, Parys, Australië (quest 2 of the owner's 2026-10-29 rulings). Choosing a word sense from
context, so that `boks` the sport and `boks` the container stop sharing a surface. A register tag on
every afr entry: this quest tags the entries the rulings name. The `technical` register and
`Context`. A better Afrikaans word for `case` than `boks`.

## Done when

- [ ] The ADR for register and avoid on dictionary entries is accepted.
- [ ] The store schema and validator accept `register` and `avoid`, and refuse a bad value.
- [ ] `doos` and `dose` carry the avoid mark; `kartondoos` for `102883344` carries `register: formal`.
- [ ] A07 reads `kartondoos` in formal register and `boks` in neutral and informal.
- [ ] `a case` never reads `doos`.
- [ ] `verstaan --register formal` translates instead of exiting 1.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
