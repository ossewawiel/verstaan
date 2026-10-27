---
issue: 180
title: "Write the mod relation into the UNL graph for A08 and A11"
milestone: M3
status: open
depends_on: [22, 184, 194, 195, 196]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 280
---
## What

`Graph::relations` is declared in `engine/include/verstaan/engine.hpp` and never written: no code
anywhere assigns to it. The implementer working issue 25 confirmed this by grep before stopping
issue 25. The first rule-author pass on this quest stopped on 2026-09-28 on five blockers, B1 to
B5. The owner split it on 2026-10-27, flight plan answer D1: "shrink 180 to mod on A08/A11, the
closed-class negative test and the rule id in Trace." Issue 194 builds the tree interpreter
(B3), issue 195 the English D-rules (B2), issue 196 the name literals (B5), and issue 197 the
scopes ADR (B4). Issue 198 takes `plc`, `cnt` and `and`.

After this quest, `Engine::translate` copies the `mod` edge the tree interpreter builds into
`Result::unl.relations` for A08, `a beautiful book`, and A11, `the beautiful car`. The rule that
built the edge appears in `Result::trace`. The closed-class words issue 184 imports fold into
attributes and never appear as graph nodes.

## Acceptance criteria

- `Engine::translate` with `Options{Lang::eng, Lang::afr}` returns exactly one relation for A08,
  `mod(book;beautiful)`, and one for A11, `mod(car;beautiful)`.
- Each `Relation` carries its label and the indices of the two nodes it joins.
- `Result::trace` names the rule that built each `mod` edge.
- A test shows no node in `Result::unl.nodes` for `the`, `a` or `of`, on A02, A08 and A11.
- A02, `the book`, returns no relation.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

`plc`, `cnt` and `and` on A07, A09 and A13: issue 198. A12's degree adverb on the modifier:
issue 181 checks it through generation. A14 and A15: they need the scope issue 197 decides.
`agt` and `obj`: no fixed-set row has a verb yet (B1). Generation into Afrikaans: issue 181.
Closing issue 25: issue 183.

## Done when

- [ ] `Result::unl.relations` holds the `mod` edge for A08 and A11.
- [ ] The building rule's id appears in `Result::trace` for each edge.
- [ ] The closed-class negative test passes.
- [ ] A02 returns no relation.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
