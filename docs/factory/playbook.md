# Playbook: how the game is played

This page explains the moving parts of the factory as a player would meet them. The rules it
describes live in `SPEC.md` §5, `PLAN.md` §6 and the skill files; if this page and those disagree,
those win. Terms are from `docs/glossary.md`.

## The map

The map is the repository. Each milestone in `PLAN.md` §7 is a region, and each region is a
branch. A region is explored when its branch has merged into `main`. The console's Map panel
draws the regions in order, with a bar for how much of each is won.

You are always in one region: the main quest. Side quests sit off the path and can be taken
whenever their dependencies are met. They never block the main quest, and the main quest never
waits for them.

## An encounter, start to finish

An encounter is one issue file becoming one work commit, plus a red `test` commit before it when
a test-writer pass ran. Here is what happens when you type `/factory-run 07`.

1. **The check.** The factory reads `git status`. A dirty tree stops it before anything else,
   because a half-finished encounter must not be mixed into a new one.
2. **The brief.** It reads the issue file whole, checks that every issue in `depends_on` is done,
   and checks out the milestone branch, cutting it from `main` if it does not exist yet.
3. **The party is chosen.** The issue's `agent` field names who goes first. A tooling issue sends
   the implementer alone. An engine or grammar issue sends the rule-author first, who writes the
   test table and stubs, then the test-writer, who lands failing tests, then the implementer, who
   makes them pass. The docs-writer may run beside any of them.
4. **The fight.** The agent works from the issue file and the sections of `SPEC.md` it names.
   Every save runs the auto-fix gate: the file is formatted. Every time the agent tries to stop,
   the fast gate runs: build, fast tests, data validation for changed files. A failure blocks the
   stop, shows the output, and writes one line to the ledger.
5. **The count.** The factory runs the fast gate once more by hand, then checks every "Done when"
   line in the issue against the diff. Anything unticked goes back to the agent.
6. **The commit.** One work commit, `feat(#07): title`. When a test-writer pass ran, its
   `test(#07): title` commit already sits before it, carrying the red suite on its own. Then the
   issue file flips to `status: done` with the commit hash, in a second commit, `chore(#07): close`.
7. **The next move.** `/factory-status` regenerates `STATE.md` and the console and prints the
   next command. If the issue carried a checkpoint, the factory stops here and waits for you.

An encounter is won when both commits exist. It is never won on a stub, a skipped test or a
loosened assertion; the verifier looks for exactly those at the boss fight.

### An example

Picture issue 08, the logged-in mirror. The implementer writes the login flow and the export
loop, saves, and the formatter runs. It tries to hand off. The fast gate runs pytest for
`tools/mirror` and one test fails: the session cookie was written to disk by a debug line. The
stop is blocked with the pytest output, and the ledger gains a line with signature
`pytest-red`. The implementer removes the debug line, tries again, the gate passes, and the
hand-off report lists the two runs. The factory checks the six "Done when" lines, commits, and
prints `Resume with: /factory-run 09`.

## The gate ladder

| Tier | When | What | Cost |
|---|---|---|---|
| Auto-fix | every save | clang-format, ruff format | a second |
| Fast | every stop | build the core, fast tests, changed data validation, changed tool tests | under a minute |
| Full | `/gate`, before a merge | everything, all presets, tidy, equivalence, tiers, regenerate and diff | minutes |

The full gate writes the stamp: the commit hash it passed on. A hook refuses `git merge` and
`gh pr ready` unless the stamp equals HEAD and the tree is clean. That is what keeps the merge
shut without anyone remembering to check.

The first thing the factory ever does, issue 01, is break each gate on purpose and watch it
fail. A gate that cannot fail also passes, and looks the same from outside.

Each hook's logic is a tracked script under `tools/factory/hooks/`, with a pytest module under
`tools/factory/tests/`. `.claude/hooks/<name>.sh` is a wrapper of at most six lines that `exec`s
it, and is hand-edited only, never by an agent: a hook is the thing that checks the agent, so the
agent must not be the one who can rewrite it (`docs/factory/issues/93-hooks-as-tracked-scripts.md`).

## Checkpoints

The factory stops for a human at four kinds of moment. The issue file says which with its
`checkpoint:` field.

1. The first issue of a milestone lands. You read the shape before the rest is built on it.
2. A grammar first parses a whole test corpus. You read the sentences.
3. Generated tables first replace runtime tables in a build. This is where a silent divergence
   between the two back ends would start.
4. Before every merge. The verifier reads the whole diff, reports in the house voice, and you
   decide. This is the boss fight.

## Self-improvement

The factory learns from its own failures, but never on its own.

1. The fast gate fails and writes one line to the ledger: signature, stage, issue, time, detail.
2. The console shows the count per signature and how far the top one is from three.
3. At three of a kind, `/factory-retro` proposes a rule. It prefers, in order: a gate step, a
   line in the agent file that keeps failing, a line in a standards file, a line in a skill, and
   `CLAUDE.md` last, because every line there is loaded every session.
4. You say yes or no per proposal. An approved rule lands in its own `chore: retro` commit that
   also removes the promoted lines from the ledger. That is a level gained.
5. Rules whose signature has not fired for two milestones are proposed for pruning, the same way.

An agent that silently rewrites its own instructions drifts, and the thing that would notice is
the thing that drifted. That is why nothing here is automatic past step 2.

## Resource rules

Every party member has a model and an effort in its file, and the console shows them. Every
quest file names its `agent`, `model` and `effort` too (SPEC.md §6), the loadout it is embarked
with: the quest card shows it on its summary row, and `python -m tools.validate --all` refuses a
quest file that lacks any of the three, so a new quest or side quest cannot land without one. The
three-pass sequence (rule-author at opus high, then two sonnet passes) is for engine core and
rule design only. Tooling takes one implementer pass. The verifier is opus and read-only, and
runs once per merge. Do not raise a level to get past a failure; report the failure instead.

## The quest giver

New work does not appear from nowhere. `/quest` is the quest giver's tool: it plans one quest
with the developer, asking only what the files cannot answer, writes the issue file to `SPEC.md`
§6, validates it and mirrors it. A new milestone's issues are written at a checkpoint from
`PLAN.md` §7 and what the last milestone found, through the same skill. A new map, a line of main
quests `PLAN.md` §7 does not cover yet, goes through `/create-map` instead: it interrogates the
seed, the way the whole plan was interrogated, then turns every settled choice into an ADR before
it writes a §7 row, and it is the only skill allowed to write one. The brief under
`docs/decisions/` is the record; the ADRs under `docs/adr/` are the decisions; the new milestone's
own planning quest, once `/create-map` has the owner's yes, calls `/quest` for each of its issues.

A quest is on the main line (its milestone is an `M` number) or it is a side quest (`Side` or
`Post-M6`); the quests room shows the two apart. The line between them is not a wall:
`depends_on` may point across it in either direction, and it often should. A side quest that a
main quest needs first (worktrees before the first merge, CI before the second) is written with
that main quest's number in the main quest's `depends_on`; a side quest that needs a main quest's
work names it the same way. Whoever writes the quest names every such dependency, because the
console draws "blocked by" and "blocks" from `depends_on` and nothing else, and marks a block
that crosses the line so it cannot be skimmed past. `python -m tools.validate --all` refuses a
`depends_on` that names a quest that does not exist, or the quest itself.
