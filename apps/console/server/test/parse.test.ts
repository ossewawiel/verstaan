// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  parseIssues,
  buildModel,
  parseWorktreePorcelain,
  parseLessons,
  inProgressQuests,
  lastEvents,
  parseAgentDetails,
  parseSkills,
  parseCommands,
  crossReferenceHooks,
  playbookLane,
  buildShipSystems,
  type Issue,
  type WorktreeSummary,
} from '../src/model/parse.js';

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
    finished: false,
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

  // issue 112: the old `merged` flag answered "is this branch's HEAD an ancestor of main", true
  // for a tree that has not committed yet — exactly as true as for a tree whose work has landed —
  // and inProgressQuests dropped the quest whenever every claimant tree carried it. The field is
  // gone; a matching tree is enough on its own, so a tree at `main`'s own head still contributes
  // its quest.
  it('reports a quest whose tree sits at main\'s own head (issue 112)', () => {
    const rows = inProgressQuests(
      [mkIssue(50, 'A')],
      [mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', head: 'abc', issue: { n: 50, title: 'A' } })],
    );
    expect(rows).toEqual([{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: 'side-50-a' }]);
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

describe('lastEvents (issue 173)', () => {
  const mkIssue = (n: number, status: Issue['status'], commit: unknown = null): Issue => ({
    n,
    file: `${n}-x.md`,
    title: `Quest ${n}`,
    milestone: 'M1',
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
  });

  it('returns the done issues, newest first', () => {
    const issues = [mkIssue(1, 'done', 'a1'), mkIssue(2, 'open'), mkIssue(3, 'done', 'c3')];
    expect(lastEvents(issues)).toEqual([
      { n: 3, title: 'Quest 3', commit: 'c3' },
      { n: 1, title: 'Quest 1', commit: 'a1' },
    ]);
  });

  it('never returns fewer than `limit` rows when more than `limit` exist, regardless of input order', () => {
    // Deliberately out of number order: a truncation bug that slices before sorting would drop
    // #7 here (issue 173 acceptance criteria: "no client-side truncation bug").
    const issues = [mkIssue(7, 'done'), mkIssue(1, 'done'), mkIssue(2, 'done'), mkIssue(3, 'done'), mkIssue(4, 'done'), mkIssue(5, 'done'), mkIssue(6, 'done')];
    const events = lastEvents(issues, 5);
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.n)).toEqual([7, 6, 5, 4, 3]);
  });

  it('returns fewer than `limit` rows only when fewer than `limit` quests have actually landed', () => {
    expect(lastEvents([mkIssue(1, 'done'), mkIssue(2, 'open')], 5)).toHaveLength(1);
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

// Issue 175: Ship systems.
describe('parseAgentDetails', () => {
  it('reads name, description, model, effort, tools and colour from agent front matter', () => {
    const files = [
      {
        name: 'implementer.md',
        content:
          '---\nname: implementer\ndescription: Makes tests pass. Use for any tooling issue.\ntools: Read, Write, Edit, Grep, Glob, Bash\nmodel: sonnet\neffort: medium\ncolor: green\n---\n## Read first\n',
      },
    ];
    const [agent] = parseAgentDetails(files);
    expect(agent).toEqual({
      name: 'implementer',
      description: 'Makes tests pass. Use for any tooling issue.',
      model: 'sonnet',
      effort: 'medium',
      tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
      color: 'green',
    });
  });

  // The whole point of this acceptance criterion (issue 175): a fixture agent file added to
  // `.claude/agents/`, with no console code change, appears in parseAgentDetails' own output on
  // the next call -- proven here by calling it twice, the second time with one more file, exactly
  // what a fresh `readDir()` would return after a file lands mid-session.
  it('lists a newly added agent file with no code change, on the next call', () => {
    const before = [{ name: 'implementer.md', content: '---\nname: implementer\nmodel: sonnet\neffort: medium\n---\n' }];
    const after = [...before, { name: 'scout.md', content: '---\nname: scout\ndescription: Finds things.\nmodel: haiku\neffort: low\ntools: Read\n---\n' }];
    expect(parseAgentDetails(before).map((a) => a.name)).toEqual(['implementer']);
    expect(parseAgentDetails(after).map((a) => a.name)).toEqual(['implementer', 'scout']);
    expect(parseAgentDetails(after).find((a) => a.name === 'scout')).toMatchObject({ description: 'Finds things.', model: 'haiku', tools: ['Read'] });
  });
});

describe('parseSkills', () => {
  it('reads name, description and argument-hint, falling back to the directory name', () => {
    const files = [
      { name: 'create-map/SKILL.md', content: '---\nname: create-map\ndescription: Plans a new map.\nargument-hint: [a seed]\n---\nbody' },
      { name: 'no-name/SKILL.md', content: '---\ndescription: Has no name field.\n---\nbody' },
    ];
    const skills = parseSkills(files);
    // parseFrontmatter's generic [a, b]-list rule reads a bracketed, comma-free phrase as a
    // one-item array (its outer brackets stripped); parseSkills normalises that back to a plain
    // string, so the room reads "a seed", not a stray array or the raw "[a seed]".
    expect(skills).toEqual([
      { name: 'create-map', description: 'Plans a new map.', argumentHint: 'a seed' },
      { name: 'no-name', description: 'Has no name field.', argumentHint: null },
    ]);
  });
});

describe('parseCommands', () => {
  it('names a command from its file name, since command front matter carries no name field', () => {
    const files = [{ name: 'factory-status.md', content: '---\ndescription: Regenerate STATE.md.\n---\n1. Do it.\n' }];
    expect(parseCommands(files)).toEqual([{ name: 'factory-status', description: 'Regenerate STATE.md.' }]);
  });
});

describe('crossReferenceHooks', () => {
  const settingsJson = JSON.stringify({
    hooks: {
      PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/fast-format.sh"' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/gate-fast.sh"' }] }],
    },
  });

  it('marks a hook file referenced by an event, and one not referenced by any event, as a visible gap', () => {
    const { events, files } = crossReferenceHooks(['fast-format.sh', 'gate-fast.sh', '_env.sh'], settingsJson);
    expect(files.find((f) => f.file === 'fast-format.sh')?.referencedByEvents).toEqual(['PostToolUse']);
    expect(files.find((f) => f.file === '_env.sh')?.referencedByEvents).toEqual([]);
    expect(events.find((e) => e.event === 'PostToolUse')?.hooks).toEqual([{ command: expect.stringContaining('fast-format.sh'), file: 'fast-format.sh', exists: true }]);
  });

  it('marks an event whose command names a missing hook file as a visible gap', () => {
    const { events } = crossReferenceHooks(['gate-fast.sh'], settingsJson);
    const postToolUse = events.find((e) => e.event === 'PostToolUse');
    expect(postToolUse?.hooks[0]).toEqual({ command: expect.stringContaining('fast-format.sh'), file: 'fast-format.sh', exists: false });
  });

  it('reads no events from malformed JSON, instead of throwing', () => {
    expect(crossReferenceHooks(['a.sh'], 'not json').events).toEqual([]);
  });
});

describe('playbookLane', () => {
  it('takes station names from the level-2 headings, in file order', () => {
    const headings = [
      { level: 1, text: 'Playbook' },
      { level: 2, text: 'The map' },
      { level: 3, text: 'A sub-point' },
      { level: 2, text: 'An encounter, start to finish' },
      { level: 2, text: 'The gate ladder' },
    ];
    expect(playbookLane(headings)).toEqual([{ name: 'The map' }, { name: 'An encounter, start to finish' }, { name: 'The gate ladder' }]);
  });
});

describe('buildShipSystems', () => {
  it('assembles agents, skills, commands, hooks and the playbook lane from raw repo inputs', () => {
    const model = buildShipSystems({
      agentFiles: [{ name: 'implementer.md', content: '---\nname: implementer\nmodel: sonnet\neffort: medium\ntools: Read\n---\n' }],
      skillFiles: [{ name: 'quest/SKILL.md', content: '---\nname: quest\ndescription: Plans a quest.\n---\n' }],
      commandFiles: [{ name: 'gate.md', content: '---\ndescription: The full local gate.\n---\n' }],
      hookFileNames: ['a.sh'],
      settingsJsonText: JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: '.claude/hooks/a.sh' }] }] } }),
      playbookHeadings: [{ level: 2, text: 'The map' }],
      generated: '2026-09-16T00:00:00Z',
    });
    expect(model.agents.map((a) => a.name)).toEqual(['implementer']);
    expect(model.skills.map((s) => s.name)).toEqual(['quest']);
    expect(model.commands.map((c) => c.name)).toEqual(['gate']);
    expect(model.hooks.files).toEqual([{ file: 'a.sh', referencedByEvents: ['Stop'] }]);
    expect(model.playbookLane).toEqual([{ name: 'The map' }]);
    expect(model.generated).toBe('2026-09-16T00:00:00Z');
  });
});
