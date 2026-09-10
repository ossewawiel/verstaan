// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseIssues, buildModel, parseWorktreePorcelain, parseLessons, inProgressQuests, type Issue, type WorktreeSummary } from '../src/model/parse.js';

describe('parseFrontmatter', () => {
  it('parses scalars, null and simple lists', () => {
    const fm = parseFrontmatter('---\nissue: 7\ntitle: "A title"\nstatus: open\ndepends_on: [1, 2]\nworktree: null\n---\nbody');
    expect(fm).toEqual({ issue: 7, title: 'A title', status: 'open', depends_on: [1, 2], worktree: null });
  });

  it('returns null when there is no frontmatter block', () => {
    expect(parseFrontmatter('# just a heading')).toBeNull();
  });
});

describe('parseIssues', () => {
  it('extracts one issue per numbered file, skipping test-cases companions', () => {
    const files = [
      { name: '07-x.md', content: '---\nissue: 7\ntitle: "X"\nmilestone: M1\nstatus: done\ndepends_on: []\n---\n## What\nDoes a thing\n- [x] done one\n- [ ] done two\n' },
      { name: '07-x-test-cases.md', content: '---\nissue: 7\n---\nreview: pending' },
    ];
    const issues = parseIssues(files);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ n: 7, title: 'X', status: 'done', doneWhen: { total: 2, ticked: 1 } });
  });
});

describe('parseWorktreePorcelain', () => {
  it('parses one block per tree', () => {
    const text = 'worktree /a\nHEAD abcdef1234\nbranch refs/heads/main\n\nworktree /b\nHEAD 1234567890\ndetached\n';
    const rows = parseWorktreePorcelain(text);
    expect(rows).toEqual([
      { path: '/a', head: 'abcdef1', branch: 'main', detached: false },
      { path: '/b', head: '1234567', branch: null, detached: true },
    ]);
  });
});

describe('parseLessons', () => {
  it('counts signatures and flags ripe ones at three or more', () => {
    const text = ['{"sig":"a","ts":"2026-01-01"}', '{"sig":"a","ts":"2026-01-02"}', '{"sig":"a","ts":"2026-01-03"}', '{"sig":"b","ts":"2026-01-01"}'].join('\n');
    const l = parseLessons(text);
    expect(l.total).toBe(4);
    expect(l.ripe).toEqual(['a']);
  });
});

describe('inProgressQuests (issue 110)', () => {
  const mkIssue = (n: number, title: string): Issue => ({
    n,
    file: `${n}-x.md`,
    title,
    milestone: 'Side',
    status: 'in-progress',
    worktree: null,
    dependsOn: [],
    agent: null,
    agents: [],
    model: null,
    effort: null,
    checkpoint: null,
    commit: null,
    what: '',
    doneWhen: { total: 0, ticked: 0 },
  });
  const mkTree = (over: Partial<WorktreeSummary>): WorktreeSummary => ({
    path: '.',
    branch: null,
    detached: false,
    head: 'abc',
    isRoot: false,
    dirty: 0,
    stampMatches: false,
    merged: false,
    issue: null,
    ...over,
  });

  it('reports the tree of a single in-progress quest', () => {
    const rows = inProgressQuests(
      [mkIssue(50, 'A')],
      [mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', issue: { n: 50, title: 'A' } })],
    );
    expect(rows).toEqual([{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: 'side-50-a' }]);
  });

  it('reports two in-progress quests, lowest number first', () => {
    const rows = inProgressQuests(
      [mkIssue(50, 'A'), mkIssue(51, 'B')],
      [
        mkTree({ path: '.worktrees/side-51-b', branch: 'side-51-b', issue: { n: 51, title: 'B' } }),
        mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', issue: { n: 50, title: 'A' } }),
      ],
    );
    expect(rows.map((r) => [r.n, r.tree])).toEqual([
      [50, 'side-50-a'],
      [51, 'side-51-b'],
    ]);
  });

  it('drops a quest in-progress only in a merged tree', () => {
    const rows = inProgressQuests(
      [mkIssue(50, 'A')],
      [mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', merged: true, issue: { n: 50, title: 'A' } })],
    );
    expect(rows).toEqual([]);
  });

  it('returns an empty list when no issue is in-progress', () => {
    expect(inProgressQuests([], [])).toEqual([]);
  });

  it('reports tree: null when only the root tree names the quest', () => {
    const rows = inProgressQuests(
      [mkIssue(50, 'A')],
      [mkTree({ path: '.', branch: 'main', isRoot: true, issue: { n: 50, title: 'A' } })],
    );
    expect(rows).toEqual([{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: null }]);
  });
});

describe('buildModel', () => {
  it('assembles the whole model from raw repo inputs', () => {
    const model = buildModel({
      issueFiles: [{ name: '01-a.md', content: '---\nissue: 1\ntitle: "A"\nmilestone: M1\nstatus: open\ndepends_on: []\n---\n## What\nDo A\n' }],
      agentFiles: [],
      lessonsText: '',
      git: { head: 'abc', branch: 'main', dirty: 0, remote: 'origin' },
      stamp: { present: false, matches: false },
      generated: '2026-09-09T00:00:00Z',
    });
    expect(model.totals).toEqual({ issues: 1, done: 0 });
    expect(model.next?.n).toBe(1);
    expect(model.inProgress).toEqual([]);
  });
});
