# 0019 — A graph node is a live forest node with a non-empty UW

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

The tree pass (ADR 0017) leaves a forest. Each forest node holds a word, features, a UW and links to
other nodes. The engine must turn that forest into the UNL graph that `Engine::translate` returns in `Result::unl`. Until issue
180, `Engine::translate` called the flat `analyse()`, which reads the word list and never sees tree
links. The links that the eng grammar writes, such as `mod`, `agt` and `obj`, never reached the graph.

Issue 180 needs a reader from forest to graph. It must decide which nodes are graph nodes and which
links are relations (`docs/factory/issues/180-test-cases.md`, "The design these rows test").

## Decision

1. **New public function.** `read_graph(const Forest&, Graph&)` in
   `engine/include/verstaan/rule_interpreter.hpp` reads a forest into a graph. `kUwFeatureKey` moves
   to that header so the reader and the tree pass share it.
2. **A graph node is a live forest node with a non-empty UW.** These are not nodes: closed-class
   words with no UW, sentinels, hyper-nodes, deleted nodes, and words with no dictionary entry.
   Unknown words still report through `partial` and the `⟦word⟧` mark. Issue 183 may revisit this.
3. **A link is a UNL relation when its label starts with a lower-case letter and both ends are graph
   nodes.** Scene, row A11, `the beautiful car`: `the` is a closed-class word with no UW. It folds into `car` as
   `@def` and is no node. The graph is `mod(car;beautiful)`, as in the corpus
   (`data/languages/eng/corpus/ugoa1.yaml:626-627`, `mod(102958343.@def, 300217728)`).
4. **The closed 2010 relation list is rejected as the test.** The eng grammar also writes `to`, `scn`,
   `plf`, `plt`, `frm`, `cob`, `cag` and `adr`. A closed list would drop real edges the grammar meant.
5. **Links that end on a hyper-node wait for issue 197 (scopes).** This costs A12 its `mod(car;…)`
   edge for now.
6. **The trace names the building rule by position.** `Relation` gets no rule-id field.
7. **`Engine::translate` runs `make_forest` → `analyse_tree` → `read_graph`** in place of the flat
   `analyse()`.

## Consequences

- Tree-pass links now reach the graph, and `translate` returns them.
- The lower-case test is a convention, not a check against the relation list. A grammar typo such as
  `Mod` is silently not a relation. A later lint may flag it.
- A word with no dictionary entry has no node, so relations to it are absent until issue 183 decides.
- A12 stays one edge short until issue 197 lands.
- Input made only of closed-class words (`a`, `the the the`, `.`) now returns status `ok` with an
  empty graph. The flat path gave empty-UW nodes. Issue 181's generator will receive an empty graph
  marked `ok`. The owner may rule `ok` against `no_parse` later.
- No `Relation` layout change, so callers and generated data stay as they are.
