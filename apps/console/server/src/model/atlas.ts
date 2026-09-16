// SPDX-License-Identifier: MPL-2.0
// The atlas (ADR 0015, issue 177): docs/factory/map.yaml painted, never computed. This module
// parses the file and decides each tile's state from data the server already has -- issue front
// matter plus, for cleared-for-jump only, a GitHub read the caller supplies. No IO here: parsing
// text and deciding a tile's state are both pure, so a test never needs a real repo, a real `git`
// or a real network call.
import { parse } from 'yaml';
import type { Issue } from './parse.js';

export interface AtlasRegion {
  id: string;
  name: string;
  goal: string;
  x: number;
  y: number;
  size: number;
}

export interface AtlasTileSource {
  id: string;
  region: string;
  title: string;
  x: number;
  y: number;
  size: number;
}

export interface MapDoc {
  regions: AtlasRegion[];
  tiles: AtlasTileSource[];
}

/** `docs/factory/map.yaml`'s two lists, or an empty atlas for a blank/missing file -- the
 * console then paints nothing, never throws (SPEC.md §3.7). */
export function parseMapYaml(text: string): MapDoc {
  if (!text.trim()) return { regions: [], tiles: [] };
  const doc = (parse(text) ?? {}) as Partial<MapDoc>;
  return { regions: doc.regions ?? [], tiles: doc.tiles ?? [] };
}

export type TileState = 'lit' | 'cleared-for-jump' | 'contact';

/** ADR 0015's three states, in the ADR's own order of precedence. **Lit**: `status: done` and
 * the issue's `commit` is reachable from `main` (`onMain`, supplied by the caller so this stays
 * a pure decision, not a `git` call). **Cleared for jump**: GitHub shows an open pull request
 * with `gate.yml` green (`gateGreen`, `undefined` when GitHub was never asked -- unreachable or
 * the issue is not open -- reads the same as `false`: no jump clearance without an answer).
 * **Contact**: anything else open. A `done` issue with no reachable commit still reads as
 * contact, not lit -- a merge that has not landed on `main` is not a place to land on yet. */
export function tileStateFor(issue: Issue | undefined, onMain: boolean, gateGreen: boolean | undefined): TileState {
  if (issue?.status === 'done' && onMain) return 'lit';
  if (gateGreen) return 'cleared-for-jump';
  return 'contact';
}

export interface AtlasTile extends AtlasTileSource {
  issueN: number;
  state: TileState;
}

export interface AtlasView {
  regions: (AtlasRegion & { fogged: boolean })[];
  tiles: AtlasTile[];
}

/** The whole atlas, painted: every tile's state, and every region's fog. A region with no lit
 * tile is fogged (ADR 0015) -- computed here, from the tiles this same pass just decided, never
 * stored in `map.yaml` itself. */
export function buildAtlas({
  mapDoc,
  issues,
  isOnMain,
  gateGreenByIssue,
}: {
  mapDoc: MapDoc;
  issues: Issue[];
  isOnMain: (issueN: number) => boolean;
  gateGreenByIssue: Map<number, boolean>;
}): AtlasView {
  const byN = new Map(issues.map((i) => [i.n, i]));
  const tiles: AtlasTile[] = mapDoc.tiles.map((tile) => {
    const issueN = Number(tile.id);
    const issue = byN.get(issueN);
    const state = tileStateFor(issue, isOnMain(issueN), gateGreenByIssue.get(issueN));
    return { ...tile, issueN, state };
  });
  const litRegions = new Set(tiles.filter((t) => t.state === 'lit').map((t) => t.region));
  const regions = mapDoc.regions.map((region) => ({ ...region, fogged: !litRegions.has(region.id) }));
  return { regions, tiles };
}
