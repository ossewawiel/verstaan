# Issue 207 — capitals, names and place records test cases

**This file is the source of truth for issue 207's tests and rules.** The test-writer turns block C
into GoogleTest cases. Where a test, a rule `comment`, a grammar file, a dictionary record, an ADR or
another test-cases file disagrees with this file on a row named here, this file wins and the other is
corrected to match. Rows of `181-test-cases.md` (N16, N53), `182-test-cases.md` (P04),
`195-test-cases.md` (D03), `198-test-cases.md` (R04) and `199-test-cases.md` (K09) change here.

No `expected` value in this file came from running the engine. Each one comes from the owner's
rulings in the issue file, the archive corpus `data/languages/eng/corpus/ugoa1.yaml`, ADR 0025, the
owner's word rulings (ADR 0023: `motor`), or a rule-author draft for the owner to review.

The rule-author compiled a scratch probe outside the repo. It set no expected value. The "Today" part
of a note is the output of `main` at `af2eba1`, before this quest.

Every row that makes a claim about English or Afrikaans is `review: pending`. The owner has not ticked
these rows. A row that makes no language claim is `review: n/a`.

## Owner rulings, 2026-11-05

- **The lower-case test: option 1.** A lower-case form that is noun-only with `priority` 0 on every entry
  counts as no word. `john` is 0 on every entry, so `John` has no record and shows bare, and A13 passes as
  `John en Mary`, `ok`. `car` is 17, so `Car` gives `motor`. The rule needs no person list.
- **The accepted cost.** 65,129 of the 68,782 noun-only single-token headwords stay bare at the start of a
  sentence, as today. 475 of those 65,129 also have an exact-case record, which stands as it does today,
  so `Comrade` shows `⟦Comrade⟧`. The other 64,654 show bare, so `Dad` shows `Dad` with exit 0.
- **`New York`: quest 217 owns it.** This file pins no output for it, and no row takes it. ADR 0030 states
  what the input prints until then, as a known result and not a ruling.
- **`Einstein`: accepted, marked.** A person with a record shows marked. C25 stands.
- **`HELP`: first character only, accepted.** C08 stands.
- **The tie stays.** A tie goes to the lower-case form. That is the rule-author's reading, and the owner
  confirmed it on 2026-11-05.
- **`March`, `May` and `August` get a raised `priority`,** so the exact form wins with no engine branch.
  The values are under "Data the implementer adds".
- **`God`: a new record with the quoted UW `"God"` and `priority` 9.** The owner chose option 2 of B3. `God`
  gives `God`, `ok`, and `a book about God` gives `'n boek oor God`, `ok`.
- **The punctuation fix leaves this quest.** A second verifier read measured its true width, and the owner
  split it out for quest 220, which starts from the local branch `wip-207-put-fix`. This reverses the
  earlier ruling that kept it here. "Moved out of this quest" lists what left. ADR 0030 gives the reason.
- **`a book about cars` may go back to `om`.** `oor` there was only a side benefit. C40 states it.
- **`March on` reads the month.** A sentence that starts with the verb gives the month. The owner accepted
  this cost. C83 states it.
- **`Mr. Holly` and `Mr. Penny`: a known cost.** Any full stop counts as a sentence end. The owner accepted
  this in this quest, and quest 221 addresses it. ADR 0030 states it. No row pins it.

## B3 closed: `God`

The owner ruled that the `God` record gets a raised `priority`, and no bare `God` record exists. So the owner
chose between three options on 2026-11-05. No blocker stands in this file.

| Option | Result | Outcome |
|---|---|---|
| 2. A new `God` record with the quoted UW `"God"`, `priority` 9. | `God`, `ok`; `'n boek oor God`, `ok` | **Chosen.** It is the first record in the store with a quoted UW. |
| 1. No record, and `god`'s six entries lowered from 8 to 0, so it counts as no word. | The same outputs | Lost. It lowers six archive records where the ruling raises one word, and `God` would hold no record. |
| 3. A new `God` record with `god`'s UW `109505418`, `priority` 9. | `⟦God⟧`, `partial` | Lost. It gives a mark, not the output the owner names. Afr has no record for that UW. |

Lower-case `god` must still give `beeld`, and it does. `god` has no capital, so it takes no capital path. A
lookup is case-sensitive, so it reads the six `god` entries and never the `God` record. C93 pins this.

## Decisions

Each one settles a point the issue, SPEC.md or an ADR leaves open. Each is an ADR candidate, and
ADR 0030 records D1 to D3.

- **D1. The order of the two lookups, and the end of the hard-coded `"I"`.** A sentence-initial capital
  reads the lower-case form first. The owner's test then removes a form that counts as no word. The exact
  form wins only when its best `priority` is strictly higher. `A` is 0 against `a` at 255, so the article
  wins. `i` is noun-only at 0, so it counts as no word and the `I` records stand. No branch names `I`, which
  SPEC §1 asks for. Of 832 capitalised single-token headwords with a lower-case partner, 475 keep the exact
  form under the owner's test. 6 keep it on priority: `Dot`, `Grass`, `Greens`, `Media`, `X-ray` and `X-rays`.
  The other 351 take the lower-case form: 65 on priority and 286 on a tie. The tie is the rule-author's
  reading of "the lower-case word must win", and the owner confirmed it on 2026-11-05. Raising a record's
  `priority` is how a word leaves the tie.
- **D2. Only the first character folds.** `HELP` reads `hELP`, finds nothing and is a name, so it shows
  `HELP`, `ok`. A full fold would turn `US` into `us` and `WHO` into `who`. `IT` keeps its exact record the
  same way: `iT` has none. The owner accepted this on 2026-11-05.
- **D3. A determiner stays on a name.** `the Car` gives `die Car`, and today's `Car` drops a source word
  with status `ok`. ADR 0025 rejects that loss. `afr-gen-35` and `afr-gen-36` widen to `{N|^LEX}`, the
  shape issue 182 gave `afr-gen-4`. The widening reaches a node with no target entry, so N53 becomes
  `'n ⟦box⟧`.
- **D4. `Geneva` is `POS: PPN`.** The tagset defines PPN as a proper noun, and rule 182 gives a name
  literal the same value. So `eng-ana-183` reads one value, and `book Geneva` keeps ADR 0025's output.
  `Paris` stays `POS: NOU`, as the archive holds it, so `book Paris` takes rule 10. No row pins that.
- **D5. A mark shows the word as typed.** `Slumbrous` gives `⟦Slumbrous⟧`, as T106 of `27-test-cases.md`
  says, and ADR 0025 says "source surface". The candidate's surface is the lower-case form, because
  `eng-dis-6` reads `[all]`. So the source surface list keeps the token, and the two can differ.

- **D6. `eng-dis-11` reads a later capital, through a bare engine tag.** The rule strips `about` to its
  preposition, and `eng-ana-15` cannot place that preposition before a full stop. So the rule must not fire on
  an ordinary noun. It must still fire on `Paris` and `Einstein`, which main read with `oor`. No feature tells
  them from an ordinary noun: `Einstein`'s and `Paris`'s feature sets each also stand on a lower-case noun. So
  the engine gives a bare `CAP` tag to a later capital whose every reading is `LEX=N`, and the rule reads it. No
  other rule names `CAP`, and no tagset or dictionary file does, so only this rule can see it. The all-noun test keeps `about` as
  it was before `I` and `English`: each has a reading that is no noun, and `eng-ana-15` could not use it. The
  table below gives each shape the rule-author ran. This tag is engine work that the split did not list. ADR 0030
  says why it differs from `docs/standards/data.md`'s rule on features.

  | Shape after `([about],^POS=PRE)` | Result |
  |---|---|
  | `(N,^CAR,#PREFERRED)`, the lead | Fails. `cars` has readings with no `CAR`, so it still fires and `a book about cars.` still loses `about`. `Einstein` holds `CAR: CTB`, so it reads `om`. |
  | `(POS=PPN,#PREFERRED)` | Fails. `Paris` and `Einstein` are `POS: NOU`, so both read `om`. |
  | `(N,NUM=SNGT,#PREFERRED)` | Fails. `Einstein` is `NUM: SNG`, so it reads `om`. |
  | `({POS=PPN\|[Paris]\|[Einstein]},#PREFERRED)` | Meets each named input, in data alone. It names a person in a rule, and every other later capital with a record goes from main's `oor` to `om`. It is the fallback if the tag is refused. |
  | `(N,CAP,#PREFERRED)` | **Drafted and built.** It meets each named input. Of the 9,593 all-noun capitals, 9,588 read `oor`, as in main. Five do not: `D`, `D's`, `DP`, `PB` and `PP`, each at frequency 1. ADR 0030 states them. So "no input loses `about`" is false for these five. |
- **D7. The raised values are the smallest that win.** `March` goes from 6 to 7, because `march` is 6. `May`
  and `August` go from 0 to 1, because `may` and `august` are 0. `God` is 9, because `god` is 8. A small value
  changes the least elsewhere: ADR 0023's lexical choice is the only other reader of `priority`.

## Data the implementer adds

No store file is added, so SPEC §3.3 does not change. Run `python -m tools.importer.meta` after the change.

After the split, `eng` holds 11 disambiguation rules: main's 10 and `eng-dis-11`. `afr` holds 236 generation
rules, main's count. `afr/meta.yaml` at `af2eba1` says 234, and `eng/meta.yaml` says 5 disambiguation rules.
Both were already stale, so the file count is the figure to check, not the old `meta.yaml`.

`data/languages/eng/dictionary/g.yaml`, directly before the first `Geneva gown` record:

```yaml
- headword: Geneva
  id: 900002
  uw: "500004419"
  features: {LEMMA: Geneva, BF: Geneva, LEX: N, POS: PPN, LST: WRD, NUM: SNGT, PAR: M0, FRA: Y0, ABN: CCT, ANI: NANM, SEM: PLC}
  lang: eng
  frequency: 1
  priority: 0
  source: {archive_path: original, line: "issue 207, owner ruling 2026-11-04; UW from exports/corpus/ugoa1/export_corpus.php__project_ugoa1_lang_en_unl_ucl line 128; features adapted from the Paris record, p.yaml line 4690, with POS=PPN and SEM=PLC"}
```

`data/languages/eng/grammar/disambiguation.yaml`, appended:

```yaml
- id: "11"
  kind: disambiguation
  lhs: "([about],^POS=PRE)(N,CAP,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of about but the preposition when a later capital with a record follows, as in A09 about Geneva; the capital keeps its readings"
  source: {archive_path: original, line: "issue 207; adapted from exports/ger/49.dgrammar.txt line 14 and wiki/D-rule.wikitext line 155, in the shape of eng-dis-3 and eng-dis-7; CAP is the engine's bare tag, ADR 0030"}
```

`eng-dis-4` loses A09 to rule 11. Its comment changes to "as in about Brisbane". It stays otherwise as main
holds it.

`data/languages/eng/grammar/analysis.yaml`, record `183`:

```yaml
  lhs: "(N,^TEMP,^POS=PPN,%x)(NB,{TEMP|POS=PPN},%y)({XP,^D,^J|PUT|STAIL|CTAIL},%right)"
  source: {archive_path: original, line: "issue 199, widened in issue 207 to a record with POS=PPN; adapted from grammars/eng_unl_tgrammar.txt line 46 (rule 10) with head and adjunct swapped for a name"}
```

`data/languages/afr/grammar/generation.yaml`, records `35` and `36`, edited in place per ADR 0020:

```yaml
- id: "35"
  lhs: "(%x,{N|^LEX},@def)"
  comment: "book.@def > NS(boek,die), also for a name or a UW with no afr entry: Car.@def > NS(Car,die)"
  source: {archive_path: original, line: "issue 207; adapted from exports/afr/47.tgrammar.txt line 41 (rule 35): the word may also carry no LEX, in the shape of afr-gen-4"}
- id: "36"
  lhs: "(%x,{N|^LEX},@indef)"
  comment: "book.@indef > NS(boek,'n), also for a name or a UW with no afr entry: Car.@indef > NS(Car,'n)"
  source: {archive_path: original, line: "issue 207; adapted from exports/afr/47.tgrammar.txt line 42 (rule 36): the word may also carry no LEX, in the shape of afr-gen-4"}
```

Both `basic.yaml` copies: row A09 loses `deferred: 207` and adds `eng-dis-11` to `rules`.

### Added on 2026-11-05

`data/languages/eng/dictionary/`, six records edited in place, `priority` and `source` only. ADR 0030 gives
the reason for the marking.

| Record | `priority` | `source` becomes `{archive_path: original, line: "..."}` |
|---|---|---|
| `m.yaml:6770` `March` | 6 to 7 | `issue 207, owner ruling 2026-11-05: priority 6 raised to 7 so the exact form wins at the start of a sentence; adapted from exports/eng/en_gen_u_c_ucl/en_gen_u_c_ucl_2.txt line 6375` |
| `m.yaml:6778` `March` | 6 to 7 | The same, `exports/eng/en_ana_u_c_ucl/en_ana_u_c_ucl_2.txt line 58874` |
| `m.yaml:9642` `May` | 0 to 1 | The same with 0 raised to 1, `exports/eng/en_gen_u_c_ucl/en_gen_u_c_ucl_2.txt line 7225` |
| `m.yaml:9650` `May` | 0 to 1 | The same with 0 raised to 1, `exports/eng/en_ana_u_c_ucl/en_ana_u_c_ucl_2.txt line 60432` |
| `a.yaml:36538` `August` | 0 to 1 | The same with 0 raised to 1, `exports/eng/en_gen_u_c_ucl/en_gen_u_c_ucl_1.txt line 42936` |
| `a.yaml:36546` `August` | 0 to 1 | The same with 0 raised to 1, `exports/eng/en_ana_u_c_ucl/en_ana_u_c_ucl_1.txt line 48247` |

`data/languages/eng/dictionary/g.yaml`, a new record, directly before the first `God knows how` record:

```yaml
- headword: God
  id: 900003
  uw: "\"God\""
  features: {LEMMA: God, BF: God, LEX: N, POS: PPN, LST: WRD, NUM: SNGT, PAR: M0, FRA: Y0, ABN: CCT, ALY: ALI, ANI: ANM, SEM: HUM}
  lang: eng
  frequency: 1
  priority: 9
  source: {archive_path: original, line: "issue 207, owner ruling 2026-11-05, option 2: a record whose UW is a quoted name, the first in the store; priority 9 beats god at 8, so the exact form wins; no archive line, adapted from the Geneva record in this shard"}
```

### The validator on this data

`validate_store` ran on a scratch overlay of both stores on 2026-11-05, with the data in this file and the moved
rules taken out. It reports 0 schema, feature-value, UW and rule-reference errors in `eng` and in `afr`, and it
accepts the quoted UW. `eng` holds 11 disambiguation rules there, and `afr` holds 236 generation rules.

- The check is proven. The `God` record with a control byte in its UW, a number as its UW, `POS: ZZZ` or no
  `source` each fails, and a rule with no `source` or a wrong `kind` fails.
- The UW test is only "printable ASCII". It says nothing about what a quoted UW means. The engine test C84 does.
- The validator does not parse a rule's `lhs` or `rhs`. The probe's engine run is the only proof of those.
- The overlay kept the old `meta.yaml` and still passed, so the validator does not compare the counts. Run
  `python -m tools.importer.meta` by hand.

## Engine notes for the implementer

No public API changes. Row C57 needs one stub: it calls `decode_leading_code_point` directly, so the next step
adds that stub to the test commit. The rest of the work sits in `engine/src/engine.cpp`.

- The candidate surface is the lower-case form when that form wins. `eng-dis-6` reads `[all]`, and
  `All the books` fails without it. C02 goes red if the surface stays `All`.
- A later capital consults its exact form only. It takes no lower-case lookup.
- `is_noun` stays and narrows. A lower-case form counts as no word when every entry is `POS=NOU` and every
  entry has `priority` 0.
- A later capital whose every reading is `LEX=N` carries a bare `CAP` feature on each reading, added in
  `build_positions`, as `TEMP` is. `eng-dis-11` reads it. A sentence-initial capital needs no tag, because the
  word directly after `about` is never sentence-initial.
- `tests/unit/rule_interpreter_test.cpp:345-360` builds its own positions and adds `CAP` itself, with its own
  capital test. So its rows do not prove the engine sets the tag. The real path proves it: C12, C15, C25, C28, C94,
  N16, P04 and R04 run through `translate`, and each goes red if the engine stops setting `CAP`.
- The next implementer pass changes two pieces of text. Both are exact.
  - `eng-dis-11`'s `comment` becomes: `Strikes every reading of about but the preposition when a later capital
    whose every reading is a noun follows, as in A09 about Geneva; the capital keeps its readings`.
  - `docs/standards/data.md` gains this line, directly after the line that says a feature comes from
    `tagset.yaml`: `  - Exception: a bare tag the engine sets on a candidate, which no store record holds, stays
    out of the tagset. CAP is the one case. See ADR 0030.`
- A punctuation token's candidate carries no feature, as in main. Quest 220 owns that.
- `decode_leading_code_point` refuses an overlong form, a surrogate and a value above U+10FFFF. In main `E0 81
  81` is no capital, because main's test reads ASCII only. The strict decoder must keep it that way.
- `TEMP` stays on the name literal and only there, in the literal branch of `build_positions`. A record never
  carries it. C50 and C51 pin both sides.

## Block C

Status follows the output after a comma. `same as` compares `text`, `unl` and `status` with the second
input's result.

### F2's inputs, every one in the issue's table

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C01 | `A book` | `'n boek`, `ok` | eng-afr | neutral | eng-ana-12, afr-gen-36 | review: pending. Owner, issue. Today `boek van A`. Fires D1: `a` at 255 beats `A` at 0. |
| C02 | `All the books` | `al die boeke`, `ok` | eng-afr | neutral | eng-dis-6 | review: pending. A06's text. Today `finaal boeke`, because `eng-dis-6` reads `[all]` and the surface is `All`. |
| C03 | `Car` | `motor`, `ok` | eng-afr | neutral | — | review: pending. Owner, issue; ADR 0023. Today `Car`. |
| C04 | `Cars` | `motors`, `ok` | eng-afr | neutral | — | review: pending. Issue: "`cars` gives motors". Today `Cars`. |
| C05 | `Children` | same as `children` | eng-afr | neutral | — | review: pending. The owner's word is `kinders`. `children` gives `kind` today, and quest 209 owns that plural, so this row compares and names no text. Today `Children`. |
| C06 | `The Book` | `die Book`, `ok` | eng-afr | neutral | eng-ana-12, afr-gen-35 | review: pending. D3. `Book` has no record, so it is a name. Today `Book`. |
| C07 | `the Car` | `die Car`, `ok` | eng-afr | neutral | eng-ana-12, afr-gen-35 | review: pending. D3. A later capital takes no lower-case lookup, so it is not `die motor`. Today `Car`. |
| C08 | `HELP` | `HELP`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. D2. Owner ruled 2026-11-05: first character only. Today the same. |
| C09 | `Xyzzy` | `Xyzzy`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. A capital with no record is a name. Today the same. |
| C10 | `xyzzy` | `⟦xyzzy⟧`, `partial` | eng-afr | neutral | — | review: pending. Lower case takes no name path. Must not fire `eng-ana-182`. |
| C11 | `Émile` | `Émile`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. Owner: a person's name stays bare, and `É` is `Lu`. Node `"Émile"`. Today `⟦Émile⟧`, exit 2. |

### Places and people: the owner's rulings

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C12 | `a book about Geneva` | `'n boek oor ⟦Geneva⟧`, `partial` | eng-afr | neutral | eng-dis-11, eng-ana-12, eng-ana-15, afr-gen-4, afr-gen-36 | review: pending. A09. Nodes `102870092.@indef`, then UW `500004419`. `cnt(0,1)`, corpus line 128. The test checks the second node's UW only, because the engine adds `@about`. Must not fire `eng-ana-182`, `eng-dis-4`. Today `'n boek oor Geneva`. |
| C13 | `Geneva` | `⟦Geneva⟧`, `partial` | eng-afr | neutral | — | review: pending. No `geneva` exists, so the exact record stands. Today `Geneva`. |
| C14 | `Paris` | `⟦Paris⟧`, `partial` | eng-afr | neutral | — | review: pending. Issue's evidence. Node `112469372`. Today the same. |
| C15 | `a book about Paris` | `'n boek oor ⟦Paris⟧`, `partial` | eng-afr | neutral | eng-dis-11, afr-gen-4 | review: pending. Issue's evidence: a later capital consults the dictionary. Node `112469372`. Today `'n boek oor Paris`. |
| C16 | `a book about Brisbane` | `'n boek oor Brisbane`, `ok` | eng-afr | neutral | eng-dis-4, eng-ana-182, afr-gen-4 | review: pending. The issue's Brisbane row. Node `"Brisbane"`. Must not fire `eng-dis-11`. Today the same. |
| C17 | `Brisbane` | `Brisbane`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. Must not fire `afr-gen-35`, `afr-gen-36`. |
| C18 | `a book about John` | `'n boek oor John`, `ok` | eng-afr | neutral | eng-dis-4, eng-ana-182 | review: pending. A later `John` has no exact record, so it is a name. The lower-case form is not read. |
| C19 | `Mary and John` | `Mary en John`, `ok` | eng-afr | neutral | eng-ana-18, afr-gen-33 | review: pending. Same words as A13, with `John` later in the sentence. Today the same. |
| C20 | `John and Mary` | `John en Mary`, `ok` | eng-afr | neutral | eng-ana-18, afr-gen-33 | review: confirmed on A13. Owner's lower-case test: `john` counts as no word, so `John` is a name. Nodes `"John"`, `"Mary"`. Today the same. |
| C21 | `John` | `John`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. Owner's lower-case test. Must not read `kleinhuisie`. Today the same. |
| C22 | `the beautiful book about the city of Paris without pictures and photos on the table` | Holds UW `112469372`, holds no node `"Paris"`, text holds `⟦Paris⟧`, `partial` | eng-afr | neutral | — | review: pending. A15's name node, per ADR 0030 and issue 201. A15 keeps `deferred: 215`, and quests 201 and 215 own the rest of its text. Today a bare `Paris`, `ok`. |
| C23 | `a book about Lyon` | `'n boek oor Lyon`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. The accepted cost: an old-world place with no record shows bare until it has one. |
| C24 | `a book about Shakespeare` | `'n boek oor Shakespeare`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. The corpus gives him UW `500009156`, and the store holds no record. So the store decides, not the corpus. |
| C25 | `a book about Einstein` | `'n boek oor ⟦Einstein⟧`, `partial` | eng-afr | neutral | eng-dis-11, afr-gen-4 | review: pending. Owner ruled 2026-11-05: accepted, marked. A person with a record, `e.yaml:3426`, shows marked. Today bare. |
| C27 | `a book about Émile` | `'n boek oor Émile`, `ok` | eng-afr | neutral | eng-dis-4, afr-gen-4 | review: pending. A later non-ASCII capital. Today `'n boek ⟦Émile⟧`. |
| C28 | `a book about Áine` | `'n boek oor ⟦Áine⟧`, `partial` | eng-afr | neutral | eng-dis-11, afr-gen-4 | review: pending. A non-ASCII capital with a record, UW `115669073`, stays a record. Must not produce a node `"Áine"`. |

C26 is retired. Quest 217 owns `a book about New York`, so this quest pins no output for it.

### The capital test and the lookup order

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C29 | `Comrade` | `⟦Comrade⟧`, `partial` | eng-afr | neutral | — | review: pending. `comrade` counts as no word, so the exact record stands, UW `109951524`. Must not produce a quoted node. Today the same. |
| C30 | `I` | No node with a quoted UW; `partial` | eng-afr | neutral | — | review: pending. D1. `i` counts as no word, so the `I` records stand. This row names no text. The first reading today is the noun `106832033`, so the text is `⟦I⟧` and not `ek`, and the row must not pin that as right. |
| C31 | Every file under `engine/src` | No string literal `"I"` | n/a | n/a | — | review: n/a. Source scan, in the form of N63. SPEC §1. |
| C32 | `New book` | same as `new book` | eng-afr | neutral | — | review: pending. D1's tie: 44 against 44. |
| C54 | `Media` | Node UW `115668874`, `media`, `ok` | eng-afr | neutral | — | review: pending. D1. The exact form wins on priority: 8 against 6. Must not read `media`'s plural node. Today the lower-case form is not read, so the same node. |
| C33 | `A book. A car.` | same as `a book. a car.` | eng-afr | neutral | eng-ana-12 | review: pending. The second `A` follows `.`. Today `A boek A motor`. |
| C34 | `book A` | Second node's UW is `113637376`, no quoted UW | eng-afr | neutral | — | review: n/a. A later capital with a record takes it, so `A` the noun stands here. Today `"A"`. |
| C35 | `Slumbrous` | `⟦Slumbrous⟧`, `partial` | eng-afr | neutral | — | review: pending. D5. Runtime tables. Agrees with T106 of `27-test-cases.md`. |
| C36 | `Ωmega` | `Ωmega`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. U+03A9 is `Lu`, SPEC §3.5's test, past Latin-1. Today `⟦Ωmega⟧`. |
| C37 | `ǅx` | `⟦ǅx⟧`, `partial` | eng-afr | neutral | — | review: n/a. U+01C5 is `Lt`, not `Lu`, so it is no capital. Today the same. |
| C38 | `émile` | `⟦émile⟧`, `partial` | eng-afr | neutral | — | review: pending. `Ll` takes no name path. |
| C39 | The single byte `0xC3` | `⟦` + the byte + `⟧`, `partial` | eng-afr | neutral | — | review: n/a. A cut UTF-8 sequence is no capital, and the decoder reads no byte past the token. Today the same. |
| C55 | The bytes `E0 81 81` | `⟦` + the bytes + `⟧`, `partial` | eng-afr | neutral | — | review: n/a. An overlong form of `A` is malformed, so it is no capital and takes no lower-case lookup. Must not fire `afr-gen-36`. |
| C56 | The bytes `F0 80 81 81` | `⟦` + the bytes + `⟧`, `partial` | eng-afr | neutral | — | review: n/a. The same, in four bytes. |
| C57 | `decode_leading_code_point` on `ED A0 80` and on `F4 90 80 80` | `length` 0 for both | n/a | n/a | — | review: n/a. Rewritten so it can fail: delete the branch and each returns a code point. Through `translate` the branch has no effect, because U+D800 and values above U+10FFFF are not `Lu`. The branch exists for the decoder's contract: `length` 0 means malformed, and a returned `code` is a scalar value, which `append_utf8` requires. The test includes `engine/src/unicode_utf8.hpp`. |
| C109 | `A`, `A.` and `A?` | Each is empty text, `ok` | eng-afr | neutral | — | review: pending. As `a` gives, ADR 0019 and row N19: the article has no UW, so no graph node. Main showed `A`. Fires D1: `a` at 255 beats `A` at 0. |

### The drafted rules: one row that fires, one that must not

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C40 | `a book about cars` | Fired ids hold no `11`, `ok` | eng-afr | neutral | — | review: n/a. Must not fire `eng-dis-11`: `cars` carries no `CAP`. It prints `'n boek om motors`, as main does. The owner accepted `om` here on 2026-11-05, and this row does not pin `om` as right. |
| C41 | `a book about the car` | `'n boek oor die motor`, `ok` | eng-afr | neutral | eng-dis-3 | review: pending. Must not fire `eng-dis-11`. |
| C42 | `a book about` | Fired ids hold no `11` | eng-afr | neutral | — | review: n/a. Nothing follows `about`, so `eng-dis-11` is silent. |
| C43 | `a book about Geneva`, disambiguation only | Position 2 holds only the preposition; fired ids `10`, `11`, in order | eng-afr | neutral | eng-dis-10, eng-dis-11 | review: n/a. Replaces D03's input. Today D03 asserts `4`, `10`. |
| C44 | `a book about Brisbane`, disambiguation only | Position 2 holds only the preposition; position 3 has no features; fired ids `4`, `10` | eng-afr | neutral | eng-dis-4, eng-dis-10 | review: n/a. D03 moves here, unchanged in its assertions. |
| C45 | `book Geneva` | `boek ⟦Geneva⟧`, `partial` | eng-afr | neutral | eng-ana-183 | review: pending. ADR 0025's row. Nodes `102870092`, `500004419`; `mod(0,1)`. Fires 183, must not fire 10 or 182. |
| C46 | `glass mug` | Fired ids hold `10` and no `183` | eng-afr | neutral | eng-ana-10 | review: n/a. A common noun is no name. |
| C47 | `book xyzzy` | `boek ⟦xyzzy⟧`, `partial` | eng-afr | neutral | — | review: pending. N17, unchanged. Must not fire 183. |
| C48 | `a Car` | `'n Car`, `ok` | eng-afr | neutral | afr-gen-36 | review: pending. D3. Today `Car`. |
| C49 | Graph `100135148.@indef`, surfaces `box` | `'n ⟦box⟧`, `partial` | eng-afr | neutral | afr-gen-36 | review: pending. N53 changes under D3. Today `⟦box⟧`. |
| C50 | `book Brisbane` | Fired ids hold `182` once and `183` once | eng-afr | neutral | eng-ana-182, eng-ana-183 | review: n/a. F10.2: a name literal carries `TEMP`. |
| C51 | `book Geneva` | Fired ids hold no `182` | eng-afr | neutral | — | review: n/a. F10.2: a record carries no `TEMP`. |
| C52 | `lookup("Geneva")`, eng store | One entry, UW `500004419`, `POS: PPN`, `SEM: PLC` | n/a | n/a | — | review: n/a. The record. Replaces the assertion in `RealFixedSetWordWithNoDictionaryEntryIsUnresolved`. |
| C53 | `lookup("Brisbane")`, eng store | No entry | n/a | n/a | — | review: n/a. That test moves here. |

### `eng-dis-11` does no new damage

Each input is one the wide rule damaged. A row asserts that the word is not lost. The note gives what the input
prints, and that text is not pinned: `oor` is the correct word for each topic reading, and quest 220 owns it. Each row goes red if `eng-dis-11` reads `(N,#PREFERRED)` again.

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C96 | `a book about cars.` | Text is not `'n boek motors`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `'n boek om motors`, as main. |
| C97 | `many books about cars.` | Text is not `talle boeke motors`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `talle boeke om motors`, as main. |
| C98 | `about cars` | Text is not `motors`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `om motors`, as main. |
| C99 | `about five books` | Text is not `vyf boeke`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `om vyf boeke`, as main. `five` has a noun reading, and no capital. |
| C100 | `a book about five cars` | Text is not `'n boek vyf motors`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `'n boek om vyf motors`, as main. |
| C101 | `a book about cars and books` | Text holds `motors en boeke`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `'n boek om motors en boeke`, as main. |
| C102 | `a book about cars or books` | Text holds `motors of boeke`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `'n boek om motors of boeke`, as main. |
| C103 | `the book is about cars` | No `⟦`; no `11` fired; `ok` | eng-afr | neutral | — | review: n/a. Prints `die boek lewe motors om`, as main. The wide rule gave `die boek lewe ⟦cars⟧`. |
| C110 | `about I` | Fired ids hold no `11` | eng-afr | neutral | — | review: n/a. `I` has a pronoun reading, so it carries no `CAP`. Prints `om ⟦I⟧`, as main. With the tag on every capital it printed `⟦I⟧`, so this row can fail. |
| C111 | `a book about English` | Fired ids hold no `11`; text holds `⟦about⟧` | eng-afr | neutral | — | review: n/a. `English` has an adjective reading, so it carries no `CAP`, and `about` stays visible. Prints `'n boek Engels ⟦about⟧`. Main gave `'n boek oor English`. |

### Known costs of the split

These are known results and not rulings. **No row here takes a test,** and none pins its text as correct. Quest
220 closes them. ADR 0030's "What gets worse against main" holds the full list, with the figures from the third
verifier read.

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C104 | `a book about Geneva.` | No test. Prints `'n boek ⟦Geneva⟧`, `partial`. | eng-afr | neutral | — | review: n/a. The old fault: main loses `about` here too, `'n boek Geneva`. `eng-ana-15` cannot fire before a full stop. |
| C105 | `a book about Brisbane.` | No test. Prints `'n boek Brisbane`, `ok`. | eng-afr | neutral | — | review: n/a. The old fault, the same text in main. |
| C106 | `On the table.` | No test. Prints `die tafel`, `ok`. | eng-afr | neutral | — | review: n/a. Main gave `aan die tafel`. The capital now finds the preposition `on`, and the old head-less fault loses it. |
| C107 | `In a box.` | No test. Prints `'n boks`, `ok`. | eng-afr | neutral | — | review: n/a. Main gave `⟦In⟧ 'n boks`. The same fault. |
| C108 | `Before the summer.` | No test. Prints `die somer`, `ok`. | eng-afr | neutral | — | review: n/a. Main gave `voor die somer`. The same fault. |

### Moved out of this quest

These ids stay retired here and are never reused: C70 to C79 and C86 to C92. They moved with the `PUT` fix to
quest 220.

### The owner's records and the months

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C80 | `March` | `Maart`, `ok` | eng-afr | neutral | — | review: pending. Owner 2026-11-05. Node `115210870`. `March` at 7 beats `march` at 6. Without the raise the new order gives `loop`. Today `Maart`. |
| C81 | `May` | `Mei`, `ok` | eng-afr | neutral | — | review: pending. Owner 2026-11-05. Node `115211484`. `May` at 1 beats `may` at 0. Without the raise the new order gives `⟦May⟧`. Today `Mei`. |
| C82 | `August` | Node `115212455`, `ok` | eng-afr | neutral | — | review: pending. Owner 2026-11-05. The exact form wins. The text is `Aug`, and that is a defect: afr holds `Aug`, `LST: ABB`, and `Augustus`, both at `priority` 0, and ADR 0023's tie takes the first in store order. Correct Afrikaans is `Augustus`. This row names no text, so it does not pin `Aug`. |
| C83 | `March on` | First node `115210870`, text starts `Maart` | eng-afr | neutral | — | review: pending. The owner accepted this cost: a sentence that starts with the verb reads the month. The row pins the month and nothing about `on`. |
| C84 | `God` | `God`, `ok` | eng-afr | neutral | — | review: pending. Owner 2026-11-05, option 2. Node `"God"`. `God` at 9 beats `god` at 8. Must not fire `eng-ana-182`: the record carries no `TEMP`. Today `God`, through the name path. Without the record the new order gives `beeld`. |
| C93 | `god` | `beeld`, `ok` | eng-afr | neutral | — | review: pending. Owner 2026-11-05. Lower case takes no capital path and never reads the `God` record. Node `103560161`. Today the same. |
| C94 | `a book about God` | `'n boek oor God`, `ok` | eng-afr | neutral | eng-dis-11, eng-ana-15, afr-gen-4 | review: pending. Owner 2026-11-05. A later capital reads its exact record. Second node `"God"`. Must not fire `eng-ana-182`. Today the same text, through rule 182. |
| C95 | `lookup("God")`, eng store | One entry, UW `"God"` with its quotes, `priority` 9 | n/a | n/a | — | review: n/a. The record, and the reader's handling of `\"`. |
| C85 | `march` | `loop`, `ok` | eng-afr | neutral | — | review: pending. Lower case takes no capital path, so the raise does not touch it. |

### The owner's lower-case test

| id | input | expected | direction | register | rule ids | note |
|---|---|---|---|---|---|---|
| C60 | `Peter` | `Peter`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. `peter` is noun-only at `priority` 0, so it counts as no word. Today the same. |
| C61 | `Dad` | `Dad`, `ok` | eng-afr | neutral | eng-ana-182 | review: pending. The accepted cost: `dad` is noun-only at `priority` 0. Today the same. |
| C62 | `Teacher` | `⟦Teacher⟧`, `partial` | eng-afr | neutral | — | review: pending. Must not fire `eng-ana-182`. `teacher` is noun-only at `priority` 12, so it is a word. Afr has no record for UW `105854812`, so it shows marked, as typed under D5. Today `Teacher`. |

## What a test-writer can do today

**The row ids in block C are final.** An id is never reused. C26 is retired. C70 to C79 and C86 to C92 moved
out. C58, C59 and C63 to C69 hold no row.

Every row has its expected value, and no row is blocked. C104 to C108 take no test. The tests from
`c0627c7` need these changes:

| Rows | Change to the tests |
|---|---|
| C70 to C79, C86 to C92 | Delete from `capital_names_test.cpp`. They move with the fix. |
| C40 | Now asserts no `11`, and does not assert `oor`. |
| C57 | Rewrite against `decode_leading_code_point`. `tests/CMakeLists.txt` needs `engine/src` on the include path for this one file. |
| C96 to C103, C109, C110, C111 | New. |
| C84 | The expected value holds. Only its note changed. |

`review: pending` on a row does not hold back its test. A later tick by the owner can only change its expected
value through this file.

## Existing tests

| Test | Change |
|---|---|
| `engine_status_test.cpp`, `A09GenevaIsALiteralAndTheRowIsOk` (97-102) | Becomes C12. Rename it. |
| `engine_status_test.cpp`, `R04_a09_...` (354-368) | Second node UW `500004419`, `partial`. Replace `TraceStartsWith {"4"}` with a containment check on `11`. Rule 182 count 0. |
| `engine_status_test.cpp`, `N16_a09_...` (516-523) | Becomes C12's text. The "no `⟦`" assertion inverts. |
| `engine_status_test.cpp`, `P04_a09_...` (525-529) | Becomes C12's text and status. |
| `engine_status_test.cpp`, `K09_book_geneva_...` (733) | Becomes C45 and C51. Node 1 is `500004419`, and rule 182 count is 0. |
| `generation_test.cpp`, `N53_...` (451) | Becomes C49. |
| `rule_interpreter_test.cpp`, `D03RuleFour...` (506) | Input moves to `a book about Brisbane` (C44). C43 is new. |
| `rule_interpreter_test.cpp`, `RuleSetLoadsAllFiveGrammarKinds...` and `N56_...` | The eng disambiguation count is 11. `c0627c7` asserts 13 at lines 89 and 964, and those two move with the fix. |
| `dictionary_lookup_test.cpp`, `RealFixedSetWordWith...` (135-140) | Becomes C53. The issue does not list this test. C52 is new. |
| `golden_loader_test.cpp`, `matching_row` (49-50) | The pair moves to C16, `a book about Brisbane`, `'n boek oor Brisbane`, `ok`. The comment naming A09 goes. The issue does not list this test. |
| `engine_status_test.cpp`, `A13NamesEnterTheGraph...` (90), `N12_...`, `R05_...`, golden row A13 | No change. They stay green under the owner's lower-case test. |

The probe ran `c0627c7`'s `verstaan_tests` and `golden_tests` on a scratch copy with the split applied. Every
golden row passes. Twenty unit tests fail, and each one is in the changes above: the tests for the moved rows,
C40 and the two rule counts. At that run the helper in `rule_interpreter_test.cpp` set no `CAP`, so C43 and its
neighbour failed too. The helper now adds the tag at lines 345-360.

The probe also compared the split with main on 1,200 words in five sentence shapes, 6,000 inputs. It found no
input that lost a word for `about` where main kept one. That sample was too small and too frequent. The third
verifier read ran all 10,577 capitalised headwords and found the loss: ADR 0030 lists it. Its figures replace the
probe's.

The other test-cases files named at the top of this file now carry the corrected rows.
