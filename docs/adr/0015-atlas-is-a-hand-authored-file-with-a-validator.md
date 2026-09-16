# 0015 — The atlas is a hand-authored file with a validator in the gate

Date: 2026-09-16 · Status: Accepted

## Context

The console-as-CIC line asks for a map of known space with fog of war: a 2D region the owner pans
and zooms, where merged work is lit and unbuilt milestones sit under fog. A map is a set of things
with positions. The repository has things, folders, issue files and milestones, but nothing in it
carries an x and a y, so the positions must come from somewhere.

The interrogation (Q11) laid out three sources. A derived layout reads the tree and computes
positions on every load; it never rots and never looks like a place, and an unbuilt milestone has
no folder to place, so fog of war has nothing to cover. Hand-placed regions with derived tiles
place the seven milestones once and grid the issues inside them. A hand-drawn atlas places every
region and every tile by hand. The owner, turn 4: "hand drawn atlas."

## Decision

- `docs/factory/map.yaml` is the atlas. It names every region and every tile with an x, a y and a
  size. The seven milestone rows of `PLAN.md` §7 are the regions. One tile per issue prefix. The
  console paints exactly what the file says and never computes a position.
- A tile has three states, each read from data the server already has. **Lit**: the issue file says
  `status: done` and its `commit:` is reachable from `main`. **Cleared for jump**: GitHub shows an
  open pull request with `gate.yml` green (ADR 0014). **Contact**: the issue is open with no pull
  request. A region with no lit tile is fogged; contacts show on its edge.
- A validator under `tools/factory/` refuses an issue file whose prefix matches no tile in
  `map.yaml`, and refuses a tile whose prefix matches no issue file. It runs as a gate step, so a
  tile that rots fails a merge instead of lying on a screen.
- The file has a schema line in `SPEC.md`. It is the one new data file this line adds.

## Consequences

- The owner is the cartographer. A new milestone row in §7, a new issue prefix, or a folder split
  the map should show each need one hand edit to `map.yaml`. The validator names the missing tile;
  it never invents one.
- Terrain is stable. The engine region sits where it sat last month, so a returning visitor can
  build a memory of the place. That is the whole reason a derived layout was struck.
- Fog of war is one rule, no new data path: the issue files the server already parses decide every
  tile's state. GitHub adds one softer tier and can be absent (ADR 0014).
- The map's own quest is the only one that cannot ship before the validator does. The validator
  lands first inside that quest, proven to fail on a prefix with no tile, per
  `docs/standards/testing.md`.
- If `map.yaml` needs a hand edit more than once per milestone, the tile rule switches to derived
  tiles inside hand-placed regions (option M3 in the brief). The region positions and the fog rule
  survive that switch unchanged.

## Alternatives rejected

- **Derived graph, no file.** A seeded force layout or a treemap by path. Never rots, never a
  place: a new node shifts its neighbours, and a milestone nobody has built has no node to fog.
- **Regions by hand, tiles derived.** Seven positions once, then nothing. Struck by the owner in
  favour of the full atlas; kept as the fallback above. Its tile rule, issue files carry the
  milestone prefix, survives as the way pins find their tile.
