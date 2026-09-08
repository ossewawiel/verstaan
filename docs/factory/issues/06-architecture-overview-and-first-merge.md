---
issue: 6
title: "Architecture overview, sub-tree CLAUDE.md files, and the first gated merge"
milestone: M0
status: open
depends_on: [2, 3, 4, 5]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: null
github_issue: 6
---
## What

Bring `docs/architecture/overview.md` and the three sub-tree `CLAUDE.md` files in line with what
M0 actually built, run `/factory-retro` once, run `/gate` for real, let the verifier read the
whole `m0-foundation` diff, and merge into `main`.

## Acceptance criteria

- `docs/architecture/overview.md` describes the targets, presets and packages that exist, with
  no forward references that are not marked "planned for M<n>".
- `engine/CLAUDE.md`, `tools/CLAUDE.md`, `data/CLAUDE.md` each under 40 lines and pointing to
  the standards file, not repeating it.
- `/gate` passes and writes the stamp. Its report lists every step with time.
- The verifier's report is attached to this issue file under `## Verifier`.
- `main` contains the merge commit; `STATE.md` shows M1 issue 07 as next.
- The merge runs from the `m0-foundation` worktree, and once it lands, that worktree is removed
  from the root tree: `git worktree remove .worktrees/m0-foundation && git branch -d m0-foundation`.

## Not in scope

Anything in M1.

## Done when

- [ ] Merge done with `--no-ff`, stamp verified by `require-gate.sh` allowing the merge.
- [ ] `lessons.jsonl` reviewed by `/factory-retro`; proposals recorded even if declined.
- [ ] `.worktrees/m0-foundation` removed and the branch deleted after the merge.
