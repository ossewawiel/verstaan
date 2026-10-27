# Issue 194 — tree pass test cases

**This file is the source of truth for issue 194's tests.** The test-writer turns block T into
GoogleTest cases. Where a test, a fixture or a header comment disagrees with this file, this
file wins and the other is corrected to match. ADR 0017 is the design these rows test; where this
file and the ADR disagree, the disagreement is a finding for the owner, not a silent fix.

No value in this file came from running the engine. Rows T01 to T19 were written against the
stub, which returns `Status::not_implemented`. Rows T20 to T47 were written after
`engine/src/tree_pass.cpp` existed, from the rule text, the wiki and ADR 0017, without running it.
Two kinds of `expected` appear:

- The UNL graph on rows T01 to T10 is transcribed from `data/languages/eng/corpus/ugoa1.yaml`,
  from the line the row names. The archive corpus is the authority on the graph.
- The traces, the forests and every row from T11 on are the rule-author's reading of the rule
  text under ADR 0017's run order, with the archive passage each one rests on. They are a reading,
  not a recording. A disagreement between a real trace and this table is a finding for the
  implementer.

Every row is `review: pending`. The owner reviews English and has not ticked these rows.

## Rule 172 writes the `mod` edge, not rule 176

The owner amended issue 194 on 2026-10-27: rule 172 writes A08's `mod` edge, and the first-match
order stands (ADR 0017, `Status: Accepted`).

- In the first-match order, A08 reaches the corpus graph `mod(102870092.@indef, 300217728)`. Rule
  172, `NA(%x;%y):=mod(%x;%y)`, writes the edge. `beautiful` is an adjunct, and the archive labels
  a noun's adjunct `NA` ("adjunct to the head of a nominal phrase (NA): [beautiful] table",
  `data/archive/wiki/Syntactic_relations.wikitext`). Rule 176, `/[ACDIJNP]S/(%x;%y):=mod(%x;%y)`,
  needs a specifier link, `NS`, and none forms.
- Rule 176 writes the corpus edge only if rule 62's `+XP=NP` also renames the `NB` link inside the
  hyper-node. T-rule CONSERVATION rules that out: "Rules affect only the information clearly
  specified."

This table expects rule 172 (T01, T03) and forbids rule 176 (T06). Issue 180's "`Result::trace`
names the rule that built each `mod` edge" means rule 172 for the same reason.

## A trace id alone proves nothing

The flat pass already appends `172` three times and `176` three times on `a beautiful book`, and
builds no relation. It reads `NA(%x;%y)` as a one-node pattern whose capture, `x;%y`, matches every
word. A test that only checks the trace for a rule id passes on today's code. Every row that names
a link asserts the link itself: its label, its two ends, its scope, `built_by` and `labelled_by`.
Every row also asserts a status: `Status::no_parse` on T34 to T36, `Status::ok` on every other
row. The stub returns its input unchanged with `Status::not_implemented`, so it fails every row.

## How to read the rows

Rule ids follow `24-test-cases.md`: `eng-ana-NN` is `data/languages/eng/grammar/analysis.yaml`,
record `id: "NN"`. In the trace tables a bare number is an `eng-ana` id. `direction` is
`eng-unl`: these rows stop at the UNL graph and go no further.

Input words are eng dictionary entries, by `id`. Unless a row names another id, the entry is the
first one in shard order with that headword, which is also what the empty eng disambiguation
grammar's first-candidate fallback picks. A test may build each `Candidate` from the store or by
hand; either way its `features` are exactly the entry's, and a test may add `$uw` as
`Engine::translate` does. No rule reads `$uw`.

| Word | id | uw | Features a rule in these rows reads |
|---|---|---|---|
| `a` | 275311 | `""` | `LEX: D`, `att: "@indef"` |
| `the` | 275357 | `""` | `LEX: D`, `att: "@def"` |
| `beautiful` | 286581 | `300217728` | `LEX: J` |
| `book` | 408062 | `102870092` | `LEX: N`, `NUM: SNG` |
| `car` | 328185 | `102958343` | `LEX: N`, `NUM: SNG` |
| `possible` | 287192 (second in shard order) | `301821266` | `LEX: J` |
| `changes` | 503595 | `100191142` | `LEX: N`, `NUM: PLR` |

Forest notation, ADR 0017's node shape:

- `n0`, `n1`, ... are indices into `Forest::nodes`. `make_forest` puts `SHEAD` at `n0`, word `i` at
  `n(i+1)` and `STAIL` after the last word. Rule-made nodes follow.
- `{XB=DB, proj}` lists a node's grammar features. Dictionary features are left out; no rule in
  these rows removes one. `+{...}` adds, `−{...}` removes. `.@indef` is an attribute.
- `NB(n3;n2)@n5 [50/80]` is a link: label, head, dependent, scope, `built_by`/`labelled_by`.
- `list [n0, n5, n4]` is `Forest::list`.

Hand-built forests for rows T29 to T46. A hyper-node has an empty surface and no feature. Each
word has the surface named and the features listed, and no attribute.

| Forest | `nodes` | `links`, in graph order | `list` |
|---|---|---|---|
| F1 | `n0 {SHEAD}`, `n1` x `{N}`, `n2` y `{J}`, `n3 {STAIL}`, `n4` hyper-node | `NB(n1;n2)@n4 [seed/seed]` | `[n0, n4, n3]` |
| F2 | `n0 {SHEAD}`, `n1` a `{A}`, `n2` b `{B}`, `n3 {STAIL}`, `n4` hyper-node | `agt(n1;n2)@n4 [seed/seed]` | `[n0, n4, n3]` |
| F3 | `n0 {SHEAD}`, `n1` x, `n2` y, `n3 {STAIL}`, `n4` hyper-node | `XB(n1;n2)@n4 [seed/seed]` | `[n0, n4, n3]` |
| F4 | T18's forest: `n0 {SHEAD}`, `n1` x `{N}`, `n2` y, `n3` z, `n4 {STAIL}`, `n5` and `n6` hyper-nodes | `XB(n1;n2)@n5 [seed/seed]`, `XP(n5;n3)@n6 [seed/seed]` | `[n0, n6, n4]` |
| F5 | `n0 {SHEAD}`, `n1` x `{N}`, `n2` y, `n3` z, `n4 {STAIL}`, `n5` hyper-node | `XB(n1;n2)@n5 [seed/seed]`, `XP(n3;n2)@n5 [seed/seed]` | `[n0, n5, n4]` |

A rule written `{id, lhs, rhs}` is an in-memory analysis rule. A row with several rules gives them
in file order. "The forest is equal to its input" compares `nodes`, `list` and `links` field by
field.

## Block T

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| T01 | A08 `a beautiful book`. Words 275311, 286581, 408062. `make_forest`, then `analyse_tree` with the real eng `analysis.yaml`. | Trace, all `fired`: 70 60 71 61 72 50 12 62 80 82 100 172. `links` holds one link, `mod(n3;n2)@n5 [50/172]`. `n3` attributes `[@indef]`. `n5` has no attribute. `n1` deleted. `list [n0, n5, n4]`. `status` ok. Graph: corpus line 121, `mod(102870092.@indef, 300217728)`. | eng-unl | neutral | pending | eng-ana-70, eng-ana-60, eng-ana-71, eng-ana-61, eng-ana-72, eng-ana-50, eng-ana-12, eng-ana-62, eng-ana-80, eng-ana-82, eng-ana-100, eng-ana-172 | The step table below gives the forest after each firing. Fire row for every rule in the trace, and for the order between them. Must not fire: T05, T06. |
| T02 | A08, as T01, with the analysis list cut to records `1` to `79`. | Trace: 70 60 71 61 72 50 12 62. `links` holds one link, `NB(n3;n2)@n5 [50/50]`. `n5` is `{LEX=N, XP=NP, proj}.@indef`. `n3` has no attribute. `status` ok. | eng-unl | neutral | pending | eng-ana-70, eng-ana-60, eng-ana-71, eng-ana-61, eng-ana-72, eng-ana-50, eng-ana-12, eng-ana-62 | The issue's "finds the `NB` link rule 50 builds". T01 shows the same link after three relabels. Without rules 80 to 181 the link keeps rule 50's label, and rule 82 never moves `@indef` down. |
| T03 | A11 `the beautiful car`. Words 275357, 286581, 328185. As T01. | Trace: 70 60 71 61 72 50 12 62 80 82 100 172. One link, `mod(n3;n2)@n5 [50/172]`. `n3` attributes `[@def]`. `n1` deleted. `list [n0, n5, n4]`. `status` ok. Graph: corpus line 209, `mod(102958343.@def, 300217728)`. | eng-unl | neutral | pending | eng-ana-70, eng-ana-60, eng-ana-71, eng-ana-61, eng-ana-72, eng-ana-50, eng-ana-12, eng-ana-62, eng-ana-80, eng-ana-82, eng-ana-100, eng-ana-172 | Same steps as T01 with `@def`. A11's own purpose in `24-test-cases.md`, afr-dis-5, lies on the Afrikaans side and is out of scope here. |
| T04 | A11, as T03, with the analysis list cut to records `1` to `79`. | Trace: 70 60 71 61 72 50 12 62. One link, `NB(n3;n2)@n5 [50/50]`. `n5` is `{LEX=N, XP=NP, proj}.@def`. `status` ok. | eng-unl | neutral | pending | as T02 | The `NB` link for A11. |
| T05 | T01's and T03's runs. | Neither trace holds 54. | eng-unl | neutral | pending | — | Must-not row for eng-ana-54, and the run-order row. After step 6, rule 54 `(DP,%dp)(NB,%nb)(...)` and rule 12 both match `(n1)(n5)(n4)`. The first-match order fires 12. The sweep order fires 54 in the same sweep, and the article becomes a specifier. |
| T06 | T01's and T03's runs. | Neither trace holds 81, 86, 91, 124 or 176. No link in the final forest has a label ending in `S`. | eng-unl | neutral | pending | — | Must-not row for eng-ana-176, the rule the issue names; see the blocker above. Rule 81 stays silent because rule 62 changes `n5`'s features, not the `NB` link's label (ADR 0017, CONSERVATION). |
| T07 | A01 `book`. Word 408062. As T01. | Trace: 72 62. No link. `n1` is `{XP=NP, proj}`, no attribute. `list [n0, n1, n2]`. `status` ok. Graph: corpus line 1, `102870092`. | eng-unl | neutral | pending | eng-ana-72, eng-ana-62 | Must-not row for 12, 50, 60, 61, 70, 71, 80, 82, 100 and 172. A bare noun projects straight to a noun phrase. |
| T08 | A02 `the book`. Words 275357, 408062. As T01. | Trace: 70 60 72 12 62. No link. `n2` attributes `[@def]`. `n1` deleted. `list [n0, n2, n3]`. `status` ok. Graph: corpus line 2, `102870092.@def`. | eng-unl | neutral | pending | eng-ana-70, eng-ana-60, eng-ana-72, eng-ana-12, eng-ana-62 | Must-not row for 50, 54, 80, 82, 100, 172 and 176. Issue 180's "A02 returns no relation" rests on this row. Rule 12 copies the attribute onto a word here, not a hyper-node. |
| T09 | A03 `a book`. Words 275311, 408062. As T01. | Trace: 70 60 72 12 62. No link. `n2` attributes `[@indef]`. `n1` deleted. `status` ok. Graph: corpus line 3, `102870092.@indef`. | eng-unl | neutral | pending | eng-ana-70, eng-ana-60, eng-ana-72, eng-ana-12, eng-ana-62 | The indefinite twin of T08. |
| T10 | `possible changes`, corpus line 167. Words 287192, 503595. As T01. | Trace: 1 71 61 72 50 62 80 100 172. One link, `mod(n2;n1)@n4 [50/172]`. `n2` attributes `[@pl]`. `n4` has no attribute. `status` ok. Graph: `mod(100191142.@pl, 301821266)`. | eng-unl | neutral | pending | eng-ana-1, eng-ana-71, eng-ana-61, eng-ana-72, eng-ana-50, eng-ana-62, eng-ana-80, eng-ana-100, eng-ana-172 | Must-not row for 12, 60, 70 and 82. With no article, the hyper-node never carries `att`, so rule 82 has nothing to move. Rule 1 fires inside the loop, first. The row names `possible` 287192 because the corpus graph holds its UW; the first-candidate fallback picks 287191, and issue 195 owns that choice. |
| T11 | `make_forest` on T01's three words. | `nodes`: `n0` `{SHEAD}`; `n1` `a` with attributes `[@indef]` and no `att` feature; `n2` `beautiful`; `n3` `book`; `n4` `{STAIL}`. Sentinels have an empty surface. `list [n0, n1, n2, n3, n4]`. `links` empty. No node deleted. | eng-unl | neutral | pending | — | The hand-over, ADR 0017. Every other feature of each word is unchanged. The sentinels are the system nodes the archive's tokeniser makes (`Tokenization.wikitext`). |
| T12 | `make_forest` on no words, then `analyse_tree` with the real grammar. | `nodes`: `n0` `{SHEAD}`, `n1` `{STAIL}`. `list [n0, n1]`. Trace empty. `status` ok. | eng-unl | neutral | pending | — | Must-not row for every rule: no rule matches a bare pair of sentinels. |
| T13 | `analyse_tree`, real grammar, on T01's output forest. | Trace empty. The forest is equal to its input. `status` ok. | eng-unl | neutral | pending | — | The fixpoint: COMPREHENSIVENESS says the pass ends when no rule applies, so a second pass has nothing to do. |
| T14 | One analysis rule, `{id: "loop", lhs: "(%x,A)", rhs: "(%x,+B)"}`. `make_forest` on one word, `{surface: "x", features: {LEX: A}}`. | Trace: `kTreePassRuleCap` entries `{loop, fired}`, then one `{loop, capped}`. The call returns. `n1` holds `{B}` once. `status` ok. | eng-unl | neutral | pending | — | The cap. Source: T-rule wiki, RECURSIVENESS: `(%x,A):=(%x,+B);` "creates an infinite loop". The rule keeps matching because its left side never tests `B`. |
| T15 | One analysis rule, `{id: "guarded", lhs: "(%x,A,^B)", rhs: "(%x,+B)"}`. Input as T14. | Trace: one `{guarded, fired}`. No `capped` entry. `n1` holds `{B}`. `status` ok. | eng-unl | neutral | pending | — | Must-not row for the cap. Source: the same wiki passage, "(%x,A,^B):=(%x,+B); (the rule applies only once)". |
| T16 | Two analysis rules, in order: T14's `loop`, then `{id: "after", lhs: "(%x,A,^C)", rhs: "(%x,+C)"}`. Input as T14. | Trace: `kTreePassRuleCap` entries `{loop, fired}`, one `{loop, capped}`, then one `{after, fired}`. `n1` holds `{B}` and `{C}`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017. The cap retires one rule and the pass goes on. |
| T17 | One analysis rule, record `21` of the real `analysis.yaml`: `(TEMP,%x)(BLK,%y)(TEMP,%z)` → `(%x&%y&%z,-BLK)`. Words: `{surface: "x", features: {TEMP}}`, `{surface: " ", features: {BLK}}`, `{surface: "y", features: {TEMP}}`. | Trace: one `{21, unsupported}`. The forest is equal to `make_forest`'s output. `status` ok. | eng-unl | neutral | pending | — | Source: ADR 0017's table of right sides the pass does not apply yet; a merge is one. Must-not row: T01 to T10 hold no `unsupported` entry and no `capped` entry. |
| T18 | One analysis rule, record `86`: `XP(XB(%x;%y);%z)` → `XB(%x;%y)XS(%x;%z)`. A hand-built forest: `n0` `{SHEAD}`, `n1` x `{N}`, `n2` y, `n3` z, `n4` `{STAIL}`, `n5` and `n6` hyper-nodes. `links`: `XB(n1;n2)@n5 [seed/seed]`, `XP(n5;n3)@n6 [seed/seed]`. `list [n0, n6, n4]`. | Trace: 86. `links`, in this order: `XB(n1;n2)@n6 [seed/seed]`, `XS(n1;n3)@n6 [86/86]`. `n5` not deleted and holds no link. `status` ok. | eng-unl | neutral | pending | eng-ana-86 | Dearborisation of a specifier. Source: `Default_grammar.wikitext`, "rewrites this as two relations having %x as first argument: XB(%x;%y) and XS(%x;%z)". The inner link keeps its place and moves to the outer scope; the outer link is replaced in place. No fixed-set row reaches rule 86 under ADR 0017. |
| T19 | Two analysis rules, records `92` then `94`: `XB(%x;e)` → `(%x)`, and `(e)` → `""`. A hand-built forest: `n0` `{SHEAD}`, `n1` x, `n2` `{e}`, `n3` `{STAIL}`, `n4` a hyper-node. `links`: `XB(n1;n2)@n4 [seed/seed]`. `list [n0, n4, n3]`. | Trace: 92 94. `links` empty. `n1` not deleted. `n2` deleted. `n4` not deleted. `status` ok. | eng-unl | neutral | pending | eng-ana-92, eng-ana-94 | Deletion of empty categories. A link rule removes the link and keeps both nodes (T-rule SCOPE: "Nodes may not be deleted through NN, TT, NT, TN and TL rules"). The list rule `(e):=` then deletes `n2`. After rule 92, `n2` is in no list entry and no link, so visit order reaches it after the walk, in arena order (ADR 0017, Visit order). |
| T20 | One analysis rule, record `30`: `(DIGIT,^HOUR,^MINUTE,%h)(":",%a)(DIGIT,^MINUTE,^SECOND,%m)` → `(%h,+HOUR)(%a)(%m,+MINUTE)`. Words `{surface: "12", features: {DIGIT}}`, `{surface: ":"}`, `{surface: "30", features: {DIGIT}}`. | Trace: one `{30, fired}`. `n1` holds `{DIGIT}`, `{HOUR}`. `n3` holds `{DIGIT}`, `{MINUTE}`. `n2` unchanged. No node deleted. `list [n0, n1, n2, n3, n4]`. `status` ok. | eng-unl | neutral | pending | eng-ana-30 | Fire row for a quoted string (ADR 0017, Matching). `":"` is the archive's `<STRING>` (T-rule formal syntax, `<STRING> ::= """<text>"""`) and tests the surface. Today's code reads it as a tag and never matches. No second firing: `n1` now holds `HOUR`, and `(n2)(n3)(n4)` starts with no digit. |
| T21 | As T20, with the middle word `{surface: "."}`. | Trace empty. The forest is equal to `make_forest`'s output. `status` ok. | eng-unl | neutral | pending | — | Must-not row for eng-ana-30: the string must equal the whole surface. |
| T22 | As T20, with the middle word `{surface: "colon", features: {":"}}`. | Trace empty. The forest is equal to `make_forest`'s output. `status` ok. | eng-unl | neutral | pending | — | Must-not row for eng-ana-30: a quoted string never tests a feature. A tag reading of `":"` fires here. |
| T23 | One analysis rule, record `29`: `(DIGIT,^HOUR,%h)(":",%a)(DIGIT,^MINUTE,%m)(":",%b)(DIGIT,^SECOND,%s)` → `(%h,+HOUR)(%a)(%m,+MINUTE)(%b)(%s,+SECOND)`. Words `12`, `:`, `30`, `:`, `00`. Each digit word carries `{DIGIT}`; each colon carries no feature. | Trace: one `{29, fired}`. `n1 +{HOUR}`, `n3 +{MINUTE}`, `n5 +{SECOND}`. `n2` and `n4` unchanged. No node deleted. `list [n0, n1, n2, n3, n4, n5, n6]`. `status` ok. | eng-unl | neutral | pending | eng-ana-29 | Fire row for rule 29. The only five-node window that starts on a digit is `(n1)...(n5)`. No second firing: `n1` now holds `HOUR`. |
| T24 | Record `29` alone, on T20's three words. | Trace empty. The forest is equal to `make_forest`'s output. `status` ok. | eng-unl | neutral | pending | — | Must-not row for eng-ana-29. The list has one five-node window, `(n0)...(n4)`, and `n0` is no digit. |
| T25 | One analysis rule, record `26`: `(TIME,^"/\d\d\:\d\d\:\d\d/")` → `(-TIME,+TEMP)`. One word, `{surface: "12:30:00", features: {TIME}}`. | Trace: one `{26, unsupported}`. The forest is equal to `make_forest`'s output: `n1` still holds `{TIME}` and holds no `TEMP`. `status` ok. | eng-unl | neutral | pending | eng-ana-26 | Fire row for a test the pass cannot read (ADR 0017, Three-valued matching). `n0` is false, as it holds no `TIME`. On `n1`, `TIME` is true and the quoted regex is unknown, so `^` of it is unknown, and the window is unknown. Today's code fires 26 and writes `TEMP`, because it reads the regex as a tag that never holds. |
| T26 | Record `26` alone, one word `{surface: "12", features: {DIGIT}}`. | Trace empty. The forest is equal to `make_forest`'s output. `status` ok. | eng-unl | neutral | pending | — | Must-not row for eng-ana-26. `TIME` is false on every node, so every window is false, and the unknown regex never decides. A sentence without a time never meets rule 26. |
| T27 | One analysis rule, `either`: `({"/\d/"\|DIGIT},W,^SEEN,%x)` → `(%x,+SEEN)`. One word, `{surface: "12", features: {DIGIT, W}}`. | Trace: one `{either, fired}`. `n1` holds `{SEEN}`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017. A disjunction with one true alternative is true, though the other is unknown. `n0` is false through `W`. No second firing: `^SEEN` fails on `n1`, and `W` fails on `n2`. |
| T28 | As T27, with the word `{surface: "x", features: {W}}`. | Trace: one `{either, unsupported}`. The forest is equal to `make_forest`'s output. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017. On `n1` the disjunction is unknown OR false, so unknown, and `W` and `^SEEN` are true. The first place not false is unknown, so the rule retires. Must-not counterpart of T27. |
| T29 | One analysis rule, record `80`: `/[ACDIJNPV]B/(%x;%y)` → `XB(%x;%y)`. Forest F1. | Trace: one `{80, fired}`. `links` holds one link, `XB(n1;n2)@n4 [seed/80]`. `status` ok. | eng-unl | neutral | pending | eng-ana-80 | Fire row for the regex subset: one class, then one literal, one atom per character of `NB`. No second firing: `X` is not in the class. |
| T30 | Record `80` alone, on F1 with its one link replaced by two links, in order: `XB(n1;n2)@n4 [seed/seed]`, `NBB(n1;n2)@n4 [seed/seed]`. | Trace empty. The forest is equal to its input. `status` ok. | eng-unl | neutral | pending | — | Must-not row for eng-ana-80. `XB`: `X` is not in the class. `NBB`: the regex has two atoms and the label three characters, and the regex must match the whole label. |
| T31 | One analysis rule, `{id: "alt", lhs: "/(agt\|obj\|aoj)/(A,%a;B,%b)", rhs: "VS(%a;%b)"}`. Forest F2. | Trace: one `{alt, unsupported}`. The forest is equal to its input: one link, `agt(n1;n2)@n4 [seed/seed]`. `status` ok. | eng-unl | neutral | pending | — | Source: T-rule wiki, REGULAR EXPRESSIONS, `/(agt\|obj\|aoj)/(A,%a;B,%b):=VS(%a;%b);`. The label runs to the second `/`, so the rule has two ends. A group and `\|` are outside the subset, so the label is unknown, and both ends are true. Today's code finds the `(` inside the slashes and reads the label `/`. |
| T32 | One analysis rule, `{id: "range", lhs: "/[a-z]{2,3}/(A,%a;B,%b)", rhs: "VS(%a;%b)"}`. Forest F2. | Trace: one `{range, unsupported}`. The forest is equal to its input. `status` ok. | eng-unl | neutral | pending | — | Source: T-rule wiki, REGULAR EXPRESSIONS, `/[a-z]{2,3}/(A,%a;B,%b):=VS(%a;%b);`. A range and a quantifier are outside the subset. Today's code reads `[a-z]` as the three characters `a`, `-`, `z`. |
| T33 | Rule `alt` from T31, on F2 with `n1` holding `{C}` in place of `{A}`. | Trace empty. The forest is equal to its input. `status` ok. | eng-unl | neutral | pending | — | Must-not row for T31 and T32. The head test `A` is false, so the link term is false, though its label is unknown. |
| T34 | One analysis rule, `{id: "relabel", lhs: "XB(%x;%y)", rhs: "NA(%x;%y)"}`. Forest F3 with its link's `to` set to `100000`. | Trace empty. The forest is equal to its input. `status` `no_parse`. | eng-unl | neutral | pending | — | Source: original, ADR 0017, A forest the pass can read; `docs/standards/cpp.md`, "No exceptions across the public API. Return `Status`". The check runs before the first step. Today's code indexes `nodes` out of range. |
| T35 | One analysis rule, `{id: "mark", lhs: "(%x,^F)", rhs: "(%x,+F)"}`. A hand-built forest: `n0 {SHEAD}`, `n1` x, `n2 {STAIL}`. `list [n0, n1, 7, n2]`. No link. | Trace empty. The forest is equal to its input: `n1` holds no `F`. `status` `no_parse`. | eng-unl | neutral | pending | — | Source: original, ADR 0017. A `list` entry out of range. `mark` matches `n0` on a readable forest, so an empty trace shows that no step ran. |
| T36 | Rule `relabel` from T34, on F3 with `n2` deleted. | Trace empty. The forest is equal to its input. `status` `no_parse`. | eng-unl | neutral | pending | — | Source: original, ADR 0017. A link names a deleted node. No firing makes this forest: `delete_node` removes every link that names the node. |
| T37 | Rule `relabel` from T34, on F3 with one more node, `n5`, `{surface: "z"}`, deleted. No `list` entry and no link names `n5`. | Trace: one `{relabel, fired}`. `links` holds `NA(n1;n2)@n4 [seed/relabel]`. `n5` still deleted. `status` ok. | eng-unl | neutral | pending | — | Must-not row for T34 to T36. A deleted node that nothing names leaves the forest readable, as in T13, where `n1` is deleted. |
| T38 | One analysis rule, `{id: "partial", lhs: "XB(%x;%y)", rhs: "NA(%x,+Q;%z)"}`. Forest F3. | Trace: one `{partial, unsupported}`. The forest is equal to its input: `n1` holds no `Q`, the link is still `XB(n1;n2)@n4 [seed/seed]`, `nodes` has 5 entries. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017, Run order and Right sides. `%z` is unbound on the left. T-rule LL#16 makes "a new node %B5" there, and the pass does not build it yet. Today's code adds `Q` to `n1` before it finds `%z` unbound. |
| T39 | One analysis rule, `{id: "grow", lhs: "XB(%x;%y)", rhs: "NA(+e;%z)"}`. Forest F3. | Trace: one `{grow, unsupported}`. The forest is equal to its input. `nodes` has 5 entries. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017. The head `+e` makes a node before the dependent `%z` fails. The forest after the entry holds no such node. Today's code leaves a sixth node. |
| T40 | One analysis rule, `{id: "stray", lhs: "(P,%p)", rhs: "(%q,+F)"}`. One word, `{surface: "p", features: {P}}`. | Trace: one `{stray, unsupported}`. The forest is equal to `make_forest`'s output: 3 nodes, `n1` not deleted and holding no `F`, `list [n0, n1, n2]`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017, Right sides. A group whose index the left side does not bind is a new node in the archive (T-rule LL#11). Today's code drops the group, deletes `n1` as unnamed, and records a firing. |
| T41 | One analysis rule, `{id: "whole", lhs: "XB(%x;%y)", rhs: "NA(%x,+Q;%y)"}`. Forest F3. | Trace: one `{whole, fired}`. `links` holds `NA(n1;n2)@n4 [seed/whole]`. `n1` holds `{Q}`. `nodes` has 5 entries. `status` ok. | eng-unl | neutral | pending | — | Must-not row for T38 to T40: a right side with every index bound applies whole, and no `unsupported` entry appears. No second firing: no `XB` link is left. |
| T42 | Four analysis rules, in order. `mk`: `(P,%p)(Q,%q)` → `(XB(%p;%q),+Z,%new)`. `L`: `(T,^M,%a)(Z,^T,%b)` → `(%a,+M)(%b)`. `R`: `(Z,^T,%a)(T,^M,%b)` → `(%a)(%b,+M)`. `tag`: `(Z,^T,%x)` → `(%x,+T)`. Words `{surface: "p", features: {P}}`, `{surface: "q", features: {Q}}`, `{surface: "z", features: {Z}}`. | Trace, all `fired`: mk tag L tag. `n5`, the hyper-node, holds `{Z}`, `{T}`, `{M}`. `n3` holds `{Z}`, `{T}` and no `M`. `links` holds `XB(n1;n2)@n5 [mk/mk]`. `list [n0, n5, n3, n4]`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017, Visit order; T-rule PRIORITY, "from left to right (in case of lists)". After `mk`, `n5` stands left of `n3` in the list, so `tag` takes `n5` first, and `L` sees the `T` node on the left. Arena order takes `n3` first and gives mk tag R tag. |
| T43 | T42's run. | The trace holds no `R`. `n3` holds no `M`. | eng-unl | neutral | pending | — | Must-not row for T42: the arena-order reading. |
| T44 | Four analysis rules, in order. `mk` as in T42. `in`: `XB(%x,T,^M;%y)` → `XB(%x,+M;%y)`. `out`: `(XB(%a;%b),T,^M,%x)` → `(%x,+M)`. `tag` as in T42. Words `{surface: "p", features: {P, Z}}`, `{surface: "q", features: {Q}}`. | Trace, all `fired`: mk tag out tag in. `n4`, the hyper-node, holds `{Z}`, `{T}`, `{M}`. `n1` holds `{P}`, `{Z}`, `{T}`, `{M}`. `links` holds `XB(n1;n2)@n4 [mk/in]`. `list [n0, n4, n3]`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017, Visit order; T-rule PRIORITY, "top-down (in case of graphs)". The walk visits the hyper-node `n4` before `n1`, which it holds. Arena order takes `n1` first and gives mk tag in tag out. |
| T45 | Three analysis rules, in order. `inZ`: `Z(%x,N;%y)` → `IN(%x;%y)`. `outZ`: `Z(%x,^N;%y)` → `OUT(%x;%y)`. `pick`: `/X[BP]/(%x;%y)` → `Z(%x;%y)`. Forest F4. | Trace, all `fired`: pick outZ pick inZ. `links`, in this order: `IN(n1;n2)@n5 [seed/inZ]`, `OUT(n5;n3)@n6 [seed/outZ]`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017, Visit order, link order. `n6` comes before `n5` in visit order, so the `XP` link in `n6` comes before the `XB` link in `n5`, though `XB` is first in graph order. Graph order gives pick inZ pick outZ. |
| T46 | T45's three rules, on forest F5. | Trace, all `fired`: pick inZ pick outZ. `links`, in this order: `IN(n1;n2)@n5 [seed/inZ]`, `OUT(n3;n2)@n5 [seed/outZ]`. `status` ok. | eng-unl | neutral | pending | — | Must-not row for T45: two links in one scope keep graph order. Link order never moves `XP` before `XB` here. |
| T47 | Two analysis rules, in order. `first`: `(A,^B,%x)` → `(%x,+B)`. `broken`: `{lhs: "(A", rhs: "(%x)"}`. One word, `{surface: "x", features: {A}}`. | Trace: `{first, fired}`, then `{broken, unsupported}`. `n1` holds `{A}`, `{B}`. `status` ok. | eng-unl | neutral | pending | — | Source: original, ADR 0017, Three-valued matching. A rule that does not parse is unknown at every place, so it retires at the first step that reaches it, after `first` stops matching. Today's code skips it in silence. Must-not: T01 to T10 and T12 hold no `unsupported` entry, because all 181 eng rules parse. |

## T01, step by step: A08 `a beautiful book`

Each step fires the first rule in file order whose left side matches, at its first match, then
scans again from rule 1. Dictionary features are left out of the forest column.

| step | rule | left side | first match | forest after the firing |
|---|---|---|---|---|
| 0 | hand-over | — | — | `list [n0 SHEAD, n1 a.@indef, n2 beautiful, n3 book, n4 STAIL]`. No link. |
| 1 | 70 | `(D,^proj,^XB,^XP)` | `n1` | `n1 +{XB=DB}` |
| 2 | 60 | `({^A\|SHEAD\|CHEAD\|PUT})(DB,^proj,^XP)` | `(n0)(n1)` | `n1 −{XB=DB} +{XP=DP, proj}` |
| 3 | 71 | `(J,^proj,^XB,^XP)` | `n2` | `n2 +{XB=JB}` |
| 4 | 61 | `({^A\|SHEAD\|CHEAD\|PUT})(JB,^proj,^XP)({^P\|PUT\|STAIL\|CTAIL})` | `(n1)(n2)(n3)` | `n2 −{XB=JB} +{XP=JP, proj}` |
| 5 | 72 | `(N,^proj,^XB,^XP)` | `n3` | `n3 +{XB=NB}` |
| 6 | 50 | `(JP,%jp)(NB,%nb)({XP\|PUT\|STAIL\|CTAIL},%right)` | `(n2)(n3)(n4)` | New hyper-node `n5 {XB=NB, LEX=N}`. Link `NB(n3;n2)@n5 [50/50]`. `n3 +{proj}`. `n2 +{adjt}`. `list [n0, n1, n5, n4]`. |
| 7 | 12 | `(D,att,%x)(NB,%y)({^N\|PUT\|STAIL\|CTAIL},%right)` | `(n1)(n5)(n4)` | `n1` deleted. `n5.@indef`. `list [n0, n5, n4]`. |
| 8 | 62 | `({^D,^J,^N\|SHEAD\|CHEAD\|PUT})(NB,^proj,^XP)({^D,^J,^P\|PUT\|STAIL\|CTAIL})` | `(n0)(n5)(n4)` | `n5 −{XB=NB} +{XP=NP, proj}`, so `n5 {LEX=N, XP=NP, proj}.@indef`. The link is still `NB`. |
| 9 | 80 | `/[ACDIJNPV]B/(%x;%y)` | `NB(n3;n2)` | `XB(n3;n2)@n5 [50/80]` |
| 10 | 82 | `(XB(%x;%y),%w,att)` | `n5`, which holds `XB(n3;n2)` | `n3.@indef`. `n5` attributes cleared. |
| 11 | 100 | `XB(%x,N;%y,adjt)` | `XB(n3;n2)` | `NA(n3;n2)@n5 [50/100]` |
| 12 | 172 | `NA(%x;%y)` | `NA(n3;n2)` | `mod(n3;n2)@n5 [50/172]` |
| — | — | — | — | No rule matches. The pass ends. |

Why the rules that do not fire stay silent, step by step:

| step | silent rule | why |
|---|---|---|
| 1 | 69 `(A,...)` | The tag test is case-sensitive. `a` carries the value `a`, never `A`. |
| 2 | 71 on `n2` | Rule 60 matches `(n0)(n1)` and comes first in the file. The sweep order fires 71 here. |
| 4 | 72 on `n3` | Rule 61 matches `(n1)(n2)(n3)` and comes first. `n1` carries no `A`, so 61's left context `{^A\|...}` holds. |
| 6 | 62 on `n3` | Rule 50 matches first in the file. Rule 62 would refuse anyway: `n2`, tagged `J`, sits to the left of `n3`, and `{^D,^J,^N\|...}` excludes it. That guard is what holds `n3` back in the sweep order's second sweep. |
| 7 | 54 `(DP,%dp)(NB,%nb)(...)` | It matches `(n1)(n5)(n4)` as well. Rule 12 comes first in the file. This is row T05. |
| 7 | 10 `(N,%x)(NB,%y)(...)` | `n1` is a determiner, not a noun. |
| 10 to the end | 81 `/[ACDIJNPV]P/(%x;%y)` | No link is labelled with a `P`. Rule 62 changed `n5`'s features, not the link's label. |
| 10 to the end | 80 again | `XB` does not match `[ACDIJNPV]B`: `X` is not in the class. |
| 11 | 95 to 99 `XB(%x,A;...)` ... `XB(%x,J;...)` | `n3` carries none of `A`, `C`, `D`, `I`, `J`. |
| 12 | 127 to 170 `/[ACDIJNPV][ACS]/(%x;%y,REL)` | `n2` carries no relation-name tag. |
| 12 | 171 `NA(%x;%y,DIGIT,^ORD)` | `n2` is not a digit. |
| after 12 | 176 `/[ACDIJNP]S/(%x;%y)` | No link label ends in `S`. This is row T06. |

## T03, step by step: A11 `the beautiful car`

The steps are T01's with `the` for `a`, `car` for `book` and `@def` for `@indef`.

| step | rule | first match | forest after the firing |
|---|---|---|---|
| 0 | hand-over | — | `list [n0 SHEAD, n1 the.@def, n2 beautiful, n3 car, n4 STAIL]` |
| 1 | 70 | `n1` | `n1 +{XB=DB}` |
| 2 | 60 | `(n0)(n1)` | `n1 −{XB=DB} +{XP=DP, proj}` |
| 3 | 71 | `n2` | `n2 +{XB=JB}` |
| 4 | 61 | `(n1)(n2)(n3)` | `n2 −{XB=JB} +{XP=JP, proj}` |
| 5 | 72 | `n3` | `n3 +{XB=NB}` |
| 6 | 50 | `(n2)(n3)(n4)` | `n5 {XB=NB, LEX=N}`; `NB(n3;n2)@n5 [50/50]`; `n3 +{proj}`; `n2 +{adjt}`; `list [n0, n1, n5, n4]` |
| 7 | 12 | `(n1)(n5)(n4)` | `n1` deleted; `n5.@def`; `list [n0, n5, n4]` |
| 8 | 62 | `(n0)(n5)(n4)` | `n5 {LEX=N, XP=NP, proj}.@def` |
| 9 | 80 | `NB(n3;n2)` | `XB(n3;n2)@n5 [50/80]` |
| 10 | 82 | `n5` | `n3.@def`; `n5` attributes cleared |
| 11 | 100 | `XB(n3;n2)` | `NA(n3;n2)@n5 [50/100]` |
| 12 | 172 | `NA(n3;n2)` | `mod(n3;n2)@n5 [50/172]` |

## Evidence, not a test: A08 in the sweep order

The sweep order runs each rule while it matches, then the next, and repeats the sweep until one
sweep fires nothing. ADR 0017 rejects it, and the owner accepted that on 2026-10-27. This trace is
why. It is a record of the decision, not an open option.

| sweep | firings, in order | what happens |
|---|---|---|
| 1 | 70, 71, 72 | `a`, `beautiful` and `book` get their bar features. |
| 2 | 60, 61 | `a` becomes `DP`, `beautiful` becomes `JP`. Rule 62 skips `book`: `beautiful` sits to its left. |
| 3 | 50, 54, 80, 81, 86, 100, 124, 172, 176 | Rule 12 runs first and finds no noun bar. Rule 50 builds it. Rule 54, later in the same sweep, makes `a` the specifier. Dearborisation splits the tree into `NA(book;beautiful)` and `NS(book;a)`. Rule 172 writes `mod(book;beautiful)`. Rule 176 writes `mod(book;a)`. |
| 4 | none | Rule 12 finds no article at the top of the list. The pass ends. |

The sweep ends with two `mod` edges, an article node with no UW, and `book` without `@indef`.
Corpus line 121 holds one edge and `@indef` on the noun.

## Stubs the tests are written against

The `test(#194)` commit carries the public shape below and a stub `engine/src/tree_pass.cpp`. The
suite builds against that commit, and every row is red. The work commit replaces the stub. The
round-1 version of this section named stubs that never reached a commit; the verifier's finding
01 found that commit did not compile.

| Name | Header | Stub body |
|---|---|---|
| `enum class TraceEvent { fired, capped, unsupported }`, `TraceEntry::event` (default `fired`) | `engine.hpp` | shape only |
| `kTreePassRuleCap` (1024) | `rule_interpreter.hpp` | shape only |
| `struct TreeNode`, `struct Link`, `struct Forest`, `struct TreeResult` | `rule_interpreter.hpp` | shape only |
| `Forest make_forest(std::vector<Candidate>)` | `rule_interpreter.hpp` | returns an empty `Forest` |
| `TreeResult RuleInterpreter::analyse_tree(Forest, Trace&) const` | `rule_interpreter.hpp` | returns its input forest, appends nothing, `Status::not_implemented` |

The revision after checkpoint 4 adds no public name. `Status::no_parse` already exists. The
header comments on `TreeResult` and `analyse_tree` now state visit order, three-valued matching
and the readable-forest check.

`RuleInterpreter::analyse`, the flat pass, keeps issue 22's contract and its tests. Issue 180
moves `Engine::translate` onto the tree pass; issue 194 does not touch `engine.cpp`.
