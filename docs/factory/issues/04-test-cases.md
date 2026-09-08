# Issue 04 — test cases

**This file is the source of truth.** `tests/fixtures/languages/xxa/tests/basic.yaml` and
`.../xxb/tests/basic.yaml` carry the same rows so a loader can read them. Where the two disagree,
this file wins and the YAML is corrected to match it.

Every row is `review: n/a`. The reviewer ticks Afrikaans and English rows; xxa and xxb are invented
here, so the author of the languages is the authority on what they say, and there is nobody else to
ask. No expected value in this file came from running the engine — the engine returns
`Status::not_implemented` and will keep doing so until the `implementer` closes this issue's chain.

## The pair in one paragraph

`xxa` and `xxb` describe the same ten concepts and differ on three axes at once. `xxa` puts the verb
between its two nouns; `xxb` puts it after both. `xxa` writes the definite with the separate word
`ta` and glues plural and past onto the word as `-ki` and `-du`; `xxb` does the mirror, gluing the
definite on as `-n` and writing plural and past as the separate particles `mo` and `da`. An
adjective stands in front of its noun in `xxa` and behind it in `xxb`. So one translation moves a
mark off a word and onto a neighbouring token, and back again, in both directions.

Notation in `expected`: `⟦word⟧` is the marking of `SPEC.md` §3.4 for a word that fell through
untranslated. The `status` column is the `Status` value the `Result` must carry.

## Block A — xxa ⇄ xxb

| id | input | expected | status | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| A01 | `kano zuma sona` | `hundo kinda vidra` | ok | xxa->xxb | neutral | n/a | xxa-ana-01, xxb-gen-01 | Plain clause, no marks. Also the must-not-fire row for xxa-ana-02, xxa-ana-03, xxa-inf-01, xxa-inf-02, xxb-gen-02, xxb-gen-03. |
| A02 | `hundo kinda vidra` | `kano zuma sona` | ok | xxb->xxa | neutral | n/a | xxb-ana-01, xxa-gen-01 | The same clause back. Must-not-fire row for xxb-ana-02, xxb-ana-03, xxb-inf-01, xxa-gen-02, xxa-gen-03. |
| A03 | `ta kano zuma sona` | `hundon kinda vidra` | ok | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-02, xxb-gen-01, xxb-inf-01 | The definite article. A separate word in xxa becomes a suffix in xxb. |
| A04 | `hundon kinda vidra` | `ta kano zuma sona` | ok | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-inf-01, xxa-gen-01, xxa-gen-02 | The same definite, the other way: a suffix becomes a separate word. |
| A05 | `kanoki zuma sona` | `mo hundo kinda vidra` | ok | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-inf-01, xxb-gen-01, xxb-gen-02 | The plural. A suffix in xxa becomes the particle `mo` in xxb. |
| A06 | `mo hundo kinda vidra` | `kanoki zuma sona` | ok | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxa-gen-01, xxa-inf-01 | The same plural, the other way. |
| A07 | `sona rintadu nolu bero` | `kinda libru pikko da lektu` | ok | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-03, xxa-inf-02, xxb-gen-01, xxb-gen-02, xxb-gen-03 | Past tense and a modifier at once. The `-du` suffix becomes the particle `da`, and the adjective crosses its noun. |
| A08 | `kinda libru pikko da lektu` | `sona rintadu nolu bero` | ok | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxb-ana-03, xxa-gen-01, xxa-gen-03, xxa-inf-02 | The same sentence back. |
| A09 | `sona zuma glimu` | `kinda ⟦glimu⟧ vidra` | partial | xxa->xxb | neutral | n/a | xxa-ana-01, xxb-gen-01 | `glimu` is in no dictionary. Word order still fixes its slot, so the clause parses and only the one word is marked. |
| A10 | `kinda glimu vidra` | `sona zuma ⟦glimu⟧` | partial | xxb->xxa | neutral | n/a | xxb-ana-01, xxa-gen-01 | The same unknown word from the other side. The object slot is the middle one in xxb and the last one in xxa, so the mark moves. |
| A11 | `sona zuma veri` | `kinda ⟦veri⟧ vidra` | partial | xxa->xxb | neutral | n/a | xxa-ana-01, xxb-gen-01 | `veri` analyses to `house(icl>building)`, which xxb has no word for. Analysis succeeds and generation is the side that fails, and the mark still holds the xxa surface form. |
| A12 | `kano` | *(empty string)* | no_parse | xxa->xxb | neutral | n/a | — | One noun, no verb. No word-order rule matches, so nothing is built and `text` stays empty. Must-not-fire row for every xxa and xxb rule. |
| A13 | `hundo` | *(empty string)* | no_parse | xxb->xxa | neutral | n/a | — | The same on the xxb side. |
| A14 | `milaki zuma ta kano` | `mo katsu hundon vidra` | ok | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-02, xxa-inf-01, xxb-gen-01, xxb-gen-02, xxb-inf-01 | A plural subject and a definite object in one clause. Each language marks one of them with a suffix and the other with a word, and they disagree about which. |
| A15 | `mo katsu hundon vidra` | `milaki zuma ta kano` | ok | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxb-inf-01, xxa-gen-01, xxa-gen-02, xxa-inf-01 | A14 back. |
| A16 | `ta sonaki pelo beroki` | `mo kindan mo libru manga` | ok | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-02, xxa-inf-01, xxb-gen-01, xxb-gen-02, xxb-inf-01 | One node carries `@def` and `@pl` together. xxa writes the article and glues the plural on; xxb glues the definite on and writes the particle. |
| A17 | `mo kindan mo libru manga` | `ta sonaki pelo beroki` | ok | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxb-inf-01, xxa-gen-01, xxa-gen-02, xxa-inf-01 | A16 back. |

17 rows. Ten `ok`, three `partial`, two `no_parse` — and A11 and A09 fail on different sides of the
pipeline, so a test that confuses them shows up as one row and not two.

## The UNL graph behind each input

The `test-writer` may assert `Result::unl` as well as `Result::text`. These are the graphs, written
the way `tests/fixtures/languages/<lang>/corpus/basic.yaml` writes them. Both directions of a pair
share one graph; that is the point of the interlingua.

| rows | graph |
|---|---|
| A01, A02 | `agt(see(icl>perceive), dog(icl>animal))` / `obj(see(icl>perceive), child(icl>person))` |
| A03, A04 | `agt(see(icl>perceive), dog(icl>animal).@def)` / `obj(see(icl>perceive), child(icl>person))` |
| A05, A06 | `agt(see(icl>perceive), dog(icl>animal).@pl)` / `obj(see(icl>perceive), child(icl>person))` |
| A07, A08 | `agt(read(icl>interpret).@past, child(icl>person))` / `obj(read(icl>interpret).@past, book(icl>publication))` / `mod(book(icl>publication), small(icl>size))` |
| A09, A10 | `agt(see(icl>perceive), child(icl>person))` / `obj(see(icl>perceive), "glimu")` |
| A11 | `agt(see(icl>perceive), child(icl>person))` / `obj(see(icl>perceive), house(icl>building))` |
| A12, A13 | empty graph |
| A14, A15 | `agt(see(icl>perceive), cat(icl>animal).@pl)` / `obj(see(icl>perceive), dog(icl>animal).@def)` |
| A16, A17 | `agt(want(icl>desire), child(icl>person).@def.@pl)` / `obj(want(icl>desire), book(icl>publication).@pl)` |

## Rule coverage

Every drafted rule has a row that fires it and a row that must not. `docs/standards/data.md` makes
an uncovered rule a warning at M2 and an error from M3; the fixture starts covered.

| rule | fires in | must not fire in |
|---|---|---|
| xxa-ana-01 | A01 | A12 |
| xxa-ana-02 | A03 | A01 |
| xxa-ana-03 | A07 | A01 |
| xxa-gen-01 | A02 | A13 |
| xxa-gen-02 | A04 | A02 |
| xxa-gen-03 | A08 | A02 |
| xxa-inf-01 | A05 | A01 |
| xxa-inf-02 | A07 | A01 |
| xxb-ana-01 | A02 | A13 |
| xxb-ana-02 | A06, A08 | A02 |
| xxb-ana-03 | A08 | A02 |
| xxb-gen-01 | A01 | A12 |
| xxb-gen-02 | A05, A07 | A01 |
| xxb-gen-03 | A07 | A01 |
| xxb-inf-01 | A04 | A02 |

## What the corpus covers

The five sentences per language that the acceptance criteria name live in
`tests/fixtures/languages/<lang>/corpus/basic.yaml`, ids `xxa-c1`..`xxa-c5` and `xxb-c1`..`xxb-c5`:
a plain subject-verb-object clause, a definite article, a plural, a past tense, and a word no
dictionary holds. Rows A14 through A17 go past the corpus on purpose: they stack two marks on one
node so that a rule which happens to work for one mark at a time still fails here.
