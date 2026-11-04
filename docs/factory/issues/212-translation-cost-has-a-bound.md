---
issue: 212
title: "Translation cost has a bound"
milestone: Side
status: open
depends_on: [210]
agent: test-writer
agents: [test-writer, implementer]
model: sonnet
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: 338
---
## What

Each firing copies the whole forest (`engine/src/tree_pass.cpp:497`, `generation.cpp:791`) and
rescans from rule 1. ADR 0017 accepts this cost for runtime tables.
`collect_disambiguation_deletions` also enumerates every reading combination before it tests any
(`rule_interpreter.cpp:564-595`). `cut` has 224 readings, so a width-3 D-rule visits 224 cubed =
11,239,424 combinations per window. The `connected` tier takes text from a caller. Five thousand
repeats of `the`, about 20 KB, hold one core for over two minutes and return nothing.

```
"the" x 5000       exit=0  132.9 s  (empty text)
"books" x 400      exit=0   26.8 s
"cut" x 3          exit=2    0.78 s
"cut" x 60         exit=2   64.5 s
"xyzzy" x 20000    exit=2    0.8 s
one 120 KB token   exit=2    0.0 s
```

The runs were on this desktop in a release build, and the Pi will be slower. The effort is one step
above the test-writer's default because this is engine core. Quest 210 comes first because
`translate` reopens the dictionary on every call.

After this quest, every input above finishes in under 10 seconds on the release preset, or returns
a named status. The D-rule stops enumerating readings it can reject early, shown by a test that
counts the combinations visited for `cut` x 3. The long inputs carry a label other than `fast`. A
new status needs an ADR, and SPEC §3.4 matches if `Status` changes.

## Acceptance criteria

- Every input in the table finishes in under 10 seconds on the release preset, or returns a named
  status, in a test. The long inputs carry a label other than `fast`.
- A test counts the combinations the D-rule visits for `cut` x 3, and the count falls.
- SPEC §3.4 matches if `Status` changes.
- An ADR exists if a new status is added.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Reporting a capped rule in the status: quest 208. Running on a Pi: quest 205.

## Done when

- [ ] Every F8 input finishes in under 10 seconds on the release preset, or returns a named status, in a test.
- [ ] The D-rule stops enumerating readings it can reject early, shown by a combination-count test.
- [ ] An ADR records any new status.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
