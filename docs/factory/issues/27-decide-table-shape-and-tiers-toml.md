---
issue: 27
title: "Decide the generated table shape and write tiers.toml"
milestone: M4
status: open
depends_on: []
agent: rule-author
agents: [rule-author]
model: opus
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

The compiler is a skeleton (`tools/compiler/cli.py`). `Engine::generated` is a stub
(`engine/src/engine.cpp:20`). `tiers.toml` does not exist. `engine/generated/fixture/` is a
hand-written stand-in for compiler output. Nothing says what a generated table holds, which words
a tier keeps, or what a pull request compiles. Quest 29 cannot write a compiler until those are
decided, and quest 30 cannot load a table nobody has shaped.

After this quest, one ADR (the next free number after 0027) records six decisions, `tiers.toml`
exists, and `27-test-cases.md` holds the table that quests 29 and 30 turn into tests. Both quests
name that file in their acceptance criteria. The six decisions:

- **Tables or generated code.** ADR 0007 makes the interpreter the reference and says the compiler
  reproduces it. The choice is rule text in tables, run by the same interpreter, against rule code
  generated per rule. The ADR names the cost of each against ADR 0007's identical-trace demand.
- **Top-N selection.** SPEC §7 says top-N by frequency. `frequency` in the store is one byte. In
  eng, 377,534 of about 576,885 entries sit at 1, and 1,257 sit at the cap of 255. In afr, 11,497
  sit at 2 and 10,701 at 4. Ties are the normal case, so the ADR names a deterministic tie-break,
  and says how a fixed-set word cannot fall out of the basic tier.
- **What a pull request compiles.** The English store takes about 5 minutes to validate in Python.
  A pull request compiles the xxa/xxb pair (quest 28). The real stores compile only on a branch
  that changes data or the compiler, in a `data` job. This follows the 2026-09-16 brief,
  `docs/decisions/2026-09-16-engine-test-data/brief.html`, and the written "no" on carved fixtures
  under issue 188's `## Verifier`.
- **Which tiers are committed.** ADR 0003 commits generated output. The rule-author measures the
  size of each tier's output, or estimates it from a slice and says so. The ADR says which tiers
  go in git, and how an uncommitted tier gets built on a clean checkout.
- **What "no allocation after load" covers.** `Result` returns by value with `std::string` and
  vectors. The ADR says whether `Result` changes, or the claim covers the tables only. SPEC §3.4
  follows.
- **What the equivalence suite compares.** `basic` holds only top-N words, and the runtime back
  end reads the full store. The ADR names the tier the suite compares against runtime tables, and
  why the diff is fair.

The checkpoint is 4 because the ADR sets how much the repository grows.

## Acceptance criteria

- The ADR exists with status `Proposed`, and the owner has accepted it before this issue closes.
- `tiers.toml` names the three tiers, their languages, N, and the budgets from SPEC §7.
- A pytest parses `tiers.toml` and checks those keys.
- `27-test-cases.md` holds a table of cases, each one a store slice and the table or output it
  must give. Quests 29 and 30 turn it into tests.
- SPEC §3.4, §3.5 and §7 match the ADR.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Writing the compiler: quest 29. Loading the tables: quest 30. Measuring memory: quest 32.

## Done when

- [ ] The ADR is accepted by the owner.
- [ ] `tiers.toml` parses in a pytest.
- [ ] `27-test-cases.md` is written.
- [ ] SPEC §3.4, §3.5 and §7 match the ADR.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
