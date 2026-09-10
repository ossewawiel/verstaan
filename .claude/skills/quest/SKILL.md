---
name: quest
description: The quest giver. Plans one new quest or side quest with the developer, then writes its issue file to SPEC.md §6, validates it, mirrors it to GitHub and hands over the command to start it. Use when /quest is invoked, when the developer asks to plan or add a quest, a side quest, a feature or a piece of work, or when a checkpoint or retro has produced work that needs an issue file.
argument-hint: [main|side] [a sentence on the work]
---

Issue: `$ARGUMENTS`. A leading `main` or `side` fixes the kind; the rest is the seed. Empty
means ask.

## What this skill is for

Every piece of work enters the project as one file under `docs/factory/issues/`. The file is
the truth: the console reads it, `/factory-run` routes it, GitHub mirrors it. This skill is the
one place that file gets written, so every quest comes out the same shape with the loadout and
the dependencies decided on purpose, not remembered. It never starts the work; `/factory-run`
does that.

## 1. Read before asking

1. `git status --porcelain` in the root tree. Not empty → stop, show it, ask.
2. Read `docs/factory/STATE.md`, `docs/factory/PLAN.md` §7 (the milestone table and its issue
   ranges), and the frontmatter of every `docs/factory/issues/NN-*.md` (number, title, milestone,
   status, `depends_on`). Skip `*-test-cases.md`.
3. Read `.claude/agents/*.md` frontmatter: each party member's default `model` and `effort`.
4. Read `.claude/skills/factory-run/SKILL.md` "Routing" and "Writing a quest".

## 2. Plan: ask only what cannot be inferred

One `AskUserQuestion` round, at most four questions, each with the proposal first and marked
"(Recommended)". Never ask what step 1 already answered.

| Decide | Propose from | Ask only if |
|---|---|---|
| What and why now | the seed | the seed is empty or names no observable outcome |
| Main or side | `main` if the work is in a PLAN §7 milestone goal, else `side` | the seed fits neither, or both |
| Milestone | the PLAN §7 row whose goal names the work; `Side` for a side quest; `Post-M6` only if the seed says later | a main quest's row is unclear |
| Number | `max(existing) + 1`; a main quest inside its milestone's range only if a number there is still free | never; say which number and why |
| `depends_on` | every open or done quest whose output the work needs, read from their titles and What sections | a candidate is a judgement call |
| Cross-line block | if this is a side quest and an open main quest needs it, add this number to that main quest's `depends_on` too | always confirm, it edits another file |
| Loadout | `agent` from the routing table (design → `rule-author`, tests first → `test-writer`, prose → `docs-writer`, else `implementer`); `model` and `effort` from that agent's file, raised one step only for engine core or a public API change | the seed touches two agents' work |
| Checkpoint | `4` if it changes `engine/include/`, a public API or a merge path; else `null` | never; state it |

Keep the "why now" in the developer's own words, dated, the way issues 98 and 102 quote the
owner. A quest with no observable outcome is not a quest; send it back to the seed.

## 3. Add: write the file

Path: `docs/factory/issues/NN-<slug>.md`, slug from the title, kebab-case, under 40 characters.

Frontmatter exactly as `docs/factory/SPEC.md` §6, every key present, `status: open`,
`commit: null`, `worktree: null`, `github_issue: null`. `agents:` lists every party member the
routing sequence will use, `agent:` the first of them.

Body, in the house voice (`docs/standards/voice.md`; terse, one fact a sentence, named actor,
one concrete scene):

- `## What`: two paragraphs. What exists today and what is wrong or missing, then what will
  exist after. Quote the developer's ask with its date if there is one.
- `## Acceptance criteria`: observable, each one a command or a page state a reviewer can check.
- `## Not in scope`: what a reader might assume is included and is not, so the next quest can
  pick it up by name.
- `## Done when`: a checkbox list, `- [ ] ...`. The console counts these on the card, so every
  line is one thing the closing commit can tick.

If step 2 decided a cross-line block, add this number to the waiting main quest's `depends_on`
in the same change and say so in its `## What` with one sentence.

## 4. Prove the file, then hand over

1. `python -m tools.validate --all` exits 0. It refuses a missing loadout, a `depends_on` that
   names no quest, and a self-dependency; fix the file, never the validator.
2. `node tools/console/src/generate.mjs` so the file console shows the quest; the web console
   sees the file on its own.
3. The file reaches `main` before the work starts: `/factory-run` reads the issue file from
   the root tree and refuses a dirty one, and the console merges statuses across worktrees but
   never surfaces a file that only a branch has. So the file lands one of two ways:

   | Written | Where the file goes |
   |---|---|
   | on its own | worktree `.worktrees/quest-NN-<slug>` on branch `quest-NN-<slug>` from `main`; one commit `docs(#NN): quest`; `python -m tools.factory.mirror_github` with `GH_TOKEN` set, so `github_issue:` is filled, in a second commit; push; draft PR. Then `/gate` in that worktree, `gh pr ready`, merge, `git pull --ff-only` in the root. |
   | inside a planning quest already running (issue 12's shape) | in that quest's worktree, uncommitted; its work commit carries every file it wrote |

4. Hand over as a person: what the quest is in one sentence, its number, kind, loadout and what
   it waits on, where the file sits, and the next command: `/gate` if the PR is still a draft,
   `/factory-run NN` once the file is on `main`.

## What this skill never does

- Start the work. That is `/factory-run`.
- Edit `PLAN.md` §7's milestone ranges, an ADR, or any agent file. Say when one of those needs
  changing and stop.
- Raise a loadout past the agent's default without saying why in the issue's `## What`.
- Write a quest whose Done when is empty.
