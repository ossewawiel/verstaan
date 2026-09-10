// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseIssues, buildModel, parseWorktreePorcelain, parseLessons } from '../src/model/parse.js';

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
  });
});
