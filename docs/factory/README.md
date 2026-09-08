# How the factory works

Verstaan is built by a small code factory: a handful of Claude Code agents, three slash commands,
and hooks that enforce the rules the agents would otherwise have to remember. This page is the
onboarding narrative. The mechanics are in `PLAN.md` §6 and the exact rules in `SPEC.md` §5.

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

## A session, start to finish

```
/factory-status            # what is done, what is next
/factory-run               # picks the next open issue, or /factory-run 12
...                        # agents work; you answer at checkpoints
/factory-retro             # optional, mid-milestone
/gate                      # before a PR; must be run for real
```

## The console

`docs/factory/console/index.html` is the game console: open it from `file://`, no server. It is
rendered from the repository by `node tools/console/src/generate.mjs`, which `/factory-status` runs
for you. Nothing on it is editable; the files are. Five rooms:

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
