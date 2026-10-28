# Issue 180 — mod relation test cases

**This file is the source of truth for issue 180's tests.** The test-writer turns block G into
GoogleTest cases. Where a test, a header comment or a fixture disagrees with this file, this file
wins and the other is corrected to match. ADR 0017 is the design under the tree pass; where this
file and the ADR disagree, the disagreement is a finding for the owner, not a silent fix.

No expected value in this file came from running the engine. Two kinds of `expected` appear:

- Every UNL graph is transcribed from `data/languages/eng/corpus/ugoa1.yaml`, from the `source.line`
  the row names. The archive corpus is the authority on the graph.
- Every trace and every hand-built forest is the rule-author's reading of the rule text under ADR
  0017. The A08 and A11 traces are row T01 and T03 of `194-test-cases.md`, which the owner amended
  on 2026-10-27. A real trace that disagrees with a reading is a finding for the implementer.

The rule-author compiled a scratch probe of `make_forest` and `analyse_tree` outside the repo to
check that the design is buildable. It set no value in this table.

The owner reviewed the table on 2026-10-28, after PR #312 merged. The thirteen rows that make a
claim about English, G01 to G09 and G11 to G14, are `review: confirmed`. The fifteen rows G20 to
G30 and G40 to G43 are `review: n/a`: they test hand-built forests and the CLI trace line and make
no language claim. The traces stay the rule-author's reading, held by the passing tests.

## The design these rows test

### Engine::translate

1. Tokenise, look up, apply name literals, build positions and disambiguate, as today.
2. Take each position's first candidate, as today. Call `make_forest` on that list.
3. Call `RuleInterpreter::analyse_tree` on the forest, with `result.trace`. Do not call
   `RuleInterpreter::analyse`. The flat pass stays for its own tests only (ADR 0017, Hand-over).
4. Call `read_graph(tree.forest, result.unl)`.
5. `result.status` is `no_parse` when `analyse_tree` or `read_graph` returns `no_parse`. Else it is
   `partial` or `ok` by the rule that holds today. `result.text` keeps today's echo; issue 181 owns
   generation.

### read_graph (stub in `engine/include/verstaan/rule_interpreter.hpp`)

`[[nodiscard]] Status read_graph(const Forest& forest, Graph& graph);`

- It clears `graph` first.
- A **graph node** is a live forest node whose `$uw` feature (`kUwFeatureKey`) is present and not
  empty. `graph.nodes` holds one `Node` per graph node, in arena order: its UW, and the forest
  node's `attributes` in order.
- Not graph nodes: a deleted node, a sentinel, a hyper-node (no `$uw`), a closed-class word
  (`$uw` present and empty, SPEC.md §3.2), a word with no dictionary entry and no name literal
  (no `$uw`).
- A **UNL link** is a link whose label starts with a lower-case letter `a` to `z`, and whose `from`
  and `to` both name graph nodes. `graph.relations` holds one `Relation` per UNL link, in graph
  order. `Relation::from` is the link's head and `Relation::to` its dependent, as indices into
  `graph.nodes`. `mod(n3;n2)` with `n3` = `book` is `mod(book;beautiful)`.
- Any other link is not copied: a syntactic label (`NB`, `XB`, `NA`), or an end that is not a
  graph node.
- It returns `Status::ok`. On a forest that fails ADR 0017's readability check it returns
  `Status::no_parse` and leaves `graph` empty.

### The CLI trace line (stub in `apps/cli/src/trace_line.hpp`)

`[[nodiscard]] std::string verstaan::cli::trace_line(const TraceEntry& entry);`

- A `fired` entry prints the rule id alone, as today: `172`.
- Any other entry prints the rule id, one space, and the event name: `1 capped`,
  `26 unsupported`.
- `apps/cli/src/main.cpp` prints `trace_line(entry)` for each entry, in place of `entry.rule`.

### The data change

`data/languages/eng/grammar/analysis.yaml`, record `id: "1"`. Applied by the rule-author.

| Field | Before | After |
|---|---|---|
| `lhs` | `(N,PLR,^@pl,^@multal,^@paucal,^@all)` | `(N,PLR,^@pl,^@multal,^@paucal,^@all,^@both)` |
| `comment` | `books > book.@pl` | `books > book.@pl; a plural that already carries @both keeps @both alone` |
| `source` | `{archive_path: grammars/eng_unl_tgrammar.txt, line: 17}` | `{archive_path: original, line: "issue 180; adapted from grammars/eng_unl_tgrammar.txt line 17, adds ^@both to match rule 177's set"}` |

`source` follows issue 195's mark for a project-written record. Rule 177,
`(@pl,{@multal|@paucal|@all|@both})`, removes `@pl` beside four attributes. Rule 1 guarded only
three of them. On `both books`, rule 1 adds `@pl`, rule 12 moves `@both` onto `books`, rule 177
removes `@pl`, and rule 1 adds it again. The two rules alternate until both reach
`kTreePassRuleCap`. The guard makes rule 1's set equal rule 177's set, so the pair stops after one
firing each.

## How to read the rows

Rule ids follow `24-test-cases.md`: `eng-ana-NN` is record `id: "NN"` of
`data/languages/eng/grammar/analysis.yaml`. In a trace, a bare number is an `eng-ana` id and every
entry is `fired` unless the row says otherwise. `direction` is `eng-unl`: these rows stop at the
UNL graph.

A graph is written as its node list, then its relation list. `[300217728, 102870092.@indef]` is
two nodes in that order, the second with the one attribute `@indef`. `mod 1→0` is
`Relation{label "mod", from 1, to 0}`. A row that names a graph asserts every node, every
attribute in order, and every relation: equality, not containment.

Engine rows call `Engine::load(RuleSet::load(eng, afr))` on the real stores and
`translate(text, Options{.from = Lang::eng, .to = Lang::afr})`.

Words, by eng dictionary `id`. Each is the first entry in shard order with that headword, which is
what `Engine::translate` picks after disambiguation (D06 rows of `rule_interpreter_test.cpp`: no
English D-rule fires on these rows).

| Word | id | uw | Features a rule in these rows reads |
|---|---|---|---|
| `a` | 275311 | `""` | `LEX: D`, `att: "@indef"` |
| `the` | 275357 | `""` | `LEX: D`, `att: "@def"` |
| `both` | 275330 | `""` | `LEX: D`, `att: "@both"` |
| `beautiful` | 286581 | `300217728` | `LEX: J` |
| `book` | 408062 | `102870092` | `LEX: N`, `NUM: SNG` |
| `books` | 489278 | `102870092` | `LEX: N`, `NUM: PLR` |
| `car` | 328185 | `102958343` | `LEX: N`, `NUM: SNG` |

Hand-built forests for rows G20 to G30, in `194-test-cases.md`'s notation. `{$uw: 300217728}` is the
feature `{"$uw", "300217728"}`. `.@indef` is an attribute. A hyper-node has an empty surface and no
feature. `[50/172]` is `built_by`/`labelled_by`; `read_graph` reads neither.

| Forest | `nodes` | `links`, in graph order | `list` |
|---|---|---|---|
| H1 | `n0 {SHEAD}`, `n1` beautiful `{$uw: 300217728}`, `n2` book `{$uw: 102870092}`.@indef, `n3 {STAIL}`, `n4` hyper-node | `mod(n2;n1)@n4 [50/172]` | `[n0, n4, n3]` |
| H2 | `n0 {SHEAD}`, `n1` a `{$uw: ""}`.@indef, `n2` beautiful `{$uw: 300217728}`, `n3` book `{$uw: 102870092}`.@indef, `n4 {STAIL}`, `n5` hyper-node | `mod(n3;n2)@n5 [50/172]` | `[n0, n1, n5, n4]` |

## Block G

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| G01 | A08 `a beautiful book`, `Engine::translate`. | Graph `[300217728, 102870092.@indef]`, relations `[mod 1→0]`. Trace, all `fired`: 70 60 71 61 72 50 12 62 80 82 100 172. `status` ok. | eng-unl | neutral | confirmed | eng-ana-70, eng-ana-60, eng-ana-71, eng-ana-61, eng-ana-72, eng-ana-50, eng-ana-12, eng-ana-62, eng-ana-80, eng-ana-82, eng-ana-100, eng-ana-172 | Corpus line 121, `mod(102870092.@indef, 300217728)`. Trace is 194 T01. The trace's one `172` names the rule that wrote the edge's label; rule 50 built the link. Fails today: the flat pass writes no relation. |
| G02 | A11 `the beautiful car`, `Engine::translate`. | Graph `[300217728, 102958343.@def]`, relations `[mod 1→0]`. Trace: 70 60 71 61 72 50 12 62 80 82 100 172. `status` ok. | eng-unl | neutral | confirmed | as G01 | Corpus line 209, `mod(102958343.@def, 300217728)`. Trace is 194 T03. |
| G03 | A02 `the book`, `Engine::translate`. | Graph `[102870092.@def]`, relations `[]`. Trace: 70 60 72 12 62. `status` ok. | eng-unl | neutral | confirmed | eng-ana-70, eng-ana-60, eng-ana-72, eng-ana-12, eng-ana-62 | Corpus line 2, `102870092.@def`. Must-not row for eng-ana-172 and every relation. Trace is 194 T08. |
| G04 | A02, A08 and A11, `Engine::translate`, one test over the three rows. | For each row: no `Node` has an empty `uw`, and the node count is 1, 2 and 2. | eng-unl | neutral | confirmed | eng-ana-12 | The issue's closed-class negative test. `Node` has no surface, so a node for `the`, `a` or `of` is a node with the empty UW those entries carry. None of the three rows holds `of`; G22 and G26 test a closed-class word that no rule folds. |
| G05 | A08 and A11, `Engine::translate`. | Each trace holds exactly one entry with rule `172`, and no entry with rule `176`. | eng-unl | neutral | confirmed | eng-ana-172 | Must-not row for eng-ana-176 and for the flat pass. The flat pass appends `172` three times and `176` three times on A08 (ADR 0017, Context). G01 implies this row; it names the failure on its own. |
| G06 | A01 `book`, `Engine::translate`. | Graph `[102870092]`, relations `[]`. `status` ok. | eng-unl | neutral | confirmed | — | Corpus line 1. Must-not row for a relation on a bare noun. May pass before the change; it guards the new path. |
| G07 | A04 `books`, `Engine::translate`. | Graph `[102870092.@pl]`, relations `[]`. Trace holds exactly one `1`. `status` ok. | eng-unl | neutral | confirmed | eng-ana-1 | Corpus line 10, `102870092.@pl`. Fire row for the edited rule 1 through the engine. |
| G08 | `both books`, `Engine::translate`. | Graph `[102870092.@both]`, relations `[]`. No trace entry is `capped` or `unsupported`. Trace holds exactly one `1` and exactly one `177`. `status` ok. | eng-unl | neutral | confirmed | eng-ana-1, eng-ana-12, eng-ana-177 | Corpus line 20, `102870092.@both`. The note's row. Reading: rule 1 fires at step one, before rule 12 moves `@both` onto `books`; rule 177 removes `@pl` once; the guard stops rule 1. Without the data change this row ends in `1 capped`, `177 capped`. |
| G09 | A06 `all the books`, `Engine::translate`. | Relations `[]`. No `Node` has an empty `uw`. | eng-unl | neutral | confirmed | — | Corpus line 35, `102870092.@all.@def`, holds no relation. Must-not row for copying a link with a closed-class end on real data: the tree pass may leave a link that names `the`. The row asserts no node list, because `all` resolves to an adverb today and the node list is not this issue's. |
| G11 | Record `1` of the real `analysis.yaml`, alone in a `RuleSet`. `make_forest` on one word `{surface: "books", features: {LEX: N, NUM: PLR}}`. `analyse_tree`. | Trace `[{1, fired}]`. `n1` attributes `[@pl]`. `status` ok. | eng-unl | neutral | confirmed | eng-ana-1 | Fire row for the edited rule 1. Source: the archive comment, `books > book.@pl`. |
| G12 | Record `1` alone, as G11. One word `{surface: "books", features: {LEX: N, NUM: PLR, att: "@both"}}`. | Trace empty. `n1` attributes `[@both]`. `status` ok. | eng-unl | neutral | confirmed | — | Must-not row for the new `^@both`. `make_forest` moves `att` into `attributes` (ADR 0017). Red on main's rule text: rule 1 fires once and `n1` holds `[@both, @pl]`. |
| G13 | Records `1` then `177` of the real `analysis.yaml`, in that order. Word as G12. | Trace empty. No `capped` entry. `n1` attributes `[@both]`. `status` ok. | eng-unl | neutral | confirmed | — | Must-not row for the loop, at its smallest. Red on main's rule text: the trace holds a `capped` entry for rule `1` and one for rule `177`. |
| G14 | Control: in-memory rule `{id: "1", lhs: "(N,PLR,^@pl,^@multal,^@paucal,^@all)", rhs: "(+att=@pl)"}`, then record `177` of the real `analysis.yaml`. Word as G12. | Trace holds exactly `kTreePassRuleCap` `fired` entries for `1`, exactly `kTreePassRuleCap` for `177`, one `{1, capped}` and one `{177, capped}`, and nothing else. The last entry is `{177, capped}`. `status` ok. | eng-unl | neutral | confirmed | eng-ana-177 | Source: `grammars/eng_unl_tgrammar.txt` line 17, the archive text. Shows why the data change exists, and stays green on any later data. Reading: rule 1 fires first, and the two then alternate. Rule 1 reaches the cap first and retires; rule 177 then makes its last firing and retires. |
| G20 | `read_graph(H1, g)`, `g` empty. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[mod 1→0]`. | eng-unl | neutral | n/a | — | Source: original. The A08 graph, from a hand-built forest. Fails on the stub: it returns `not_implemented`. |
| G21 | H1 with its link relabelled `NA`. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[]`. | eng-unl | neutral | n/a | — | Must-not row for G20: a syntactic link, upper-case label, is not a relation. 194 T02's forest. |
| G22 | `read_graph(H2, g)`. `n1` `a` is live. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[mod 1→0]`. | eng-unl | neutral | n/a | — | A closed-class word no rule folds is not a graph node. The relation indices skip it: `n3` is graph node 1. |
| G23 | H2 with `n1` deleted and `n1`'s `$uw` set to `102870092`. `list [n0, n5, n4]`. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[mod 1→0]`. | eng-unl | neutral | n/a | — | A deleted word is not a graph node, whatever its UW. |
| G24 | H1 plus `n5` `{surface: "xyzzy"}`, no feature, live. `list [n0, n4, n5, n3]`. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[mod 1→0]`. | eng-unl | neutral | n/a | — | A word with no dictionary entry and no name literal carries no `$uw` and is not a graph node. `Status::partial` and the `⟦word⟧` mark still report it, from the lookup. |
| G25 | H1 with its link changed to `mod(n4;n1)@n4`. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[]`. | eng-unl | neutral | n/a | — | A link whose end is a hyper-node is not copied. Scopes are issue 197's. |
| G26 | H2 with its link changed to `mod(n3;n1)@n5`. | Returns ok. Graph `[300217728, 102870092.@indef]`, relations `[]`. | eng-unl | neutral | n/a | — | A link whose end is a closed-class word is not copied. G09's shape, by hand. |
| G27 | H1 with three links, in graph order: `to(n2;n1)@n4`, `XB(n2;n1)@n4`, `or(n1;n2)@n4`. | Returns ok. Relations `[to 1→0, or 0→1]`, in that order. | eng-unl | neutral | n/a | — | Source: original. Two-letter UNL labels count; `to` is on the right side of record 169 of eng `analysis.yaml`. Graph order is kept; the upper-case label is skipped. |
| G28 | H1 with its link's `to` set to `100000`. `g` holds one node `{uw: "stale"}` and one relation on entry. | Returns `no_parse`. `g.nodes` and `g.relations` are empty. | eng-unl | neutral | n/a | — | Source: original, ADR 0017, A forest the pass can read. No exception and no read out of range. |
| G29 | `read_graph(H1, g)`, `g` holding one node `{uw: "stale"}` and one relation on entry. | Returns ok. `g` equals G20's graph. | eng-unl | neutral | n/a | — | `read_graph` replaces the graph; it never appends. |
| G30 | H1 with `n1` replaced by `{surface: "John", features: {$uw: "\"John\""}}`. | Returns ok. Two nodes: the first with `uw` the six bytes `"John"`, quotes included, and no attribute; the second `102870092.@indef`. Relations `[mod 1→0]`. | eng-unl | neutral | n/a | — | A name literal (issue 196) is a graph node. The engine-level guard is the existing `A13NamesEnterTheGraphAsQuotedLiterals`. |
| G40 | `trace_line(TraceEntry{"172", TraceEvent::fired})`. | `"172"` | — | — | n/a | — | A firing prints as the CLI prints it today. Fails on the stub: it returns `""`. |
| G41 | `trace_line(TraceEntry{"1", TraceEvent::capped})`. | `"1 capped"` | — | — | n/a | — | The note's case: a `capped` entry must not read as one more firing. |
| G42 | `trace_line(TraceEntry{"26", TraceEvent::unsupported})`. | `"26 unsupported"` | — | — | n/a | — | Rule 26 is ADR 0017's own `unsupported` example. |
| G43 | `trace_line(TraceEntry{"loop"})`. | `"loop"` | — | — | n/a | — | `event` defaults to `fired` (engine.hpp). |

Row count: 28. Ids G10, G15 to G19 and G31 to G39 are not used.

## Existing tests

Every existing `fast` test stays green. These read `Engine::translate` and now run through the tree
pass:

| Test | Why it stays green |
|---|---|
| `engine_status.A04PluralWordFiresRuleOneAndIsOk` | Rule 1 still fires on `books` (G07). |
| `engine_status.A13NamesEnterTheGraphAsQuotedLiterals` | `"John"` and `"Mary"` carry a `$uw`; `and` is closed-class and drops out. |
| `engine_status.A09GenevaIsALiteralAndTheRowKeepsStatusPartial` | `"Geneva"` carries a `$uw`; `about` is closed-class and drops out. |
| `engine_status.SentenceInitialTheStillResolvesThroughTheDictionary` | `The` resolves to `the`, which rule 12 folds. |
| `engine_status.EmptyInputCannotBeSegmentedAndIsNoParse` | No token, so no forest: the early return stays before `make_forest`. |
| `EngineTest.GeneratedReturnsNotImplemented` | `Engine::generated` never reaches the tree pass. |

`rule_interpreter.WorkedRuleOneMarksPluralNoun` runs record `1` through the flat pass on a word
without `@both`. It stays green on the new text. Its comment quotes the archive text, which is
still the archive's.

## For the test-writer

- Engine rows G01 to G09 go in `tests/unit/engine_status_test.cpp`. Rows G11 to G14 go in
  `tests/unit/tree_pass_test.cpp`. Rows G20 to G30 go in `tree_pass_test.cpp` or a new
  `tests/unit/read_graph_test.cpp`. Rows G40 to G43 go in a new
  `tests/unit/cli_trace_line_test.cpp`, `#include "trace_line.hpp"`. Add new files to
  `verstaan_tests` in `tests/CMakeLists.txt`; it already links `verstaan_cli_trace`.
- The data change is already in the tree, so G12 and G13 pass at once. Prove each red before the
  `test(#180)` commit: put main's record `1` back
  (`git show main:data/languages/eng/grammar/analysis.yaml`), run the two rows, see them fail as
  their notes say, restore the new text. G14 is the control and is green on both texts.
- G07 and G08 compare `attributes` by equality, in order. Only one attribute is expected on each.

## For the implementer

- `engine/src/engine.cpp`: the five steps above. Remove the `interpreter.analyse` call.
- `engine/src/tree_pass.cpp`: `read_graph`. Reuse the file's own readability check.
- `apps/cli/src/trace_line.cpp`, and `main.cpp` prints `trace_line(entry)`. No test drives
  `main.cpp`; the verifier reads it.
- Expect new relations on rows out of scope, copied as the grammar builds them. On the fixed set,
  the scratch probe showed these links. They are a heads-up, not expected values: A07 gets a `tim` link from rule 166, not the
  corpus `plc` (issue 198). A12 gets `mod(beautiful;very)` from rule 176, and its
  `mod(car;…)` edge ends on a hyper-node and is not copied (issues 181 and 197). A14 and A15 get
  links with hyper-node ends or wrong labels (issues 197 and 198). No test asserts these.
- A full re-import of eng grammar writes record `1` back to the archive text. The owner-run import
  diff (SPEC.md §3.2) will show this one record. Keep the store's text.
