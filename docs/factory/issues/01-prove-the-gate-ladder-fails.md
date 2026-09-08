---
issue: 1
title: "Prove the gate ladder fails before trusting it"
milestone: M0
status: done
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 1
commit: 9bf3f3a
---
## What

The hooks in `.claude/hooks/` and `.claude/settings.json` were written before any build system
existed. Nothing has shown that they run, that they block, or that they log. This issue makes the
ladder real on a minimal repo: a CMake preset with one library target and one fast test, one
Python tool package with one pytest, and then breaks each gate on purpose.

## Acceptance criteria

- **`bash -n` passes on every hook script**, and each runs under Git Bash on this machine.
- **`gate-fast.sh` blocks.** A deliberately failing `fast` test makes the Stop hook exit 2 with the
  test output; restoring it makes the hook exit 0. Both runs recorded in the issue report.
- **`gate-fast.sh` logs.** The failing run appends one well-formed JSON line to
  `docs/factory/lessons.jsonl` with `sig: fast-tests-red` and `issue: 1`.
- **`require-gate.sh` blocks.** A `git merge` command with no stamp is refused; after writing the
  stamp by hand for HEAD on a clean tree it passes; a dirty tree refuses again. **Prove the guard fails.**
- **`fast-format.sh` formats** a deliberately mis-indented `.cpp` and a `.py` on write, and prints
  to stderr rather than failing when the formatter is missing.
- The `stop_hook_active` guard is the first thing `gate-fast.sh` checks. Shown by feeding it
  `{"stop_hook_active":true}` with a failing test present and getting exit 0.

## Not in scope

The real engine, any data. The library target may be an empty `verstaan_core` with one function.

## Done when

- [x] Every criterion above has a recorded failing run and a recorded passing run.
- [x] `docs/factory/README.md` gate table matches what actually runs.
- [x] The deliberately broken test and the hand-written stamp are removed before the commit.
