---
issue: 103
title: "The loadout on every quest: the card shows agent, model and effort, and the validator refuses a quest without them"
milestone: Side
status: done
depends_on: [99]
agent: implementer
agents: [implementer]
model: sonnet
effort: low
checkpoint: null
commit: 1e63f0c
worktree: null
github_issue: null
---
## What

The file console's meta line under each quest read `agent / model / effort`. The web console
(issue 99) parsed those three fields into its API and then never rendered them; the card showed
only the agent. The owner, 2026-09-10: "which model and effort do i use. it does not display in
the console. it used to display in the console. it is like the armour and weapons needed to
embark on the quest. it is important. new side quests and quests generated should also make sure
it is displayed in the details."

## What changed

- The quest card shows the loadout, `agent / model / effort`, under the title on the summary
  row, readable without opening the card. The detail adds Loadout, Checkpoint, Worktree and
  Commit, the rest of what the old meta line carried.
- A quest file missing any of the three is flagged on the card, `no loadout: model, effort
  missing`, in the in-progress colour, not left blank.
- The Next row on the console shows the loadout and the `/factory-run` command beside the title.
- `python -m tools.validate --all` gained `check_issue_loadouts`: every `docs/factory/issues/
  NN-*.md` with frontmatter must carry non-empty `agent`, `model` and `effort`. The gate and CI
  both run `--all`, so a new quest or side quest cannot merge without its loadout. Test-cases
  companions (`04-test-cases.md`) carry no frontmatter and are skipped, as the console skips them.
- `docs/factory/playbook.md` "Resource rules" says so.

## Acceptance

- `/quests` shows `implementer / sonnet / low` on quest 07's summary row before it is opened.
- A fixture quest without `model:` and `effort:` shows `no loadout: model, effort missing`.
- `python -m tools.validate --all` exits 1 naming the file and the field when one is stripped,
  and 0 on this repository as it stands.
- Playwright: `apps/console/e2e/loadout.spec.ts`. Pytest: `tools/validate/tests/test_loadouts.py`.
