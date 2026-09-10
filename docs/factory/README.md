# How the factory works

Verstaan is built by a small code factory: a handful of Claude Code agents, three slash commands,
and hooks that enforce the rules the agents would otherwise have to remember. This page is the
onboarding narrative. The mechanics are in `PLAN.md` §6 and the exact rules in `SPEC.md` §5.

## Prerequisites

The GitHub CLI, `gh`, is required: it opens and merges every pull request (`git-workflow.md`
"Pull requests"). Install it with `winget install --id GitHub.cli` or see https://cli.github.com.

`GH_PAT_CHANGELOG` is a repository secret `.github/workflows/changelog.yml` needs: a personal
access token (repo scope) that authors the changelog PR as a real actor, since a PR authored with
the default `GITHUB_TOKEN` never triggers the `gate` check and could never satisfy branch
protection. Create it once, under the repository's Settings > Secrets and variables > Actions,
before the first `v*` tag is pushed.

## The shape

There are two phases. Phase A, interrogation, already happened; it produced `PLAN.md`, `SPEC.md`,
the ADRs and the first issue files. Phase B is the loop you are in now:

```
/factory-status  →  /factory-run  →  (agents work one issue)  →  gates  →  commit  →  repeat
                                               │
                                     checkpoint? stop, ask the human
```

One issue becomes one commit on the milestone branch. When the milestone's issues are all done,
`/gate` runs the full ladder, the verifier reads the whole diff, and the branch merges.

## The three rules that make it resumable

1. The issue files under `issues/` are the state. `STATE.md` is a rendering. If they disagree, the
   files win, and `/factory-status` fixes the rendering.
2. Every rule that can be a gate is a gate. Formatting happens on save. Compile and fast tests run
   before the session may stop. The full gate stamps the commit, and a hook refuses to open a pull
   request without the stamp.
3. Failures are data. The fast gate logs each failure to `lessons.jsonl`. When a signature repeats
   three times, `/factory-retro` proposes a rule. A human says yes or no.

## The gate ladder

Rules in full at `SPEC.md` §5. What actually runs, proven in issue 01:

| Tier | Hook | Trigger | Must |
|---|---|---|---|
| Auto-fix | `.claude/hooks/fast-format.sh` | `PostToolUse` on `Edit`\|`Write`\|`MultiEdit` | Format the one file just written with `clang-format` or `ruff format`; never block. Prints to stderr, does not fail, when the formatter is missing. |
| Fast | `.claude/hooks/gate-fast.sh` | `Stop` | Build `verstaan_core`, build the fast test binaries, run `ctest -L fast`, validate changed data, run pytest for changed tools. Exit 2 blocks the stop and shows the failing output. Logs every failure to `lessons.jsonl`. Checks `stop_hook_active` first so a failure can never loop the Stop hook. |
| Gate stamp | `.claude/hooks/require-gate.sh` | `PreToolUse` on `Bash`\|`PowerShell` | Refuse `git merge`, `gh pr create` (non-draft) and `gh pr ready` unless the gate stamp matches `HEAD` on a clean tree. The stamp is written only by `/gate`. |
| Full | `/gate` | manual, before a PR | Fast + `ctest` all labels + `clang-tidy` + equivalence + all tiers configure and build + `python -m tools.validate --all` + pytest all. Writes the gate stamp. |

## A session, start to finish

```
/factory-status            # what is done, what is next
/factory-run               # picks the next open issue, or /factory-run 12
...                        # agents work; you answer at checkpoints
/factory-retro             # optional, mid-milestone
/gate                      # before a PR; must be run for real
```

## The console

The console is the game: the page that says where the project is. It is a small Node/React app,
`apps/console/` (issue 99; ADR 0010) — a Fastify server with a read-only JSON API and a change
stream, and a React client built with Vite. `apps/console` is the one part of the repository
allowed dependencies of its own; the engine and the Python tools stay at zero (ADR 0008).

A `SessionStart` hook starts the built server for you at the beginning of a session, from the
root tree, if nothing already answers on the port; it never builds the app itself, only starts
what is already built. Double-click `console.cmd` (or run `.\console.ps1`) in the repository root
to start it by hand and open `http://127.0.0.1:7864`: the first run installs dependencies
(`npm ci`) and builds the app (`npm run build`) inside `apps/console`, and every later run rebuilds
only when the client or server source is newer than the last build. Start it from the root tree:
the server reads the tree its own files sit in, so `console.cmd` double-clicked inside a worktree
binds the Library, Playbook and Glossary rooms to that worktree's docs instead of the root's. Only
issue status merges across every tree regardless of where the server runs. React Router gives
every room a real path (`/quests/07`, `/library/docs/factory/PLAN.md`); the SSE change stream
invalidates only the data a room is showing, so an open card, scroll position and focus survive a
change instead of the page reloading. The watch on `docs/` is recursive on Windows and macOS, so a
doc nested a level deeper, such as `docs/standards/voice.md`, wakes the page too; Node's recursive
watch is not reliable on Linux, so there the watch stays top-level-only, same as the old file
console. Nothing is written to disk, nothing on it is editable, and it listens on the loopback
address only.

The file-based copy, `docs/factory/console/index.html`, still exists for a machine with no server
running: `node tools/console/src/generate.mjs` from any tree writes that tree's console and the
root's, hooks run it on edits and stops, and the root page reloads itself every two minutes. It is
never committed, and it is untouched by issue 99 — it stays the zero-dependency fallback under
`tools/console/`, separate from the app under `apps/console/`. Five rooms either way:

| Room | What it holds |
|---|---|
| Console | The main quest, the next move to type, one side task under ten minutes, the save point, the party and its cost, the ledger as an experience bar. |
| Quests | Every issue file, whole, grouped by milestone, the next one open. |
| Playbook | `docs/factory/playbook.md`: how an encounter, the gate ladder, checkpoints and self-improvement work, with an example. |
| Library | Every project document rendered as a page, grouped: start here, plan and spec, architecture, decisions, standards, UNL reference, licences, the party, skills and commands. Backtick paths link across pages. |
| Glossary | `docs/glossary.md`: one term, one meaning, and the words we do not use. |

## What is different from a normal repo

- `engine/generated/` is compiler output. Editing it by hand is a bug.
- `data/` is CC BY-SA and the engine is MPL-2.0. They stay separate on purpose.
- The archive mirror is verbatim. Interpretation happens in the importer, never in the mirror.
- There is no CI server yet. The hook ladder is the CI. When a remote exists, the same commands
  move into a workflow file.
