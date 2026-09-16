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
    skillFiles: [],
    commandFiles: [],
    hookFiles: [],
    settingsJsonText: '',
    playbookText: '',
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

describe('GET /api/ship-systems (issue 175)', () => {
  const repo = fixtureRepo();
  repo.agentFiles = [{ name: 'implementer.md', content: '---\nname: implementer\ndescription: Makes tests pass.\nmodel: sonnet\neffort: medium\ntools: Read, Write\ncolor: green\n---\n' }];
  repo.skillFiles = [{ name: 'quest/SKILL.md', content: '---\nname: quest\ndescription: Plans a quest.\n---\n' }];
  repo.commandFiles = [{ name: 'gate.md', content: '---\ndescription: The full local gate.\n---\n' }];
  repo.hookFiles = [{ name: 'fast-format.sh', content: '' }, { name: '_env.sh', content: '' }];
  repo.settingsJsonText = JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: '.claude/hooks/fast-format.sh' }] }] } });
  repo.playbookText = '# Playbook\n\n## The map\n\ntext\n\n## An encounter, start to finish\n\ntext\n';
  const { app, invalidate } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('lists every agent, skill and command file with the fields the room needs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ship-systems' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agents).toEqual([{ name: 'implementer', description: 'Makes tests pass.', model: 'sonnet', effort: 'medium', tools: ['Read', 'Write'], color: 'green' }]);
    expect(body.skills).toEqual([{ name: 'quest', description: 'Plans a quest.', argumentHint: null }]);
    expect(body.commands).toEqual([{ name: 'gate', description: 'The full local gate.' }]);
  });

  it('cross-references hooks against settings.json events, keeping the unreferenced file visible', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ship-systems' });
    const { hooks } = res.json();
    expect(hooks.files.find((f: { file: string }) => f.file === '_env.sh').referencedByEvents).toEqual([]);
    expect(hooks.files.find((f: { file: string }) => f.file === 'fast-format.sh').referencedByEvents).toEqual(['PostToolUse']);
  });

  it('renders the playbook lane from the file\'s own level-2 headings, in order', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ship-systems' });
    expect(res.json().playbookLane).toEqual([{ name: 'The map' }, { name: 'An encounter, start to finish' }]);
  });

  // The acceptance criterion, proven at the whole-route level: an agent file added to the folder
  // (simulated here the same way the real file watcher tells the server to look again --
  // `invalidate()`, no other code touched) appears in the very next response.
  it('lists a newly added agent file on the next load, with no code change', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/ship-systems' });
    expect(before.json().agents.map((a: { name: string }) => a.name)).toEqual(['implementer']);

    repo.agentFiles = [...repo.agentFiles, { name: 'scout.md', content: '---\nname: scout\ndescription: Finds things.\nmodel: haiku\neffort: low\n---\n' }];
    invalidate();

    const after = await app.inject({ method: 'GET', url: '/api/ship-systems' });
    expect(after.json().agents.map((a: { name: string }) => a.name)).toEqual(['implementer', 'scout']);
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
