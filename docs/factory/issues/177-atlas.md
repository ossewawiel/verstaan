---
issue: 177
title: "The atlas: a hand-drawn map.yaml, one tile per issue, fog of war and a gate validator"
milestone: M7
status: open
depends_on: [176]
agent: implementer
agents: [implementer]
model: sonnet
effort: high
checkpoint: 4
commit: null
worktree: null
github_issue: null
---
## What

ADR 0015 decided the atlas is a hand-authored file, not a computed layout: `PLAN.md` §7's seven
milestone rows have no x, y or size anywhere in the repository, so a map has nowhere to read
positions from until one file states them on purpose. ADR 0014 supplies the network half: the
"cleared for jump" tile state needs GitHub's live pull-request and check-run state, unavailable
from any file on disk, and must degrade to unpainted, not broken, when GitHub is unreachable.

After this quest, `docs/factory/map.yaml` names every region (the seven milestones) and every
tile (one per issue prefix) with `x`, `y` and `size`, and `SPEC.md` carries its schema line. A
validator under `tools/factory/` runs as a gate step: it refuses an issue file whose prefix
matches no tile, and refuses a tile whose prefix matches no issue file, proven to fail first per
`docs/standards/testing.md`. The console paints the file with `d3-zoom`, computing nothing: a
tile is **lit** when its issue's `status: done` and `commit:` is reachable from `main`; **cleared
for jump** when GitHub shows an open pull request with `gate.yml` green; **contact** when the
issue is open with no pull request. A region with no lit tile is fogged, its contacts visible on
the region's edge. GitHub down leaves every lit and contact tile painted from the issue files
alone; the bridge (quest 173) shows comms-lost and the cleared-for-jump tier goes unpainted, per
ADR 0014.

## Acceptance criteria

- `docs/factory/map.yaml` exists with seven regions (M0 through M6/M7 per `PLAN.md` §7's current
  rows) and one tile per issue-number prefix currently in `docs/factory/issues/`, each tile
  carrying `x`, `y`, `size`.
- `SPEC.md` gains a schema line for `map.yaml` under its data-file sections (§3 or a new
  subsection, following the shape of an existing schema entry).
- A validator script under `tools/factory/` (e.g. `tools/factory/validate_map.py`) refuses: an
  issue file whose number prefix has no tile in `map.yaml`; a tile in `map.yaml` whose prefix
  matches no issue file. A test proves it fails first on a fixture with a missing tile, then
  passes once the tile is added, per `docs/standards/testing.md`.
- The validator runs as a step in `.github/workflows/gate.yml` (or the local `/gate` script it
  wraps) and in `python -m tools.validate --all`.
- The console atlas page renders `map.yaml` with `d3-zoom` (pan and zoom), computing no position
  itself; a tile's state (lit / cleared for jump / contact / fogged) is a pure function of issue
  front matter plus, for cleared-for-jump only, a GitHub API read.
- A test stubs GitHub as unreachable and asserts every lit and contact tile still paints, the
  cleared-for-jump tier is empty, and the bridge's comms-lost chip (quest 173) is visible.
- `/gate` and CI green.

## Not in scope

Any change to how the bridge computes GitHub reachability, beyond consuming it (quest 173 owns
that check). The flight deck's launch actions. Auto-generating `map.yaml` from a script; the
owner hand-edits it, per ADR 0015.

## Done when

- [ ] `docs/factory/map.yaml`: seven regions, one tile per issue prefix, each with `x`, `y`,
      `size`.
- [ ] `SPEC.md` carries `map.yaml`'s schema line.
- [ ] Validator under `tools/factory/`, proven to fail first, wired into the gate.
- [ ] Atlas page renders with `d3-zoom`; lit / cleared-for-jump / contact / fogged states match
      ADR 0015's rules.
- [ ] GitHub unreachable: tiles still paint except cleared-for-jump; bridge shows comms-lost.
- [ ] `/gate` and CI green.

Source: `docs/decisions/2026-09-16-console-as-cic/handoff.md`, quest table row 5; ADR 0014; ADR 0015.
