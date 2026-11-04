# 0026 — A relation carries its scope id and the graph lists its scopes

Date: 2026-10-29 · Status: Accepted (owner, 2026-11-04, as amended)

## Context

`Relation` in `engine/include/verstaan/engine.hpp` holds a label and two node indices. It has no
scope. `docs/unl-reference/spec/universal-relations.md` writes a relation as
`<rel>:<scope>(<source>, <target>)`. A scope id after the label, as in `agt:01(kill, Peter)`, puts
the relation in a named sub-graph. A relation with no id sits in the main scope, `:00`.

Row A14, `a car, a book and a mug`, has three conjuncts. Row A15, `pictures and photos`, needs a
scope for the same reason. Issue 180's rule-author pass stopped on this on 2026-09-28 (blocker B4).
The owner split the work on 2026-10-27 (flight plan D1): this ADR first, A14 and A15 deferred.
The forest already holds the scope. Each `Link` in `rule_interpreter.hpp` has `std::size_t scope`,
the index of the hyper-node that holds the link. The tree pass sets it (the T-rule SCOPE), and
generation reads it (`scope_of`, ADR 0021). Only the `Graph` loses it. `read_graph` (ADR 0019)
skips a link that ends on a hyper-node and copies no `scope` for the rest. So `and:01(car, book)`
and `and(car, book)` read as the same relation, and two conjunctions in one graph cannot be told
apart. The graph-to-forest step in generation has no scope to restore.

A change to `engine.hpp` needs an ADR (`engine/CLAUDE.md`). This is that ADR.

The corpus also uses a scope as an argument. Row A14 is `and(car, :01) and:01(book, mug)`. A15 holds
`mod(book, :01.@without)`, an attribute on a scope. Other corpus rows hold `and(:01, :02)`,
with a scope at both ends. 17 corpus lines take this shape, so a relation that ends only on nodes
cannot carry them. The first draft of this ADR missed this. A check against the corpus on 2026-11-04
found it, and the owner accepted the amended text.

## Decision

A relation carries its scope id, and either end of a relation may name a scope. The graph lists its
scopes, and a scope may carry attributes.

- `Relation` gains three `std::uint16_t` fields, each zero by default. `scope` is the scope the
  relation sits in, and zero is the main scope, `:00`. `from_scope`, when not zero, says the `from`
  end is that scope, and `from` is then unused. `to_scope` does the same for `to`. A default-built
  `Relation` keeps today's meaning, so no existing caller changes.
- `Graph` gains `std::vector<Scope> scopes;`, with `struct Scope { std::uint16_t id = 0;
  std::size_t entry = 0; std::vector<std::string> attributes; };`. `entry` indexes `Graph::nodes`
  and names the scope's head node. `attributes` holds what the corpus writes on the scope, such as
  `@without` in `:01.@without`.
- A scope id in `scopes` is unique and non-zero. Scope `:00` is implicit and never listed.
- Forest to graph: `read_graph` gives each non-root hyper-node that holds a link a scope id, 1, 2,
  and so on, in first-seen link order. The root hyper-node maps to 0. A link that ends on a
  hyper-node sets `from_scope` or `to_scope`, and is no longer skipped. `Scope::entry` is the graph
  node of the hyper-node's head, the node the forest links as that hyper-node's head.
- Graph to forest: generation makes one hyper-node per listed scope, puts the `entry` node under it
  as head, and sets `Link::scope` on each relation to that hyper-node. A scope end links to that
  hyper-node. Scope 0 maps to the root.
- Printing a relation writes `label:NN` when `scope` is not zero. A scope end prints `:NN`, followed
  by its attributes, in place of a node.
- Scopes nest by pointing at each other. No nested structure exists, and no special case is needed.

| Row | UNL text | Relations |
|---|---|---|
| A14 | `and(car, :01) and:01(book, mug)` | `{and, from car, to_scope 1}`, `{and, scope 1, book, mug}` |
| A15, last part | `mod(book, :01.@without) and:01(pictures, photos)` | `{mod, from book, to_scope 1}`, `{and, scope 1, pictures, photos}`; scope 1 holds `@without` |
| John, Mary, Peter | `and("John", :01) and:01("Mary", :02) and:02("Peter", :03)` | Each scope's relation ends on the next scope |
| Both ends | `and(:01, :02)` | `{and, from_scope 1, to_scope 2}` |

Generation walks these as they stand. The comma after `car` and the `en` before `mug` are generation
rules, which quest 201 writes for A14.

## Rejected

| Option | Why not |
|---|---|
| A chain in one scope: `and:01(car, book)`, `and:01(book, mug)` | The first draft of this ADR. It does not match the corpus, which writes `and(car, :01)`. Issue 201 requires the corpus graph. It also leaves no place for `:01.@without` or `and(:01, :02)`. |
| A scope node: copy the forest's hyper-node into `nodes`, joined by relations | ADR 0019 removes hyper-nodes from graph nodes, and every graph node has a non-empty UW. The archive text puts the id on the label, so a node needs a rewrite on read and write. The forest keeps its hyper-nodes; the graph records only the id. |
| A nested graph: `Node` or `Relation` owns a child `Graph` | Scopes share nodes with the main graph (`book` above serves two edges). A child graph copies or re-indexes them. Every walk needs a recursion. |
| Encode the id in the label string, `"and:01"` | Every rule that matches `and` must strip the suffix. The id is data, not text. |
| Do nothing, flatten to `and(car, book)`, `and(book, mug)` | Two conjunctions in one graph then cannot be told apart. A14 and A15 stay out of reach, which is blocker B4. |

## Consequences

- **No code lands with this ADR.** The header change, the analysis code that reads `:NN`, and the
  generation code that walks a scope are a later quest, written once the owner accepts this ADR.
- A14 and A15 stay out of every exact-match test until that quest ships.
- The tree interpreter (issue 194) and the relation rules (issue 198) are untouched.
- `Relation` grows from 48 to 56 bytes on a 64-bit build: 48 + 3 x 2 = 54, padded to 56. A graph
  holds tens of relations, so this costs nothing measurable.
- The first draft's open question, what `entry` names for a scope inside a scope, is closed. `entry`
  always names a node. A scope reaches another scope through `from_scope` or `to_scope`.
