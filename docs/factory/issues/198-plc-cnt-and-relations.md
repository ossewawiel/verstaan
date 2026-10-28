---
issue: 198
title: "The plc, cnt and and relations on A07, A09 and A13"
milestone: M3
status: in-progress
depends_on: [180, 195, 196]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: null
commit: null
worktree: .worktrees/m3-198-plc-cnt-and-relations
github_issue: 306
---
## What

Issue 180 writes the first relation, `mod`, into `Graph::relations`, on A08 and A11. Three more
relation kinds in the fixed set have no quest after the 2026-10-27 split: `plc` on A07, `cnt` on
A09, and `and` on A13. The tree interpreter from issue 194 already runs the rules that build
them. No test checks that it does, and A07 and A09 need issue 195's preposition readings first.
The owner chose to give them their own quest on 2026-10-27, while writing the split.

After this quest, `Result::unl.relations` holds `plc(book;box)` for A07, `cnt(book;"Geneva")` for
A09 and `and("Mary";"John")` for A13, each with the rule id in `Trace`. If a row needs a rule the
store lacks, the rule-author pass writes it here, with a test sentence.

## Acceptance criteria

- `Engine::translate` with `Options{Lang::eng, Lang::afr}` returns the relation above for each of
  A07, A09 and A13, and no other relation for those rows.
- `Result::trace` names the rule that built each relation.
- A must-not-fire test per relation: A08 carries no `plc`, A07 no `cnt`, and A13 carries exactly
  one `and`, not two.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

`and` with three conjuncts, A14, and every relation on A15: they need the scope issue 197
decides. `agt` and `obj`: no fixed-set row has a verb yet (blocker B1). Afrikaans generation:
issue 181.

## Done when

- [ ] A07, A09 and A13 each carry their one relation in `Result::unl`.
- [ ] Each relation's rule id appears in `Result::trace`.
- [ ] Must-not-fire tests pass for all three relations.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
