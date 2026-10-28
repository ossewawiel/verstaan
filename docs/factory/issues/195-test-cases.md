# Issue 195 — English D-rule test cases

**This file is the source of truth for issue 195's tests and rules.** The test-writer turns block D
into GoogleTest cases. The implementer pastes the records under "The rules" into
`data/languages/eng/grammar/disambiguation.yaml`. Where a test, a rule `comment`, the YAML file or
`tests/fixtures/languages/eng/tests/basic.yaml` disagrees with this file, this file wins and the
other is corrected to match.

No `expected` value in this file came from running the engine. Each one is the rule-author's
reading of the English, checked against the dictionary shards the row names. The inputs come from
three places, named on each row: the fixed set in `basic.yaml` (the archive's `ugoa1` corpus), the
archive's `aa1` corpus, and two sentences the owner gave or must give. A Python model of the
matcher in `engine/src/rule_interpreter.cpp` checked that each rule can fire at all. No expected
value was copied from that model.

Every row is `review: pending`. The owner reviews English and has not ticked these rows.

## Blocker: the matcher cannot run rules 1 to 3 as written

Resolved inside this issue: the owner chose on 2026-10-28 to fix the matcher here, and ADR 0018
records both changes. The text below is the finding as the rule-author pass wrote it.

Rules 1, 2 and 3 need two changes to `RuleInterpreter::disambiguate`. Rule 4 needs neither and
fires today. Until the changes land, rows D01, D04, D07, D08 and D12 stay red. The test-writer
writes them red on purpose. D02, D05, D06 and D09 to D11 are red today too: with the empty eng list,
`disambiguate` takes the issue-21 fallback and collapses every multi-reading position. They go green
once the rules land. D02 and D05 also guard change 2: a `#PREFERRED` that matches but still prunes
turns them red.

**B1. One reading is marked for deletion once per matching combination.**
`collect_disambiguation_deletions` walks every combination of readings in the window. Each full
match appends `(position, candidate)` for every position with more than one reading. A second
match with the same target reading appends the same pair again. `apply_disambiguation_rule` sorts
the pairs and erases by index. After the first erase, the duplicate index now points at the next
reading, and the matcher erases that one too. Scene: A07, with the plain rule
`([in],^POS=PRE)(POS=ART)`. `in` has 10 non-preposition readings. `a` has 3 article readings. The
matcher records 30 marks on `in`. The duplicates erase all 13 prepositions. `in` ends with one
reading, the adverb `274318`, and the guard `candidates.size() > 1` keeps it. The rule meant to
remove the adverb leaves only the adverb.

**B2. The context word loses its readings too.** The same loop marks the article's own matching
readings. With B1 fixed, the plain rule strikes all three article readings of `a`. The noun
reading `357442`, the letter "a", moves to the front. The archive names this hazard and its cure.
`data/archive/wiki/D-rule.wikitext` line 154: "In order to prevent the system from replacing the
rightmost nodes, we have to assign #PREFERRED to the nodes to be preserved". Line 155 shows the
form, `(R)(N,#PREFERRED)=0;`. Today the matcher reads `#PREFERRED` as a tag. No reading carries
that tag, so rules 1 to 3 never match. They are inert, not harmful.

**The engine change the rows assume.** Both changes go in `engine/src/rule_interpreter.cpp`. No
public name changes.

1. A reading is deleted once, however many combinations matched it. Deduplicate the pairs before
   the erase.
2. A `#PREFERRED` term always matches. A position whose node carries `#PREFERRED` is never pruned.

Rows D02, D05 and D12 pin change 2. D01, D04, D07, D08 and D12 pin change 1. No `afr` rule carries
`#PREFERRED`, so change 2 leaves `afr` alone. Change 1 changes `afr` only where duplicate marks
over-deleted.

**A way round that is not recommended.** Rules 1 to 3 pass on today's matcher if their second node
reads `(POS=ART,^SEM)`. Only one article reading of `a`, `the` and `an` has no `SEM`: the
`exports/eng/export_cc.php` entries `516052` (`a`), `516101` (`the`) and `516053` (`an`).
One match per window means no duplicates. The rule then deletes that one article reading, which
is last in shard order, so the front reading does not move. The rule works because of a quirk in
the dictionary, not because of the grammar. It breaks when that entry gains a `SEM` value or a
second article entry without one lands. The owner chooses: engine change in this issue, engine
change in a new issue first, or this way round.

## The rules

Paste-ready. The file keeps its licence header. Each record is the seven lines the reader in
`engine/src/rule_interpreter.cpp` expects, in the order `SPEC.md` §3.3 gives. Rule ids follow
issue 24's convention: record `id: "N"` is `eng-dis-N` in a `rule ids` column.

```yaml
# Licence: CC BY-SA 4.0. Source: UNL Archive, see data/archive/manifest.jsonl
# archive: none for eng. Every record below is project-written (issue 195):
# source.archive_path "original" marks it, and source.line names the archive rule it adapts.
- id: "1"
  kind: disambiguation
  lhs: "([in],^POS=PRE)(POS=ART,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of in but the preposition when an article follows, as in A07 a book in a box; the article keeps its readings"
  source: {archive_path: original, line: "issue 195; adapted from exports/ger/49.dgrammar.txt line 14 and wiki/D-rule.wikitext line 155"}
- id: "2"
  kind: disambiguation
  lhs: "([on],^POS=PRE)(POS=ART,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of on but the preposition when an article follows, as in A15 on the table; the article keeps its readings"
  source: {archive_path: original, line: "issue 195; adapted from exports/ger/49.dgrammar.txt line 14 and wiki/D-rule.wikitext line 155"}
- id: "3"
  kind: disambiguation
  lhs: "([about],^POS=PRE)(POS=ART,#PREFERRED)"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of about but the preposition when an article follows, as in A15 about the city; the article keeps its readings"
  source: {archive_path: original, line: "issue 195; adapted from exports/ger/49.dgrammar.txt line 14 and wiki/D-rule.wikitext line 155"}
- id: "4"
  kind: disambiguation
  lhs: "([about],^POS=PRE)(^LEX,^[.],^[,],^[!],^[?],^[;],^[:])"
  rhs: "0"
  conditions: []
  comment: "Strikes every reading of about but the preposition when a word the dictionary does not hold follows, as in A09 about Geneva; a punctuation mark does not count"
  source: {archive_path: original, line: "issue 195; adapted from exports/ger/49.dgrammar.txt line 14 and wiki/English_Disambiguation_Grammar.wikitext line 21"}
```

What each rule reads:

- `[in]`, `[on]`, `[about]`: a literal. It matches the token's surface exactly, case and all.
  Line 14 of `exports/ger/49.dgrammar.txt` opens the same way: `({[vor]|[von]|[nach]},plc)`.
- `^POS=PRE`: the reading is not a preposition. Every adverb, adjective and noun reading matches.
  The rule strikes them. Preposition readings never match, so the rule never strikes one.
- `POS=ART,#PREFERRED`: the next word has an article reading. That word is context only.
- `^LEX`: the next word carries no `LEX` value. Only a token with no dictionary entry has none.
  `build_positions` in `engine/src/engine.cpp` gives such a token one reading with no features.
- `^[.]` to `^[:]`: the six split-punctuation bytes of `engine/src/tokeniser.cpp`. Each is a token
  with no dictionary entry, so `^LEX` alone would match it. Line 21 of
  `wiki/English_Disambiguation_Grammar.wikitext` states the same boundary with `{PUT,^BLK|STAIL}`. No English token carries `PUT`, so the rule names the bytes.
- No `(BLK)` node. The tokeniser emits no blank token, so a `(BLK)` node never matches. The
  archive writes linear rules without it too: `(ART)(VER)=0;` at `D-rule.wikitext` line 23.
- Rule 4 carries no `#PREFERRED`. Its context word has one reading, and the matcher never prunes a
  one-reading position. Adding the mark today would make rule 4 inert, and D03 would go red.

## How to read the rows

A test builds its positions the way `build_positions` in `engine/src/engine.cpp` does. It calls
`tokenise`, then `Dictionary::lookup_tokens` on the real `eng` store. Every entry becomes one
reading, in shard order. A token with no entry becomes one reading with its surface and no
features. The test then calls `RuleInterpreter::disambiguate` with the real `eng` rule set, unless
the row says otherwise. Positions count from 0.

| Notation | Meaning |
|---|---|
| `in@2 → P` | Position 2 holds only readings with `POS=PRE`. Every `POS=PRE` reading the lookup gave is still there, in shard order. |
| `in@1 kept` | Position 1 holds exactly the readings the lookup gave, in shard order. |
| trace `[2, 3]` | `trace.entries` holds these rule ids in this order, every entry `fired`. `[]` means no entry. |

The readings these rows touch, from the shards:

| Word | Shard | Entries | `POS=PRE` entries | First entry |
|---|---|---|---|---|
| `in` | `i.yaml` | 23 | 13 | `274318`, `LEX: A, POS: AAV` |
| `on` | `o.yaml` | 23 | 13 | `270995`, `LEX: A, POS: AAV` |
| `about` | `a.yaml` | 21 | 5 | `272937`, `LEX: A, POS: AAV` |
| `a` | `a.yaml` | 4 | 0 | `275311`, `LEX: D, POS: ART, att: "@indef"`; `357442` is `LEX: N` |
| `the` | `t.yaml` | 3 | 0 | `275357`, `LEX: D, POS: ART, att: "@def"` |
| `Geneva` | `g.yaml` | 0 | — | no entry |

A test reads the counts from its own lookup, not from this table. The table shows why each row
holds.

## Block D

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| D01 | A07 `a book in a box` | `in@2 → P`. Trace `[1]`. | eng-afr | neutral | pending | eng-dis-1 | Firing row for rule 1. `ugoa1` line 91, corpus Afrikaans `'n boek in 'n doos`. Red until B1 and B2 are fixed. |
| D02 | A07 `a book in a box` | `a@3 kept`, front `275311`. `box@4 kept`. `a@0 kept`, `book@1 kept`. | eng-afr | neutral | pending | eng-dis-1 | The context row. The article after `in` keeps all four readings. Pins `#PREFERRED`. Passes today only because rule 1 is inert; it must still pass once D01 is green. |
| D03 | A09 `a book about Geneva` | `about@2 → P`. `Geneva@3 kept`: one reading, surface only. Trace `[4]`. | eng-afr | neutral | pending | eng-dis-4; must not fire: eng-dis-3 | Firing row for rule 4. Must-not-fire row for rule 3: `Geneva` has no article reading. `ugoa1` line 128, corpus Afrikaans `'n boek oor Genève`. Green once rule 4 is in the store. |
| D04 | A15 `the beautiful book about the city of Paris without pictures and photos on the table` | `about@3 → P`. `on@12 → P`. Trace `[2, 3]`: rules run in file order. | eng-afr | neutral | pending | eng-dis-2, eng-dis-3; must not fire: eng-dis-1, eng-dis-4 | Firing row for rules 2 and 3. Must-not-fire row for rule 4: `the` has dictionary entries. Rule 1's literal `[in]` must not match `without`. `ugoa1` line 248. Red until B1 and B2 are fixed. |
| D05 | A15, as D04 | `the@4 kept`, `the@13 kept`: three readings each. `city@5 kept`. `table@14 kept`. | eng-afr | neutral | pending | eng-dis-2, eng-dis-3 | The context row for A15. Passes today only because rules 2 and 3 are inert; it must still pass once D04 is green. |
| D06 | Each of the twelve `basic.yaml` rows A01 to A06, A08, A10 to A14 | Every position kept. Trace `[]`. | eng-afr | neutral | pending | must not fire: eng-dis-1, eng-dis-2, eng-dis-3, eng-dis-4 | The `basic.yaml` must-not-fire row for all four rules. None of these rows holds `in`, `on` or `about`. A13 `John and Mary`: `Mary` has no entry, but no `about` comes before it. One test case per row. |
| D07 | `a book on a box` | `on@2 → P`. `a@3 kept`. Trace `[2]`. | eng-afr | neutral | pending | eng-dis-2 | Second firing row for rule 2, with an indefinite article. `ugoa1` line 105, `data/languages/eng/corpus/ugoa1.yaml`. Corpus Afrikaans `'n boek bo op 'n doos`. Red until B1 and B2 are fixed. |
| D08 | `some days in the summer` | `in@2 → P`. `the@3 kept`. Trace `[1]`. | eng-afr | neutral | pending | eng-dis-1 | Second firing row for rule 1, with a definite article. `ugoa1` line 141. Red until B1 and B2 are fixed. |
| D09 | `come in` | `in@1 kept`, front `274318`, the adverb. Trace `[]`. | eng-afr | neutral | pending | must not fire: eng-dis-1 | The adverbial `in` the issue names. No word follows `in`, so no two-node window starts there. Owner-supplied: no archive corpus holds an adverbial `in`. |
| D10 | `The Tortoise went on with a slow but steady pace straight to the end of the course.` | `on@3 kept`, front `270995`, the adverb. Trace `[]`. | eng-afr | neutral | pending | must not fire: eng-dis-2 | Adverbial `on`: "went on" means "carried on". `with` follows, and `with` has no article reading. `data/archive/exports/corpus/aa1/export_corpus.php__project_aa1_lang_en_unl_0`, line 14, the ninth `<br />` segment. |
| D11 | `he walked about.` | `about@2 kept`, front `272937`, the adverb. Trace `[]`. | eng-afr | neutral | pending | must not fire: eng-dis-3, eng-dis-4 | Adverbial `about`: "walked around". The full stop follows. It has no entry, but rule 4 excludes it by name. Owner-supplied. |
| D12 | Hand-built, no I/O. Rule 1 alone in `RuleSet::from_rules`. Position 0, surface `in`: `{LEX=A, POS=AAV}`, `{LEX=J, POS=ADJ}`, `{LEX=P, POS=PRE, rel=plc}`, `{LEX=P, POS=PRE, rel=tim}`. Position 1, surface `a`: `{LEX=D, POS=ART}`, `{LEX=D, POS=ART}`, `{LEX=N, POS=NOU}`. | Position 0 holds the `plc` and `tim` readings, in that order. Position 1 holds all three readings, in order. Trace `[1]`. | eng-afr | neutral | pending | eng-dis-1 | B1 and B2 at the smallest size. Two article readings give two matches per target reading. Today's matcher, with the plain rule, leaves position 0 with only `tim`: the duplicate mark erases `plc`. |
| D13 | Hand-built, no I/O. `RuleSet::from_rules` with an empty disambiguation list. One position, surface `bank`, readings `{sense=financial}`, `{sense=river}`. | One reading, `sense=financial`. Trace `[]`. | eng-afr | neutral | pending | — | Issue 21's empty-list fallback, unchanged. It replaces `EngEmptyDisambiguationFallsBackToFirstCandidate`, which reads the real `eng` store and asserts the list is empty. That test goes red when the rules land. |
| D14 | `RuleSet::load` on the real stores, eng to afr | `disambiguation()` holds four records, ids `1`, `2`, `3`, `4`, in file order, each `kind` `disambiguation`, each `rhs` `0`. | eng-afr | neutral | pending | eng-dis-1 to eng-dis-4 | Replaces the `EXPECT_TRUE(rules.disambiguation().empty())` line in `RuleSetLoadsAllFiveGrammarKindsFromTheRealStores`. |

Fourteen rows. Each rule has a firing row and a must-not-fire row:

Issue 198 adds rule 5 and replaces two rows. D01 is now `198-test-cases.md` R10, and D14 is R17.
Where this file and that one disagree on those two rows, that one wins.

| Rule | Fires | Must not fire |
|---|---|---|
| eng-dis-1 | D01, D08, D12 | D04 (`without`), D06, D09 |
| eng-dis-2 | D04, D07 | D06, D10 |
| eng-dis-3 | D04 | D03, D06, D11 |
| eng-dis-4 | D03 | D04, D06, D11 |

## Where the rules stop

These sentences are recorded, not tested. Each one shows where the four rules stop. None is a row
in block D.

- **A noun phrase with no article.** `a book in English` (`ugoa1` line 126), `a train in Paris`
  (111), `chair in office` (175), `some minutes on Monday` (149), `a book about love` (129),
  `a book about me` (71). The next word has dictionary entries and no article reading. No rule
  reaches the preposition, so it stays an adverb.
- **A number after `in`.** `He was born in 1959 in Sapporo, Japan`, `eolss` segment 18. `1959` has
  no entry. Rule 4 covers `about` only, so `in` stays an adverb.
- **A number after `about`.** `The average is about 250 mm, but averages are highly misleading.`,
  `eolss` segment 1348. Rule 4 fires on `250` and strikes the degree adverb the sentence needs.
  The matcher has no test for a digit. A misfire of rule 4.
- **A particle before an article.** `turn on the light`, `about a dozen`. Rules 2 and 3 strike the
  adverb reading the phrase needs. A misfire of rules 2 and 3. Phrasal verbs are not in scope.
- **The preposition's sense.** The rules choose the part of speech, not the relation. In D01 the
  front reading of `in` is `432553`, `rel: tim`. A07 needs `plc`. Issue 198 chooses among the
  preposition readings.

## Stubs

None. The tests call names that exist: `tokenise`, `Dictionary::load`,
`Dictionary::lookup_tokens`, `RuleSet::load`, `RuleSet::from_rules`,
`RuleInterpreter::disambiguate`. `build_positions` is file-local in `engine/src/engine.cpp`, so a
test builds its positions itself, as "How to read the rows" says. The engine change for B1 and B2
touches no public name.
