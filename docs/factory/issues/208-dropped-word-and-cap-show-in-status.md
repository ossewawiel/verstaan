---
issue: 208
title: "A word the pass drops, or a rule cap it hits, shows in the status"
milestone: Side
status: open
depends_on: []
agent: rule-author
agents: [rule-author, test-writer, implementer]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

Two silent losses return status `ok`. Finding F1: the tokens pass the dictionary, the forest
forms, and the graph is read back. ADR 0019 says a closed-class word has no UW, so it is no graph
node. If no rule folds the word into an attribute, nothing records it. `engine/src/engine.cpp:204-210`
collects surfaces only for nodes with a UW, `engine.cpp:216-224` marks only tokens with no entry,
and `engine/src/generation.cpp:1201` appends only unplaced graph nodes. ADR 0025 rejected this
outcome for graph nodes: "The text loses a word with no sign." ADR 0019 line 42 left `ok` against
`no_parse` for the owner, and no ruling exists.

A reader translates `a book without a car`. The result reads `'n boek 'n motor`, "a book, a car",
and `without` is gone. The exit code is 0.

```
$V "a book without a car"   exit=0  'n boek 'n motor
$V "a book but a car"       exit=0  'n boek 'n motor
$V "a book if a car"        exit=0  'n boek 'n motor
$V "a book for a car"       exit=0  'n boek 'n motor
$V "this book"              exit=0  boek
$V "every book"             exit=0  boek
$V "both books"             exit=0  boek
$V "."                      exit=0  (empty)
$V "and"                    exit=0  (empty)
$V "in the in the in the"   exit=0  (empty)
```

`because`, `although`, `unless`, `while`, `than`, `since` and `nor` give the same `'n boek 'n motor`.

Finding F5: `kTreePassRuleCap` is per rule, per pass, and `translate` runs the whole input as one
forest. After 1,024 firings the rule retires (`engine/src/tree_pass.cpp:519-522`,
`generation.cpp:930-933`) and `analyse_tree` still returns `ok` (`tree_pass.cpp:609`). ADR 0017
chose that status for the tree pass, so the sign shows only under `--trace`. A service sends a long
document as one call. Up to word 1,024 the plurals are right. After that they are singular. The
input `books` 1,100 times gives `boeke=1024` and `boek=76`, exit 0, with `1 capped, 72 capped,
afr-gen-56 capped, afr-gen-227 capped` visible only in the trace.

The rule-author brings the owner one proposal for how a dropped closed-class word and a capped
rule report. One ADR records the ruling. After this quest, each input above reports what the
ruling says.

The F5 input takes 152.2 s on a release build, and the Stop hook's target is 60 s. So its test uses
a smaller input or a lower cap, or carries a label other than `fast`. The hand-off states which.

## Owner rulings

The ruling is recorded here, with its date. Not yet ruled.

## Acceptance criteria

- The owner has ruled on how a dropped word and a hit cap report.
- The ADR is accepted.
- Each F1 input in the table above, and the seven named words, reports what the ruling says, in a
  test.
- The F5 case reports what the ruling says, in a test that fits the Stop hook's 60 s target or
  carries a label other than `fast`.
- SPEC §3.4 matches if `Status` changes.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Bounding the cost of long inputs: quest 212. Plural inflection: quest 209.

## Done when

- [ ] The owner has ruled.
- [ ] The ADR is accepted.
- [ ] Each F1 and F5 input reports what the ruling says, in a test.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
