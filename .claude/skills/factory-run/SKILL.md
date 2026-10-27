---
name: factory-run
description: Phase B of the Verstaan code factory. Regenerates STATE.md, picks the next open issue or a given one, routes it to the right subagents at the right model and effort, runs the gates, and stops at checkpoints. Use when /factory-run is invoked or when resuming work on docs/factory/issues/.
argument-hint: [issue-number] [first pass: agent=<a> model=<m> effort=<e>] [--resume]
---

Issue: `$ARGUMENTS` (empty means the next open one). The console adds the first pass after the
number: `<NN> first pass: agent=<a> model=<m> effort=<e>`. When that and the issue file disagree,
the issue file wins. One issue, one work commit, one
`chore(#NN): close` commit. Then stop and print the next command.

## Every run starts the same way

Run this from the root tree, on `main`. It never works there past step 6.

1. `git status --porcelain` in the root tree. Not empty → stop, show it, ask.
2. Run `python -m tools.factory.status` (the `/factory-status` command's step 1; it picks the next
   issue by script, not by reading frontmatter). Read the chosen issue file whole.
3. Check `depends_on` are all `status: done`. If not → stop and say which.
4. Check the chosen issue's `status`. If it is `in-progress` and `--resume` was not given, stop:
   report the issue number and the tree named in its `worktree:` field, and do not proceed. With
   `--resume`, continue in that same tree instead of creating a new one (skip step 6).
5. Work happens on a branch, never on `main`: `m<K>-NN-<slug>` for a main-quest issue in
   milestone K, cut from `main`, or `side-NN-<slug>` for a side quest.
6. `git fetch origin && git merge --ff-only origin/main` in the root tree first: every issue now
   cuts its own branch, so a stale local `main` costs a whole issue's worth of missed merges, not
   a milestone's worth. Then create a fresh tree for this issue, every time: `git worktree add -b
   <branch> .worktrees/<branch> main`. Every issue gets its own branch and its own tree; no branch
   is shared across issues any more. When the root tree has a `CMakeUserPresets.json` (gitignored,
   it holds the `linux-gcc` preset), copy it into the new worktree. From here on, every command in this skill runs with
   `.worktrees/<branch>` as the working directory, not the root tree.
7. In the worktree, edit the issue file: `status: in-progress`, `worktree: .worktrees/<branch>`.
   Leave this uncommitted; it lands in the work commit at the end. The root console still sees it,
   because it reads each tree's issue files straight off disk (`readWorktrees()` in
   `tools/console/src/read.mjs`), not through git.
8. Read `docs/factory/SPEC.md` §2, §3 for the component the issue touches, and the standards
   file for the file types it will change. `/factory-status` never writes `docs/factory/STATE.md`,
   in this tree or the root tree. Only the merge path writes it, in step 10 below.

## Routing

| `agent:` in the issue | Sequence |
|---|---|
| `implementer` | implementer → done |
| `rule-author` | rule-author writes the test table into `NN-test-cases.md` → test-writer lands failing tests → implementer makes them pass |
| `docs-writer` | docs-writer → done. May run in parallel with any of the above. |
| `test-writer` | test-writer → implementer |

The session model is Sonnet, at medium effort, when the console boards the quest. The quest's
`model` and `effort` belong to the first pass, not to the session, and arrive in the prompt as
`first pass: agent=<a> model=<m> effort=<e>`. They set the first pass, the one named in `agent:`.
Every later pass takes its own agent file's `model` and `effort`. Every Agent call passes `model` and `effort`
explicitly. The lists of valid values live in `docs/factory/loadouts.json`. Do not raise a level
silently; if the issue looks mis-sized, say so and continue at the stated level.

Before every rule-author pass, run the `scout` agent (haiku, read-only) on the reference rules the
issue touches. Save its digest to `.scout/NN.md` in the worktree (NN is the issue number) (`.scout/` is gitignored) and name
that path in the rule-author's brief. Before a retry after a failed gate, the scout may digest the
failing log the same way.

Whenever the sequence includes the test-writer, its hand-off ends with its own commit in the
worktree, `git add -A && git commit -m "test(#NN): <title>"`, before the implementer starts. The
work commit made in step 3 below then carries the implementation only, never the tests.

## While the agent works

- The agent gets: the issue file path, the SPEC sections named above, and nothing else. It reads
  the rest itself.
- If the agent reports a blocker, stop and relay it verbatim. Do not work around it.

## After the agent hands off, in this order

All of this runs inside the issue's worktree, `.worktrees/<branch>`.

1. Run the fast gate by hand once, with the preset the platform picks, the same `uname` switch as
   `tools/factory/hooks/gate_fast.sh` (`linux-gcc` on Linux and Darwin, `msvc-debug` otherwise):
   `cmake --build --preset <preset> && ctest --preset <preset> -L fast`
   and `python -m tools.validate --changed`. Fix nothing yourself; send failures back to the agent.
2. Check every "Done when" line in the issue file against the diff. Unchecked → back to the agent.
3. `git add -A && git commit` with `<type>(#NN): <title>` and the session's attribution trailer.
   When the test-writer ran, its `test(#NN): <title>` commit already exists (see "Routing"
   above); this commit carries the implementation only, not the tests.
4. Edit the issue file: `status: done`, `commit: <hash>`, `worktree: null`.
5. `git commit -am "chore(#NN): close"`.
6. `python -m tools.factory.mirror_github` (needs `GH_TOKEN` in the environment; if it is not set,
   say so and continue — the `mirror-check` CI job will catch the resulting drift on the next push).
7. Append nothing to `lessons.jsonl` yourself; the hooks do that.
8. Run `python -m tools.factory.status` again in the worktree. It prints only; the worktree never
   writes STATE.md. Print its output.
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
    push, the PR and the merge without asking again. **The D4 lane:** a quest with
    `checkpoint: null` and `agents: [implementer]` only skips the question. Run `/gate` first. If it
    is red, send the failure back to the agent and ship nothing. If it is green, run "Gate, PR,
    merge" at once. The hand-off note is still written. Any other quest asks. Every branch,
    `m*-*` or `side-*`/`quest-*`,
    gets the same four options:

    | Option | What you run |
    |---|---|
    | Gate, PR, merge | `/gate`, push, `gh pr create`, wait for the `gate` check, `gh pr merge --merge --delete-branch`, then `cd` to the root tree, `git pull --ff-only`, `python -m tools.factory.status --write` to compute the four fields fresh and write `docs/factory/STATE.md`, commit that one file as `chore: refresh STATE.md after merging #NN into main`, then `git worktree remove .worktrees/<branch> && git branch -D <branch>` |
    | Gate and PR, then stop | the same, stopping once the PR is open and its check is green |
    | Push only | `git push -u origin <branch>`, nothing else |
    | Hold | nothing reaches GitHub |

    `/gate` stamps HEAD. `require_gate.sh` refuses `gh pr create`, `gh pr ready` and `gh pr merge`
    without that stamp on the tree they act on.

"Gate, PR, merge" removes the tree in the same step, for every branch: once `git pull --ff-only`
in the root tree has caught up, `git worktree remove .worktrees/<branch>` and `git branch -D
<branch>` run there. `gh pr merge --merge --delete-branch` already removed the branch from
`origin` in the same call as the merge; do not also run `git push origin --delete <branch>`, it
races the same delete. A milestone's close-out issue merges nothing: it only tags `main` with
`m<K>` and writes the next map (`docs/factory/git-workflow.md` "Finishing a milestone").

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
  on both cards. `python -m tools.validate --changed` refuses a number that names no quest the
  moment the quest file itself is in the diff, so the gate catches a typo here.

Every quest carries its loadout, `agent`, `model` and `effort` (issue 103); the same validator
refuses one without.

## Checkpoints

If the issue's `checkpoint:` is set, stop after step 10 and do not start the next issue. Checkpoint
4 means run the `verifier` agent on `git diff main...HEAD` first, fix what it finds, and relay what
it found in the hand-off — a reviewer catching a real mistake is worth a sentence, not a section.

A checkpoint changes what happens *after* the hand-off, never the hand-off itself: step 10's
plain-language report and its shipping options still run. The developer picking an option there
is the sign-off; the stop is about not starting the next issue.

## When a gate fails

Three tries at most, each with the failure text handed to the agent. On the third failure stop,
leave the branch as is, and report the three attempts. Never close the issue on a stub, a skipped
test, or a loosened assertion.

## Resuming

Any session: `/factory-status`, then `/factory-run`. A half-done issue shows as `open` with a
dirty tree or an unclosed work commit; say which and ask whether to continue or reset.
