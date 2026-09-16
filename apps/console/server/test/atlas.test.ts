// SPDX-License-Identifier: MPL-2.0
// The atlas (ADR 0015, issue 177): map.yaml parsed, tile state decided, region fog computed.
// Every case here is pure -- no git call, no network call -- the caller supplies `isOnMain` and
// `gateGreenByIssue` as plain data, the same seam buildAtlas() itself asks for.
import { describe, it, expect } from 'vitest';
import { parseMapYaml, tileStateFor, buildAtlas } from '../src/model/atlas.js';
import type { Issue } from '../src/model/parse.js';

const MAP_YAML = `
regions:
  - {id: m0, name: M0, goal: g, x: 0, y: 0, size: 100}
  - {id: m1, name: M1, goal: g, x: 200, y: 0, size: 100}
tiles:
  - {id: '01', region: m0, title: One, x: 0, y: 0, size: 10}
  - {id: '02', region: m0, title: Two, x: 20, y: 0, size: 10}
  - {id: '07', region: m1, title: Seven, x: 200, y: 0, size: 10}
`;

function issue(n: number, status: Issue['status'], commit: string | null = null): Issue {
  return {
    n,
    file: `${String(n).padStart(2, '0')}-x.md`,
    title: `Issue ${n}`,
    milestone: 'M0',
    status,
    worktree: null,
    dependsOn: [],
    agent: null,
    agents: [],
    model: null,
    effort: null,
    checkpoint: null,
    commit,
    what: '',
    doneWhen: { total: 0, ticked: 0 },
    githubIssue: null,
  };
}

describe('parseMapYaml', () => {
  it('reads regions and tiles', () => {
    const doc = parseMapYaml(MAP_YAML);
    expect(doc.regions.map((r) => r.id)).toEqual(['m0', 'm1']);
    expect(doc.tiles.map((t) => t.id)).toEqual(['01', '02', '07']);
  });

  it('returns an empty atlas for blank text, never throws', () => {
    expect(parseMapYaml('')).toEqual({ regions: [], tiles: [] });
    expect(parseMapYaml('   \n')).toEqual({ regions: [], tiles: [] });
  });
});

describe('tileStateFor', () => {
  it('is lit when done and the commit is on main', () => {
    expect(tileStateFor(issue(1, 'done', 'abc'), true, undefined)).toBe('lit');
  });

  it('is contact when done but the commit is not (yet) on main', () => {
    expect(tileStateFor(issue(1, 'done', 'abc'), false, undefined)).toBe('contact');
  });

  it('is cleared-for-jump when an open PR has a green gate, and the issue is not lit', () => {
    expect(tileStateFor(issue(1, 'open'), false, true)).toBe('cleared-for-jump');
  });

  it('lit outranks cleared-for-jump', () => {
    expect(tileStateFor(issue(1, 'done', 'abc'), true, true)).toBe('lit');
  });

  it('is contact for an open issue with no PR or a PR that has not gone green', () => {
    expect(tileStateFor(issue(1, 'open'), false, undefined)).toBe('contact');
    expect(tileStateFor(issue(1, 'open'), false, false)).toBe('contact');
  });
});

describe('buildAtlas', () => {
  const mapDoc = parseMapYaml(MAP_YAML);
  const issues = [issue(1, 'done', 'abc'), issue(2, 'open'), issue(7, 'open')];

  it('paints every tile from the issues, and fogs a region with no lit tile', () => {
    const atlas = buildAtlas({
      mapDoc,
      issues,
      isOnMain: (n) => n === 1,
      gateGreenByIssue: new Map([[7, true]]),
    });
    expect(atlas.tiles.find((t) => t.id === '01')?.state).toBe('lit');
    expect(atlas.tiles.find((t) => t.id === '02')?.state).toBe('contact');
    expect(atlas.tiles.find((t) => t.id === '07')?.state).toBe('cleared-for-jump');
    // m0 has a lit tile (01), m1 does not (07 is only cleared-for-jump, not lit).
    expect(atlas.regions.find((r) => r.id === 'm0')?.fogged).toBe(false);
    expect(atlas.regions.find((r) => r.id === 'm1')?.fogged).toBe(true);
  });

  it('never crashes on a tile whose issue is missing from the issue list', () => {
    const atlas = buildAtlas({
      mapDoc: { regions: mapDoc.regions, tiles: [{ id: '999', region: 'm0', title: 'Ghost', x: 0, y: 0, size: 10 }] },
      issues: [],
      isOnMain: () => false,
      gateGreenByIssue: new Map(),
    });
    expect(atlas.tiles[0].state).toBe('contact');
  });
});
