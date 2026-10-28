---
issue: 196
title: "A capitalised name with no dictionary entry enters the graph as a quoted literal"
milestone: M3
status: in-progress
depends_on: [19, 20]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: .worktrees/m3-196-name-literals
github_issue: 304
---
## What

The lookup (issue 20) resolves a token against the dictionary and nothing else. `Mary` and
`Geneva` are in no English shard. `john` is in `j.yaml` as a common noun, so `John` resolves to
the wrong concept. The fixed set expects names to enter the graph as quoted UNL literals, `"John"`
and `"Mary"` (issue 24, row A13). Issue 180's rule-author pass stopped on this on 2026-09-28 as
blocker B5. The owner chose the split on 2026-10-27, flight plan answer D1: "name literals (B5),
before 180."

After this quest, a capitalised token that is not sentence-initial, or that has no lower-case
dictionary hit, becomes a literal node: its `uw` is the quoted surface form. A capitalised token
takes the literal reading over a lower-case common-noun hit. A sentence-initial capital with a
real dictionary hit, such as `The`, still resolves through the dictionary.

## Acceptance criteria

- `John` and `Mary` in A13 each produce a node whose `uw` is `"John"` and `"Mary"`.
- `Geneva` in A09 produces `"Geneva"`, and the row keeps `Status::partial` from its Afrikaans side.
- `The` at the start of a sentence still resolves to the closed-class record issue 184 imports.
- A lower-case `john` still resolves to the common noun.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

The `and` relation between the two names: issue 198. Multi-word names, such as `New York`.
Afrikaans generation of a literal: issue 181.

## Done when

- [ ] A13's names enter the graph as quoted literals.
- [ ] A09's `Geneva` enters as a literal.
- [ ] Sentence-initial `The` and lower-case `john` still resolve through the dictionary.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
