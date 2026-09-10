// SPDX-License-Identifier: MPL-2.0
// Ported from tools/console/test/run.mjs's readWorktrees fixture coverage (issue 112's `finished`
// field). No real git checkout is exercised here: every shell-out is injected so the fixture
// stays independent of this repository's own worktree layout.
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorktrees } from '../src/model/read.js';

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
