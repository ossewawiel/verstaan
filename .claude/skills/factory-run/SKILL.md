---
name: factory-run
description: Phase B of the Verstaan code factory. Regenerates STATE.md, picks the next open issue or a given one, routes it to the right subagents at the right model and effort, runs the gates, and stops at checkpoints. Use when /factory-run is invoked or when resuming work on docs/factory/issues/.
argument-hint: [issue-number] [--resume]
---

Issue: `$ARGUMENTS` (empty means the next open one). One issue, one work commit, one
`chore(#NN): close` commit. Then stop and print the next command.

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
6. `python -m tools.factory.mirror_github` (needs `GH_TOKEN` in the environment; if it is not set,
   say so and continue — the `mirror-check` CI job will catch the resulting drift on the next push).
7. Append nothing to `lessons.jsonl` yourself; the hooks do that.
8. Run the `/factory-status` steps again. Print STATE.md.
9. **Check the battlefield, not just the kill.** A closed issue is not a shipped one. Run:
   `git ls-remote --heads origin <branch>` (does the branch exist on origin at all, and does it
   match local HEAD) and `git log origin/main..main --oneline` (is `main` itself ahead of
   `origin/main`, independent of this issue). Know, in one line each: committed locally / pushed
   to origin / PR open / merged to main — whichever is true, not just "done".
10. **Hand over as a person, not a spec.** Write for a developer skimming on a phone. Say what
    changed and why it matters, name anything only a human can do (a repository secret, a
    credential), and say where the work is sitting, using step 9's facts. No file-by-file
    inventory, no flag lists, no wall of headings. Then put the shipping options to the developer
    with `AskUserQuestion`, and carry out the one they pick. Their choice is the sign-off: run the
    push, the PR and the merge without asking again. The four options:

    | Option | What you run |
    |---|---|
    | Gate, PR, merge | `/gate`, push, `gh pr create`, wait for the `gate` check, `gh pr merge`, then `cd` to the root tree and `git pull --ff-only`; if the branch is `side-*` or `quest-*`, `git worktree remove .worktrees/<branch> && git branch -d <branch>` |
    | Gate and PR, then stop | the same, stopping once the PR is open and its check is green |
    | Push only | `git push -u origin <branch>`, nothing else |
    | Hold | nothing reaches GitHub |

    `/gate` is what stamps HEAD, and `require_gate.sh` refuses `gh pr ready` and `gh pr merge`
    without that stamp, so every option above "push only" runs it first.

For a `side-*` or `quest-*` branch, "Gate, PR, merge" removes the tree in the same step: once
`git pull --ff-only` in the root tree has caught up, `git worktree remove .worktrees/<branch>`
and `git branch -d <branch>` run there, because no close-out issue ever runs for that branch. A
milestone branch, `m1-mirror` say, is the exception: several issues share its tree, so the tree
stays until the milestone's close-out issue removes it once every issue on the branch has landed
(`docs/factory/git-workflow.md` "Worktrees").

## Writing a quest

A checkpoint, a retro or the owner may have you write a new issue file. Use the `quest` skill
(`.claude/skills/quest/SKILL.md`): it follows `SPEC.md` §6 exactly and decides two things
before the body (playbook "The quest giver"):

- **Main or side.** `milestone:` is an `M` number for the main line, `Side` or `Post-M6` for a
  side quest. The quests room shows the two apart; a side quest never appears under a milestone.
- **What it waits on, across the line too.** `depends_on` lists every quest that must be done
  first, main or side. If this side quest is what a main quest is waiting for, put this number in
  that main quest's `depends_on` as well, so the main quest's card shows the block. The console
  draws "blocked by" and "blocks" from `depends_on` and nothing else; a cross-line block is marked
  on both cards. `python -m tools.validate --all` refuses a number that names no quest, so the
  gate catches a typo here.

Every quest carries its loadout, `agent`, `model` and `effort` (issue 103); the same validator
refuses one without.

## Checkpoints

If the issue's `checkpoint:` is set, stop after step 10 and do not start the next issue. Checkpoint
4 means run the `verifier` agent on `git diff main...HEAD` first, fix what it finds, and relay what
it found in the hand-off — a reviewer catching a real mistake is worth a sentence, not a section.

A checkpoint changes what happens *after* the hand-off, never the hand-off itself: step 10's
plain-language report and its four options still run. The developer picking an option there is the
sign-off; the stop is about not starting the next issue.

## When a gate fails

Three tries at most, each with the failure text handed to the agent. On the third failure stop,
leave the branch as is, and report the three attempts. Never close the issue on a stub, a skipped
test, or a loosened assertion.

## Resuming

Any session: `/factory-status`, then `/factory-run`. A half-done issue shows as `open` with a
dirty tree or an unclosed work commit; say which and ask whether to continue or reset.
