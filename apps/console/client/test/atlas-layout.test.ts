// SPDX-License-Identifier: MPL-2.0
// layoutTiles (ADR 0015, issue 177): a fogged region's contact tiles move to that region's own
// bottom edge, evenly spaced; every other tile keeps its literal map.yaml position. Pure, no DOM.
import { describe, it, expect } from 'vitest';
import { layoutTiles } from '../src/rooms/AtlasRoom';
import type { AtlasRegion, AtlasTile } from '../src/api/client';

function region(id: string, fogged: boolean, x = 0): AtlasRegion {
  return { id, name: id, goal: 'g', x, y: 0, size: 1200, fogged };
}

function tile(id: string, region: string, state: AtlasTile['state'], x = 10, y = 10): AtlasTile {
  return { id, region, title: `T${id}`, x, y, size: 32, issueN: Number(id), state };
}

describe('layoutTiles', () => {
  it('leaves every tile at its literal position in an unfogged region', () => {
    const regions = [region('m0', false)];
    const tiles = [tile('01', 'm0', 'lit', 50, 60), tile('02', 'm0', 'contact', 80, 90)];
    const out = layoutTiles(tiles, regions);
    expect(out.find((t) => t.id === '01')).toMatchObject({ renderX: 50, renderY: 60 });
    expect(out.find((t) => t.id === '02')).toMatchObject({ renderX: 80, renderY: 90 });
  });

  it('moves a fogged region\'s contact tiles onto its own bottom edge, evenly spaced', () => {
    const regions = [region('m6', true)];
    const tiles = [tile('39', 'm6', 'contact'), tile('40', 'm6', 'contact'), tile('41', 'm6', 'contact')];
    const out = layoutTiles(tiles, regions);
    const edgeY = regions[0].y + regions[0].size + 28; // EDGE_GAP
    for (const t of out) {
      expect(t.renderY).toBe(edgeY);
      expect(t.renderX).toBeGreaterThanOrEqual(regions[0].x);
      expect(t.renderX).toBeLessThanOrEqual(regions[0].x + regions[0].size);
    }
    // Evenly spaced: the gaps between consecutive renderX values are equal.
    const xs = out.map((t) => t.renderX).sort((a, b) => a - b);
    const gap0 = xs[1] - xs[0];
    const gap1 = xs[2] - xs[1];
    expect(gap0).toBeCloseTo(gap1, 5);
  });

  it('leaves a non-contact tile (e.g. cleared-for-jump) in a fogged region at its literal position', () => {
    const regions = [region('m6', true)];
    const tiles = [tile('39', 'm6', 'cleared-for-jump', 55, 65)];
    const out = layoutTiles(tiles, regions);
    expect(out[0]).toMatchObject({ renderX: 55, renderY: 65 });
  });

  it('a single contact tile in a fogged region centres on the edge, no NaN from a lone tile', () => {
    const regions = [region('m6', true)];
    const tiles = [tile('39', 'm6', 'contact')];
    const out = layoutTiles(tiles, regions);
    expect(out[0].renderX).toBe(regions[0].x + regions[0].size / 2);
    expect(Number.isNaN(out[0].renderX)).toBe(false);
  });

  it('handles two regions independently, one fogged, one not', () => {
    const regions = [region('m0', false, 0), region('m6', true, 2000)];
    const tiles = [tile('01', 'm0', 'lit', 10, 10), tile('39', 'm6', 'contact')];
    const out = layoutTiles(tiles, regions);
    expect(out.find((t) => t.id === '01')).toMatchObject({ renderX: 10, renderY: 10 });
    expect(out.find((t) => t.id === '39')?.renderY).toBe(regions[1].y + regions[1].size + 28);
  });

  it('a tile naming a region not present in the regions list still renders at its literal position', () => {
    const out = layoutTiles([tile('01', 'ghost-region', 'contact', 5, 6)], []);
    expect(out).toEqual([{ ...tile('01', 'ghost-region', 'contact', 5, 6), renderX: 5, renderY: 6 }]);
  });
});
