# Issue 199 — analysis graph test cases

**This file is the source of truth for issue 199's tests and rules.** The test-writer turns block K
into GoogleTest cases. Where a test, a rule `comment`, a grammar file, a dictionary record or another
test-cases file disagrees with this file on a row named here, this file wins and the other is
corrected to match. Rows of `180-test-cases.md` (G03), `181-test-cases.md` (N06, N07, N11, N55,
N56), `195-test-cases.md` (D01 to D08, D10) and `198-test-cases.md` (R10 to R13, R17) change here.
"Existing tests" below names each one.

No `expected` value in this file came from running the engine. Each graph comes from the archive
corpus `data/languages/eng/corpus/ugoa1.yaml` at the archive line the row names. Each Afrikaans text
comes from the issue file, which carries the owner's 2026-10-28 rulings (ADR 0023: `boks`, `motor`).
Each reading claim is a predicate over the eng dictionary shards. A trace is asserted by
containment or by its first entries, never as a full list, except where an existing row already
pins a full list.

The rule-author compiled a scratch probe outside the repo. It set no expected value. The "Today"
part of each note is that probe's output on the store as `HEAD` holds it.

Every row that makes a claim about English or Afrikaans is `review: pending`. The owner reviews both
and has not ticked these rows. Hand-built rows make no language claim and are `review: n/a`.

## The fix is data only

No engine change. No stub. `engine/` is untouched. The five rows build the corpus graph on the
current engine once the data below is in the store. The implementer's pass has no engine work: it
confirms the suite and the validator, nothing more.

The data change is already in the tree, uncommitted:

- `data/languages/eng/grammar/disambiguation.yaml`: records `6` to `10`, appended.
- `data/languages/eng/grammar/analysis.yaml`: record `183`, inserted directly before record `10`.
- `data/languages/eng/dictionary/v.yaml`: one `very` record, id `900001`, after the last `very`.

`python -m tools.validate --changed` exits 0 on it.

## Decisions

Each one settles a point the issue, SPEC.md or an ADR leaves open. Each is an ADR candidate.

1. **A noun after a determiner takes a reading that carries cardinality, by a D-rule, not by
   frequency.** `Engine::translate` takes the first reading left after disambiguation, in shard
   order. That gives `box` `100135148`, `days` `115141059` and `summer` `115145012`. The archive's
   own default is the highest frequency, ties by dictionary order
   (`data/archive/wiki/Dictionary.wikitext` lines 192 to 200). Frequency gives `box` `102883344`,
   but it also gives `book` `106410904` (frequency 47) over the corpus's `102870092` (19), on every
   row. Over the 370 corpus tokens whose reading the corpus names, frequency picks the corpus UW 159
   times, shard order 246 times, and "first reading of the right part of speech that carries `CAR`"
   317 times. Rule 10 strikes every noun reading with no `CAR` after a determiner. On all 248
   `ugoa1` rows it adds 48 corpus UWs and loses none. Rows whose whole graph equals the corpus go
   from 16 to 24, none lost. No archive D-rule reads `CAR`; `wiki/Tagset.wikitext` line 77 defines
   `CAR=CTB`, countable.
2. **`very` gets a project-written dictionary record that carries `att: "@plus"`.** Archive rule 13
   (`grammars/eng_unl_tgrammar.txt` line 57) reads `(SAV,att,%x)` and its comment is
   `very.@plus beautiful > beautiful.@plus`. No eng record of `very` carries `att`, and none is
   `SAV`. The archive's high-frequency `very`, `exports/eng/en_gen_u_c_ucl/en_gen_u_c_ucl_1.txt`
   line 5407, UW `400031899`, sits in `_unparsed.txt`: its frequency is 269, above the importer's
   0 to 255 range. Record `900001` adapts it: frequency 255, `POS: SAV`, `att: "@plus"`. The
   dictionary carries the attribute, as it does for `the`, `all` and `some`; rule 13 fires
   unchanged. A project-written dictionary record takes an id from 900000 up, above the archive's
   highest, 657153, and `archive_path: original`. That numbering is part of the candidate.
3. **A name after a common noun modifies the noun.** Rule 10 makes the second noun the head:
   `glass mug > NB(mug, glass)`. For `book Geneva` it builds `mod("Geneva";book)`. Rule 183 sits
   before rule 10 and swaps head and adjunct when the second word is a name literal (`TEMP`) and the
   first is not. It reads `TEMP`, not `PPN`: `north Europe`, where `Europe` has a dictionary entry,
   keeps rule 10's path. This settles the edge direction ADR 0021's 2026-10-28 amendment left to
   issue 199.

## The data change

Rule ids follow issue 24's convention: record `id: "N"` of `disambiguation.yaml` is `eng-dis-N`, of
`analysis.yaml` is `eng-ana-N`. The trace carries both bare (finding F1).

`disambiguation.yaml`, appended after record `5`. The header comment now names issue 199.

```yaml
- id: "6"
  kind: disambiguation
  lhs: "([all],^att=@all)(D,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of all but the @all quantifier when a determiner follows, as in A06 all the books; the determiner keeps its readings"
  source: {archive_path: original, line: "issue 199; adapted from exports/afr/44.dgrammar.txt line 18, an intensifier does not stand before a noun phrase, and exports/ger/49.dgrammar.txt line 14"}
- id: "7"
  kind: disambiguation
  lhs: "([some],^att=@paucal)(N,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of some but the @paucal quantifier when a noun follows, as in A10 some days; the noun keeps its readings"
  source: {archive_path: original, line: "issue 199; adapted from exports/afr/44.dgrammar.txt line 18, (A,SAV)(BLK)(N)=0, with @paucal from ugoa1 lines 77 and 422 to 434"}
- id: "8"
  kind: disambiguation
  lhs: "([before],^rel=tim)(D,#PREFERRED)(N,SEM=TIM,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of before but the time readings when a determiner and a noun with a time reading follow, as in A10 before the summer; the determiner and the noun keep their readings"
  source: {archive_path: original, line: "issue 199; adapted from exports/afr/44.dgrammar.txt line 15, (P,rel=plc)(BLK)(D)(BLK)(N,SEM=TIM)=0, in the shape of rule 5"}
- id: "9"
  kind: disambiguation
  lhs: "([very],^att=@plus)(J,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of very but the @plus intensifier when an adjective follows, as in A12 a very beautiful car; the adjective keeps its readings"
  source: {archive_path: original, line: "issue 199; adapted from grammars/eng_unl_tgrammar.txt line 57, very.@plus beautiful > beautiful.@plus"}
- id: "10"
  kind: disambiguation
  lhs: "(D,#PREFERRED)(N,^CAR)"
  rhs: "0"
  conditions: []
  comment: "Strikes every noun reading with no cardinality after a determiner, as in A07 a box and A10 the summer; the determiner keeps its readings"
  source: {archive_path: original, line: "issue 199; no archive D-rule reads CAR; wiki/Tagset.wikitext line 77 defines CAR=CTB, countable"}
```

`analysis.yaml`, inserted directly before record `10`. The tree pass tries rules in file order, so
rule 183 must come first for the pair rule 10 would also match.

```yaml
- id: "183"
  kind: analysis
  lhs: "(N,^TEMP,%x)(NB,TEMP,%y)({XP,^D,^J|PUT|STAIL|CTAIL},%right)"
  rhs: "(NB(%x,+proj;%y,+adjt),+XB=NB,+LEX=N,%new)(%right)"
  conditions: []
  comment: "A name after a common noun modifies the noun: book Geneva > NB(book, Geneva)"
  source: {archive_path: original, line: "issue 199; adapted from grammars/eng_unl_tgrammar.txt line 46 (rule 10) with head and adjunct swapped for a name literal"}
```

`dictionary/v.yaml`, after record `292864`, the last `very`, and before `very fast`.

```yaml
- headword: very
  id: 900001
  uw: "400031899"
  features: {LEMMA: very, BF: very, LEX: A, POS: SAV, LST: WRD, PAR: M0, FRA: Y0, POL: AFM, SEM: MAN, SFR: K0, att: "@plus"}
  lang: eng
  frequency: 255
  priority: 44
  source: {archive_path: original, line: "issue 199; adapted from exports/eng/en_gen_u_c_ucl/en_gen_u_c_ucl_1.txt line 5407 (frequency 269 clamped to 255, POS AAV to SAV) and grammars/eng_unl_tgrammar.txt line 57, very.@plus"}
```

The UW is not empty: the schema allows an empty UW only for `LEX` C, D or P. Rule 13 deletes the
`very` node, so `400031899` never reaches the graph.

### How each row builds its graph

- **A06.** Rule 6 leaves `all` its two `@all` readings. Rule 10 strikes `books`'s noun readings with
  no `CAR`; `102870092` stays in front. Rule 1 adds `@pl`. Rule 12 fires twice: `the` gives `@def`,
  `all` gives `@all`. Rule 177 strikes `@pl`.
- **A07.** Rules 1 and 5 as issue 198. Rule 10 strikes `100135148` (`SEM: ACT`, no `CAR`); the front
  reading of `box` is `102883344`. Rules 12, 15, 48 and 154 as today.
- **A10.** Rule 7 leaves `some` its two `@paucal` readings. Rule 8 leaves `before` its two `tim`
  readings, the front one with `att: "@before"`. Rule 10 strikes `days`'s `115141059` and
  `114484516`, and `summer`'s `115145012`. Rule 1 adds `@pl`; rule 12 gives `@paucal` and `@def`;
  rule 15 gives `@before` and `rel: tim`; rule 48 links; rule 166 writes `tim`; rule 177 strikes
  `@pl`.
- **A12.** Rule 9 leaves `very` record `900001` alone. Rule 13 moves `@plus` onto `beautiful` and
  deletes `very`. Rules 50, 12, 82, 100 and 172 then run as they do for A11 `the beautiful car`.
- **`book Geneva`.** Rule 182 makes `Geneva` a proper noun. Rule 72 makes both words `NB`. Rule 183
  links `NB(book;Geneva)`. Rules 100 and 172 write `mod`.

## How to read the rows

Engine rows call `Engine::load(RuleSet::load(eng, afr))` on the real stores and
`translate(text, Options{.from = Lang::eng, .to = Lang::afr})`. A graph is written as in
`198-test-cases.md`: `[102870092.@indef]` is one node with one attribute; `plc 0→1` is
`Relation{"plc", 0, 1}`. A row asserts the nodes it names and the whole relation list, by equality.
Attributes written `{@all, @def}` are compared as a set: the corpus writes `@all.@def` and the
engine adds `@def` first (finding F4). Attributes written `[@plus]` are compared by equality.

Disambiguation rows follow `195-test-cases.md` and `198-test-cases.md`: `RunEng(text)` builds the
positions from the real eng dictionary and runs the real eng disambiguation grammar. New words:

- **kept**: the position holds exactly the lookup's readings, in order.
- **countable**: the position holds exactly the lookup's readings minus every reading with `LEX: N`
  and no `CAR` feature, in order. The test-writer adds one helper, `ExpectCountable(run, i)`.
- **`att=@x` only**: the position holds exactly the lookup's readings whose `att` is `@x`, in order.
- **`rel=x` only**: the same, for `rel`.

"Trace starts `6 10`" means the first two entries of `Result::trace` are `6` then `10`. Engine
traces put disambiguation entries before analysis entries. "Holds exactly two `12`" counts fired
entries with `rule == "12"`. A disambiguation row's trace is the full list, as in the 195 rows.

Hand-built rows use `RuleSet::from_rules` with the real record extracted by id, and no file I/O.

## Block K

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| K01 | A06 `all the books`, engine row. | One node: UW `102870092`, attributes `{@all, @def}`, no `@pl`. Relations `[]`. Trace starts `6 10`. Holds exactly one `1`, exactly two `12`, exactly one `177`. Holds no `14` and no `176`. `status` ok. | eng-unl | neutral | pending | eng-dis-6, eng-dis-10, eng-ana-1, eng-ana-12, eng-ana-177 | Corpus line 35, `102870092.@all.@def`. Fire row for eng-dis-6. Rule 12 builds both attributes; rule 177 removes `@pl`. Today: nodes `[400008007, 102870092.@pl]`; trace `1 69 59 70 14 ... 176`. |
| K02 | A06, engine row. | `text` `al die boeke`. `status` ok. Holds `afr-gen-35`, `afr-gen-37`, `afr-gen-60`. Holds no `afr-gen-56`. | eng-afr | neutral | pending | afr-gen-35, -37, -60; must not: afr-gen-56 | Issue acceptance. Takes over 181 N06. Today: `finaal boeke`. |
| K03 | A07 `a book in a box`, engine row. | Two nodes: `[102870092.@indef]`, `[102883344.@indef]`, in that order. Relations `[plc 0→1]`. Trace starts `1 5 10`. Holds exactly two `12`, exactly one `15`, exactly one `154`. Holds no `134` and no `166`. `status` ok. | eng-unl | neutral | pending | eng-dis-1, eng-dis-5, eng-dis-10, eng-ana-12, eng-ana-15, eng-ana-154 | Corpus line 91, `plc(102870092.@indef, 102883344.@indef)`. Closes 198's finding F1. Fire row for eng-dis-10. Today: node 1 `100135148`; trace starts `1 5 70`. |
| K04 | A07, engine row. | `text` `'n boek in 'n boks`. `status` ok. Holds `afr-gen-234` and exactly two `afr-gen-36`. Holds no `afr-gen-22` and no `afr-dis-5`. | eng-afr | neutral | pending | afr-gen-234, -36; must not: afr-gen-22, afr-dis-5 | Issue acceptance; `boks` by ADR 0023. Takes over 181 N07. Today: `'n boek ⟦box⟧`, partial. |
| K05 | A10 `some days before the summer`, engine row. | Two nodes: `[115155220.@paucal]`, then UW `115237250` with attributes `{@def, @before}`. Relations `[tim 0→1]`. Trace starts `7 8 10`. Holds exactly one `1`, exactly two `12`, exactly one `15`, exactly one `166`, exactly one `177`. Holds no `154`. `status` ok. | eng-unl | neutral | pending | eng-dis-7, eng-dis-8, eng-dis-10, eng-ana-1, eng-ana-12, eng-ana-15, eng-ana-166, eng-ana-177 | Corpus line 143, `tim(115155220.@paucal, 115237250.@def.@before)`. Fire row for eng-dis-7 and eng-dis-8. Today: four nodes `400007015`, `115141059`, `400066781`, `115145012.@def`; no relation. |
| K06 | A10, engine row. | `text` ends with ` dae voor die somer`. `status` ok. Holds `afr-gen-26`. | eng-afr | neutral | pending | afr-gen-26 | Issue acceptance. The first word is issue 182's: rule 40 writes `enkele`, the corpus `'n paar`. Do not assert it. Today: `om ⟦days⟧ voor ⟦summer⟧`, partial. |
| K07 | A12 `a very beautiful car`, engine row. | Two nodes: `[300217728.@plus]`, `[102958343.@indef]`, in that order. Relations `[mod 1→0]`. Trace starts `9`. Holds exactly one `13`, exactly one `12`, exactly one `172`. Holds no `14`, no `53` and no `176`. `status` ok. | eng-unl | neutral | pending | eng-dis-9, eng-ana-13, eng-ana-12, eng-ana-50, eng-ana-172 | Corpus line 210, `mod(102958343.@indef, 300217728.@plus)`. Fire row for eng-dis-9 and for record `900001`. Today: three nodes, `400510749` first; trace holds `53` and `176`. |
| K08 | A12, engine row. | `text` `'n baie mooi motor`. `status` ok. Holds `afr-gen-8`, `afr-gen-36`, `afr-gen-42`, `afr-gen-201`. | eng-afr | neutral | pending | afr-gen-8, -36, -42, -201 | Issue acceptance; `motor` by ADR 0023. Takes over 181 N11. Today: `mooi 'n motor ⟦very⟧`, partial. |
| K09 | `book Geneva`, engine row. | Two nodes: `[102870092]` and `["Geneva"]`, both with no attribute. Relations `[mod 0→1]`. Holds exactly one `182`, exactly one `183`, exactly one `172`. Holds no `10`. `status` partial. `text` `boek ⟦Geneva⟧`. | eng-unl | neutral | pending | eng-ana-182, eng-ana-183, eng-ana-100, eng-ana-172; must not: eng-ana-10 | Issue acceptance, ADR 0025: `mod(102870092;"Geneva")`. Fire row for eng-ana-183. No determiner, so eng-dis-10 cannot fire and "no `10`" reads analysis rule 10 alone. The text stays 181 N18's. Today: `mod 1→0`, trace holds `10`. |
| K10 | `book John`, engine row. | Relations `[mod 0→1]`; node 1 UW `"John"`. Holds exactly one `183`. | eng-unl | neutral | pending | eng-ana-183 | Second fire row. Extends 198 R09's input. Today: `mod 1→0`. |
| K11 | `a glass mug`, engine row. | Node 1 is `[103797390.@indef]`. Relations `[mod 1→0]`. Holds no `183`. The trace starts `10` and holds exactly two `10`. | eng-unl | neutral | pending | eng-dis-10, eng-ana-10; must not: eng-ana-183 | Must-not row for eng-ana-183: no name, so rule 10 keeps the second noun as head. Rule 10's own comment, `glass mug > NB(mug, glass)`. The first `10` is eng-dis-10, the second eng-ana-10 (finding F1). Node 0's UW is not asserted. Today: `mod 1→0`, one `10`. |
| K12 | Three inputs, one test each, engine row: `John and Mary`, `book xyzzy`, `a book about Geneva`. | Each trace holds no `183`. | eng-unl | neutral | pending | must not: eng-ana-183 | Two adjacent names, a word with no `TEMP`, and a name after a preposition. Today: green; it guards the new rule. |
| K13 | `very beautiful`, engine row. | One node `[300217728.@plus]`. Relations `[]`. Trace starts `9`. `status` ok. | eng-unl | neutral | pending | eng-dis-9, eng-ana-13 | Corpus line 575, `300217728.@plus`. Today: two nodes, `mod 1→0`. |
| K14 | `the very book`, engine row. | Holds no `9` and no `13`. | eng-unl | neutral | pending | must not: eng-dis-9, eng-ana-13 | Must-not row for eng-dis-9: no adjective follows. Today: green. |
| K20 | `all the books`, disambiguation. | `all@0` → `att=@all` only. `the@1` kept. `books@2` countable. Trace `[6, 10]`. | eng-unl | neutral | pending | eng-dis-6, eng-dis-10 | Replaces 195 D06's A06 line. Ids `275379` and `275882` are the two `@all` readings, `a.yaml`. Today: trace `[]`. |
| K21 | `all books`, disambiguation. | `all@0` kept. `books@1` countable. Trace `[10]`. | eng-unl | neutral | pending | eng-dis-10; must not: eng-dis-6 | Must-not row for eng-dis-6: no determiner follows. `all` has a determiner reading, so rule 10 reads it as context. |
| K22 | A10, disambiguation. | `some@0` → `att=@paucal` only. `days@1` countable. `before@2` → `rel=tim` only. `the@3` kept. `summer@4` countable. Trace `[7, 8, 10]`. | eng-unl | neutral | pending | eng-dis-7, eng-dis-8, eng-dis-10 | Replaces 195 D06's A10 line. `@paucal`: `275365`, `275868`. `tim`: `432590`, `531167`. Today: trace `[]`. |
| K23 | `some of these books`, disambiguation. | `some@0` kept. Trace `[10]`. | eng-unl | neutral | pending | must not: eng-dis-7 | `of` is no noun. Corpus line 113 writes `@paucal`; this rule does not reach it. |
| K24 | `a book before a box`, disambiguation. | `before@2` kept. Trace `[10]`. | eng-unl | neutral | pending | must not: eng-dis-8 | Must-not row for eng-dis-8: no `box` reading is `SEM: TIM`. |
| K25 | `some days in the summer`, disambiguation. | `in@2` → P, all 13 preposition readings. `some@0` → `att=@paucal` only. `days@1` countable. `the@3` kept. `summer@4` countable. Trace `[1, 7, 10]`. | eng-unl | neutral | pending | eng-dis-1, eng-dis-7, eng-dis-10; must not: eng-dis-5, eng-dis-8 | Replaces 195 D08 and 198 R11. Corpus line 141. Rule 8 reads `[before]` only. |
| K26 | A12, disambiguation. | `very@1` holds one reading: id `900001`, `POS: SAV`, `att: @plus`. `a@0`, `beautiful@2`, `car@3` kept. Trace `[9]`. | eng-unl | neutral | pending | eng-dis-9; must not: eng-dis-10 | Replaces 195 D06's A12 line. An adjective stands between `a` and `car`, so rule 10 is silent. |
| K27 | Six inputs, one test each, disambiguation: `the book`, `a book`, `the books`, `a car, a book and a mug`, `a book on a box`, `water in the region`. | `the book`: `the@0` kept, `book@1` countable, trace `[10]`. `a book`: as `the book`. `the books`: `books@1` countable, trace `[10]`. `a car, a book and a mug`: `car@1`, `book@4`, `mug@7` countable, every other position kept, trace `[10]`. `a book on a box`: `on@2` → P, `a@3` kept, `book@1` and `box@4` countable, trace `[2, 10]`. `water in the region`: `in@1` → `rel=plc` only, `region@3` countable, trace `[1, 5, 10]`. | eng-unl | neutral | pending | eng-dis-10 | Replace 195 D06's A02, A03, A05 and A14 lines, 195 D07 and 198 R12. Each noun keeps its front reading: `102870092`, `102958343`, `103797390`, `102883344`. |
| K28 | Five inputs, one test each, disambiguation: `book`, `books`, `a beautiful book`, `the beautiful car`, `John and Mary`. | Every position kept. Trace `[]`. | eng-unl | neutral | pending | must not: eng-dis-6 to eng-dis-10 | 195 D06's A01, A04, A08, A11 and A13 lines, unchanged. Must-not row for eng-dis-10: no determiner, or an adjective after it. Today: green. |
| K30 | Hand-built. Rule 10 alone. Position 0, surface `a`: `{LEX=D, POS=ART}`, `{LEX=N, POS=NOU}`. Position 1, surface `box`: `{LEX=N, SEM=ACT}`, `{LEX=N, SEM=ARF, CAR=CTB}`, `{LEX=V, POS=VER}`. | Position 0 holds both readings, in order. Position 1 holds `{LEX=N, SEM=ARF, CAR=CTB}` then `{LEX=V, POS=VER}`. Trace `[10]`. | eng-unl | neutral | n/a | eng-dis-10 | Source: original. Rule 10 at its smallest. It strikes nouns only; the verb stays. |
| K31 | Hand-built. As K30, with position 1 `{LEX=N, CAR=CTB}`, `{LEX=N, CAR=NCTB}`. | Every position holds every reading, in order. Trace `[]`. | eng-unl | neutral | n/a | must not: eng-dis-10 | Source: original. Every noun reading has a cardinality, uncountable included. |
| K32 | Hand-built. As K30, with position 0 `{LEX=P, POS=PRE}`, `{LEX=A, POS=AAV}`. | Every position holds every reading. Trace `[]`. | eng-unl | neutral | n/a | must not: eng-dis-10 | Source: original. No determiner reading in front. |
| K33 | Hand-built. Rule 9 alone. Position 0, surface `very`: `{LEX=A, POS=AAV}`, `{LEX=J, POS=ADJ}`, `{LEX=A, POS=SAV, att=@plus}`. Position 1, surface `beautiful`: `{LEX=J, POS=ADJ}`, `{LEX=J, POS=ADJ, MOR=STE}`. | Position 0 holds the `att=@plus` reading alone. Position 1 holds both. Trace `[9]`. | eng-unl | neutral | n/a | eng-dis-9 | Source: original. The `@plus` reading need not be first. |
| K34 | Hand-built. Rule 9 alone. As K33, position 1 surface `book`: `{LEX=N, POS=NOU}`. | Every position holds every reading. Trace `[]`. | eng-unl | neutral | n/a | must not: eng-dis-9 | Source: original. |
| K40 | Hand-built tree pass. Record `183` alone in the analysis list. Words: `{surface: "book", features: {$uw: "102870092", LEX: N, XB: NB}}`, `{surface: "Geneva", features: {$uw: "\"Geneva\"", TEMP: "", LEX: N, POS: PPN, XB: NB}}`. | Trace `[{183, fired}]`. `forest.links` holds one link: label `NB`, `from` the `book` node (`nodes[1]`), `to` the `Geneva` node (`nodes[2]`), `built_by` `183`. `status` ok. | eng-unl | neutral | n/a | eng-ana-183 | Source: original. Rule 183 at its smallest: the common noun is the head. |
| K41 | Hand-built tree pass. As K40, with `TEMP: ""` added to `book`. | Trace `[]`. No link. `status` ok. | eng-unl | neutral | n/a | must not: eng-ana-183 | Source: original. Two names: rule 22's merge, or rule 10, owns them. |
| K50 | `Dictionary::load(eng).lookup("very")`. | Seven entries, ids `270891`, `271391`, `292276`, `292277`, `292863`, `292864`, `900001`, in that order. The last has UW `400031899`, frequency 255, priority 44, and features holding `LEX: A`, `POS: SAV` and `att: @plus`. | eng-unl | neutral | pending | — | Decision 2. Store order, `v.yaml`. |
| K55 | `RuleSet::load` on the real stores, eng to afr. | `disambiguation()` holds ten records, ids `1` to `10`, in file order, each `kind` `disambiguation`, each `rhs` `0`. | eng-unl | neutral | n/a | eng-dis-1 to eng-dis-10 | Replaces 198 R17, which asserted five. Also the last line of 181 N56: `disambiguation().size()` is 10. |
| K56 | `RuleSet::load` on the real stores. | In `analysis()`, the record with id `183` stands directly before the record with id `10`. | eng-unl | neutral | n/a | eng-ana-183 | Pins the file order decision 3 needs. |

Row count: 33. Ids K15 to K19, K29, K35 to K39, K42 to K49, K51 to K54 are not used.

Each drafted rule has a fire row and a must-not row:

| Rule | Fires | Must not fire |
|---|---|---|
| eng-dis-6 | K01, K20 | K21, K28 |
| eng-dis-7 | K05, K22, K25 | K23, K28 |
| eng-dis-8 | K05, K22 | K24, K25, K28 |
| eng-dis-9 | K07, K13, K26, K33 | K14, K28, K34 |
| eng-dis-10 | K01, K03, K05, K11, K20 to K22, K25, K27, K30 | K26, K28, K31, K32 |
| eng-ana-183 | K09, K10, K40 | K11, K12, K41 |
| dictionary record `900001` | K07, K13, K26, K50 | K14 |

Each acceptance criterion and Done-when line:

| Issue line | Rows |
|---|---|
| A06, A07, A10 and A12 carry the corpus graph in `Result::unl` | K01, K03, K05, K07 |
| A06, A07 and A12 match their `expected` text exactly | K02, K04, K08 |
| A10's text ends with ` dae voor die somer` | K06 |
| `book Geneva` builds `mod` with the noun as head | K09 (K10, K40) |
| Each attribute and relation's rule id appears in `Result::trace` | K01 (`12`, `177`), K03 (`12`, `154`), K05 (`12`, `15`, `166`, `177`), K07 (`13`, `12`, `172`), K09 (`183`, `172`) |
| `ctest -L fast` and `python -m tools.validate --changed` are green | the gate; "Existing tests" below |

## Findings for the owner

None blocks this issue.

- **F1. A bare trace id cannot tell a D-rule from an analysis rule.** ADR 0024 left source-side ids
  bare. Records `1` to `10` exist in both eng `disambiguation.yaml` and eng `analysis.yaml`. On
  `a glass mug` the trace reads `10 70 60 72 72 10 12 ...`: the first `10` is eng-dis-10, the
  second eng-ana-10. Rows here work around it by position and by choosing inputs. Qualifying the
  source side, `eng-dis-N` and `eng-ana-N`, is an ADR candidate; it changes every existing trace
  row.
- **F2. The importer drops eight eng records for frequency 269.** The archive writes 269 on `very`,
  `really`, `real` and `rattling` (UW `400031899`), above its own declared 0 to 255. They sit in
  `_unparsed.txt`. Record `900001` brings one back by hand.
- **F3. A re-import of eng loses this issue's records.** The importer rewrites `v.yaml`,
  `analysis.yaml` and `disambiguation.yaml` from the archive. Records `900001`, `183` and `6` to
  `10` are `archive_path: original` and have no archive line to come back from. Issue 180's note on
  record `1` and issue 198's on records `5` and `182` say the same.
- **F4. Attribute order differs from the corpus.** A06 gives `@def` then `@all`; the corpus writes
  `@all.@def`. A05 already gives `@pl.@def` against the corpus `@def.@pl`. UNL attributes form a
  set, so K01 and K05 compare sets.
- **F5. ADR 0021's `mod` workaround has no trigger left in the fixed set.** Its amendment treats a
  quoted name that heads a plain word under `mod` as no root. After rule 183 no fixed-set row builds
  that shape. `book Geneva` still gives `boek ⟦Geneva⟧`: rules 8 and 9 of afr `generation.yaml`
  read `J` or `N` on the dependent. Retiring the workaround is issue 181's or a later one's.
- **F6. `some minutes at noon` puts `@paucal` on `noon`.** Corpus line 446. `at` has a noun reading
  (`113681048`), so rule 12's right context `{^N|...}` fails on `minutes` and later matches
  `noon`. Rule 7 is correct here; rule 12's window is the cause. Not in this issue's rows.

## Where the rules stop

Recorded, not tested.

- **Rule 6 needs a determiner after `all`.** `all books` keeps the `SAV` reading in front and builds
  `400008007` as a node. The corpus has no bare `all books` row.
- **Rule 7 needs a noun right after `some`.** `some old books` and `some of these books` keep the
  `SAV` reading. Corpus line 113, `some of these books`, wants `@paucal`. Rule 7 never chooses
  `@multal`; the corpus gives `some water` `@paucal` too (line 77).
- **Rule 8 needs a determiner and a time noun.** `before Monday` and `before the house` do not fire
  it. The place reading of `before` has no rule yet.
- **Rule 9 needs an adjective reading next.** `very quickly` keeps the adverb `400510749` in front.
- **Rule 10 strikes nouns only.** A noun whose every noun reading lacks `CAR` loses them all after a
  determiner, and a verb or adverb reading moves to the front. No fixed-set row hits this. `the
  course` already fronts the adverb `400038625` today; rule 10 does not change that. The archive's
  `exports/afr/44.dgrammar.txt` line 9 strikes verbs, prepositions and adverbs after a determiner;
  adapting it is a later issue.
- **Rule 10 reads the word right after the determiner.** `a big box` does not fire it on `box`.
- **Rule 183 reads name literals only.** A name the dictionary holds, such as `Europe` in
  `north Europe`, keeps rule 10's path.

## Existing tests

On the applied data `ctest -L fast` fails exactly 22 tests. Each is a row above or a row this file
amends.

| Test | Today's row | What changes |
|---|---|---|
| `engine_status.G03_a02_the_book_has_no_relation` | 180 G03 | Full trace becomes `10 70 60 72 12 62`. |
| `engine_status.N55_a02_trace_is_analysis_entries_then_qualified_generation_entries` | 181 N55 | Entries before generation become `10 70 60 72 12 62`. |
| `rule_interpreter.RuleSetLoadsAllFiveGrammarKindsFromTheRealStores` | 198 R17 | K55. |
| `rule_interpreter.N56_rule_set_load_reads_the_target_disambiguation_grammar` | 181 N56 | Last line: `disambiguation().size()` is 10. |
| `rule_interpreter.D01RuleOneKeepsThePrepositionOfInInABookInABox` | 198 R10 | `book@1` and `box@4` countable, not kept. Trace `[1, 5, 10]`. |
| `rule_interpreter.D02RuleOneLeavesTheArticleAfterInWithAllFourReadings` | 195 D02 | `a@3` and `a@0` kept; `book@1` and `box@4` countable. |
| `rule_interpreter.D03RuleFourKeepsThePrepositionOfAboutBeforeAnUnknownWord` | 195 D03 | Trace `[4, 10]`. |
| `rule_interpreter.D04RulesTwoAndThreeKeepThePrepositionsInA15` | 195 D04 | Trace `[2, 3, 10]`. |
| `rule_interpreter.D05RulesTwoAndThreeLeaveTheArticlesAndNounsOfA15Whole` | 195 D05 | `the@4` and `the@13` kept; `city@5` and `table@14` countable. |
| `rule_interpreter.D06A02…`, `D06A03…`, `D06A05…`, `D06A14…` | 195 D06 | K27. |
| `rule_interpreter.D06A06…`, `D06A10…`, `D06A12…` | 195 D06 | K20, K22, K26. |
| `rule_interpreter.D07RuleTwoKeepsThePrepositionOfOnInABookOnABox` | 195 D07 | K27: trace `[2, 10]`. |
| `rule_interpreter.D08RuleOneKeepsThePrepositionOfInBeforeADefiniteArticle`, `R11RuleFiveLeavesInBeforeATemporalNounWhole` | 195 D08, 198 R11 | K25, one body for both. |
| `rule_interpreter.R12RuleFiveFiresOnALocationNoun` | 198 R12 | K27: `region@3` countable, trace `[1, 5, 10]`. |
| `rule_interpreter.R13RuleFiveLeavesInBeforeANounWithNoArtefactOrLocationReading` | 198 R13 | `party@3` countable; `a@2` kept; trace `[1, 10]`. |
| `rule_interpreter.D10AdverbialOnInTheTortoiseWentOnKeepsEveryReadingAndTheAdverbFirst` | 195 D10 | Trace `[10]`, not empty. Position 3 stays kept, the adverb in front. |

Stay green on the applied data: 180 G01, G02, G04 to G09; 198 R01 to R09 (R01 reads only the first
two trace entries, `1 5`; R04 only the first, `4`); 181 N01 to N05, N08, N10, N12, N15 to N19;
195 D06's A01, A04, A08, A11 and A13 lines; D09 and D11; R14 to R16; R20 to R22. The Python suite
passes: 622 tests.

## For the test-writer

- K01 to K14 go in `tests/unit/engine_status_test.cpp`, beside the R and N rows. K20 to K34, K55 and
  K56 go in `tests/unit/rule_interpreter_test.cpp`. K40 and K41 go in `tests/unit/tree_pass_test.cpp`,
  beside R20. K50 goes in `tests/unit/dictionary_lookup_test.cpp`.
- K02, K04 and K08 replace the bodies 181 N06, N07 and N11 would have had; those rows were never
  written in 181.
- Rewrite the 22 red tests as "Existing tests" says. Keep each test name; change its comment to
  point here.
- The data change is in the tree, uncommitted. Prove each new row red before the `test(#199)`
  commit: put `HEAD`'s three data files back (`git show HEAD:<path>`), run the rows, see K01, K03,
  K05, K07, K09, K10, K13, K20, K22, K25 to K27, K50, K55 and K56 fail, then restore the new text.
  K30 to K34 and K40, K41 extract the records by id, so on `HEAD` they fail to find them; that is
  their red. K11, K12, K14, K21, K23, K24 and K28 are guards and may pass on `HEAD`.
- "Countable" is a predicate over the lookup, not a count. Do not hard-code reading counts.
- `"\"Geneva\""` is eight bytes with the quotes.

## For the implementer

- No engine change. The work commit carries the three data files and nothing under `engine/`.
- Run `ctest -L fast` and `python -m tools.validate --changed`. Both must be green after the
  test-writer's commit.
- Do not touch rule 4 or rule 5. Do not reorder `disambiguation.yaml`: the trace rows read file
  order.
