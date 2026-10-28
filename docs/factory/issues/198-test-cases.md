# Issue 198 — plc, cnt and and relation test cases

**This file is the source of truth for issue 198's tests and rules.** The test-writer turns block R
into GoogleTest cases. Where a test, a rule `comment`, a grammar file or another test-cases file
disagrees with this file on a row named here, this file wins and the other is corrected to match.
Two rows of `195-test-cases.md` change here: R10 replaces D01 and R17 replaces D14. Rule 5 below
changes what both rows see, so the 195 file now points here.

No `expected` value in this file came from running the engine. Each relation comes from the issue
file and the archive corpus `data/languages/eng/corpus/ugoa1.yaml`, at the `source.line` the row
names. Each disambiguation row is the rule-author's reading of the English, checked against the
dictionary shards. A trace is asserted by containment only: "holds exactly one `154`", never a full
list. The full trace is engine output and stays out of `expected`.

The rule-author compiled a scratch probe outside the repo to check that the drafted rules can build
the target relations. It set no expected value. The "Today" part of each note is that probe's
output on the store as `main` holds it.

Every row that makes a claim about English is `review: pending`. The owner reviews English and has
not ticked these rows. Hand-built rows make no language claim and are `review: n/a`.

## Decisions

Each one settles a point the issue or SPEC.md leaves open. Each is an ADR candidate.

1. **A07: a disambiguation rule chooses the place reading of `in`.** Today the front preposition
   reading of `in` is `432553`, `rel: tim`, and rule 166 writes `tim`. The archive chooses a
   preposition's relation in the D-grammar, by the semantic class of the noun that follows.
   `exports/afr/44.dgrammar.txt` line 17 strikes a `tim` preposition before a determiner and a
   location noun: `(P,rel=tim )(BLK )(D)(BLK)(N,LCT)= 0;`. Latin (`lat/63` line 13) and Turkish
   (`tur/82` line 13) hold the same rule. `exports/slv/72.dgrammar.txt` line 13 strikes it before
   an artefact noun: `(P,rel=tim)(BLK)(N,ARF)=0;`. Rule 5 joins the two. It strikes every non-place
   reading, not only `tim`. English `in` holds `man`, `dur`, `met` and one reading with no `rel`
   between its `tim` and `plc` readings, and striking `tim` alone leaves `man @how` in front.
2. **A09, A13: a name literal carries the archive's `TEMP` tag, and a grammar rule makes it a proper
   noun.** Rule 15 needs `(XP,...)` on the word after the preposition. Rule 18 needs `XP` on both
   conjuncts. A name literal from issue 196 carries only `$uw`, so no noun rule reaches it. The
   archive gives every string the dictionary does not hold the system feature `TEMP`
   (`wiki/English_grammar_Temporary_entries.wikitext` line 4). Its default dictionary gives a
   temporary entry `LEX=N,POS=PPN` (same file, line 50). The engine adds `TEMP`; rule 182 adds
   `LEX=N,POS=PPN` in the tree pass. `LEX` stays off the literal through disambiguation, so rule 4,
   which reads `^LEX` on `Geneva`, still fires. Only a name literal carries `TEMP`. An unresolved
   lower-case word keeps no feature, as issue 24 decided, so it does not become a noun.
3. **A13: the order is `and("Mary";"John")`, as the issue file says.** Archive rule 18 writes
   `and(%y;%x)`, with `%y` the later conjunct, and its comment reads `John and Mary >
   and(Mary,John)`. `read_graph` copies a link's head as `from` and its dependent as `to`, so the
   engine contract gives exactly the issue's order. The corpus (line 219, `and("John", "Mary")`)
   and `docs/unl-reference/spec/universal-relations.md` (`and(John, Mary)`) write the other order.
   The archive disagrees with itself. This table keeps the issue's order and names the conflict
   for the owner (finding F4).

## The data change

Applied by the rule-author. Rule ids follow issue 24's convention: record `id: "N"` of
`data/languages/eng/grammar/disambiguation.yaml` is `eng-dis-N`, and of `analysis.yaml` is
`eng-ana-N`.

`disambiguation.yaml`, appended after record `4`. The header comment now names issues 195 and 198.

```yaml
- id: "5"
  kind: disambiguation
  lhs: "([in],^rel=plc)(D,#PREFERRED)(N,{SEM=ARF|SEM=LCT},#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of in but the place readings when a determiner and a noun with an artefact or location reading follow, as in A07 a book in a box; the determiner and the noun keep their readings"
  source: {archive_path: original, line: "issue 198; adapted from exports/afr/44.dgrammar.txt line 17 and exports/slv/72.dgrammar.txt line 13"}
```

`analysis.yaml`, inserted after record `26`, the last of the archive's `TEMP` rules, and before
record `27`. The tree pass tries rules in file order, so the record sits with its kind.

```yaml
- id: "182"
  kind: analysis
  lhs: "(TEMP,^LEX)"
  rhs: "(+LEX=N,+POS=PPN)"
  conditions: []
  comment: "A name the dictionary does not hold is a proper noun: John > John (LEX=N,POS=PPN)"
  source: {archive_path: original, line: "issue 198; adapted from wiki/English_grammar_Temporary_entries.wikitext lines 4 and 50, a TEMP entry carries LEX=N,POS=PPN"}
```

What rule 5 reads:

- `[in]`: the surface `in`, exactly. `In` at the start of a sentence does not match. Rule 1 has the
  same limit.
- `^rel=plc`: the reading has no `rel: plc`. It matches the `tim`, `man`, `dur` and `met` readings,
  the reading `515846` with no `rel`, and every adverb, adjective and noun reading. The four `plc`
  readings never match, so the rule never strikes them.
- `(D,#PREFERRED)`: the next word has a determiner reading. Context only; never pruned (ADR 0018).
- `(N,{SEM=ARF|SEM=LCT},#PREFERRED)`: the word after it has a noun reading tagged artefact or
  location. Context only. One such reading among many is enough: `box` fronts `100135148`,
  `SEM: ACT`, and `423060` to `423064` are `SEM: ARF`.
- `PLC` is left out. No archive D-rule reads it, and no corpus sentence in reach fires it.

After rules 1 and 5 on A07, `in` holds `432555` (`plc`), `432558` (`plc @inside`), `531132` and
`531135`, in shard order. `432555` is in front and carries no `att`, so `box` gets no place
attribute. That matches the corpus `102883344.@indef`.

## The engine change

For the implementer. No public name changes; no stub is needed.

**E1.** In `engine/src/engine.cpp`, `build_positions` gives the candidate for a name literal one more
feature after `$uw`: the bare tag `{"TEMP", ""}`. No other candidate carries it: not a dictionary
reading, not an unresolved lower-case word, not a punctuation token. The tag test in both matchers
reads a feature key, so `(TEMP)` matches it.

Until E1 lands, R04 to R07 stay red. R01 and R10 to R17 turn green on the data change alone.

## How to read the rows

Engine rows call `Engine::load(RuleSet::load(eng, afr))` on the real stores and
`translate(text, Options{.from = Lang::eng, .to = Lang::afr})`. A graph is written as in
`180-test-cases.md`: `[102870092.@indef]` is one node with one attribute; `plc 0→1` is
`Relation{label "plc", from 0, to 1}`. `"John"` is the six bytes with quotes. A row asserts the nodes
it names and the whole relation list, by equality. It asserts no node it does not name.

Disambiguation rows follow `195-test-cases.md`, "How to read the rows": `tokenise`,
`Dictionary::lookup_tokens` on the real eng store, then `RuleInterpreter::disambiguate` with the real
eng rule set. `in@2 → plc` means position 2 holds exactly the lookup's readings with `rel: plc`, in
shard order. `in@2 → P` and `kept` mean what they mean in that file.

Hand-built rows use `RuleSet::from_rules` and no file I/O. A tree-pass row calls `make_forest` on
the words it lists, then `analyse_tree`.

## Block R

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| R01 | A07 `a book in a box`, `Engine::translate`. | Two nodes. Node 0 `102870092.@indef`. Node 1 attributes `[@indef]`. Relations `[plc 0→1]`. The trace starts `1 5`, holds exactly one `154`, and holds no `166`. `status` ok. | eng-unl | neutral | pending | eng-dis-1, eng-dis-5, eng-ana-15, eng-ana-154 | Corpus line 91, `plc(102870092.@indef, 102883344.@indef)`. Fire row for eng-dis-5 and eng-ana-154. Node 1's UW is not asserted (finding F1). Today: relations `[tim 0→1]`; trace `1`, no `5`, ends `166`. |
| R02 | A07, as R01. | No relation has the label `cnt` or `tim`. The trace holds no `134` and no `166`. | eng-unl | neutral | pending | must not fire: eng-ana-134, eng-ana-166 | The issue's must-not row for `cnt`. `in`'s place reading carries no `cnt`, so rule 134 has no label to read. Today: red, rule 166 writes `tim`. |
| R03 | A08 `a beautiful book`, `Engine::translate`. | Relations exactly `[mod 1→0]`. The trace holds no `5` and no `154`. | eng-unl | neutral | pending | must not fire: eng-dis-5, eng-ana-154 | The issue's must-not row for `plc`. No preposition, so no place label. Today: green; it guards the new rule. 180 G01 holds the full graph. |
| R04 | A09 `a book about Geneva`, `Engine::translate`. | Two nodes. Node 0 `102870092.@indef`. Node 1 UW `"Geneva"`. Relations `[cnt 0→1]`. The trace starts `4`, holds exactly one `182` and exactly one `134`. `status` partial. | eng-unl | neutral | pending | eng-dis-4, eng-ana-182, eng-ana-15, eng-ana-134 | Corpus line 128, `cnt(102870092.@indef, 500004419)`. The literal replaces the UW (issue 196). Fire row for eng-ana-134 and the first for eng-ana-182. Node 1's attributes are not asserted (finding F2). Today: relations `[]`; trace `4 70 60 72 12 73`. Red until E1. |
| R05 | A13 `John and Mary`, `Engine::translate`. | Nodes `["John"]`, `["Mary"]`, in that order, neither with an attribute. Relations `[and 1→0]`: `and("Mary";"John")`. The trace holds exactly two `182` and exactly one `18`. | eng-unl | neutral | pending | eng-ana-182, eng-ana-72, eng-ana-62, eng-ana-18 | Issue order; decision 3. Corpus line 219 writes `and("John", "Mary")` (finding F4). `status` is not asserted (finding F3). Today: relations `[]`; trace `68`. Red until E1. |
| R06 | A13, as R05. | Exactly one relation has the label `and`. No relation has the label `or`. The trace holds exactly one `18`, and no `16` and no `19`. | eng-unl | neutral | pending | eng-ana-18; must not fire: eng-ana-16, eng-ana-19 | The issue's must-not row: one `and`, not two. Rule 16 is the comma list and rule 19 is `or`. Today: red, no `and` at all. |
| R07 | `Mary and John`, `Engine::translate`. | Nodes `["Mary"]`, `["John"]`. Relations `[and 1→0]`: `and("John";"Mary")`. The trace holds exactly one `18`. | eng-unl | neutral | pending | eng-ana-182, eng-ana-18 | Corpus line 220. Second fire row for eng-ana-18. It pins decision 3: the later conjunct is the head, whatever the names. The corpus writes `and("Mary", "John")` (finding F4). Today: relations `[]`. Red until E1. |
| R08 | Three inputs, one test each, `Engine::translate`: `The book`, `john`, `book xyzzy`. | The trace holds no `182`. For `book xyzzy`, `status` partial. | eng-unl | neutral | pending | must not fire: eng-ana-182 | Must-not row for E1 and rule 182. `The` resolves to `the`, and `john` to the common noun (issue 196): neither is a literal. `xyzzy` has no entry and no capital, so it carries no `TEMP` and stays outside the parse. Today: green; it guards the change. |
| R09 | `book John`, `Engine::translate`. | Node 1 UW `"John"`. The trace holds exactly one `182`. | eng-unl | neutral | pending | eng-ana-182 | A non-initial capital is a literal (issue 196) and gets `TEMP`. The existing `CapitalisedNameAfterALowerCaseWordIsALiteralNotTheCommonNoun` input. Today: no `182`. Red until E1. |
| R10 | A07 `a book in a box`, disambiguation. | `in@2 → plc`: `432555`, `432558`, `531132`, `531135`. `a@0`, `book@1`, `a@3`, `box@4` kept. Trace `[1, 5]`. | eng-afr | neutral | pending | eng-dis-1, eng-dis-5 | Replaces `195-test-cases.md` D01, which asserted every preposition kept and trace `[1]`. Rule 1 strikes the non-prepositions; rule 5 strikes the non-place prepositions. `box` keeps all 26 readings: rule 5 marks it `#PREFERRED`. Today: `in@2` holds 13 readings; trace `[1]`. |
| R11 | `some days in the summer`, disambiguation. | `in@2 → P`, all 13 preposition readings. `the@3`, `summer@4` kept. Trace `[1]`. | eng-afr | neutral | pending | eng-dis-1; must not fire: eng-dis-5 | 195 D08's input. Corpus line 141, `tim(115155220.@paucal, 115237250.@def)`. Every noun reading of `summer` is `SEM: TIM`. D08 stays as written. Today: green. |
| R12 | `water in the region`, disambiguation. | `in@1 → plc`, the four readings of R10. `water@0`, `the@2`, `region@3` kept. Trace `[1, 5]`. | eng-afr | neutral | pending | eng-dis-1, eng-dis-5 | Fire row for the `LCT` alternative. `region` has four `SEM: LCT` readings and no `ARF`. Source: `data/archive/exports/corpus/eolss/export_corpus.php__project_eolss_lang_en_unl_0` line 14, "The demand for fresh water in the region exceeds…". Today: trace `[1]`. |
| R13 | `woman in a party`, disambiguation. | `in@1 → P`, all 13 preposition readings. `a@2`, `party@3` kept. Trace `[1]`. | eng-afr | neutral | pending | eng-dis-1; must not fire: eng-dis-5 | Corpus line 163, `lpl(110787470, 107447641.@indef)`: a logical place, not `plc`. `party` has no `ARF` or `LCT` reading. Which relation this row gets is not this issue's. Today: green. |
| R14 | Hand-built. Rule 5 alone. Position 0, surface `in`: `{LEX=P, POS=PRE, rel=tim}`, `{LEX=P, POS=PRE, rel=man}`, `{LEX=P, POS=PRE, rel=plc}`. Position 1, surface `a`: `{LEX=D, POS=ART}`, `{LEX=N, POS=NOU}`. Position 2, surface `box`: `{LEX=N, SEM=ACT}`, `{LEX=N, SEM=ARF}`. | Position 0 holds the `plc` reading alone. Positions 1 and 2 hold both readings, in order. Trace `[5]`. | eng-afr | neutral | n/a | eng-dis-5 | Source: original. Rule 5 at its smallest. Both `#PREFERRED` positions keep every reading, and the noun's front reading need not be the artefact. |
| R15 | Hand-built. As R14, with position 2 `{LEX=N, SEM=ACT}`, `{LEX=N, SEM=TIM}`. | Every position holds every reading, in order. Trace `[]`. | eng-afr | neutral | n/a | must not fire: eng-dis-5 | Source: original. No artefact or location reading, so no match. |
| R16 | Hand-built. Rule 5 alone. Position 0, surface `on`, the three readings of R14's position 0. Positions 1 and 2 as R14. | Every position holds every reading. Trace `[]`. | eng-afr | neutral | n/a | must not fire: eng-dis-5 | Source: original. The literal `[in]` reads the surface only. 195 D07 holds the real-store case. |
| R17 | `RuleSet::load` on the real stores, eng to afr. | `disambiguation()` holds five records, ids `1` to `5`, in file order, each `kind` `disambiguation`, each `rhs` `0`. | eng-afr | neutral | n/a | eng-dis-1 to eng-dis-5 | Replaces `195-test-cases.md` D14, which asserted four. Today: four records. |
| R20 | Hand-built. Record `182` alone in the analysis list. One word `{surface: "John", features: {$uw: "\"John\"", TEMP: ""}}`. | Trace `[{182, fired}]`. `n1` features hold `LEX: N` and `POS: PPN`. `status` ok. | eng-unl | neutral | n/a | eng-ana-182 | Source: original. Rule 182 fires once: after it, `^LEX` is false. |
| R21 | Hand-built. Record `182` alone. One word `{surface: "John", features: {$uw: "\"John\"", TEMP: "", LEX: N}}`. | Trace `[]`. `status` ok. | eng-unl | neutral | n/a | must not fire: eng-ana-182 | Source: original. A `TEMP` word that already has a part of speech keeps it. Archive rule 22 makes such a word: it merges two `PPN` words and adds `TEMP`. |
| R22 | Hand-built. Record `182` alone. One word `{surface: "xyzzy"}`, no feature. | Trace `[]`. `status` ok. | eng-unl | neutral | n/a | must not fire: eng-ana-182 | Source: original. No `TEMP`, no firing. Hand-built twin of R08's `book xyzzy`. |

Row count: 20. Ids R18, R19 and R23 onwards are not used.

Each drafted rule has a fire row and a must-not row:

| Rule | Fires | Must not fire |
|---|---|---|
| eng-dis-5 | R01, R10, R12, R14 | R03, R11, R13, R15, R16; 195 D06, D07, D09 |
| eng-ana-182 | R04, R05, R07, R09, R20 | R08, R21, R22 |
| eng-ana-154 (existing) | R01 | R03 |
| eng-ana-134 (existing) | R04 | R02 |
| eng-ana-18 (existing) | R05, R07 | R06 (fires once, not twice) |

## Findings for the owner

None blocks this issue. Each is outside its scope.

- **F1. A07 picks the wrong `box`.** `Engine::translate` takes the first reading in shard order,
  `100135148`, `SEM: ACT`, frequency 1. The corpus has `102883344`, `SEM: ARF`, frequency 26. R01
  asserts the relation, not node 1's UW. Choosing a sense by frequency or by `SEM` is a later issue.
- **F2. A09's `Geneva` carries `@about`.** Rule 15 copies the preposition's `att` onto its object:
  `+att=%x`. Both `cnt` readings of `about` carry `att: @about`. `@about` is a universal nominal
  attribute (`docs/unl-reference/spec/universal-attributes.md` line 59), but the corpus writes no
  attribute on line 128 or on `a book about love`, line 129. R04 does not assert node 1's
  attributes. A rule that drops `@about` under `cnt` would close the gap.
- **F3. A13's `status` is `partial`; `basic.yaml` says `ok`.** `Mary` and `John` have no dictionary
  entry, so `Engine::translate` marks the row partial. R05 asserts no `status`. Issue 196 or 181
  owns which one is right.
- **F4. The archive writes `and` both ways.** See decision 3.

## Where the rules stop

Recorded, not tested.

- **A noun with an artefact sense in an abstract phrase.** `in the form of` fires rule 5: `form` has
  two `SEM: ARF` readings. The phrase needs `man` or `met`. A misfire, and the rule's greediest
  case: any one artefact or location reading is enough.
- **An adjective between the determiner and the noun.** `in a small box` does not fire rule 5. The
  window is three words wide.
- **No determiner.** `chair in office` (line 175, `plc`) and `a train in Paris` (line 111, `plc`)
  do not fire rule 5. `in` keeps its `tim` reading in front.
- **A capitalised `In`.** Rule 5, like rule 1, reads the surface `in` only.
- **`PLC` nouns.** `in the kitchen` does not fire rule 5. `kitchen` is `SEM: PLC` only. Adding
  `SEM=PLC` needs an archive reference or the owner's word.
- **Names in longer rows.** E1 and rule 182 also reach A15's `Paris` and `book John`, which now gets
  `mod(book;"John")` through rules 10 and 172. No test asserts either. A14 and A15 belong to issue
  197.

## Existing tests

| Test | What changes |
|---|---|
| `rule_interpreter.D01RuleOneKeepsThePrepositionOfInInABookInABox` | Red on the new data. The test-writer rewrites it to R10. |
| `rule_interpreter.RuleSetLoadsAllFiveGrammarKindsFromTheRealStores` | Red on the new data. The test-writer rewrites its D14 lines to R17. |
| `rule_interpreter.D02RuleOneLeavesTheArticleAfterInWithAllFourReadings` | Stays green: rule 5 marks `a` and `box` `#PREFERRED`. |
| `rule_interpreter.D03…`, `D06…`, `D07…`, `D08…`, `D09…` | Stay green. D03 builds its own positions, so `Geneva` there carries no `TEMP`. |
| `engine_status.A13NamesEnterTheGraphAsQuotedLiterals`, `A09GenevaIsALiteralAndTheRowKeepsStatusPartial`, `CapitalisedNameAfterALowerCaseWordIsALiteralNotTheCommonNoun` | Stay green. Each reads `$uw` or `status`, not features. |
| 180's G01 to G09 | Stay green. No row holds `in`, `about` or a name. |

On the applied data, without E1, `ctest -L fast` fails exactly the first two rows of this table.

## For the test-writer

- R01 to R09 go in `tests/unit/engine_status_test.cpp`. R10 to R17 go in
  `tests/unit/rule_interpreter_test.cpp`, beside the D-rows; R10 and R17 replace the bodies of the
  two tests named above. R20 to R22 go in `tests/unit/tree_pass_test.cpp`.
- The data change is already in the tree, uncommitted. Prove each row red before the `test(#198)`
  commit: put `main`'s two grammar files back (`git show main:data/languages/eng/grammar/...`), run
  the rows, see R01, R02, R10, R12 and R17 fail as their notes say, then restore the new text. R04
  to R07 and R09 stay red until E1. R14 to R16 and R20 to R22 build their own rules, so they pass at
  once; they pin the rule text, not a change.
- Count by trace entries with `event == fired`. "Holds exactly one `154`" counts entries whose
  `rule` is `"154"`.
- A `"\"John\""` UW is six bytes with the quotes. R05 and R07 compare node order too.

## For the implementer

- E1 only. The work commit carries E1 and the two grammar files the rule-author already changed.
- Do not touch rule 4. It reads `^LEX` on `Geneva` before the tree pass, and E1 adds no `LEX`.
- A full re-import of eng grammar does not reach these records: both are `archive_path: original`.
  Issue 180's note on record `1` still holds.
