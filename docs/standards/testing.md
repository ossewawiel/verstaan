# Testing

## Prove a gate fails before you trust it

**A gate is not proven by watching it pass.** A gate that can never fail also passes, and looks
identical from the outside. Before reporting any check as working: break the thing it checks,
run the check, watch it fail, restore, run it again. Report both runs. This applies to hooks,
CTest labels, validators, equivalence tests and the pull request stamp. Issue 01 exists to do
exactly this for the whole ladder.

## Test kinds

| Kind | Where | Label | Runs in |
|---|---|---|---|
| Engine unit | `tests/unit/` | `fast` | Stop hook, `/gate` |
| Golden sentences | `tests/golden/<tier>/` | `golden` | `/gate`; the fast subset in the Stop hook |
| Equivalence, runtime vs generated | `tests/equivalence/` | `equivalence` | `/gate` |
| Tier budget | `tests/tier/` | `tier` | `/gate`, M4 onward |
| Tooling | `tools/*/tests/` | pytest | Stop hook for changed tools, `/gate` all |
| Data validation | `tools/validate` | — | Stop hook for changed files, `/gate` all |

## Rules

- Tests are written before the implementation for engine core and rules. The `rule-author` writes
  the table; `test-writer` turns it into failing tests; `implementer` makes them pass. Stubs throw
  or return `Status::not_implemented`; a working body makes every test green the moment it is born.
- **Never derive expected values by running the code under test.** The golden text for a sentence
  comes from the owner or from the archive corpus, never from the engine.
- Golden files are plain text: `input ⇒ expected` one per line, with a `# source:` line above.
  A golden failure prints the diff and the rule trace.
- Domain tests are pure: no file I/O, no clock, no network, no environment. Fixture data lives in
  `tests/fixtures/` as a tiny language pair, `xxa` ⇄ `xxb`, invented for tests only.
- Never pipe a test command into `head`, `tail` or `grep` and then read the exit code.
- A tooling test that shells out spawns processes in the hundreds, and Windows sometimes refuses:
  exit `3221225794` (`0xC0000142`, STATUS_DLL_INIT_FAILED) from `git init` or any other spawned
  binary is the OS, not the test. Re-run before believing it. The same `tools/factory` suite that
  errored on 20 to 34 fixtures per run on Windows passes 84 tests in 5 s on Linux.
