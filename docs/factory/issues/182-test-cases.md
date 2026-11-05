# Issue 182 — generation rule divergences, test cases

**This file is the source of truth for issue 182's tests and rules.** The test-writer turns block P
into GoogleTest cases. Where a test, a rule `comment`, `generation.yaml`, a store test row or another
test-cases file disagrees with this file on a row named here, this file wins and the other is
corrected to match. Rows of `181-test-cases.md` and the `engine_status` tests listed under
"Existing tests" change here.

No `expected` value in this file came from running the engine. Each Afrikaans text comes from one of
two places: the owner-confirmed `expected` of rows A09, A10 and A15 in
`tests/fixtures/languages/eng/tests/basic.yaml`, or a sentence of the afr corpus
`data/languages/afr/corpus/ugoa1.yaml` at the line the row names. Where a row takes a part of one of
those sentences, the note says so. A UW with no afr dictionary entry renders as `⟦<source surface>⟧`
(ADR 0025), so the corpus's `Genève` and `Parys` read `⟦Geneva⟧` and `⟦Paris⟧` here, as in the
fixture.

The rule-author compiled a scratch probe outside the repo to check that each drafted rule can fire
on the current interpreter. The probe set no expected value.

Every row that makes a claim about Afrikaans is `review: pending`. The owner reviews them.

## The fix is data only

No engine change. No stub. `engine/` is untouched. Every drafted rule uses syntax the generation
interpreter already parses:

- **Attribute pair.** `%y,N,@top,@contact` is three tag tests, AND-joined. `has_tag`
  (`engine/src/tree_syntax.cpp`) reads a tag as a feature key, a feature value or an attribute. So
  the pair holds when the node carries both attributes. No `@top.@contact` dotted form is needed.
  `.` is not a rule separator (`docs/unl-reference/formats/transformation-grammar.md`).
- **Two-word literal.** `['n paar]` makes one word node whose surface is `'n paar` (ADR 0022). The
  archive already writes multi-word literals: rule 14 `[ver van]`, rule 25 `[as gevolg van]`. No
  closed-class record has the headword `'n paar`, so the node carries the rule's edits only:
  `LEX=D, POS=QUA`.
- **A dependent with no LEX.** `{N|^LEX}` is a disjunction. `^LEX` holds on a name literal and on a
  UW with no afr entry: `choose_word` (`engine/src/generation.cpp`) gives both only the UW feature.

The data change is in the tree, uncommitted:

- `data/languages/afr/grammar/generation.yaml`: rule `4` and rule `40` edited in place, `archive_path:
  original` (ADR 0020). Rule `235` inserted after rule `21`. Rule `236` inserted after rule `9`.
- `data/languages/eng/tests/basic.yaml` row A15: `rules` drops `afr-gen-22` and adds `afr-gen-235`,
  `afr-gen-236`. Rule `22` stays covered by row A07 (line 74).

## The rules

| id | lhs | rhs | source |
|---|---|---|---|
| afr-gen-4 | `cnt(%x,N;%y,{N\|^LEX})` | `NA(%x;PC([oor],LEX=P,POS=PRE;%y,-CAS,+CAS=OBL))` | original; adapted from `exports/afr/47.tgrammar.txt` line 10. The rhs already wrote `[oor]`; only the archive comment said `omtrent`. The dependent may now also carry no LEX. |
| afr-gen-40 | `(%x,N,@paucal)` | `(NS(%x,-@paucal,-NUM,+NUM=PLR;%y,['n paar],+LEX=D,+POS=QUA,+DIS=BEF),+LEX=N)` | original; `exports/afr/47.tgrammar.txt` line 46 with `['n paar]` for `[enkele]`, per corpus lines 141 to 144. |
| afr-gen-235 | `plc(%x;%y,N,@top,@contact)` | `XA(%x;PC([op],LEX=P,POS=PRE;%y,-CAS,+CAS=OBL))` | original; adapted from `exports/afr/47.tgrammar.txt` line 24 (rule 18, `@on`). No archived rule keys `@contact`. |
| afr-gen-236 | `nam(%x,N;%y,{N\|^LEX})` | `((%y,+>BLK)(%x,+>BLK),+LEX=%x)` | original; the group shape of rule 33 (`and`, `exports/afr/47.tgrammar.txt` line 39). No archived afr, dut or chi generation rule handles `nam`. Word order per corpus line 248. |

Rule `235` sits before rule `234`. Rule `234`, `plc(%x,N;%y,N)`, takes any noun head first
(`181-test-cases.md`, note C5). Rule `236`'s position among the relation rules does not change the
result: no other relation rule matches a `nam` link.

## How to read the rows

- **gen** rows call `RuleInterpreter(Rules()).generate(graph, AfrDictionary(), surfaces, Lang::afr,
  trace)`, as `tests/unit/generation_test.cpp` does. The input column gives the graph as
  `uw.@attr` nodes, index from 0, and `label(from,to)` relations, then the surfaces in node order.
- **eng-afr** rows call `Engine::translate(input, Options{Lang::eng, Lang::afr})`, as
  `tests/unit/engine_status_test.cpp` does.
- A trace is asserted by containment of `fired` entries. "Not" lists rules that must hold no
  `fired` entry.

## Block P

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| P01 | `102870092.@indef`, `500004419`; `cnt(0,1)`; surfaces `book`, `Geneva` | `text` `'n boek oor ⟦Geneva⟧`. `status` partial. Holds `afr-gen-4`, `afr-gen-36`. `text` holds no `omtrent`. | gen | neutral | pending | afr-gen-4, afr-gen-36 | Fire row for rule 4. A09's corpus graph, line 128. Text is A09's fixture `expected`, verbatim. Today: `'n boek ⟦Geneva⟧`, rule 4 silent, because the unentried UW has no `LEX`. |
| P02 | `102870092.@indef`, `107543288`; `cnt(0,1)`; surfaces `book`, `love` | `text` `'n boek oor liefde`. `status` ok. Holds `afr-gen-4`. | gen | neutral | pending | afr-gen-4 | Rule 4 on a noun dependent, the archive's own case. Corpus line 129. |
| P03 | `102870092`, `300217728`; `cnt(0,1)`; surfaces `book`, `beautiful` | Holds no `afr-gen-4`. `text` holds no `oor`. | gen | neutral | n/a | must not: afr-gen-4 | Must-not row for rule 4. An adjective carries `LEX=J`, so `{N\|^LEX}` fails. Hand-built; no Afrikaans claim. |
| P04 | `a book about Geneva` | `text` `'n boek oor ⟦Geneva⟧`. `status` partial. Holds `afr-gen-4`. | eng-afr | neutral | pending | eng-dis-11, eng-ana-12, eng-ana-15, afr-gen-4, afr-gen-36 | A09 end to end. The owner reversed ruling D1 on 2026-11-04 (ADR 0025 amendment), and issue 207 gave `Geneva` a record (ADR 0030). The analysis builds `cnt(book;500004419)`. Afr has no record for that UW, so the word shows marked. Row C12 of `207-test-cases.md`. |
| P05 | `115155220.@paucal`, `115237250.@def.@before`; `tim(0,1)`; surfaces `days`, `summer` | `text` `'n paar dae voor die somer`. `status` ok. Holds `afr-gen-40`, `afr-gen-26`. Holds no `afr-gen-30`. | gen | neutral | pending | afr-gen-40, afr-gen-26 | Fire row for rule 40. A10's corpus graph, line 143. Text is A10's fixture `expected`, verbatim. Replaces 181 N30's `ends_with`. Today: `enkele dae voor die somer`. |
| P06 | `some days before the summer` | `text` `'n paar dae voor die somer`. `status` ok. Holds `afr-gen-40`, `afr-gen-26`. | eng-afr | neutral | pending | eng-ana-12, eng-ana-15, afr-gen-26, afr-gen-35, afr-gen-40, afr-gen-227, afr-inf-M2, afr-inf-M7 | A10 end to end; the issue's acceptance row. Today: `enkele dae voor die somer`. |
| P07 | `115155220.@paucal`; no relation; surfaces `days` | `text` `'n paar dae`. The list node with surface `'n paar` carries `LEX=D` and `POS=QUA`, and no `UW` feature. Holds `afr-gen-40`. | gen | neutral | pending | afr-gen-40 | The two-word literal is one node (ADR 0022: no closed-class record, rule edits only). Text is the head of corpus lines 141 to 144, all `'n paar dae ...`. |
| P08 | `102870092.@multal`; no relation; surfaces `books` | Holds `afr-gen-41`. Holds no `afr-gen-40`. `text` holds no `paar`. | gen | neutral | n/a | must not: afr-gen-40 | Must-not row for rule 40. Asserts no full text: corpus line 39 writes `etlike boeke`, and rule 41 writes `talle`. That divergence is not this issue's (F2). |
| P09 | `102870092.@def`, `104379243.@def.@top.@contact`; `plc(0,1)`; surfaces `book`, `table` | `text` `die boek op die tafel`. `status` ok. Holds `afr-gen-235`. Holds no `afr-gen-234`, no `afr-gen-22`, no `afr-gen-18`. | gen | neutral | pending | afr-gen-235; must not: afr-gen-234, afr-gen-22 | Fire row for rule 235. Text is the head of corpus lines 734 to 744 (`die boek op die tafel ...`). Proves 235 sits before 234. Today: `die boek in die tafel`, rule 234. |
| P10 | `102870092.@def`, `104379243.@def.@top.@contact`, `500003943`; `plc(0,1)`, `cnt(0,2)`; surfaces `book`, `table`, `Paris` | `text` `die boek op die tafel oor ⟦Paris⟧`. `status` partial. Holds `afr-gen-235`, `afr-gen-4`. | gen | neutral | pending | afr-gen-235, afr-gen-4 | Corpus line 734, `die boek op die tafel oor Parys`, whole. The place phrase comes before the content phrase. |
| P11 | `102870092.@indef`, `102883344.@indef.@contact`; `plc(0,1)`; surfaces `book`, `box` | Holds no `afr-gen-235`. `text` holds no `op`. | gen | neutral | n/a | must not: afr-gen-235 | Must-not row for rule 235: `@contact` alone. Corpus line 282 writes `'n boek by 'n doos`. No rule writes `by` yet (F1), so the row asserts no full text. |
| P12 | `102870092`, `104379243.@top`; `plc(0,1)`; surfaces `book`, `table` | Holds no `afr-gen-235`. `text` holds no `op`. | gen | neutral | n/a | must not: afr-gen-235 | Must-not row for rule 235: `@top` alone. Hand-built; no corpus sentence carries `@top` without `@contact`. |
| P13 | `108524735.@def`, `500003943`; `nam(0,1)`; surfaces `city`, `Paris` | `text` `⟦Paris⟧ die stad`. `status` partial. Holds `afr-gen-236`, `afr-gen-35`. | gen | neutral | pending | afr-gen-236, afr-gen-35 | Fire row for rule 236. Text is the `Parys die stad` part of corpus line 248 and of A15's fixture `expected`. The name goes before the whole noun phrase, determiner included. Today: `die stad ⟦Paris⟧`, appended by ADR 0025. |
| P14 | `108524735.@def`, `"Paris"`; `nam(0,1)`; surfaces `city`, `Paris` | `text` `Paris die stad`. `status` ok. Holds `afr-gen-236`. | gen | neutral | pending | afr-gen-236 | The issue's "the name it attaches, unquoted": a name literal shows without its quotes (ADR 0025). |
| P15 | as P10 | Holds no `afr-gen-236`. | gen | neutral | n/a | must not: afr-gen-236 | Must-not row for rule 236: no `nam` link. |
| P16 | `102870092.@def`, `104379243.@def.@top.@contact`, `300217728`, `108524735.@def`, `500003943`; `plc(0,1)`, `mod(0,2)`, `cnt(0,3)`, `nam(3,4)`; surfaces `book`, `table`, `beautiful`, `city`, `Paris` | `text` `die mooi boek op die tafel oor ⟦Paris⟧ die stad`. `status` partial. Holds `afr-gen-4`, `afr-gen-8`, `afr-gen-35`, `afr-gen-235`, `afr-gen-236`. Holds no `afr-gen-22`, no `afr-gen-234`. | gen | neutral | pending | afr-gen-4, afr-gen-8, afr-gen-35, afr-gen-235, afr-gen-236 | A15's corpus graph, line 248, without `mod(book;:01.@without)` and `and:01(...)`. `Graph` has no scope yet (ADR 0026, proposed). Text is A15's fixture `expected` up to `die stad`. The rest, `sonder prente en foto's`, needs the scope and a `@without` rule (F3). |
| P17 | `the beautiful book about the city of Paris without pictures and photos on the table` | `text` equals A15's fixture `expected`, `die mooi boek op die tafel oor ⟦Paris⟧ die stad sonder prente en foto's`, modulo the `⟦Paris⟧` mark. `status` per D1. | eng-afr | neutral | pending; blocked | eng-ana-12, eng-ana-15, eng-ana-18, eng-ana-50, afr-gen-4, afr-gen-8, afr-gen-33, afr-gen-35, afr-gen-227, afr-gen-235, afr-gen-236, afr-inf-M3, afr-inf-M16 | A15 end to end; the issue's acceptance row. **Blocked outside this issue** (B1). Do not write it as a passing test. Write it as `GTEST_SKIP()` naming B1, or leave it out. Today: `mooi boek die stad Paris skilderye foto's in die tafel`. |
| P18 | `python -m tools.validate --changed` | Exit 0. No uncovered-rule warning names `afr-gen-235` or `afr-gen-236`. | data | neutral | n/a | afr-gen-235, afr-gen-236 | Coverage comes from the A15 store row's `rules`. |

18 rows. Fire rows: rule 4 P01, P02, P04, P10, P16. Rule 40 P05 to P07. Rule 235 P09, P10, P16.
Rule 236 P13, P14, P16. Must-not rows: rule 4 P03, rule 40 P08, rule 235 P11, P12, rule 236 P15.

## Decisions

Each settles a point the issue, SPEC.md or an ADR leaves open. Each is an ADR candidate.

- **D1. A name literal under `cnt` is placed, and A09 turns `ok` end to end.** Rule 4 now accepts a
  dependent with no `LEX`. On the corpus graph, the UW `500004419` has no afr entry, so `Geneva`
  keeps its mark: P01 is A09's fixture text exactly. Through the engine, the analysis builds the name
  literal `"Geneva"`, which ADR 0025 shows unmarked: P04 reads `'n boek oor Geneva`, `ok`. ADR 0025
  foresaw this ("The owner rules on A09 then"). The alternative, accepting only an unentried UW and
  not a literal, leaves `oor` out of A09 end to end and fails the acceptance criterion. **The owner
  rules:** keep A09's fixture `status: partial` and `⟦Geneva⟧` as the reference reading, or change
  them to `ok` and `'n boek oor Geneva`. Until then the fixture row stands and P04 is pending.
- **D2. An attribute pair is written as two tag tests.** `plc(%x;%y,N,@top,@contact)`. No archived
  rule keys a pair; the T-rule reference documents no dotted form. Two bare tags AND-join under the
  existing parser. Rule 235 uses the `XA` shape of rule 18 (`@on`), not the `NA` shape of rule 234,
  so it also serves a verb head.
- **D3. The name goes before the whole noun phrase.** Rule 236 follows A15 (corpus line 248, `Parys
  die stad`), the only `nam` row the fixture set confirms. Three other afr corpus lines disagree:
  line 419 `die boek "Le Petit Prince"` (name after, quotes kept), line 512 `stad van Praag` (name
  after, with `van`), line 515 `Atlantiese Oseaan` (an adjective form before). One rule cannot
  produce all four orders. The owner rules whether the A15 order is the default, and which feature
  (a quoted title, a place UW) selects the others.

## Findings for the owner

- **F1.** `@contact` alone has no rule. Corpus line 282 writes `by`. Rule 234 writes `in`.
- **F2.** Rule 41 (`@multal`) writes `talle`. Corpus line 39 writes `etlike`. Same class of
  divergence as rule 40; not in this issue.
- **F3.** No afr rule writes `sonder` for `@without`. A15's tail needs it, and the `and:01` scope.

## Blockers outside this issue

- **B1. A15 end to end cannot reach its fixture text.** Today the analysis builds one relation for
  A15, `plc(photos;table)`. It builds no `cnt`, `nam`, `mod` or scope, no `@top.@contact`, no `@def`
  on `book`, and takes `pictures` as `skilderye`. The corpus graph also needs a scoped `and:01`, and
  `Graph` has no scope (ADR 0026, proposed, not built). The issue's first acceptance criterion names
  A15. Its generation half is P16. The analysis half needs its own issue.

## Existing tests

These assert A09 end to end as `partial`. Under D1 they turn red. Each changes to P04's reading
once the owner rules D1; until then the test-writer leaves them and the implementer reports them.

| Test | Today | After |
|---|---|---|
| `engine_status.A09GenevaIsALiteralAndTheRowKeepsStatusPartial` | `status` partial | literal check stays; `status` ok |
| `engine_status.R04_a09_a_book_about_geneva_has_the_cnt_relation` | `status` partial | `status` ok; graph checks unchanged |
| `engine_status.N16_a09_a_book_about_geneva_appends_the_mark` | `starts_with("'n boek ")`, one `⟦Geneva⟧` | replaced by P04 |

Unchanged and still green: 181 N26, N27 (A07, rule 234), N61 (rule 22), N62 (`@on`, rule 18),
`engine_status` K06 (`ends_with`). 181 N30 stays green and P05 tightens it.

## For the test-writer

- Put the gen rows in `tests/unit/generation_test.cpp`, the eng-afr rows in
  `tests/unit/engine_status_test.cpp`, using the helpers already there.
- Test names carry the row id: `P05_a10_corpus_graph_gives_n_paar`.
- The red suite before the data lands: P01, P04, P05, P06, P07, P09, P10, P13, P14, P16. P02, P03,
  P08, P11, P12, P15 are green today and must stay green.

## For the implementer

- No engine work. Confirm the suite and `python -m tools.validate --changed`.
- Report the three existing tests of D1 as red and blocked on the owner's ruling, not fixed.
