---
issue: 197
title: "ADR: how the UNL graph holds a scope, so A14 and A15 can carry and:01"
milestone: M3
status: in-progress
depends_on: [12]
agent: docs-writer
agents: [docs-writer]
model: sonnet
effort: low
checkpoint: null
commit: null
worktree: .worktrees/m3-197-scopes-adr
github_issue: 305
---
## What

`Relation` in `engine/include/verstaan/engine.hpp` holds a label and two node indices. It has no
scope. A14, `a car, a book and a mug`, needs a scoped graph, `and:01`, to hold three conjuncts.
A15 needs one for `pictures and photos`. A scope cannot be added without changing the public
header, and a header change needs an ADR first. Issue 180's rule-author pass stopped on this on
2026-09-28 as blocker B4. The owner chose the split on 2026-10-27, flight plan answer D1: "scopes
ADR only, with A14/A15 deferred."

After this quest, `docs/adr/` holds one ADR that decides how a graph holds a scope: the scope id
on a relation, the scope node, or a nested graph. It cites the scope rules in
`docs/unl-reference/spec/universal-relations.md` and states the header change it implies. No
code changes. A14 and A15 stay out of every exact-match test until a later quest builds the
scope this ADR decides.

## Acceptance criteria

- `docs/adr/NNNN-*.md`, the next free number, names the decision in its title.
- The ADR shows A14's graph written in the chosen shape, edge by edge.
- The ADR lists each option it rejected, with the reason.
- The ADR names the fields `engine.hpp` gains and states that no code lands with it.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The header change and the code that builds scoped relations: a later quest, written once this
ADR is accepted. Tests for A14 and A15. The tree interpreter: issue 194.

## Done when

- [x] The ADR exists under `docs/adr/` with A14 worked through.
- [x] Rejected options carry their reasons.
- [x] The header change is named and no code changes.
- [x] `python -m tools.validate --changed` is green.
