// SPDX-License-Identifier: MPL-2.0
// Ported from tools/console/test/run.mjs's readWorktrees fixture coverage (issue 112's `finished`
// field). No real git checkout is exercised here: every shell-out is injected so the fixture
// stays independent of this repository's own worktree layout.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorktrees, readDirAll, readSkillFiles } from '../src/model/read.js';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// A real absolute path built with join(), not a hardcoded POSIX literal: readWorktrees() compares
// shInOkFn's cwd argument against resolve()'d paths, and a forward-slash literal never equals the
// backslash form resolve() produces on Windows CI. tools/console/test/run.mjs's fixture (issue
// 109) hit this first.
const here = dirname(fileURLToPath(import.meta.url));
const fakeRoot = join(here, '__fake-root__');
const fakeSideTree = join(fakeRoot, '.worktrees', 'side-92-worktrees');
const fakeCommonDir = join(fakeRoot, '.git');

const fakePorcelain =
  `worktree ${fakeRoot}\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n\n` +
  `worktree ${fakeSideTree}\nHEAD 2222222222222222222222222222222222222222\nbranch refs/heads/side-92-worktrees\n`;

const fakeListShFn = (cmd: string) =>
  cmd.includes('--git-common-dir') ? fakeCommonDir : cmd.includes('worktree list') ? fakePorcelain : '';

describe('readWorktrees finished field (issue 112)', () => {
  // A non-root tree is finished when no in-progress issue file names it and its working tree is
  // clean. No ancestry: a tree that has not started and a tree whose work has landed via a squash
  // merge are the same shape in git, so `finished` never asks git that question.
  it('marks a clean tree with no in-progress issue file as finished', () => {
    const rows = readWorktrees({ shFn: fakeListShFn, shInFn: () => '' });
    expect(rows.find((r) => r.path === '.worktrees/side-92-worktrees')?.finished).toBe(true);
  });

  it('always reports the root tree as finished: false, even when clean', () => {
    const rows = readWorktrees({ shFn: fakeListShFn, shInFn: () => '' });
    expect(rows.find((r) => r.isRoot)?.finished).toBe(false);
  });

  it('marks a dirty tree as finished: false', () => {
    const rows = readWorktrees({ shFn: fakeListShFn, shInFn: (cwd) => (cwd === fakeSideTree ? ' M some-file.md' : '') });
    expect(rows.find((r) => !r.isRoot)?.finished).toBe(false);
  });
});

// Issue 175 acceptance criteria: "A test adds a fixture agent file under a scratch
// `.claude/agents/` fixture ... and asserts it appears in the room's response on the next load,
// with no code change." Proven here at the real IO layer, against a throwaway directory, not a
// stub: a second call to the same read function, after a file lands on disk, sees it -- no code
// under server/src changes between the two calls.
describe('readDirAll and readSkillFiles pick up a newly written fixture file with no code change (issue 175)', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'verstaan-console-ship-systems-'));
  });

  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  it('readDirAll (.claude/hooks/*) sees a hook file written after the first call', () => {
    const hooksDir = join(scratch, '.claude', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'fast-format.sh'), '#!/bin/sh\necho fast-format\n');
    expect(readDirAll(hooksDir).map((f) => f.name)).toEqual(['fast-format.sh']);

    // Land a second fixture file, the way a real hook script would land mid-session. No function
    // under test is touched between this call and the one above.
    writeFileSync(join(hooksDir, '_env.sh'), '#!/bin/sh\n');
    expect(readDirAll(hooksDir).map((f) => f.name).sort()).toEqual(['_env.sh', 'fast-format.sh']);
  });

  it('readSkillFiles (.claude/skills/*/SKILL.md) sees a new skill directory written after the first call', () => {
    const skillsDir = join(scratch, '.claude', 'skills');
    mkdirSync(join(skillsDir, 'quest'), { recursive: true });
    writeFileSync(join(skillsDir, 'quest', 'SKILL.md'), '---\nname: quest\ndescription: Plans a quest.\n---\n');
    expect(readSkillFiles(skillsDir).map((f) => f.name)).toEqual(['quest/SKILL.md']);

    mkdirSync(join(skillsDir, 'create-map'), { recursive: true });
    writeFileSync(join(skillsDir, 'create-map', 'SKILL.md'), '---\nname: create-map\ndescription: Plans a new map.\n---\n');
    expect(readSkillFiles(skillsDir).map((f) => f.name).sort()).toEqual(['create-map/SKILL.md', 'quest/SKILL.md']);
  });
});
