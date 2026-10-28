# 0021 — Generation runs generation.yaml as one first-match loop over the UNL graph

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

Issue 181 asks `Engine::translate` to turn the UNL graph of issue 180 into Afrikaans through "the
`NN → NT → TT → TL` passes `generation.yaml` encodes". The file holds 234 rules after issue 181's
rule `234`. No record names its pass. The file order is the pass order:

| Rules | Shape | Section |
|---|---|---|
| 1 to 34, 234 | relation on the left: `mod(%x,N;%y,J)`, `plc(...)`, `and(%x;%y)` | arborisation of the network (NT, and NL for `and`/`or`) |
| 35 to 61 | one node or a word window on the left: `(%x,N,@def)`, `(D,%d)(BLK)([alle])...` | attribute rules and list post-editing |
| 62 to 150 | link terms on the left | default grammar, arborisation and transformation (TT) |
| 151 to 226 | link on the left, a word list on the right | default grammar, linearisation (TL) |
| 227 | `(%x,^inflected,FLX)` | morphological generation |
| 228 to 233 | list patterns | post-processing: scopes, blanks, commas |

`data/archive/exports/afr/unl_nl_tgrammar.txt` heads rules 62 to 233 with exactly these sections.
The wiki loads grammars in order and applies one rule list: "Rules are applied serially, according
to the order defined in the grammar" (`data/archive/wiki/T-rule.wikitext`, PRIORITY).

ADR 0017 runs `analysis.yaml` the same way. Its tree pass cannot apply most generation right sides.
It retires as `unsupported` a nested link in a link end (rules 1 to 32 build `PC(...)` inside
`XA(...)`), a node made from a literal (`[die]`, `" "`), and two link terms on the left (rules 65 to
69, the arborisation core). It has no right side that turns a link into words (rules 151 to 226).

## Decision

### Run order

- `RuleInterpreter::generate` runs every rule of `generation()` as one loop over one forest, with
  ADR 0017's run order unchanged: the first rule in file order whose left side matches fires once,
  at its first match, then the scan starts again. The cap, the three-valued matching and the
  `unsupported` retirement are ADR 0017's.
- No pass identifier is added to the data. The file order is the pass order.

### The starting forest

- Arena: `SHEAD`, one word node per graph node in graph order, `STAIL`, then one hyper-node `R`.
- Every relation becomes a link, label as written (`mod`, `plc`), head `from`, dependent `to`, scope
  `R`.
- `Forest::list` is `SHEAD`, every root in graph order, `STAIL`. A root is a graph node that no
  relation names as its dependent. When every node is a dependent, graph node 0 is the root.
  One exception (amended 2026-10-28): under `mod` only, a quoted name that heads a plain word does
  not count as a root, and the word does. The analysis builds `mod("Geneva" → book)` for
  `book Geneva`, with the name as head. Under every other label the definition stands:
  `and("John" → book)` for `the book and John` keeps `"John"` as the root. Which way the analysis
  should write that `mod` edge is issue 199's.
- A word node's surface, features and UW come from lexical choice (ADR 0023). Its attributes are the
  graph node's. When its entry carries `PAR` and `to_inflection()` holds that paradigm, the node
  also carries `{FLX, <paradigm>}`. `docs/unl-reference/formats/default-grammar.md`: rule 227 runs
  "a paradigm's PAR=Mxx rules copied onto the entry during generation".
- A name literal (`"John"`) and a node with no target entry are ADR 0025's.

### Right sides the generation pass adds

1. **A link term in a link end**, `XA(%x;PC([in],...;%y,...),+BEF)`, makes a hyper-node that holds
   the inner link. The end's edits (`+BEF`) go to the hyper-node. Its head is the inner link's head.
   It takes its head's `LEX`.
2. **A literal**: `[w]` makes a new word node (ADR 0022). `"w"` makes a new node whose surface is
   `w` (rules 60, 231).
3. **A group around one link term whose head is the left side's node** (rules 35 to 42, 50 to 52):
   the link goes into the scope of that node, and the group's edits go to that node. No hyper-node
   is made. The scope of a node is the scope of the first link, in link order, that names it; `R`
   when no link names it.
4. **Two link terms on the left, one nested link on the right** (rules 65 to 69, 102 to 104, 108 to
   110, 114 to 116, 120 to 122, 126 to 128, 132 to 134, 138 to 140, 144 to 146): the right-side
   inner link is the left-side term with the same label and the same captures. It moves into a new
   hyper-node `H`. The other term becomes the outer link, relabelled in its place and scope, with
   `H` as its head. `H` takes the shared head's `LEX`. `H` replaces the shared head in every other
   link end and in `Forest::list`. Two link terms on one left side match two different links:
   rule 66, `XB(%x;%y)XB(%x;%z)`, never matches one `XB` link twice.
5. **A link on the left, a word list on the right** (rules 151 to 226): the link is removed. The
   order goes onto the head's span. `(%y)(%x)` puts the dependent before the head's span;
   `(%x)(%y)` puts it after. A span starts as the head alone. The edits apply to the nodes named.
6. **A link on the left, one group holding a word list on the right** (rules 33, 34): a new node
   `C` holds the list as its span. The link is removed. The group's edits go to `C`. `C` replaces
   the link's head in every other link end and in `Forest::list`.
7. **A list-node pattern**, `((%x)(%y))` (rules 228 to 230), matches a node of `Forest::list` whose
   span holds exactly that many items. The right side puts the items in its place. A word that is
   an item of its own span stands for itself, and its span is spent. A hyper-node with no span of
   its own stands for its head.
8. **`!K`** (rule 227) runs the inflection rule the node's `K` value names, through
   `RuleInterpreter::inflect` on `to_inflection()`. The branch is the first whose `&`-joined tags
   all hold on the node (`PLR` for `NUM=PLR`). The result replaces the surface.

### After the loop

- One `Position` per node of `Forest::list`, sentinels included. A word node's candidates are the
  node itself, then its lexical alternatives (ADR 0023). Every other node has one candidate.
- `disambiguate_target` runs `to_disambiguation()` over them. A word whose front candidate changes
  takes that candidate's headword as its surface.
- `text` joins the surfaces of `Forest::list`, sentinels left out. ADR 0025 appends the marks.
- Amended 2026-10-28: one blank goes between two adjacent top-level list items that rule 231 did
  not already separate. A graph with more than one root otherwise ran its words together:
  `all the books` gave `finaalboeke`.
- `RuleSet::load` reads `to_store_root`'s `grammar/disambiguation.yaml` into `to_disambiguation()`.
  `disambiguation()` stays the `from_store_root` file.

## Rejected

| Option | Why not |
|---|---|
| Classify each rule by shape and run NN, NT, TT, TL, LL as five passes | The file already orders them. Rules 35 to 61 mix shapes. ADR 0017 rejected the same split for analysis. |
| A group's hyper-node replaces its node (rules 35, 36) | A08 becomes `mooi 'n boek`. `NB(H;mooi)` with `DIS=BEF` puts `mooi` before the whole noun phrase. With the link beside `NA(boek;mooi)`, rule 67 nests the adjunct under the determiner. |
| A linearised link writes its words onto the link's scope | In A07, `PB(in;doos)` and `NP(doos;'n)` share one hyper-node. Both would write the same scope. |
| A hyper-node's tag test reads its head's features | ADR 0017 reads a node's own features only. Copying `LEX` at creation is the narrower change. Rule 99, `XP(%x,N;%y)`, needs it. |
| Run the disambiguation grammar before the loop | No word list exists yet. Every afr D-rule reads adjacent words. |

## Consequences

- `generate` needs `GenerationResult`, `disambiguate_target`, `RuleSet::to_disambiguation()` and a
  seven-list `RuleSet::from_rules`. Issue 181 adds them as stubs. These are additions; `Forest`,
  `TreeNode` and `Link` keep their shape. Spans and hyper-node heads stay inside
  `engine/src/generation.cpp`.
- Rule 227 fires on every noun with a paradigm, the singular too: `boek` takes M3's `SNG` branch on
  A01. Issue 24's coverage table reads A01 as a must-not row for afr-gen-227 and afr-inf-M3. Issue
  24 calls its rule ids a reading, and this table records the difference.
- Shapes still unsupported: the merge `&` (rule 61), a `+`-prefixed link right side (rules 43 to 49),
  `?` items (rules 2, 23, 43 to 49), three link terms out (rule 150). A sentence that reaches one
  gets its `unsupported` entry.
- A span of five or more items never flattens: rules 228 to 230 stop at four. Its words are
  appended, marked (ADR 0025).
- Analysis keeps its own loop. Nothing here changes `analyse_tree`.
