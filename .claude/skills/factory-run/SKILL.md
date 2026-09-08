---
name: factory-run
description: Phase B of the Verstaan code factory. Regenerates STATE.md, picks the next open issue or a given one, routes it to the right subagents at the right model and effort, runs the gates, and stops at checkpoints. Use when /factory-run is invoked or when resuming work on docs/factory/issues/.
---

## Every run starts the same way

1. `git status --porcelain`. Not empty → stop, show it, ask.
2. Run the `/factory-status` steps. Read the chosen issue file whole.
3. Check `depends_on` are all `status: done`. If not → stop and say which.
4. Check out the milestone branch from `docs/factory/PLAN.md` §7. Create it from `main` if absent.
5. Read `docs/factory/SPEC.md` §2, §3 for the component the issue touches, and the standards
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

1. Run the fast gate by hand once: `cmake --build --preset msvc-debug && ctest --preset msvc-debug -L fast`
   and `python -m tools.validate --changed`. Fix nothing yourself; send failures back to the agent.
2. Check every "Done when" line in the issue file against the diff. Unchecked → back to the agent.
3. `git add -A && git commit` with `<type>(#NN): <title>` and the session's attribution trailer.
4. Edit the issue file: `status: done`, `commit: <hash>`.
5. `git commit -am "chore(#NN): close"`.
6. Append nothing to `lessons.jsonl` yourself; the hooks do that.
7. Run the `/factory-status` steps again. Print STATE.md.

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
