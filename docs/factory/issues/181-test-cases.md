# Issue 181 — generation test cases

**This file is the source of truth for issue 181's tests and rules.** The test-writer turns block N
into GoogleTest cases. Where a test, a rule `comment`, an ADR, `24-test-cases.md`,
`tests/fixtures/languages/eng/tests/basic.yaml` or the issue file disagrees with this file on a row
named here, this file wins and the other is corrected to match. A disagreement with an
owner-confirmed `expected` value is never settled here: it is listed under "Scope conflicts" for
the owner.

No `expected` value in this file came from running the engine. Each Afrikaans text comes from
`data/languages/afr/corpus/ugoa1.yaml` at the line the row names, or from an afr dictionary record
the row names. Each trace claim is the rule-author's reading of `generation.yaml` under ADR 0021,
not a recording. A trace is asserted by containment only: "holds `afr-gen-35`" means at least one
entry with that id and `event == fired`; "holds no `afr-gen-22`" means no such fired entry. An
`unsupported` entry never counts either way.

The rule-author compiled a scratch probe outside the repo against `main` as it stands. It printed
the UNL graph `Engine::translate` builds for each fixture row. It set no expected value. Its output
is the "Today" table under ruling D1.

Every row that makes a claim about Afrikaans or English is `review: pending`: the owner reviews both
languages and has not ticked these rows. Rows that make no language claim are `review: n/a`.

## Owner rulings, 2026-10-28

The rule-author's first pass found six scope conflicts, C1 to C6. The owner ruled on C1 to C4.

**D1, on C1 and C3: issue 199 owns the English-side analysis fixes.** Generation reads the graph
issue 180 builds. Today it differs from the corpus graph on four rows:

| Row | `Engine::translate` builds | Corpus graph |
|---|---|---|
| A06 `all the books` | `400008007`, `102870092.@pl`, no relation | `102870092.@all.@def` |
| A07 `a book in a box` | `plc(102870092.@indef, 100135148.@indef)` | `plc(102870092.@indef, 102883344.@indef)` |
| A10 `some days before the summer` | four nodes, `400007015`, `115141059`, `400066781`, `115145012.@def`, no relation | `tim(115155220.@paucal, 115237250.@def.@before)` |
| A12 `a very beautiful car` | `400510749`, `300217728`, `102958343.@indef`, `mod 1→0` | `mod(102958343.@indef, 300217728.@plus)` |

Issue 199 owns these graphs and the exact-match engine rows for A06, A07 and A12: N06, N07 and N11.
A10's exact match stays with issue 182, which depends on issue 199, because rule 40 writes
`[enkele]` where the corpus writes `'n paar`: N09 and N29. These five rows leave 181's acceptance
set. Issue 181 keeps the generator rows on the corpus graphs, so generation is still proven on
lines 35, 91, 143 and 210 (N25 to N28, N30, N33, N34).

**D2, on C2: afr-dis-5 is proven on a generated list.** Generation picks a word by UW (ADR 0023).
UW `300217728` maps only to adjectives (`mooi`, `pragtig`, `skoon`), so A08's and A11's lists never
hold the adverb `mooi`. Rows N58 to N60 prove the rule on a list that holds the homograph. Rows N15
prove it stays silent on A02, A03 and A07. Rows N13 and N14 are withdrawn.

**D3, on C4: the archive's priority stands.** ADR 0023 is accepted. `motor` (priority 2) wins over
`kar` (1), and `boks` (2) over `doos` (1). Rows A07, A11 and A12 of `24-test-cases.md` and
`tests/fixtures/languages/eng/tests/basic.yaml` now read `'n boek in 'n boks`, `die mooi motor` and
`'n baie mooi motor`. The archive's own `exports/afr/44.tgrammar.txt` lines 56 to 58 write
`die mooi motor`. N10, N26, N31 and N33 take the new text and are no longer blocked.

ADRs 0021, 0022, 0024 and 0025 are accepted as proposed.

Two notes stand without a ruling. Neither blocks a row.

- **C5. afr-gen-22's `+BEF` puts a place phrase before its noun.** Under rule 196,
  `NB(%x;%y,BEF):=(%y)(%x)`, A07 would read `'n in 'n boks boek`. The flag suits a verb (`in die
  kombuis vermoor`, the rule's own comment). Rule `234`, drafted below, covers a noun head. Issue 182
  does not list this divergence. When issue 182 adds `op` for A15's `@top.@contact`, rule `234` now
  takes A15's noun head first, so issue 182's rule must sit before it.
- **C6. The issue names M16 on A15 and M2 on A10.** Neither row is in 181's acceptance set. Rows
  N40 to N43 apply M2, M3, M7 and M16 on single-node graphs instead.

### Issue 181's acceptance set

N01 to N05, N08, N10, N12, N15 to N28, N30 to N35, N40 to N63: 52 rows. No row in it is blocked.

| Rows | Status |
|---|---|
| N06, N07, N11 | Owned by issue 199. |
| N09, N29 | Owned by issue 182 (A10's determiner), after issue 199. |
| N13, N14 | Withdrawn by ruling D2. |

## The design

ADRs 0021 to 0025, all accepted on 2026-10-28, hold it. In short:

- `RuleInterpreter::generate` builds a forest from the graph and runs `generation.yaml` as one
  first-match loop, ADR 0017's order. File order is the pass order (ADR 0021).
- A word comes from the afr dictionary by UW: lemma entries, highest priority first, then store
  order (ADR 0023).
- A bracketed word on a right side takes the features of the afr closed-class record of that
  headword, when one exists (ADR 0022).
- After the loop, the afr disambiguation grammar runs over the final word list (ADR 0021).
- Generation trace ids read `afr-gen-N`, `afr-dis-N`, `afr-inf-MN` (ADR 0024).
- A placed name shows as itself. A node no rule places, and a source word with no entry, is
  appended as `⟦word⟧`, and the row is `partial` (ADR 0025).

## The data change

Applied by the rule-author. `data/languages/afr/grammar/generation.yaml`, a new record inserted
after record `21` and before record `22`. The pass tries rules in file order, so the record sits
after the attribute-specific `plc` rules 12 to 21 and before the default rule 22.
`python -m tools.validate --changed` exits 0 on it.

```yaml
- id: "234"
  kind: generation
  lhs: "plc(%x,N;%y,N)"
  rhs: "NA(%x;PC([in],LEX=P,POS=PRE;%y,-CAS,+CAS=OBL))"
  conditions: []
  comment: "A place phrase on a noun follows the noun: plc(boek,boks) > NA(boek,PC(in,boks)), 'n boek in 'n boks"
  source: {archive_path: original, line: "issue 181; adapted from exports/afr/47.tgrammar.txt line 28 (rule 22) without its +BEF, in the NA shape of line 10 (rule 4)"}
```

Rule `234` reads:

- `plc(%x,N;%y,N)`: a `plc` relation whose head and dependent both carry `N`. Rules 12 to 21 match
  first when the dependent carries `@behind`, `@on` and the rest. A head that is not a noun falls
  through to rule 22, which keeps its `+BEF`.
- `NA(...)`: the archive's adjunct-to-a-noun label, as rule 4 writes it for `cnt`. No `BEF`, so
  rule 200, `NB(%x;%y):=(%x,+>BLK)(%y,+>BLK)`, puts the phrase after the noun.

## The stubs

Added by the rule-author. Each body returns `Status::not_implemented`, no entry, or no change.
`ctest -L fast` stays green on the stubs: 183 tests.

| Stub | File |
|---|---|
| `Dictionary::lookup_uw(std::string_view uw) const` | `engine/include/verstaan/dictionary.hpp`, `engine/src/dictionary_lookup.cpp` |
| `RuleSet::to_disambiguation() const`, member `to_disambiguation_` | `engine/include/verstaan/rule_set.hpp` |
| `RuleSet::from_rules(...)`, seven lists, the seventh `to_disambiguation` | `rule_set.hpp`, `engine/src/rule_interpreter.cpp` |
| `struct GenerationResult { Forest forest; std::string text; Status status; }` | `engine/include/verstaan/rule_interpreter.hpp` |
| `RuleInterpreter::generate(const Graph&, const Dictionary&, const std::vector<std::string>& source_surfaces, Lang target_language, Trace&) const` | `rule_interpreter.hpp`, `engine/src/generation.cpp` (new, in `engine/CMakeLists.txt`) |
| `RuleInterpreter::disambiguate_target(std::vector<Position>&, Lang target_language, Trace&) const` | `rule_interpreter.hpp`, `engine/src/generation.cpp` |

## How to read the rows

Rule ids follow `24-test-cases.md`, with ADR 0024's prefixes: `afr-gen-N` is record `id: "N"` of
`data/languages/afr/grammar/generation.yaml`; `afr-dis-N` of `disambiguation.yaml`; `afr-inf-MN`
of `inflection.yaml`. These are the ids the engine writes into the trace. Analysis ids stay bare.

- **Engine rows** call `Engine::load(RuleSet::load(eng, afr))` on the real stores and
  `translate(input, Options{.from = Lang::eng, .to = Lang::afr})`. `expected` is `text`, byte for
  byte, then `status`.
- **Generator rows** call `RuleInterpreter(RuleSet::load(eng, afr)).generate(graph,
  Dictionary::load(afr, Lang::afr), surfaces, Lang::afr, trace)`. `graph` is written as in
  `198-test-cases.md`: `[102870092.@def]` is one node with one attribute; `plc 0→1` is
  `Relation{"plc", 0, 1}`. `surfaces` holds the English word of each node, in node order.
- **Hand-built rows** use `RuleSet::from_rules` for the rules and say what else they read.
- "N words" counts the words of `text` split on single spaces.

## Block N

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| N01 | A01 `book`, engine row. | `boek`, `ok`. The trace holds `afr-gen-227` and `afr-inf-M3`. It holds no `afr-gen-35`, `afr-gen-36`, `afr-gen-56`, `afr-gen-195` or `afr-gen-231`. | eng-afr | neutral | pending | afr-gen-227, afr-inf-M3; must not: afr-gen-35, -36, -56, -195, -231 | `ugoa1` line 1. Proves the afr dictionary is read: `102870092` is `boek`, `b.yaml` line 15946. Rule 227 runs M3's `SNG` branch, which changes nothing (ADR 0021, consequences). Issue 24 reads A01 as a must-not row for 227 and M3. Today: `book`. |
| N02 | A02 `the book`, engine row. | `die boek`, `ok`. Holds `afr-gen-35`, `afr-gen-125`, `afr-gen-195`, `afr-gen-230`, `afr-gen-231`, `afr-inf-M3`. Holds no `afr-gen-33`, `afr-gen-36`, `afr-gen-67`, `afr-gen-196`, `afr-gen-229` and no `afr-dis-5`. | eng-afr | neutral | pending | afr-gen-35, -125, -195, -230, -231, afr-inf-M3; must not: afr-gen-33, -36, -67, -196, -229, afr-dis-5 | Line 2. The issue's must-not row for afr-dis-5. Today: `the book`. |
| N03 | A03 `a book`, engine row. | `'n boek`, `ok`. Holds `afr-gen-36`, `afr-gen-195`, `afr-gen-231`. Holds no `afr-gen-35` and no `afr-dis-5`. | eng-afr | neutral | pending | afr-gen-36, -195, -231; must not: afr-gen-35, afr-dis-5 | Line 3. `'n` reaches `n.yaml` only after the shard fix (ADR 0022). Today: `a book`. |
| N04 | A04 `books`, engine row. | `boeke`, `ok`. Holds `afr-gen-56`, `afr-gen-227`, `afr-inf-M3`. Holds no `afr-gen-35`, `afr-gen-36`, `afr-gen-40`, `afr-gen-231`, `afr-inf-M2`, `afr-inf-M7` or `afr-inf-M16`. | eng-afr | neutral | pending | afr-gen-56, -227, afr-inf-M3; must not: afr-gen-35, -36, -40, -231, afr-inf-M2, -M7, -M16 | Line 10. M3 adds `e`. One word, so no blank. Today: `books`. |
| N05 | A05 `the books`, engine row. | `die boeke`, `ok`. Holds `afr-gen-35`, `afr-gen-56`, `afr-inf-M3`. Holds no `afr-gen-37` and no `afr-gen-60`. | eng-afr | neutral | pending | afr-gen-35, -56, afr-inf-M3; must not: afr-gen-37, -60 | Line 31. Two attributes on one node. Today: `the books`. |
| N06 | A06 `all the books`, engine row. | `al die boeke`, `ok`. Holds `afr-gen-35`, `afr-gen-37`, `afr-gen-60`. Holds no `afr-gen-56`. | eng-afr | neutral | pending | afr-gen-35, -37, -60; must not: afr-gen-56 | Line 35. **Owned by issue 199** (D1). N25 runs the corpus graph in 181. Today: `all the books`. |
| N07 | A07 `a book in a box`, engine row. | `'n boek in 'n boks`, `ok`. Holds `afr-gen-234` and exactly two `afr-gen-36`. Holds no `afr-gen-22` and no `afr-dis-5`. | eng-afr | neutral | pending | afr-gen-234, -36; must not: afr-gen-22, afr-dis-5 | Line 91, amended by D3. **Owned by issue 199** (D1): today's graph carries `100135148`. Fire row for rule 234. N27 tests the order on the corpus graph. Today: `a book in a box`. |
| N08 | A08 `a beautiful book`, engine row. | `'n mooi boek`, `ok`. Holds `afr-gen-8`, `afr-gen-36`, `afr-gen-67`, `afr-gen-124`, `afr-gen-196`. Holds no `afr-gen-9`, `afr-gen-26`, `afr-gen-35`, `afr-gen-42` or `afr-gen-234`. | eng-afr | neutral | pending | afr-gen-8, -36, -67, -124, -196; must not: afr-gen-9, -26, -35, -42, -234 | Line 121. Rule 67 nests `mooi boek` under `'n`. Must-not row for rule 234: no `plc`. Today: `a beautiful book`. |
| N09 | A10 `some days before the summer`, engine row. | `'n paar dae voor die somer`, `ok`. Holds `afr-gen-26`, `afr-gen-35`, `afr-inf-M7`, `afr-inf-M2`. | eng-afr | neutral | pending | afr-gen-26, -35, afr-inf-M7, -M2 | Line 143. **Owned by issue 182** (D1), after issue 199 fixes the graph. N30 runs the corpus graph in 181. Today: `some days before the summer`. |
| N10 | A11 `the beautiful car`, engine row. | `die mooi motor`, `ok`. Holds `afr-gen-8`, `afr-gen-35`, `afr-gen-67`, `afr-gen-196`. Holds no `afr-gen-36`. | eng-afr | neutral | pending | afr-gen-8, -35, -67, -196; must not: afr-gen-36 | Line 209, amended by D3: `102958343` is `motor` by priority (ADR 0023). The analysis graph matches the corpus. Today: `the beautiful car`. |
| N11 | A12 `a very beautiful car`, engine row. | `'n baie mooi motor`, `ok`. Holds `afr-gen-8`, `afr-gen-36`, `afr-gen-42`, `afr-gen-201`. | eng-afr | neutral | pending | afr-gen-8, -36, -42, -201 | Line 210, amended by D3. **Owned by issue 199** (D1): today's graph keeps `very` as a node. N33 and N34 run the corpus graph in 181. Today: `a very beautiful car`. |
| N12 | A13 `John and Mary`, engine row. | `John en Mary`, `ok`. Holds `afr-gen-33` and `afr-gen-229`. Holds no `afr-gen-34`, `afr-gen-58`, `afr-gen-227` or `afr-inf-M3`. | eng-afr | neutral | pending | afr-gen-33, -229; must not: afr-gen-34, -58, -227, afr-inf-M3 | Line 219. Names show as themselves (ADR 0025), closing issue 198's finding F3. `en` is the `e.yaml` line 5354 record. No name and no `en` carries a paradigm, so rule 227 stays silent. Today: `⟦John⟧ and ⟦Mary⟧`, `partial`. |
| N13 | A08 `a beautiful book`, engine row. | The trace holds `afr-dis-5`. | eng-afr | neutral | pending | afr-dis-5 | **Withdrawn by D2.** N58 to N60 prove afr-dis-5; N15 proves it silent on A02, A03 and A07. Not written. |
| N14 | A11 `the beautiful car`, engine row. | The trace holds `afr-dis-5`. | eng-afr | neutral | pending | afr-dis-5 | **Withdrawn by D2**, as N13. Not written. |
| N15 | Three inputs, one test each, engine row: A02 `the book`, A03 `a book`, A07 `a book in a box`. | The trace holds no `afr-dis-5`. | eng-afr | neutral | pending | must not: afr-dis-5 | The issue's must-not rows. A07 holds this whatever issue 199 changes in its graph: no determiner stands before a verb, preposition or adverb. Today: green; it guards the wiring. |
| N16 | A09 `a book about Geneva`, engine row. | `status` `partial`. `text` starts with `'n boek ` and holds `⟦Geneva⟧` exactly once. | eng-afr | neutral | pending | afr-gen-36 | Line 128. ADR 0025: no rule places a literal under `cnt`, so `Geneva` is appended. Issue 24's `'n boek oor ⟦Geneva⟧` is issue 182's. Keeps `A09GenevaIsALiteralAndTheRowKeepsStatusPartial` and R04 green. |
| N17 | `book xyzzy`, engine row. | `boek ⟦xyzzy⟧`, `partial`. | eng-afr | neutral | pending | — | ADR 0025: a source word with no entry is appended. Issue 198's R08 input. Today: `book ⟦xyzzy⟧`. |
| N18 | `book Geneva`, engine row. | `boek ⟦Geneva⟧`, `partial`. | eng-afr | neutral | pending | must not: afr-gen-8, -9 | ADR 0025: `mod(102870092;"Geneva")` reaches no rule, because rules 8 and 9 read `J` or `N` on the dependent. Keeps `SentenceWithAMissingDictionaryWordIsPartialAndMarksThatWord` green. Today: `book ⟦Geneva⟧`. |
| N19 | `the`, engine row. | `text` empty, `ok`. `unl` has no node. | eng-afr | neutral | n/a | — | ADR 0019's consequence: closed-class input gives an empty graph marked `ok`. The generator writes nothing. Today: `the`. |
| N20 | Generator row. Line 1: `[102870092]`, surfaces `[book]`. | `boek`, `ok`. | unl-afr | neutral | pending | afr-gen-227, afr-inf-M3 | Corpus line 1. |
| N21 | Generator row. Line 2: `[102870092.@def]`, surfaces `[book]`. | `die boek`, `ok`. | unl-afr | neutral | pending | afr-gen-35, -195, -231 | Corpus line 2. |
| N22 | Generator row. Line 3: `[102870092.@indef]`, surfaces `[book]`. | `'n boek`, `ok`. | unl-afr | neutral | pending | afr-gen-36 | Corpus line 3. |
| N23 | Generator row. Line 10: `[102870092.@pl]`, surfaces `[books]`. | `boeke`, `ok`. | unl-afr | neutral | pending | afr-gen-56, afr-inf-M3 | Corpus line 10. |
| N24 | Generator row. Line 31: `[102870092.@def.@pl]`, surfaces `[books]`. | `die boeke`, `ok`. | unl-afr | neutral | pending | afr-gen-35, -56, afr-inf-M3 | Corpus line 31. |
| N25 | Generator row. Line 35: `[102870092.@all.@def]`, surfaces `[books]`. | `al die boeke`, `ok`. Holds `afr-gen-37`, `afr-gen-60`, `afr-gen-191`. Holds no `afr-gen-56`. | unl-afr | neutral | pending | afr-gen-35, -37, -60, -191; must not: afr-gen-56 | Corpus line 35. Rule 191 puts `alle` (`DIS=BEF`) before `boek`; rule 195 then puts `die` before both; rule 60 turns `die alle boeke` into `al die boeke`. `[alle]` has no record (ADR 0022). Fire row for rule 60. |
| N26 | Generator row. Line 91: `[102870092.@indef, 102883344.@indef]`, `plc 0→1`, surfaces `[book, box]`. | `'n boek in 'n boks`, `ok`. | unl-afr | neutral | pending | afr-gen-234, -36 | Corpus line 91, amended by D3: `102883344` is `boks` by priority (ADR 0023). |
| N27 | Generator row. As N26. | `text` starts with `'n boek in 'n ` and has five words. Holds `afr-gen-234`, `afr-gen-67`, `afr-gen-129` and `afr-gen-160`. Holds no `afr-gen-18` and no `afr-gen-22`. | unl-afr | neutral | pending | afr-gen-234, -67, -129, -160; must not: afr-gen-18, -22 | Second fire row for rule 234. Under rule 22 alone the text starts `'n in 'n`. |
| N28 | Generator row. Line 121: `[102870092.@indef, 300217728]`, `mod 0→1`, surfaces `[book, beautiful]`. | `'n mooi boek`, `ok`. | unl-afr | neutral | pending | afr-gen-8, -36, -67, -196 | Corpus line 121. |
| N29 | Generator row. Line 143: `[115155220.@paucal, 115237250.@def.@before]`, `tim 0→1`, surfaces `[days, summer]`. | `'n paar dae voor die somer`, `ok`. | unl-afr | neutral | pending | afr-gen-26, -35, -40, afr-inf-M7, -M2 | Corpus line 143. **Owned by issue 182** (D1): rule 40 writes `[enkele]`. |
| N30 | Generator row. As N29. | `text` ends with ` dae voor die somer`. Holds `afr-gen-26`, `afr-gen-40`, `afr-inf-M7`, `afr-inf-M2`. Holds no `afr-gen-30`. | unl-afr | neutral | pending | afr-gen-26, -40, afr-inf-M7, -M2; must not: afr-gen-30 | Fire row for M7 and for M2's `SNG` branch on `somer`. Rule 26 takes `@before` ahead of rule 30, the plain `tim`. Green whatever issue 182 writes in rule 40. |
| N31 | Generator row. Line 209: `[102958343.@def, 300217728]`, `mod 0→1`, surfaces `[car, beautiful]`. | `die mooi motor`, `ok`. | unl-afr | neutral | pending | afr-gen-8, -35, -196 | Corpus line 209, amended by D3. |
| N32 | Generator row. As N31. | `text` starts with `die mooi ` and has three words. | unl-afr | neutral | pending | afr-gen-8, -35, -67, -196 | Word order, independent of the noun. |
| N33 | Generator row. Line 210: `[102958343.@indef, 300217728.@plus]`, `mod 0→1`, surfaces `[car, beautiful]`. | `'n baie mooi motor`, `ok`. | unl-afr | neutral | pending | afr-gen-8, -36, -42, -201 | Corpus line 210, amended by D3. |
| N34 | Generator row. As N33. | `text` starts with `'n baie mooi ` and has four words. Holds `afr-gen-42`, `afr-gen-113` and `afr-gen-201`. | unl-afr | neutral | pending | afr-gen-42, -113, -201 | Fire row for rule 42 and rule 201. Rule 42's `JS` link joins `NA(motor;mooi)`'s scope (ADR 0021, right side 3). |
| N35 | Generator row. `["John", "Mary"]`, `and 1→0`, surfaces `[John, Mary]`. | `John en Mary`, `ok`. | unl-afr | neutral | pending | afr-gen-33, -229 | Corpus line 219 writes `and("John", "Mary")`. This row takes the engine's order, issue 198's decision 3: rule 33 writes `%y` first, so the corpus order would read `Mary en John`. Issue 198's finding F4. |
| N40 | Generator row. `[103925226.@pl]`, surfaces `[photos]`. | `foto's`, `ok`. Holds `afr-inf-M16`. | unl-afr | neutral | pending | afr-gen-56, afr-inf-M16 | The M16 row. Source: the record `foto's`, `f.yaml` line 2810, `BF: foto, NUM: PLR`, and corpus line 248. M16 writes `>"'s"`, an empty left part. |
| N41 | Generator row. `[115155220.@pl]`, surfaces `[days]`. | `dae`, `ok`. Holds `afr-inf-M7`. | unl-afr | neutral | pending | afr-gen-56, afr-inf-M7 | Source: the record `dae`, `d.yaml` line 1210, `BF: dag, NUM: PLR`, and M7's comment. M7 writes `[-1]:"e"`, a replacement of the last letter (`wiki/A-rule.wikitext`, Replacement). Today `inflect` reads it as an append and gives `dage`. |
| N42 | Generator row. `[115237250.@pl]`, surfaces `[summers]`. | `somers`, `ok`. Holds `afr-inf-M2`. | unl-afr | neutral | pending | afr-gen-56, afr-inf-M2 | M2's `PLR` branch. Source: the record `somers`, `s.yaml` line 17706. |
| N43 | `RuleInterpreter(RuleSet::load(eng, afr)).inflect("M7", "PLR", "dag", false, trace)`. | `dae`. Trace `[{M7, fired}]`. | unl-afr | neutral | pending | afr-inf-M7 | `inflect` keeps its bare-id contract (ADR 0024). Isolates the affix fix from the pass. Today: `dage`. |
| N44 | Generator row, as N21. Read `GenerationResult::forest`. | One live node of `forest.list` has the surface `die`. Its features hold `LEMMA: die`, `BF: die`, `LEX: D` and `POS: ART`. | unl-afr | neutral | pending | afr-gen-35 | ADR 0022. `LEMMA` and `BF` come from the record at `d.yaml` line 4114; `POS: ART` comes from the rule. |
| N45 | Generator row, as N22. Read `GenerationResult::forest`. | One live node of `forest.list` has the surface `'n`. Its features hold `LEMMA: 'n`, `LEX: D` and `POS: ART`. | unl-afr | neutral | pending | afr-gen-36 | ADR 0022 and the shard fix: the record sits at `n.yaml` line 2. Today `Dictionary::lookup("'n")` finds nothing. |
| N46 | Generator row, as N26. Read `GenerationResult::forest`. | The node with the surface `in` holds `LEX: P` and `POS: PRE`. It holds no `LEMMA` and no `LEX: A`. | unl-afr | neutral | pending | afr-gen-234 | ADR 0022: `in` has no closed-class record. Its three entries are adverbs with UWs (`i.yaml`), and the node takes none of them. |
| N47 | Hand-built. Generation list: one record, `id: "1"`, lhs `(%x,N,@def)`, rhs `(NS(%x,-@def;%y,[qqq],+LEX=D,+POS=ART),+LEX=N)`. Other lists empty. Real afr dictionary. Graph `[102870092.@def]`. | `GenerationResult::forest` holds one live node with the surface `qqq`. Its features are exactly `LEX: D` and `POS: ART`, in any order. The trace holds `afr-gen-1`. | unl-afr | neutral | n/a | — | Source: original. A literal with no record carries the rule's edits only. `qqq` is in no afr shard. |
| N48 | `Dictionary::load(afr, Lang::afr).lookup_uw("300217728")`. | Six entries, ids `20866`, `24584`, `22017`, `26086`, `23039`, `27524`, in that order. | unl-afr | neutral | n/a | — | Store order: `m.yaml` lines 8642 and 8762, `p.yaml`, `s.yaml`. |
| N49 | `lookup_uw("102958343")`. | Six entries, ids `15462`, `15473`, `15475`, `15464`, `15477`, `15480`, in that order. | unl-afr | neutral | n/a | — | `k.yaml` before `m.yaml`. The inflected `karre` and `motors` are returned too; lexical choice drops them. |
| N50 | `lookup_uw("100135148")`, then `lookup_uw("")`. | Both empty. | unl-afr | neutral | n/a | — | No afr entry holds A07's analysis UW (C1). An empty UW never matches the closed-class records. |
| N51 | Generator row. `[115155220]`, surfaces `[day]`. | `dag`, `ok`. | unl-afr | neutral | pending | afr-inf-M7 | ADR 0023: `dae` stands first in `d.yaml` but its headword is not its `BF`. Source: `BF: dag` on `d.yaml` line 1210. |
| N52 | Generator row. `[300217728]`, surfaces `[beautiful]`. | `mooi`, `ok`. | unl-afr | neutral | pending | — | ADR 0023: `mooi`, `pragtig` and `skoon` tie at priority 0; store order takes `mooi`. Corpus line 121. No paradigm: `M0` is not in `inflection.yaml`. |
| N53 | Generator row. `[100135148.@indef]`, surfaces `[box]`. | `⟦box⟧`, `partial`. | unl-afr | neutral | n/a | — | ADR 0025: a node with no afr entry. It is the root, so it stands in the list, marked, and is not appended a second time. |
| N54 | Generator row. Empty graph, no surfaces. | `text` empty, `ok`. The trace holds no fired `afr-gen-` entry. | unl-afr | neutral | n/a | — | An `unsupported` entry for a rule that does not parse is allowed. |
| N55 | A02 `the book`, engine row. Read the whole trace. | The entries before the first entry whose `rule` starts with `afr-` are, as fired ids, `70 60 72 12 62`. Every entry from there on has a `rule` that starts with `afr-gen-`, `afr-inf-` or `afr-dis-`. | eng-afr | neutral | pending | — | ADR 0024. The analysis part is G03's list, unchanged. |
| N56 | `RuleSet::load(eng, afr)`. | `to_disambiguation()` holds 13 records, ids `1` to `13` in file order, each `kind` `disambiguation`, each `rhs` `0`. Record `5` has lhs `(D,^AFT)(BLK)({V\|P\|AAV})`. `disambiguation()` still holds the five eng records, ids `1` to `5`. | unl-afr | neutral | n/a | afr-dis-1 to afr-dis-13 | ADR 0021. Today: `to_disambiguation()` is empty. |
| N57 | `RuleSet::from_rules` with seven lists, each one record with ids `d`, `a`, `fi`, `s`, `g`, `ti`, `td`. | Each accessor returns its one record: `disambiguation()` `d`, `analysis()` `a`, `from_inflection()` `fi`, `subcategorisation()` `s`, `generation()` `g`, `to_inflection()` `ti`, `to_disambiguation()` `td`. | unl-afr | neutral | n/a | — | Source: original. Today the stub drops `td`. |
| N58 | Hand-built. `to_disambiguation()`: record `5` of `data/languages/afr/grammar/disambiguation.yaml`, verbatim. Other lists empty. `disambiguate_target(positions, Lang::afr, trace)`. Position 0, surface `'n`: `{LEX=D, POS=ART}`. Position 1, surface ` `: `{BLK}`. Position 2, surface `mooi`: `{LEX=A, POS=AAV, SEM=MAN}`, `{LEX=J, POS=ADJ}`. | Position 2 holds the `ADJ` candidate alone. Positions 0 and 1 unchanged. Trace `[{afr-dis-5, fired}]`. | unl-afr | neutral | n/a | afr-dis-5 | Source: original, shaped as a generated list. The fire row for afr-dis-5, the homograph issue 24 names. |
| N59 | Hand-built. As N58, with position 0 surface `die`, `{LEX=D, POS=ART}`, and position 2 surface `boek`: `{LEX=N, POS=NOU}`, `{LEX=N, POS=NOU, NUM=PLR}`. | Every position unchanged. Trace `[]`. | unl-afr | neutral | n/a | must not: afr-dis-5 | Source: original. A noun after a determiner, as on A02. |
| N60 | Hand-built. As N58, with position 0 `{LEX=D, POS=QUA, AFT}`. | Every position unchanged. Trace `[]`. | unl-afr | neutral | n/a | must not: afr-dis-5 | Source: original. `^AFT` exempts a determiner that may stand after (the rule's comment). |
| N61 | Generator row. `[300217728, 102883344]`, `plc 0→1`, surfaces `[beautiful, box]`. | The trace holds `afr-gen-22`. It holds no `afr-gen-234`. | unl-afr | neutral | n/a | afr-gen-22; must not: afr-gen-234 | Source: original. A head that is not a noun falls through to rule 22. `text` is not asserted. |
| N62 | Generator row. `[102870092, 104379243.@on]`, `plc 0→1`, surfaces `[book, table]`. | `boek op tafel`, `ok`. Holds `afr-gen-18`. Holds no `afr-gen-234` and no `afr-gen-22`. | unl-afr | neutral | pending | afr-gen-18; must not: afr-gen-234, -22 | Rule 18's own comment: `plc(book,table.@on) > XA(boek,PC(op,tafel))`. Rule 18 sits before rule 234. |
| N63 | Repository check: `rg -n "issue 25" engine/`. | No line. | — | — | n/a | — | The issue's last done-when. Today: `rule_set.hpp` line 47, `dictionary.hpp` lines 13 and 46. A test-writer may put it in a ctest; a verifier may run it by hand. |
| N64 | `RuleInterpreter(RuleSet::load(eng, afr)).inflect("M5", "PLR", "bestuur", false, trace)`. | `bestuur`, unchanged. The trace is empty. | unl-afr | neutral | n/a | — | Source: checkpoint 4 verifier, 2026-10-28. M5's rhs `PLR:=[-2]:"",0>"e"` is a comma-joined action list the engine does not support. It must never put grammar syntax into a word. |
| N65 | `translate("directions")`, engine row. | `text` holds no `"` character. | eng-afr | neutral | n/a | — | Source: checkpoint 4 verifier, 2026-10-28. Same guard, end to end. |
| N66 | `translate("the book and John")`, engine row. | `die boek en John`, `ok`. | eng-afr | neutral | pending | — | Source: checkpoint 4 verifier, 2026-10-28. Guards against a name treated as a non-root under `and`. |

Row count: 62. Ids N36 to N39 are not used. 55 rows form 181's acceptance set. N06, N07 and N11
are owned by issue 199, N09 and N29 by issue 182, and N13 and N14 are withdrawn. N64 to N66 came
from the checkpoint 4 review (2026-10-28).

Each drafted rule, and each existing rule a row names, has a fire row and a must-not row:

| Rule | Fires | Must not fire |
|---|---|---|
| afr-gen-234 (drafted) | N26, N27 | N08, N61, N62 |
| afr-gen-8 | N08, N28 | N18 |
| afr-gen-18 | N62 | N27 (the plain `plc` takes 234) |
| afr-gen-22 | N61 | N07, N27, N62 |
| afr-gen-26 | N30 | N08 |
| afr-gen-33 | N12, N35 | N02 |
| afr-gen-35 | N02, N21 | N03 |
| afr-gen-36 | N03, N22 | N02 |
| afr-gen-37, afr-gen-60 | N25 | N05 |
| afr-gen-40 | N30 | N04 |
| afr-gen-42 | N34 | N08 |
| afr-gen-56 | N04, N23 | N01, N25 |
| afr-gen-67, afr-gen-196 | N08, N28 | N02 |
| afr-gen-195, afr-gen-231 | N02 | N01, N04 |
| afr-gen-227 | N01, N04 | N12 |
| afr-gen-229 | N12, N35 | N02 |
| afr-inf-M2 | N30, N42 | N04 |
| afr-inf-M3 | N04, N23 | N12 |
| afr-inf-M7 | N30, N41, N43 | N04 |
| afr-inf-M16 | N40 | N04 |
| afr-dis-5 | N58 | N02, N03, N15 (A02, A03, A07), N59, N60 |

`tools/validate`'s coverage check reads `data/languages/<iso3>/tests/`, which holds no file for
either language. Rule 234 adds no store test sentence; issue 198's rules 5 and 182 set the same
precedent.

## Existing tests

| Test | What changes |
|---|---|
| `engine_status.G01_a08_a_beautiful_book_has_the_mod_relation`, `G02_a11_...` (the shared helper at line 181) and `G03_a02_the_book_has_no_relation` | Red: `FiredIds` compares the whole trace, and generation appends `afr-` entries. The test-writer compares the entries before the first `afr-` entry. The analysis trace each asserts stays exact. |
| `engine_status.SentenceWithAMissingDictionaryWordIsPartialAndMarksThatWord`, `A09GenevaIsALiteralAndTheRowKeepsStatusPartial`, `R04_...`, `R08` rows | Stay green under ADR 0025 (N16 to N18). |
| `engine_status.SentenceInitialTheStillResolvesThroughTheDictionary`, `LowerCaseJohnStillResolvesToTheCommonNoun` | Stay green. `john` maps `104446276`, which the afr store holds (`toilet` and others). |
| `engine_status.G08`'s helper `AnyNotFired` | Amended 2026-10-28. It now skips `afr-` entries: generation leaves `unsupported` entries for the rules that do not parse (2, 23, 43 to 49, 61, 150), and G08 asserts on the analysis part only. |
| `engine_status` R02, R03, R05, G05, G07, G08 | Stay green. They count bare ids; generation ids are qualified (ADR 0024). |
| `engine_status.R01_a07_a_book_in_a_box_has_the_plc_relation` | Amended 2026-10-28. Keeps its graph assertions, drops its `status == ok` assertion: A07 is `partial` under ADR 0025 until issue 199 fixes `box`'s UW. The status claim belongs to issue 199's exact match. |
| `engine_status.A13NamesEnterTheGraphAsQuotedLiterals` | Stays green. N12 adds the text. |
| `rule_interpreter.*`, `tree_pass.*`, `read_graph.*` | Unchanged. They build their own interpreter and never call `translate`. |

## For the test-writer

- N01 to N19 and N55 go in `tests/unit/engine_status_test.cpp`. N20 to N54 and N61, N62 go in a new
  `tests/unit/generation_test.cpp`, added to `tests/CMakeLists.txt` with the `fast` label. N56 to
  N60 go in `tests/unit/rule_interpreter_test.cpp`.
- Load the afr `Dictionary` and the `RuleSet` once per file, in a function-local static, as
  `EngToAfrEngine()` does.
- Write the 52 rows of 181's acceptance set. Do not write N06, N07, N09, N11 or N29: issues 199 and
  182 take them into their own test-cases files. Do not write N13 or N14: they are withdrawn.
- On the stubs every row that asserts a text, a trace entry, a feature or a list fails. Four pass
  on the stubs and pin behaviour: N15, N50, N59 and N60. Report any other row that passes at
  once.
- Count by `event == fired`. "Exactly two `afr-gen-36`" counts fired entries whose `rule` is
  `afr-gen-36`.

## For the implementer

The work, in the order the rows exercise it:

- **E1.** `RuleSet::load` reads `to_store_root/grammar/disambiguation.yaml` into
  `to_disambiguation()`. The seven-list `from_rules` keeps the seventh list.
- **E2.** `Dictionary::lookup_uw`: every shard, store order. Build a UW index once per `Dictionary`;
  the afr store is 9.2 MB, and every engine row loads it.
- **E3.** `Dictionary::lookup` keys the shard on the first ASCII letter, as `tools/importer`'s
  `shard_letter` does, so `'n` reaches `n.yaml`.
- **E4.** `parse_affix` and `apply_affix` read `[N]:"y"` as the replacement of character `N`,
  negative from the end (`wiki/A-rule.wikitext`, Replacement). `0>"e"`, `>"'s"` and `"eid">"ede"`
  keep their meaning. M5 and M17's two-action forms are not needed by any row.
- **E5.** `RuleInterpreter::generate`, ADR 0021. It needs `tree_pass.cpp`'s parser and matcher. Move
  them behind an internal header in `engine/src/`, not into the public API. The new right sides are
  ADR 0021's eight items. Parse `?`-prefixed items, `+`-prefixed links and `&` as unsupported, never
  as a crash.
- **E6.** Lexical choice, ADR 0023. Literal nodes, ADR 0022. Fall-through marks, ADR 0025.
- **E7.** `disambiguate_target`: `disambiguate`'s algorithm over `to_disambiguation()`, ids
  qualified. Run it after the loop on one position per list node, sentinels included.
- **E8.** `Engine::translate`: after `read_graph`, collect one source surface per graph node (the
  forest node's `surface`, in `read_graph`'s order), call `generate` with
  `Dictionary::load(rules_.to_store_root(), options.to)`, append the unresolved-token marks, and set
  `text` and `status` by ADR 0025. `unl` and the analysis trace stay as they are. Rewrite the comment
  at `engine.cpp` line 140.
- **E9.** Rewrite the three comments that name issue 25 (N63). `dictionary.hpp` lines 13 and 46:
  `Engine::translate` marks an unresolved word, issues 23 and 181. `rule_set.hpp` line 47: the
  eng-to-afr pipeline issue 183 closes.
- **E10.** The data change is in the tree, uncommitted. It goes in the work commit with the code.
  A full re-import of afr grammar drops rule 234 (ADR 0020).

Two things will look wrong and are not:

- Rule 227 and M3 fire on a singular noun. M3's `SNG` branch is `0>""`.
- Rules that do not parse (2, 23, 43 to 49, 61, 150) leave `unsupported` entries in every trace.
