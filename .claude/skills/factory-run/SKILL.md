---
name: factory-run
description: Phase B of the Verstaan code factory. Regenerates STATE.md, picks the next open issue or a given one, routes it to the right subagents at the right model and effort, runs the gates, and stops at checkpoints. Use when /factory-run is invoked or when resuming work on docs/factory/issues/.
---

## Every run starts the same way

Run this from the root tree, on `main`. It never works there past step 6.

1. `git status --porcelain` in the root tree. Not empty → stop, show it, ask.
2. Run the `/factory-status` steps. Read the chosen issue file whole.
3. Check `depends_on` are all `status: done`. If not → stop and say which.
4. Check the chosen issue's `status`. If it is `in-progress` and `--resume` was not given, stop:
   report the issue number and the tree named in its `worktree:` field, and do not proceed. With
   `--resume`, continue in that same tree instead of creating a new one (skip step 6).
5. Work happens on a branch, never on `main`: the milestone branch from `docs/factory/PLAN.md` §7
   for a main-quest issue, or `side-NN-<slug>` for a side quest.
6. Create that branch's tree if it is not already checked out:
   `git worktree add .worktrees/<branch> <branch>` if the branch exists, else
   `git worktree add -b <branch> .worktrees/<branch> main`. From here on, every command in this
   skill runs with `.worktrees/<branch>` as the working directory, not the root tree.
7. In the worktree, edit the issue file: `status: in-progress`, `worktree: .worktrees/<branch>`.
   Leave this uncommitted; it lands in the work commit at the end. The root console still sees it,
   because it reads each tree's issue files straight off disk (`readWorktrees()` in
   `tools/console/src/read.mjs`), not through git.
8. Read `docs/factory/SPEC.md` §2, §3 for the component the issue touches, and the standards
   file for the file types it will change.

## Routing

| `agent:` in the issue | Sequence |
|---|---|
| `implementer` | implementer → done |
| `rule-author` | rule-author writes the test table into `NN-test-cases.md` → test-writer lands failing tests → implementer makes them pass |
| `docs-writer` | docs-writer → done. May run in parallel with any of the above. |
| `test-writer` | test-writer → implementer |

Model and effort come from the issue frontmatter. Do not raise them silently; if the issue looks
mis-sized, say so and continue at the stated level.

## While the agent works

- The agent gets: the issue file path, the SPEC sections named above, and nothing else. It reads
  the rest itself.
- If the agent reports a blocker, stop and relay it verbatim. Do not work around it.

## After the agent hands off, in this order

All of this runs inside the issue's worktree, `.worktrees/<branch>`.

1. Run the fast gate by hand once: `cmake --build --preset msvc-debug && ctest --preset msvc-debug -L fast`
   and `python -m tools.validate --changed`. Fix nothing yourself; send failures back to the agent.
2. Check every "Done when" line in the issue file against the diff. Unchecked → back to the agent.
3. `git add -A && git commit` with `<type>(#NN): <title>` and the session's attribution trailer.
4. Edit the issue file: `status: done`, `commit: <hash>`, `worktree: null`.
5. `git commit -am "chore(#NN): close"`.
6. Append nothing to `lessons.jsonl` yourself; the hooks do that.
7. Run the `/factory-status` steps again. Print STATE.md.

The tree itself is not removed here: it is removed by the milestone's close-out issue once the
branch has merged into `main` (`docs/factory/git-workflow.md` "Worktrees"), because other issues
on the same branch may still need it.

## Checkpoints

If the issue's `checkpoint:` is set, stop after step 7 and say: what landed, what to look at, and
what the next command is. Do not start the next issue. Checkpoint 4 means run the `verifier`
agent on `git diff main...HEAD` first and relay its report before stopping.

## When a gate fails

Three tries at most, each with the failure text handed to the agent. On the third failure stop,
leave the branch as is, and report the three attempts. Never close the issue on a stub, a skipped
test, or a loosened assertion.

## Resuming

Any session: `/factory-status`, then `/factory-run`. A half-done issue shows as `open` with a
dirty tree or an unclosed work commit; say which and ask whether to continue or reset.
