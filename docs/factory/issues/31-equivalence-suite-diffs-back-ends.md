---
issue: 31
title: "The equivalence suite diffs both back ends"
milestone: M4
status: open
depends_on: [30, 201, 207, 208]
agent: test-writer
agents: [test-writer, implementer]
model: sonnet
effort: medium
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

ADR 0007 says `tests/equivalence/` runs every corpus sentence through both back ends and diffs
the text, the UNL graph and the rule trace. SPEC §3.4 says the same, and this quest checks it
does. Today `tests/equivalence/placeholder_test.cpp` is `int main() { return 0; }`, so the claim
that two back ends agree is untested.

This quest waits on 201, 207 and 208 so the graph shape and the status rules settle before two
back ends pin them. After it, each ugoa1 corpus sentence (248 in each language) runs through the
runtime back end and the generated back end of the tier quest 27's ADR names. Any diff is a
finding, even where both back ends translate a sentence wrongly. The xxa/xxb pair also runs here.
The red proof comes first: hand-alter one generated table, see the suite fail, restore it, and
paste the failure in the hand-off.

## Acceptance criteria

- The placeholder is gone.
- All 248 eng sentences and the xxa/xxb rows are diffed under the label `equivalence`, on the tier
  quest 27's ADR names.
- The diff covers `text`, `unl` and `trace`, and SPEC §3.4 says so.
- The red proof is pasted in the hand-off.
- The hand-off states the suite time.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Fixing a sentence both back ends translate wrongly. File it as its own quest.

## Done when

- [ ] `placeholder_test.cpp` is gone.
- [ ] All 248 eng sentences and the xxa/xxb rows are diffed under label `equivalence`.
- [ ] The red proof is shown.
- [ ] The suite time is stated.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
