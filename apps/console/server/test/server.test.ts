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
    mapYamlText: '',
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

describe('GET /api/codex/:nn (issue 176)', () => {
  const repo = fixtureRepo();
  repo.issueFiles = [
    {
      name: '03-c.md',
      content: [
        '---',
        'issue: 3',
        'title: "C"',
        'milestone: M1',
        'status: open',
        'depends_on: []',
        'agent: implementer',
        'model: sonnet',
        'effort: medium',
        'checkpoint: null',
        '---',
        '## What',
        '',
        'Backstory citing ADR 0011.',
        '',
        'The outcome sentence.',
        '',
        '## Acceptance criteria',
        '',
        '- One.',
        '',
        '## Not in scope',
        '',
        'Nothing else.',
        '',
        '## Done when',
        '',
        '- [ ] One.',
        '',
      ].join('\n'),
    },
  ];
  repo.library = [
    { group: 'Start here', blurb: 'x', docs: [{ path: 'docs/glossary.md', content: '| Term | Meaning | Defined in |\n|---|---|---|\n| ADR | An architecture decision record. | docs/adr/ |\n' }] },
    { group: 'Decisions', blurb: 'x', docs: [{ path: 'docs/adr/0011-console-actions-run-only-allow-listed-scripts.md', content: '# 0011' }] },
  ];
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('returns the objective, intel, loadout, orders and after-action, sourced from the issue file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/codex/03' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.objective).toBe('The outcome sentence.');
    expect(body.intel).toContainEqual({ kind: 'adr', text: 'ADR 0011', href: '/library/docs/adr/0011-console-actions-run-only-allow-listed-scripts.md' });
    expect(body.loadout).toEqual({ agent: 'implementer', model: 'sonnet', effort: 'medium', checkpoint: null });
    expect(body.orders).toEqual({ acceptanceCriteria: '- One.', notInScope: 'Nothing else.' });
    expect(body.afterAction).toEqual({ doneWhen: { total: 1, ticked: 0 }, commit: null, verifier: null });
  });

  it('404s for an issue that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/codex/99' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/debrief (issue 176)', () => {
  const repo = fixtureRepo();
  repo.lessonsText = ['{"sig":"a","ts":"2026-01-01T00:00:00Z"}', '{"sig":"b","ts":"2026-01-05T00:00:00Z"}', '{"sig":"a","ts":"2026-01-03T00:00:00Z"}'].join('\n');
  const { app } = buildApp({ readRepoFn: () => repo });
  afterAll(() => app.close());

  it('groups lessons.jsonl by sig, newest group first, with a count per group', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/debrief' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((g: { sig: string }) => g.sig)).toEqual(['b', 'a']);
    expect(body.find((g: { sig: string }) => g.sig === 'a').count).toBe(2);
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

describe('GET /api/atlas (ADR 0015, issue 177)', () => {
  function repoWithMap(): RepoModel {
    return {
      ...fixtureRepo(),
      mapYamlText:
        'regions:\n' +
        '  - {id: m0, name: M0, goal: g, x: 0, y: 0, size: 100}\n' +
        '  - {id: m1, name: M1, goal: g, x: 200, y: 0, size: 100}\n' +
        'tiles:\n' +
        // issue 1: done, commit abc1111 (fixtureRepo). issue 2: open, no PR.
        "  - {id: '01', region: m0, title: A, x: 0, y: 0, size: 10}\n" +
        "  - {id: '02', region: m1, title: B, x: 200, y: 0, size: 10}\n",
    };
  }

  it('paints lit and contact from the issue files alone when GitHub is unreachable, and leaves cleared-for-jump empty', async () => {
    const repo = repoWithMap();
    const { app } = buildApp({
      readRepoFn: () => repo,
      githubReachableFn: async () => false,
      // fixtureRepo's issue 1 carries commit: 'abc1111' -- present here as "on main".
      mainAncestorShasFn: () => new Set(['abc1111']),
      // Proves the GitHub round trip is skipped outright when unreachable, not just ignored.
      openPullRequestGateStatesFn: async () => {
        throw new Error('must not be called when GitHub is unreachable');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/atlas' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.githubReachable).toBe(false);
    expect(body.tiles.find((t: { id: string }) => t.id === '01').state).toBe('lit');
    expect(body.tiles.find((t: { id: string }) => t.id === '02').state).toBe('contact');
    expect(body.tiles.some((t: { state: string }) => t.state === 'cleared-for-jump')).toBe(false);
    await app.close();
  });

  it('adds cleared-for-jump only when GitHub is reachable and a gate check answers', async () => {
    const repo = repoWithMap();
    const { app } = buildApp({
      readRepoFn: () => repo,
      githubReachableFn: async () => true,
      mainAncestorShasFn: () => new Set(),
      ghAuthTokenFn: () => 'tok',
      openPullRequestGateStatesFn: async () => new Map([[2, true]]),
    });
    const res = await app.inject({ method: 'GET', url: '/api/atlas' });
    const body = res.json();
    expect(body.githubReachable).toBe(true);
    expect(body.tiles.find((t: { id: string }) => t.id === '02').state).toBe('cleared-for-jump');
    await app.close();
  });
});
