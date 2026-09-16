// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';
import { buildModel } from '../src/model/parse.js';
import type { RepoModel } from '../src/model/parse.js';

function fixtureRepo(): RepoModel {
  return {
    issueFiles: [
      { name: '01-a.md', content: '---\nissue: 1\ntitle: "A"\nmilestone: M1\nstatus: done\ndepends_on: []\ncommit: abc1111\n---\n## What\nDo A\n' },
      { name: '02-b.md', content: '---\nissue: 2\ntitle: "B"\nmilestone: M1\nstatus: open\ndepends_on: [1]\n---\n## What\nDo B\n' },
    ],
    agentFiles: [],
    lessonsText: '',
    library: [{ group: 'Start here', blurb: 'x', docs: [{ path: 'docs/x.md', content: '# X\nhello' }] }],
    artefacts: [],
    git: { head: 'abc1234', branch: 'main', dirty: 0, remote: 'origin' },
    stamp: { present: false, matches: false },
    worktrees: [],
    generated: '2026-09-09T00:00:00Z',
  };
}

describe('GET /api/state', () => {
  const repo = fixtureRepo();
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('returns application/json equal to buildModel(readRepo())', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/state' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toEqual(buildModel(repo));
  });
});

describe('GET /api/issues', () => {
  const repo = fixtureRepo();
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('lists issues sorted by number', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/issues' });
    expect(res.json().map((i: { n: number }) => i.n)).toEqual([1, 2]);
  });
});

describe('GET /api/issues/:nn', () => {
  const repo = fixtureRepo();
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('returns one issue with its raw file content', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/issues/01' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ n: 1, title: 'A' });
  });

  it('404s for an issue that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/issues/99' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/docs/*', () => {
  const repo = fixtureRepo();
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('renders a known document to HTML with headings', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/docs/x.md' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ path: 'docs/x.md', title: 'X' });
  });

  it('404s for an unknown document', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/docs/nope.md' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /health', () => {
  const { app } = buildApp({ readRepoFn: fixtureRepo });
  afterAll(() => app.close());

  it('answers ok with a pid', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.payload).toMatch(/^ok \d+$/);
  });
});

describe('GET /api/events (issue 173)', () => {
  const repo = fixtureRepo();
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('lists the done issues, newest first, with their commit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ n: 1, title: 'A', commit: 'abc1111' }]);
  });
});

describe('GET /api/github-status (issue 173, ADR 0014)', () => {
  it('reports reachable: true when the injected check succeeds', async () => {
    const repo = fixtureRepo();
    const { app } = buildApp({ readRepoFn: () => repo, githubReachableFn: async () => true });
    const res = await app.inject({ method: 'GET', url: '/api/github-status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reachable: true });
    await app.close();
  });

  it('reports reachable: false, not a 5xx, when the injected check fails -- comms-lost, never an error page', async () => {
    const repo = fixtureRepo();
    const { app } = buildApp({ readRepoFn: () => repo, githubReachableFn: async () => false });
    const res = await app.inject({ method: 'GET', url: '/api/github-status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reachable: false });
    await app.close();
  });
});
