---
issue: 194
title: "Tree interpreter for analysis rules, run in the archive's order, with its ADR"
milestone: M3
status: open
depends_on: [22, 184]
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: xhigh
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

`RuleInterpreter::analyse` (issue 22) makes one left-to-right pass per rule over a flat node
list. It can add attributes, merge two nodes and delete a node. It cannot build a tree. Rules 38
to 79 of `data/languages/eng/grammar/analysis.yaml` build tree links: rule 50 folds an adjective
phrase into a noun bar, `NB(%nb,+proj;%jp,+adjt,+proj)`. Rules 80 to 176 then read those trees
and write relations: rule 176 turns `/[ACDIJNP]S/(%x;%y)` into `mod(%x;%y)`. The one-pass
interpreter never reaches rule 176, because rule 50's output does not exist. Issue 180's
rule-author pass stopped on this on 2026-09-28 as blocker B3. The owner chose the split on
2026-10-27, flight plan answer D1: "tree interpreter + ADR (B3), before 180."

After this quest, the engine holds a tree interpreter for the archive's tree rules. It runs them
in the archive's order: repeat a rule while it matches, then move on, until no rule applies. A
new ADR under `docs/adr/` records that order, the node shape, and where the flat pass ends and
the tree pass starts. The loadout runs one step above the rule-author's default, at `xhigh`,
because this quest designs engine core and changes `engine/include/`.

## Acceptance criteria

- `docs/adr/NNNN-*.md`, the next free number, states the run order, the tree node shape and the
  hand-over from `analyse` to the tree pass. Its title is the decision.
- `194-test-cases.md` lists, for A08 and A11, each tree rule that fires, in order, with the tree
  after each firing.
- A GoogleTest case feeds A08 through the analysis passes and finds the `NB` link rule 50 builds.
- The same test finds rule 176's `mod` edge in the interpreter's output, before `Engine::translate`
  copies anything into `Graph::relations`.
- A rule that still matches its own output stops at a fixed iteration cap and appends a
  `TraceEntry` naming the rule. It never loops forever.
- `ctest -L fast` passes. `python -m tools.validate --changed` exits 0.

## Not in scope

Writing relations into `Result::unl` and the closed-class negative test: issue 180. Relations
other than `mod`: issue 198. English disambiguation rules: issue 195. Name literals: issue 196.
Scoped relations (`and:01`): issue 197. Tree generation for Afrikaans: issue 181.

## Done when

- [ ] The ADR exists and names the run order and the node shape.
- [ ] `194-test-cases.md` traces A08 and A11 rule by rule.
- [ ] The tree interpreter runs rules 38 to 176 in the archive's order.
- [ ] A test finds rule 176's `mod` edge for A08.
- [ ] A self-matching rule stops at the cap with a trace entry.
- [ ] `ctest -L fast` and `python -m tools.validate --changed` are green.
