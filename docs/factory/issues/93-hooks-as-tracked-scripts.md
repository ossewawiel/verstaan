---
issue: 93
title: "Hooks as tracked scripts: logic under tools/factory/hooks/, one-line wrappers under .claude/"
milestone: Side
status: in-progress
depends_on: [6]
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: null
commit: d0e0091
worktree: .worktrees/side-93-hooks-as-tracked-scripts
github_issue: null
---
## What

Issue 06's checkpoint moved `require-gate.sh`'s logic into `tools/factory/hooks/require_gate.sh`
with tests, leaving `.claude/hooks/require-gate.sh` as a one-line `exec`. Do the same for the
other hooks: `gate-fast.sh`, `fast-format.sh`, `capture-failure.sh`, `refresh-console.sh`,
`_env.sh`. Two reasons. Edits under `.claude/hooks/` are refused to agents by the permission
classifier, and that is the right default: a hook is the thing that checks the agent, so the agent
must not rewrite it. And a hook under `.claude/` has no tests today; none of them has ever been
proven to fail. A wrapper of five lines that never changes is a small surface to guard by hand;
the logic beside it gets pytest like every other tool.

## Acceptance criteria

- Every hook under `.claude/hooks/` is a wrapper of at most six lines that `exec`s a script of
  the same name under `tools/factory/hooks/`. The wrapper carries the tier/trigger comment only.
- Each moved script has a pytest module under `tools/factory/tests/` that runs it the way Claude
  Code does (JSON on stdin, exit code observed) and includes at least one case per exit-2 path,
  written to fail first (`docs/standards/testing.md`).
- `gate-fast.sh`'s `stop_hook_active` guard is covered by a test: without it the hook loops.
- `docs/factory/git-workflow.md` and `docs/factory/playbook.md` say where hook logic lives and
  that the wrappers are hand-edited only.
- `ruff` and the licence-header check pass on the moved scripts.

## Not in scope

Changing what any hook does. Same inputs, same exit codes, same messages.

## Done when

- [x] `ls .claude/hooks/*.sh | xargs wc -l` shows no file over six lines.
- [x] `python -m pytest tools/factory/` green, with a fail-first case per hook.
- [x] The developer has applied the wrapper diffs by hand and says so in the close commit.
