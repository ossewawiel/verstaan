# Issue 24 — test cases

**This file is the source of truth.** `tests/fixtures/languages/eng/tests/basic.yaml` carries the
same fifteen rows so a loader can read them. Where the two disagree, this file wins and the YAML is
corrected to match it.

No `expected` value in this file came from running the engine. The engine returns
`Status::not_implemented` and keeps doing so until the M3 slice quests close. Every `expected` is
transcribed from `data/languages/afr/corpus/ugoa1.yaml`, from the row whose `source.line` matches
the English row's `source.line`. The archive corpus is the authority on what the Afrikaans says.

Every row is `review: pending`. The owner is the reviewer for Afrikaans and English, and the owner
has not ticked these rows yet. A tick flips the column to `confirmed`, one row at a time.

## The corpus in one paragraph

`ugoa1` is the UNL Archive's noun-phrase corpus. It carries 248 numbered lines per language, and
`eng` and `afr` share the line numbering, so line 121 is `a beautiful book` on one side and
`'n mooi boek` on the other. Every line is a noun phrase; not one has a finite verb. That shape
decides what this set can test. It gives a clean run at determiners, number, modification, place
and time relations, and coordination, and it gives no run at all at tense, agreement or word order
in a clause. The fifteen rows below climb from a bare noun to a fourteen-word phrase that stacks
five relations on one head, and they cross three Afrikaans inflectional paradigms and one
homograph on the way.

Notation in `expected`: `⟦word⟧` is the marking of `SPEC.md` §3.4 for a word that fell through
untranslated. The mark holds the **English** surface form, because the engine has no Afrikaans form
to put there. The `status` column is the `Status` value the `Result` must carry.

`direction` reads `eng-afr` per this issue's acceptance criteria. The xxa/xxb fixture of issue 04
writes the same field as `xxa->xxb`. Issue 26's loader has to accept both spellings, or one of the
two files changes.

## How to read the rule ids

Archive rule ids restart at `1` in every grammar file, so a bare `12` names four different rules.
This table qualifies each id with language and kind:

| Prefix | File |
|---|---|
| `eng-ana-NN` | `data/languages/eng/grammar/analysis.yaml`, record `id: "NN"` |
| `afr-gen-NN` | `data/languages/afr/grammar/generation.yaml`, record `id: "NN"` |
| `afr-dis-NN` | `data/languages/afr/grammar/disambiguation.yaml`, record `id: "NN"` |
| `afr-inf-MNN` | `data/languages/afr/grammar/inflection.yaml`, record `id: "MNN"` |

The ids name the rules the rule-author expects to fire. They are a reading of the rule text, not a
recording of a run. Issue 26's loader prints the real trace on failure, and a disagreement between
the trace and this column is a finding for the implementer, not a silent correction here.

## Block A — eng → afr, `ugoa1`

| id | input | expected | status | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| A01 | `book` | `boek` | ok | eng-afr | neutral | pending | — | `ugoa1` line 1. A bare UW, no attribute, no relation. Dictionary lookup carries the whole row. Must-not-fire row for every rule this table names. |
| A02 | `the book` | `die boek` | ok | eng-afr | neutral | pending | eng-ana-12, afr-gen-35, afr-gen-125, afr-gen-231 | Line 2. The definite article becomes `@def` on the node, then `die` in front of the noun. Must-not-fire row for afr-dis-5: the word after the determiner is a noun, not a verb, preposition or adverb. |
| A03 | `a book` | `'n boek` | ok | eng-afr | neutral | pending | eng-ana-12, afr-gen-36, afr-gen-125, afr-gen-231 | Line 3. The same path as A02 through `@indef`. Afrikaans writes the indefinite article with a leading apostrophe, so the row also pins the tokeniser's treatment of `'n`. |
| A04 | `books` | `boeke` | ok | eng-afr | neutral | pending | eng-ana-1, afr-gen-56, afr-gen-227, afr-inf-M3 | Line 10. English strips the plural suffix into `@pl`; Afrikaans puts one back through paradigm M3, which adds `e`. The mark moves off the word and onto the node, and back. |
| A05 | `the books` | `die boeke` | ok | eng-afr | neutral | pending | eng-ana-1, eng-ana-12, afr-gen-35, afr-gen-56, afr-gen-227, afr-inf-M3 | Line 31. Two attributes on one node, `@def.@pl`. A rule that handles one attribute at a time still has to survive this row. |
| A06 | `all the books` | `al die boeke` | ok | eng-afr | neutral | pending | eng-ana-12, afr-gen-35, afr-gen-37, afr-gen-60, afr-inf-M3 | Line 35. The graph is `@all.@def` with no `@pl`, so eng-ana-1 must not fire — its left side carries `^@all`. afr-gen-37 supplies the plural itself, and afr-gen-60 reorders `die alle boeke` to `al die boeke`; that rule's own comment names this output. |
| A07 | `a book in a box` | `'n boek in 'n doos` | ok | eng-afr | neutral | pending | eng-ana-12, eng-ana-15, afr-gen-22, afr-gen-36, afr-gen-129 | Line 91. The first relation row: `in` becomes an attribute on the box node, then the `plc` relation, then the Afrikaans preposition again. Two indefinite articles in one phrase. Must-not-fire row for afr-dis-5. |
| A08 | `a beautiful book` | `'n mooi boek` | ok | eng-afr | neutral | pending | eng-ana-12, eng-ana-50, afr-gen-8, afr-gen-36, afr-gen-124, afr-dis-5 | Line 121. Adjectival modification through `mod`. `mooi` is a homograph: the afr dictionary holds it as `ADJ` and as `AAV`. afr-dis-5 deletes the adverb reading, because an ordinary determiner cannot be followed by an adverb. |
| A09 | `a book about Geneva` | `'n boek oor ⟦Geneva⟧` | partial | eng-afr | neutral | pending | eng-ana-12, eng-ana-15, afr-gen-4 (diverges), afr-gen-36 | Line 128. **The designated partial row.** `Geneva` is in no `data/languages/eng/dictionary/<a-z>.yaml` shard: `g.yaml` holds `Geneva gown`, `Genevan` and `Genevans`, and no bare `Geneva`. The corpus UW is `500004419`, which neither dictionary maps. The corpus reads `'n boek oor Genève`; one word of it cannot be reached, so that word carries the mark. afr-gen-4's comment writes `omtrent` where the corpus writes `oor`. |
| A10 | `some days before the summer` | `'n paar dae voor die somer` | ok | eng-afr | neutral | pending | eng-ana-12, eng-ana-15, afr-gen-26, afr-gen-35, afr-gen-40 (diverges), afr-gen-227, afr-inf-M2, afr-inf-M7 | Line 143. **The M7 row.** `dag` takes paradigm M7, which replaces the final `g` with `e` to give `dae`; M7's own comment names `dae`. `somer` takes M2 and stands here in its singular branch. The graph is `@paucal`, not `@pl`, so eng-ana-1 must not fire. afr-gen-40 writes `enkele` where the corpus writes `'n paar`. |
| A11 | `the beautiful car` | `die mooi kar` | ok | eng-afr | neutral | pending | eng-ana-12, eng-ana-50, afr-gen-8, afr-gen-35, afr-gen-124, afr-dis-5 | Line 209. **The disambiguation row.** Same shape as A08 with the definite article, and the shortest phrase in which afr-dis-5 has real work: `die` is a determiner, `mooi` offers an `ADJ` reading and an `AAV` reading, and afr-dis-5 strikes the adverb. |
| A12 | `a very beautiful car` | `'n baie mooi kar` | ok | eng-afr | neutral | pending | eng-ana-12, eng-ana-13, eng-ana-50, afr-gen-8, afr-gen-36, afr-gen-42 | Line 210. A degree adverb on the adjective, `@plus`. eng-ana-13 folds `very` into the attribute; afr-gen-42 unfolds it to `baie`. The row stacks a modifier on a modifier. |
| A13 | `John and Mary` | `John en Mary` | ok | eng-afr | neutral | pending | eng-ana-18, afr-gen-33 | Line 219. Both names enter the graph as quoted UNL literals, `"John"` and `"Mary"`, not as dictionary entries, so neither is a fall-through and the row is `ok`. The two names sit on opposite sides of a trap: `Mary` is in no English shard, and `john` **is** — as a common noun. A capitalised token has to take the literal reading over a lower-case dictionary hit. Must-not-fire row for afr-gen-58, which only strips a repeated `en` from three or more conjuncts. |
| A14 | `a car, a book and a mug` | `'n kar, 'n boek en 'n beker` | ok | eng-afr | neutral | pending | eng-ana-12, eng-ana-16, eng-ana-18, afr-gen-33, afr-gen-36, afr-gen-58, afr-inf-M2 | Line 230. **The M2 row.** `beker` takes paradigm M2, standing in its singular branch. Three conjuncts, so eng-ana-16 normalises the comma to a second `and` and afr-gen-58 puts the comma back. Three indefinite articles survive the round trip. |
| A15 | `the beautiful book about the city of Paris without pictures and photos on the table` | `die mooi boek op die tafel oor ⟦Paris⟧ die stad sonder prente en foto's` | partial | eng-afr | neutral | pending | eng-ana-12, eng-ana-15, eng-ana-18, eng-ana-50, afr-gen-4 (diverges), afr-gen-8, afr-gen-22 (diverges), afr-gen-33, afr-gen-35, afr-gen-227, afr-inf-M3, afr-inf-M16 | Line 248. **The M16 row**, and the only UW-backed one in the corpus: `foto` takes M16, which adds `'s`. The phrase stacks `plc`, `mod`, `cnt`, `nam` and `and` on one head and reorders heavily into Afrikaans. `Paris` (UW `500003943`) is in neither dictionary, so the row is `partial` too — see "Where M16 forces a second partial" below. |

Fifteen rows. Thirteen `ok`, two `partial`. No `no_parse` row: every line in `ugoa1` is a
well-formed noun phrase, and the corpus offers nothing that must fail to parse.

## What each special requirement lands on

| Requirement | Row | Witness |
|---|---|---|
| Names a real `afr/grammar/disambiguation.yaml` id | A11 (also A08) | afr-dis-5, `(D,^AFT)(BLK)({V\|P\|AAV})=0` |
| M2 paradigm | A14 (also A10, via `somer`) | `beker`, `data/languages/afr/dictionary/b.yaml`, `PAR: M2` |
| M7 paradigm | A10 | `dae`, `data/languages/afr/dictionary/d.yaml`, `PAR: M7` |
| M16 paradigm | A15 | `foto's`, `data/languages/afr/dictionary/f.yaml`, `PAR: M16` |
| `status: partial` | A09 (designated), A15 (forced) | `Geneva`; `Paris` |

## Rule coverage

`docs/standards/data.md` makes an uncovered rule a warning at M2 and an error from M3. The rules
below are the ones this block names; the block starts them covered on both sides.

| rule | fires in | must not fire in |
|---|---|---|
| eng-ana-1 | A04, A05 | A06, A10 |
| eng-ana-12 | A02 | A01 |
| eng-ana-13 | A12 | A08 |
| eng-ana-15 | A07 | A01 |
| eng-ana-16 | A14 | A13 |
| eng-ana-18 | A13 | A01 |
| eng-ana-50 | A08 | A02 |
| afr-dis-5 | A08, A11 | A02, A03, A07 |
| afr-gen-4 | A09 | A02 |
| afr-gen-8 | A08 | A02 |
| afr-gen-22 | A07 | A02 |
| afr-gen-26 | A10 | A07 |
| afr-gen-33 | A13 | A01 |
| afr-gen-35 | A02 | A03 |
| afr-gen-36 | A03 | A02 |
| afr-gen-37 | A06 | A05 |
| afr-gen-40 | A10 | A04 |
| afr-gen-42 | A12 | A08 |
| afr-gen-56 | A04 | A01 |
| afr-gen-58 | A14 | A13 |
| afr-gen-60 | A06 | A05 |
| afr-gen-227 | A04 | A01 |
| afr-inf-M2 | A14 | A04 |
| afr-inf-M3 | A04 | A01 |
| afr-inf-M7 | A10 | A04 |
| afr-inf-M16 | A15 | A04 |

## Where M16 forces a second partial

`foto's` is the only Afrikaans surface form in the whole `ugoa1` corpus whose lemma carries
`PAR: M16`. It appears on three lines, 246, 247 and 248, and every one of the three also carries
`Paris`. UW `500003943` is in neither `data/languages/eng/dictionary/` nor
`data/languages/afr/dictionary/`; the English shard `p.yaml` does hold a `Paris`, but it maps
UW `112469372`, the herb *Paris quadrifolia*, not the city. Of the three lines, only 248 pairs
`foto's` with the UW the corpus's own graph names: line 248 reads `pictures and photos` against
`prente en foto's`, which matches `106999436` to `prent` and `103925226` to `foto`. Lines 246 and
247 put `foto's` opposite `pictures`, which the dictionary answers with `prent`.

So the set cannot cover M16 with an `ok` row. A15 covers it with a `partial` row and names the
reason. A09 stays the designated partial of the acceptance criteria because it is the small,
readable one: four words, one missing name, one mark.

## Where the corpus and the rules disagree

These rows are correct as written and the engine will not produce them from the rules as they
stand today. Each line is a finding for the implementer, not an error in the table.

| row | rule | rule produces | corpus says |
|---|---|---|---|
| A09, A15 | afr-gen-4, `cnt(%x,N;%y,N)` | `omtrent` | `oor` |
| A10 | afr-gen-40, `(%x,N,@paucal)` | `enkele` | `'n paar` |
| A15 | afr-gen-22, `plc(%x;%y,N)` | `in` | `op` — the graph carries `@top.@contact`, and no afr generation rule keys on that pair |
| A15 | — | — | no afr generation rule handles the `nam` relation at all |

## What the store does not carry yet

The engine cannot tag `the`, `a`, `and`, `of`, `on` or `without` from the dictionary, and it cannot
tag `die` or `'n` either. The UNLarium exports hold those entries with an empty UW field —
`[the]{275860}""(LEMMA=the,BF=the,LEX=D,POS=ART,...)` — and the importer's schema requires `uw` to
have at least one character, so it wrote them to `data/languages/eng/_unparsed.txt` and
`data/languages/afr/_unparsed.txt` instead. That is 1639 English and 1658 Afrikaans entries, every
determiner, conjunction, preposition and punctuation mark among them. Neither store holds a single
record with `LEX: D`.

These rows still read `ok`. A function word the grammar supplies as a literal or as an attribute is
not a dictionary fall-through, and marking six rows `⟦the⟧` would describe an importer gap as an
engine result. The gap is real and it belongs to a new issue against `tools/importer` and
`tools/validate/schema/`, not to this table.
