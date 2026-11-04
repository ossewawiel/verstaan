---
issue: 210
title: "Engine::load reads the store once and reports a failure"
milestone: Side
status: open
depends_on: [28, 213]
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

`read_grammar_file` returns an empty list for a missing file (`engine/src/rule_interpreter.cpp:140-145`),
and the line reader skips what it cannot read, so random bytes give an empty list too.
`RuleSet::load` has no failure value (`rule_set.hpp:12-15`), and `Engine::load` has no failure path
(`engine.hpp:108`). `Engine::translate` runs with whatever arrived. A deployment copies
`data/languages/afr` and loses `generation.yaml`. Every article and plural vanishes from then on.
Each answer is exit 0 and looks like Afrikaans. An operator has nothing to alert on.

The verifier compiled `apps/cli/src/main.cpp` with `VERSTAAN_REPO_ROOT` set to a scratch tree and
damaged one file at a time (finding F4):

```
variant                                    input              result
afr/grammar/generation.yaml removed        the book           exit=0  boek
afr/grammar/generation.yaml removed        books              exit=0  boek
afr/grammar/generation.yaml empty          books              exit=0  boek
afr/grammar/generation.yaml 20 KB random   books              exit=0  boek
eng/grammar/analysis.yaml removed          a book in a box    exit=0  boek boks
eng/analysis.yaml cut with head -n 300     a book in a box    exit=0  boek boks
afr/grammar/inflection.yaml removed        books              exit=0  boek
both stores removed                        a book             exit=2  ⟦a⟧ ⟦book⟧
```

A second fault sits beside it (F9, F10.3, and finding F8's dictionary reopened per call).
`engine/CLAUDE.md:7` says "`src/` is the core. No I/O", yet `engine/src/dictionary_lookup.cpp:36`
and `rule_interpreter.cpp:34` open files with `std::ifstream`, `RuleSet` carries the store roots,
and `translate` reads shards on every call (`engine/src/engine.cpp:176`, `:211`). SPEC §3.4 says
the basic tier must not allocate after load, and today `load` reads no dictionary at all.

After this quest, a missing or corrupt grammar file is a load failure, and the CLI reports it with
its own exit code. `translate` opens no file. The change touches the public API, so one ADR
records it, and the ADR also settles where store reading lives. Today's 7-second suite relies on
reading one shard per lookup, so the hand-off states the suite time before and after. If `ctest -L fast` then passes the Stop hook's 60 s target, the carved-fixture "no" in issue 188 reopens, and the hand-off says so.

Quest 28 comes first because it changes `Engine::load` and `engine.hpp` too. Quest 213 comes first
because a count check needs its corrected `meta.yaml`. A cut on a record boundary is the hard case.
`analysis.yaml` is 1 + 183 x 7 = 1,282 lines, and `head -n 295` leaves 42 clean rules with no sign
of damage. Only the `meta.yaml` counts can catch it.

## Acceptance criteria

- Each row of the table above is a load failure the CLI reports with its own exit code, in a test
  per variant.
- `translate` opens no file, shown by a test.
- The ADR states where store reading lives, and is accepted.
- A store cut on a record boundary (`head -n 295` of `analysis.yaml`) is a load failure through the
  `meta.yaml` counts, in a test.
- `engine/CLAUDE.md:7` and the code agree on where I/O lives.
- SPEC §3.4 and §3.6 match the load failure and its exit code.
- The hand-off states the suite time before and after, and whether the 60 s target is passed.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

The validator's refusal of unreadable stores: quest 211. The cost bound: quest 212.

## Done when

- [ ] A missing or corrupt grammar file is a load failure, in a test per variant.
- [ ] The CLI reports a load failure with its own exit code.
- [ ] `translate` opens no file.
- [ ] `engine/CLAUDE.md:7` and the code agree on where I/O lives; SPEC §3.4 and §3.6 match.
- [ ] The ADR is accepted, and the suite time is stated before and after.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
