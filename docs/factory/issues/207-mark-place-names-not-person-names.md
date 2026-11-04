---
issue: 207
title: "A place name with no record is marked and a person's name is not"
milestone: Side
status: open
depends_on: []
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 333
---
## What

Today a capitalised word with no entry becomes a quoted literal, and the pass places it unmarked
(ADR 0025 and its amendments). `apply_name_literals` decides what a capitalised token is
(`engine/src/engine.cpp:44-98`): a sentence-initial token with any exact-case entry keeps that
entry (`engine.cpp:84`), a sentence-initial token whose lower-case form is only a noun becomes a
name (`engine.cpp:91`), and any capital after the first word becomes a name whatever the
dictionary holds (`engine.cpp:79-82`). `is_capitalised` tests ASCII only (`engine.cpp:44-46`). That
makes `John`, `Mary`, `Geneva` and `Paris` one thing, and the owner has ruled they are not.

Owner, 2026-11-04: A09 is `'n boek oor ⟦Geneva⟧`, partial, because "it was a mistake to pass it".
A15 carries `⟦Paris⟧`. A13 stays `John en Mary`, ok. The rule-author finds what separates a person
from a place. The owner ruled the mechanism on 2026-11-04, below. The same quest fixes the scenes in finding F2 of issue 188's verifier
report, with one ADR (F10.1: who is a name, the noun-only test, the hard-coded `"I"`, the ASCII
capital test; F10.2: the bare `TEMP` tag on every name literal at `engine.cpp:127`).

The scene. A user types an ordinary English sentence with a capital first letter. `a book` gives
`'n boek`. `A book` gives `boek van A`, "book of A", with exit 0. No golden row sees this, because
every fixed-set input starts in lower case except the names. The verifier's inputs:

```
$V "A book"          exit=0  boek van A
$V "All the books"   exit=0  finaal boeke
$V "Car"             exit=0  Car          ("car" gives motor)
$V "Cars"            exit=0  Cars         ("cars" gives motors)
$V "Children"        exit=0  Children
$V "The Book"        exit=0  Book
$V "the Car"         exit=0  Car
$V "HELP"            exit=0  HELP
$V "Xyzzy"           exit=0  Xyzzy        ("xyzzy" gives ⟦xyzzy⟧, exit 2)
$V "Émile"           exit=2  ⟦Émile⟧
```

The cause F2 left out: the store holds `A` as a noun at `data/languages/eng/dictionary/a.yaml:2`,
so an exact-case hit on `A` always wins and the article never gets its turn.

After this quest, `A book` gives `boek van A` no more: a sentence-initial capital on a known word
finds the word. `A book` gives `'n boek`, `Car` gives `motor`, `All the books` no longer gives
`finaal boeke`. The ASCII test no longer decides the path, and the ADR names the output for
`Émile`. `Émile` is a person's name, and the owner ruled a person's name stays bare. The ADR states
each output. Issue 196 sent no test-writer, so its tests landed green in `ee6d3c1`; this quest
sends one.

The owner's 2026-10-29 place ruling also binds the ADR. Most old-world cities, countries, regions
and languages have an Afrikaans name (look at the Dutch; Geneva to Genève, Paris to Parys).
New-world cities, regions and rivers keep their own (New York, Brisbane). So `a book about
Brisbane` must not read as a failure the way Geneva does, unless the ADR says why.

Two more things belong to the ADR. A15's name node in the graph (issue 201): UW `500003943`
appears only in the two corpus files, the eng store holds `Paris` as `112469372` with `SEM: PLA`,
and afr has no record. And SPEC §3.3 matches if the mechanism adds a store file. Tests that pin
the old ruling sit at `tests/unit/engine_status_test.cpp:97-102`, `:355-356` and `:517-528`. They
change here.

## Owner rulings

2026-11-04, the owner, before any test exists: **a place is a record.** A capitalised word with an
English record uses that record. When Afrikaans has no record for that UW, the word shows marked, the
ordinary path for a word the target lacks. A capitalised word with no record is a name, and shows
bare.

- `Geneva` gains an English record, here, with the corpus's UW `500004419`. It shows `⟦Geneva⟧`,
  partial. `Paris` already has a record, `112469372`, so it shows `⟦Paris⟧`.
- `John`, `Mary`, `Brisbane` and `Émile` have no record and show bare. The rule needs no person list.
- The accepted cost: an old-world place with no record, such as `Lyon`, shows bare and `ok` until it
  gets a record. Quest 217 adds the corpus's places.

Evidence. Today `Paris` alone gives `⟦Paris⟧`, because line `engine.cpp:84` keeps the entry. `a book
about Paris` gives bare `Paris`, because `engine.cpp:79-82` makes any later capital a literal first.
The fix makes that later capital consult the dictionary.

Still for the rule-author and the ADR: a sentence-initial capital on an ordinary word. The store holds
`A` as a noun, so the rule above alone leaves `A book` wrong. The lower-case word must win there, so
`A book` gives `'n boek` and `Car` gives `motor`. The ADR states the order of the two lookups. The
corpus does not give the split by itself: it gives `Shakespeare` a UW, `500009156`, and most people
quoted literals. So the store decides, not the corpus's shape.

## Acceptance criteria

- The owner ruled on the mechanism on 2026-11-04, before any test exists.
- The ADR is accepted and covers F10.1 and F10.2.
- Golden row A09 passes with no `deferred` key. A13 still passes.
- Every input in the table above gives the output the ADR names, in a test.
- The `deferred: 207` key is gone from A09 in both `basic.yaml` copies.
- `a book about Brisbane` has a stated output in a test, per the ADR.
- The tests at `tests/unit/engine_status_test.cpp:97-102`, `:355-356` and `:517-528` assert the old
  ruling and change here.
- SPEC §3.3 matches if a store file is added.
- The engine's capital test and the capital pin in SPEC §3.5 (first character Unicode `Lu`, no space; ADR
  0028) agree. The ADR names any difference, and SPEC §3.5 follows it.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The Afrikaans place records and the other English place records: quest 217. Once an Afrikaans record
exists, the name translates. This quest adds only `Geneva`'s English record.

## Done when

- [x] The owner has ruled on the mechanism (2026-11-04).
- [ ] The ADR is accepted.
- [ ] A09 passes without `deferred` in both `basic.yaml` copies, and A13 still passes.
- [ ] The ADR gives A15's name node, and states the Brisbane output.
- [ ] Every F2 input gives the output the ADR names.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
