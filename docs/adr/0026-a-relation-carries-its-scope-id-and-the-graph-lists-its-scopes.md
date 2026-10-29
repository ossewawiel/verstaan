# 0026 — A relation carries its scope id and the graph lists its scopes

Date: 2026-10-29 · Status: Proposed (awaits owner acceptance)

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

## Decision

A relation carries its scope id. The graph lists its scopes.

- `Relation` gains `std::uint16_t scope = 0;`. Zero is the main scope, `:00`. A default-built
  `Relation` keeps today's meaning, so no existing caller changes.
- `Graph` gains `std::vector<Scope> scopes;`, with `struct Scope { std::uint16_t id = 0;
  std::size_t entry = 0; };`. `entry` indexes `Graph::nodes` and names the scope's head node, the
  one that other scopes and the main scope read as "the whole sub-graph".
- A scope id in `scopes` is unique and non-zero. Scope `:00` is implicit and never listed.
- Forest to graph: `read_graph` gives each non-root hyper-node that holds a link a scope id, 1, 2,
  and so on, in first-seen link order. The root hyper-node maps to 0. `Scope::entry` is the graph
  node of the hyper-node's head, the node the forest links as that hyper-node's head.
- Graph to forest: generation makes one hyper-node per listed scope, puts the `entry` node under it
  as head, and sets `Link::scope` on each relation to that hyper-node. Scope 0 maps to the root.
- Printing a relation writes `label:NN` when `scope` is not zero, and `label` when it is.

A14 in this shape, nodes `0 car`, `1 book`, `2 mug`, each with `@indef`:

| Edge | Label | Scope | From | To |
|---|---|---|---|---|
| 1 | `and` | 1 | 0 `car` | 1 `book` |
| 2 | `and` | 1 | 1 `book` | 2 `mug` |

`scopes = { {1, 0} }`. Node 0 also carries `@entry`. In UNL text: `and:01(car, book)` and
`and:01(book, mug)`. Generation walks scope 1 as one chain, so it can place the comma after `car`
and `en` before `mug`. A15 is the same shape with one edge, `and:01(picture, photo)`.

## Rejected

| Option | Why not |
|---|---|
| A scope node: copy the forest's hyper-node into `nodes`, joined by relations | ADR 0019 removes hyper-nodes from graph nodes, and every graph node has a non-empty UW. The archive text puts the id on the label, so a node needs a rewrite on read and write. The forest keeps its hyper-nodes; the graph records only the id. |
| A nested graph: `Node` or `Relation` owns a child `Graph` | Scopes share nodes with the main graph (`book` above serves two edges). A child graph copies or re-indexes them. Every walk needs a recursion. |
| Encode the id in the label string, `"and:01"` | Every rule that matches `and` must strip the suffix. The id is data, not text. |
| Do nothing, flatten to `and(car, book)`, `and(book, mug)` | Two conjunctions in one graph then cannot be told apart. A14 and A15 stay out of reach, which is blocker B4. |

## Consequences

- **No code lands with this ADR.** The header change, the analysis code that reads `:NN`, and the
  generation code that walks a scope are a later quest, written once the owner accepts this ADR.
- A14 and A15 stay out of every exact-match test until that quest ships.
- The tree interpreter (issue 194) and the relation rules (issue 198) are untouched.
- `Relation` grows from 48 to 56 bytes on a 64-bit build. A graph holds tens of relations, so this
  costs nothing measurable.
- Open for the rule-author: whether `entry` of a nested scope (a scope inside a scope) names a
  node or another scope. A14 and A15 need neither, so this ADR leaves it to the first sentence that does.
