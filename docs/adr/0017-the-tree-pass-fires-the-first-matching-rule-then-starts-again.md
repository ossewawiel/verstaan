# 0017 — The tree pass fires the first matching rule, then starts again from rule one

Date: 2026-10-27 · Status: Accepted

Revised 2026-10-27, before merge, after issue 194's checkpoint-4 verifier read: visit order, a
forest the pass can read, three-valued matching, quoted strings and regex labels, and an
unchanged forest after an `unsupported` entry.

## Context

`RuleInterpreter::analyse` (issue 22) is the flat pass. It runs each rule of
`grammar/analysis.yaml` once, in file order, as one left-to-right scan over a flat list of
words. It can add an attribute, merge two words and delete a word. It cannot build a tree. Rules
38 to 76 parse the list into a tree. Rules 77 to 126 reshape the tree and flatten it into a
network of syntactic links. Rules 127 to 176 turn those links into UNL relations. The flat pass
reaches none of that. Issue 180's first rule-author pass stopped on this as blocker B3.

The flat pass also misreads the link rules. It parses `NA(%x;%y)` as a one-node pattern whose
capture is named `x;%y`, and that capture matches every word. On `a beautiful book` the flat pass
appends `172` three times and `176` three times, and builds no relation. A test that only looks
for a rule id in the trace passes on that output today.

The archive states the run order in three passages of `data/archive/wiki/T-rule.wikitext`:

- PRIORITY: "Rules are applied serially, according to the order defined in the grammar." Its
  worked example: "the RULE#1 is the first applicable rule to appear in the grammar and,
  therefore, is the first one to be applied".
- RECURSIVENESS: "Rules are applied recursively as long as their conditions are true."
- COMPREHENSIVENESS: "Grammars are applied comprehensively as long as there is at least one
  applicable rule."

Two orders fit those words. The sweep order runs each rule while it matches, then the next rule,
and repeats the whole sweep until one sweep fires nothing. The first-match order fires the first
rule in file order that matches, once, and then scans again from rule one. The two orders part
on the most common noun phrase in the corpus.

`data/archive/wiki/English_grammar_Determiners.wikitext` settles it. It says why rule 12,
`(D,att,%x)(NB,%y)({^N|PUT|STAIL|CTAIL},%right)`, waits for a noun bar: "there can be other words
between the determiner and the noun: "a beautiful book", for instance. ... we first process the
noun phrase, generating all its intermediate projections (NB's). Only then we resolve the
determiners." The English grammar loads before the default grammar (`English_grammar.wikitext`:
"1) standardization, 2) language-specific, and 3) default"). So rule 12 sits in front of the
default grammar's rule 54, `(DP,%dp)(NB,%nb)(...)`, which makes an article a specifier.

In the sweep order, rule 50 folds `beautiful` into a noun bar during the third sweep. Rule 54 runs
later in that same sweep, finds `a` beside the new bar, and makes it the specifier. Rule 12 has
already had its turn. In the fourth sweep it finds no article at the top of the list. The pass
ends with `mod(book;beautiful)` from rule 172, `mod(book;a)` from rule 176, an article node with
no UW, and no `@indef` on `book`. Corpus line 121 holds one edge, `mod(102870092.@indef,
300217728)`. In the first-match order, rule 12 fires on the step after rule 50, deletes `a`, and
moves `@indef` onto the noun bar. The pass reaches the corpus graph.

## Decision

### Run order

- The tree pass runs every rule of `grammar/analysis.yaml`, 1 to 181, as one loop over one
  forest. No rule id splits a flat part from a tree part, because rule 12 must fire after rule 50.
- At each step the pass fires the first rule in file order whose left side matches. It fires
  once, at the rule's first match. Then the pass scans again from rule 1. It stops when no rule
  matches.
- The first match depends on the pattern. Visit order is defined under "Visit order" below.

| Left side | First match |
|---|---|
| Two or more nodes, `(a)(b)...` | The leftmost window of adjacent nodes in the top-level list. |
| One node, `(a)` | The first live node in visit order. Nodes inside a hyper-node count: T-rule LL#1 and LL#2 delete matching nodes "wherever they are". |
| Link terms, `XB(%x;%y)` | The first link in link order. |

- A rule may fire `kTreePassRuleCap` times in one pass, `1024`. The firing that reaches the cap is
  followed by `TraceEntry{id, TraceEvent::capped}`, and the rule is retired for the rest of the
  pass. Each firing raises the count of one rule. Every count is bounded and the grammar is
  finite, so the pass always ends. The wiki's own endless rule, `(%x,A):=(%x,+B);`, stops at the
  cap.
- A rule whose left side matches, but whose right side the pass cannot apply yet, gets
  `TraceEntry{id, TraceEvent::unsupported}` and is retired. A rule whose left side the pass cannot
  read gets the same entry, at the first place its left side is not false (see "Three-valued
  matching"). The pass neither guesses nor loops.
- An `unsupported` entry follows an unchanged forest. The pass decides that it can apply the
  whole right side before it edits anything, or it restores the forest as it stood when the rule
  matched. No node, feature, attribute or link that the right side named survives. The forest
  after the entry is equal to the forest before the rule matched.

### Visit order

T-rule PRIORITY: "In case of the same rule being applicable more than once, rules are applied
from left to right (in case of lists) and top-down (in case of graphs)." Arena order breaks that
sentence. Rule 50 makes its hyper-node after `STAIL` in the arena, but the node stands left of
every word that follows it in the list.

- Visit order is a walk over the live nodes. It walks `Forest::list` from left to right. At each
  node it visits the node, then the nodes its links hold, before the next list entry.
- The nodes a hyper-node holds are the ends of the links whose `scope` is that hyper-node. The
  walk takes those links in graph order, and for each link the head, then the dependent. A head
  or a dependent that is itself a hyper-node is walked the same way, at once. This is top-down.
- Each node is visited once, at its first place in the walk. Deleted nodes are never visited.
- After the walk, every live node not yet visited follows, in arena order. Such a node is in no
  list and no link, as `n2` in row T19 after rule 92 removes its link. LL#2 keeps such a node "as
  an isolated node", and LL#1 still reaches it.
- Link order is top-down too. A link comes before another when its `scope` comes first in visit
  order. Two links in one scope keep graph order. In rule 86's input, the outer `XP` link comes
  before the inner `XB` link, although the inner link was built first.
- `Forest::links` itself stays in graph order. Visit order and link order are match orders only.
  They never move a node or a link.

### A forest the pass can read

`analyse_tree` takes any `Forest`, including one a caller builds by hand (rows T18 and T19). The
engine throws no exception across the public API (`docs/standards/cpp.md`), so the pass checks
the forest before its first step.

- A forest is readable when every index it holds is below `nodes.size()` and names a live node.
  The indexes are each entry of `list`, and the `from`, `to` and `scope` of each link.
- On a forest that fails the check, `analyse_tree` runs no rule, appends nothing to the trace, and
  returns the input forest unchanged with `Status::no_parse`. `no_parse` already means "the
  engine has no reading of this input" (SPEC.md §3.4). The pass adds no `Status` member.
- `make_forest` and every rule firing keep the forest readable. A list rule takes a deleted node
  out of the list, and `delete_node` removes every link that names the node. Only a caller can
  hand the pass a forest that fails the check.

### Three-valued matching

A left side can hold a test the pass cannot read: a regex outside the subset below, a quoted
`/regex/`, or a UW `[[...]]`. The pass does not guess its value. Every test has one of three
values: true, false or unknown.

- A test the pass cannot read is unknown on every node. `^` on an unknown test gives unknown.
- An AND group, the items of one node pattern, is false when one item is false. Else it is
  unknown when one item is unknown. Else it is true.
- A disjunction `{a|b}` is true when one alternative is true. Else it is unknown when one
  alternative is unknown. Else it is false.
- A link term is an AND group of its label test, its head and its dependent. A node that must
  hold a matching link is true when one of its links is true. Else it is unknown when one of its
  links is unknown. Else it is false.
- A window, a node or a link matches when its value is true.
- The pass takes the rule's places in match order. The first place that is not false decides.
  True: the rule fires there. Unknown: the rule gets one `unsupported` entry and is retired, and
  the forest does not change. A rule false at every place does nothing.
- A rule whose text does not parse is unknown at every place. It gets its `unsupported` entry at
  the first step that reaches it in file order. All 181 eng rules parse at issue 194.

Rule 26, `(TIME,^"/\d\d\:\d\d\:\d\d/")`, is false on every node without `TIME` and unknown
on a `TIME` node. A sentence with no `TIME` node never meets it. The first sentence with one
gets `26 unsupported` in its trace, and its `TIME` node keeps `TIME`.

### Node shape

- `Forest` holds an arena, `nodes`, the top-level list, `list`, and every link, `links`. An index
  into `nodes` never moves and is never reused. `links` is in graph order: a relabel keeps the
  link's place, and a new link goes at the end.
- `make_forest` lays the arena out as `SHEAD`, the n words in input order, `STAIL`. Word `i` of
  the input is always `nodes[i + 1]`. Every node a rule makes goes after `STAIL`. The sentinels
  are system nodes the archive's tokeniser makes for every sentence (`Tokenization.wikitext`).
  Rule 50 needs `STAIL` to the right of `book`, and rule 62 needs `SHEAD` to the left of the
  noun bar.
- `TreeNode` is a word, a sentinel or a hyper-node: `surface`, `features`, `attributes`,
  `deleted`. A hyper-node is the node a right-side group makes around a link term, as in rule
  50's `(NB(%nb,+proj;%jp,+adjt,+proj),+XB=NB,+LEX=N,%new)`. The Determiners page names this
  shape: it "replaces two nodes (%x and %y) by a third node (%z) and creates an XB relation
  between %x and %y inside this node".
- `Link` is `label`, `from` (the head), `to` (the dependent), `scope` (the hyper-node that holds
  it), `built_by` and `labelled_by`. A relabel writes `label` and `labelled_by` and keeps
  `built_by`. The link rule 50 builds for `a beautiful book` ends the pass labelled `mod`, built
  by 50, labelled by 172.
- A hyper-node's features belong to the hyper-node, not to the link inside it. Rule 62,
  `()(-XB,-NB,+XP=NP,+proj)()`, changes the features of the hyper-node rule 50 made. It leaves
  the `NB` link inside unchanged. T-rule CONSERVATION: "Rules affect only the information clearly
  specified." So rule 80 relabels that link `XB`, rule 100 relabels it `NA`, and rule 172
  relabels it `mod`.

### Features and attributes

- The tag test is the flat pass's: a tag matches a feature key, a feature value or an attribute.
  It is case-sensitive. It reads the node's own features, never those of the nodes inside it.
- `att` is the attribute list. `make_forest` moves every dictionary `att` value into
  `attributes`. The tag `att` matches a node with one or more attributes. `+att=@v` appends `@v`.
  `+att=%x` appends every attribute of `%x`; the Determiners page: "+att=%x creates an attribute
  att and assigns the value of the same attribute in %x". `-att` clears the list.
- On the right side, an item with no sign reads as if it carried `+`. `+F` adds the tag
  `{F, ""}`. `+K=V` adds the pair. `+K=%x` adds `K` with the value `%x` holds, and adds nothing
  when `%x` is unbound. `-F` removes every feature the tag `F` matches and the attribute `F`. A
  node never holds the same pair twice.
- Every read through an index uses the bound node as it stood when the rule matched. Rule 82
  reads the hyper-node's attributes before it clears them.

### Matching

- A pattern of two or more nodes matches adjacent nodes of the top-level list only. No list joins
  the nodes inside a hyper-node.
- A link term `LABEL(a;b)` matches a link with that label whose head matches `a` and whose
  dependent matches `b`. An empty side matches any node.
- A label that starts with `/` runs to the next `/`. A `(` inside the slashes does not open the
  link's ends, so `/(agt|obj|aoj)/(A,%a;B,%b)` (T-rule, REGULAR EXPRESSIONS) has the label
  `/(agt|obj|aoj)/` and two ends.
- The pass reads one regex subset, in the label position only. Its body is a sequence of atoms.
  An atom is one letter, digit or `_`, or a class `[...]` of such characters. The regex must match
  the whole label, one atom per character. Every label regex in the eng grammar is in the subset,
  for example `/[ACDIJNPV]B/` (rule 80) and `/[ACDIJNPV][ACS]/` (rules 127 to 170).
- Any other regex body is a test the pass cannot read: a range `[a-z]`, a negated class `[^A]`,
  an escape `\d`, a group, `|`, `.`, a quantifier `*`, `+`, `?` or `{2,3}`, an anchor. A regex in a
  tag, a value or a quoted string is a test the pass cannot read, whatever its body. Such a test
  is unknown, never a set of literal characters (see "Three-valued matching").
- A quoted string `"text"` is the archive's `<STRING>` description (T-rule, formal syntax,
  `<STRING> ::= """<text>"""`). It tests that the node's `surface` equals `text`, byte for byte.
  It never tests a feature. Rules 29 and 30 read `(":",%a)` as "a node whose surface is `:`".
- `"/.../"`, a quoted regex, is a test the pass cannot read (rules 26 and 31).
- `[text]` is the archive's `<ENTRY>`. The pass tests it against `surface`, as the flat pass does.
  Every entry on an eng left side names an uninflected closed-class word: `[not]`, `[n't]`,
  `[to]`, `[and]`, `[or]`. `[[...]]`, a UW, is a test the pass cannot read (rule 31).
- A link term in the place of a side, as in `XP(XB(%x;%y);%z)`, matches a hyper-node that holds a
  matching link. A link term inside a node pattern, as in `(XB(%x;%y),%w,att)`, matches a node
  that holds a matching link.
- One index used twice binds one node. `K=%x` on the left, as in rule 18's `(XP=%x,%y)`, tests
  that the node's `K` value equals the one `%x` holds.

### Right sides

- List rules work as in the flat pass, with three additions. A group with `%new`, or a group that
  holds a link term, makes a new node; with a link term it is a hyper-node. A link side with no
  index, `e` or `+e`, makes a new node with those features. A left-side node that no group names
  is deleted, with every link that names it.
- Link rules never delete a node (T-rule SCOPE). One link in and one out is a relabel in place,
  ends swapped if the right side swaps them: rules 80, 81, 91, 95 to 176 and 181.
- One link in and two out, rules 86 to 90. The right-side link with the label and ends of the
  matched inner link is that link. It keeps its place in graph order and moves to the outer
  link's scope. The other right-side link replaces the outer link in its place, built by this
  rule. The inner hyper-node is left holding no link, and is not deleted.
- A link rule with a node on the right, `XB(%x;e):=(%x)` (rules 92 and 93), removes the link and
  keeps both nodes.
- A group or a link end that names an index the left side does not bind makes a new node in the
  archive. T-rule LL#11: `((%x,B1)):=((%y,NEW))` "Replace any node ... by a new node"; LL#16:
  "a new node %B5". The pass does not build that node yet. It reports the rule `unsupported`. It
  never drops the group and never leaves the link end unbound. `%new` is not such an index.
- Right sides unsupported at issue 194. A rule with one of these shapes is retired with an
  `unsupported` entry when its left side matches:

| Shape | Rules |
|---|---|
| Merge, `%x&%y` | 21, 22, 24, 25, 37 |
| A group that makes a node from a literal, `[and]`, `":"`, `[[00]]` | 16, 17, 27, 28, 31 to 36 |
| Movement inside a deep tree | 77, 78, 79 |
| Two link terms on the left, or a nested rewrite | 178, 179, 180 |
| A group or a link end with an index the left side does not bind | 77, 78, 79 (`%e`) |

- Left sides unsupported at issue 194. A rule with one of these tests is retired with an
  `unsupported` entry at its first place that is not false:

| Test the pass cannot read | Rules |
|---|---|
| A quoted regex, `"/.../"` | 26, 31 |
| A UW, `[[...]]` | 31 |
| A label regex outside the subset under "Matching" | none in eng |
| A rule text that does not parse | none in eng |

- Rules 29 and 30 are supported: their quoted `":"` is a surface test, and their right sides
  edit nodes only. Rule 31 is in both tables. Its right side builds a literal node.

### Hand-over

- The hand-over sits between disambiguation and the tree pass. `make_forest` takes the
  disambiguated list, not `analyse()`'s output. `RuleInterpreter::analyse_tree` then runs every
  analysis rule over the forest it returns.
- `analyse()` keeps issue 22's contract for its own single-rule tests. Issue 180 moves
  `Engine::translate` from `analyse()` to `make_forest` and `analyse_tree`. It copies every link
  whose label is a UNL relation into `Graph::relations`.
- `TraceEntry` gains `event`, default `TraceEvent::fired`, so `TraceEntry{rule.id}` keeps its
  meaning. This changes `engine/include/verstaan/engine.hpp`; this ADR is the record
  `engine/CLAUDE.md` asks for.
- `analyse_tree` returns `Status::ok` when the pass runs to its end, `capped` and `unsupported`
  entries included. It returns `Status::no_parse` only for a forest that fails the check under
  "A forest the pass can read". The `Status` enum keeps its four members.

## Rejected

| Option | Why not |
|---|---|
| Sweep order | Rule 54 takes the article before rule 12 can. A08 keeps `a` as a node, `book` loses `@indef`, and rule 176 writes `mod(book;a)`. The corpus holds neither. |
| A link label follows its hyper-node's `XB`/`XP` feature | Rule 62 would rename the `NB` link `NP` without naming it, against CONSERVATION. Every adjective on a bare noun bar would then read as a specifier, `NS`, against `Syntactic_relations.wikitext` ("adjunct to the head of a nominal phrase (NA): [beautiful] table"). It reaches the same A08 graph, through rule 176. |
| A flat pass for rules 1 to 37, then a tree pass | Rule 12 never sees a noun bar. A08 fails as in the sweep order. |
| Arena order for a one-node pattern | A hyper-node goes after `STAIL` in the arena, so a word to its right is matched first. PRIORITY says "left to right (in case of lists)". |
| A new `Status` member for a broken forest | SPEC.md §3.4 fixes `Status` at four members, and every caller switches on them. `no_parse` already says the engine has no reading. |
| Read a quoted string as a tag | `<STRING>` is its own description in the formal syntax. Read as a tag, rules 29 and 30 never match and rule 26's negation always holds. |
| Treat an unreadable test as false, or as true | As false, rule 26's `^"/.../"` holds on every `TIME` node, and the rule rewrites any time to `TEMP`. As true, rule 26 never matches and the trace says nothing. Both are guesses. |

## Consequences

- A08 and A11 reach the corpus graph through rules 70, 60, 71, 61, 72, 50, 12, 62, 80, 82, 100
  and 172. The `mod` edge comes from rule 172, `NA(%x;%y):=mod(%x;%y)`. Rule 176 never fires on
  either row. The owner amended issue 194 on 2026-10-27 to name rule 172 and accepted this order.
- The article never becomes a graph node. Issue 180's closed-class test can pass.
- Every firing starts a new scan from rule 1. The cost is the number of firings times the number
  of rules times the forest size. That is small for runtime tables. The compiler may index rules
  by their first tag later, and must keep this order (ADR 0007).
- The equivalence tests compare traces, so `capped` and `unsupported` entries are part of the
  output both back ends must agree on. The generated back end must evaluate the three values the
  same way.
- The first sentence whose tree matches rule 77, 78 or 79 retires that rule as unsupported. The
  owner sees `unsupported` in its trace. The first verb row (B1) adds them.
- The first sentence with a `TIME` node retires rule 26, and the first with a `SECOND`, `MINUTE`
  or `HOUR` node retires rule 31. Time expressions need a regex reader and a literal
  node builder. No fixed-set row has one.
- Visit order and link order give the same trace as arena order and graph order on every
  fixed-set row. They part when a one-node rule matches two nodes and one is a hyper-node, or a
  link rule matches links in nested hyper-nodes. Rows T42 to T46 tell them apart.
- `both books`, corpus line 20, makes rules 1 and 177 undo each other until both reach the cap.
  The data lacks a `^@both` guard on rule 1. Issue 180 owns that row; its file holds the note.
