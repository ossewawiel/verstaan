// SPDX-License-Identifier: MPL-2.0
// Ported from tools/console/test/run.mjs's readWorktrees fixture coverage (issue 112's `finished`
// field). No real git checkout is exercised here: every shell-out is injected so the fixture
// stays independent of this repository's own worktree layout.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorktrees, readDirAll, readSkillFiles, isCommitOnMain, mainAncestorShas } from '../src/model/read.js';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

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

// ADR 0015's "lit" test, and the checkpoint-4 fix: `commit:` is untrusted front-matter text from
// a file this process did not write (mergeIssuesAcrossWorktrees reads every worktree's issues,
// not just this one), and a shell string built from it was a command injection the verifier
// reproduced live against `HEAD; touch /tmp/pwned; echo`. isCommitOnMain never calls a subprocess
// at all any more -- these prove the regex gate closes first, before any git call could happen,
// and that mainAncestorShas never interpolates anything (its one argument, 'main', is a literal).
describe('isCommitOnMain (issue 177, security fix)', () => {
  it('refuses a shell-metacharacter payload before it is ever compared, exactly the injection the verifier reproduced', () => {
    const reachable = new Set(['deadbeef']);
    expect(isCommitOnMain('HEAD; touch /tmp/pwned; echo', reachable)).toBe(false);
    expect(isCommitOnMain('$(touch /tmp/pwned)', reachable)).toBe(false);
    expect(isCommitOnMain('`touch /tmp/pwned`', reachable)).toBe(false);
    expect(isCommitOnMain('HEAD && rm -rf /', reachable)).toBe(false);
  });

  it('refuses anything that is not a bare 7-40 char hex sha', () => {
    const reachable = new Set(['deadbeef']);
    expect(isCommitOnMain(null, reachable)).toBe(false);
    expect(isCommitOnMain(undefined, reachable)).toBe(false);
    expect(isCommitOnMain('', reachable)).toBe(false);
    expect(isCommitOnMain('xyz1234', reachable)).toBe(false); // not hex
    expect(isCommitOnMain('abc', reachable)).toBe(false); // too short
    expect(isCommitOnMain(123 as unknown as string, reachable)).toBe(false); // not a string at all
  });

  it('is true for a full sha present in the reachable set', () => {
    const full = 'a'.repeat(40);
    expect(isCommitOnMain(full, new Set([full]))).toBe(true);
  });

  it('resolves an abbreviated sha by prefix against the reachable set, the same rule git uses', () => {
    const full = `deadbeef${'0'.repeat(32)}`;
    expect(isCommitOnMain('deadbeef', new Set([full]))).toBe(true);
    expect(isCommitOnMain('deadbee0', new Set([full]))).toBe(false);
  });

  it('is false, not thrown, for a well-formed sha that is simply not in the set', () => {
    expect(isCommitOnMain('deadbeef', new Set(['cafef00d']))).toBe(false);
  });
});

describe('mainAncestorShas (issue 177: one git call, not one per issue)', () => {
  it('calls git with array arguments, never a shell-interpolated string', () => {
    const execFileSyncFn = vi.fn(() => Buffer.from('aaa\nbbb\n'));
    mainAncestorShas({ execFileSyncFn: execFileSyncFn as unknown as typeof execFileSync, cwd: '/tmp' });
    expect(execFileSyncFn).toHaveBeenCalledWith('git', ['rev-list', 'main'], expect.objectContaining({ cwd: '/tmp' }));
  });

  it('returns the trimmed, deduplicated set of lines git prints', () => {
    const execFileSyncFn = vi.fn(() => Buffer.from('aaa\nbbb\n\naaa\n'));
    const shas = mainAncestorShas({ execFileSyncFn: execFileSyncFn as unknown as typeof execFileSync });
    expect(shas).toEqual(new Set(['aaa', 'bbb']));
  });

  it('fails closed to an empty set, not a thrown error, when git itself fails', () => {
    const execFileSyncFn = vi.fn(() => {
      throw new Error('fatal: not a git repository');
    });
    const shas = mainAncestorShas({ execFileSyncFn: execFileSyncFn as unknown as typeof execFileSync });
    expect(shas).toEqual(new Set());
  });

  it('against a real, throwaway git repo: a malicious commit: value never executes, and a real merged commit resolves true', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'verstaan-console-atlas-security-'));
    const marker = join(tmpdir(), `verstaan-console-pwned-${Date.now()}`);
    try {
      const git = (args: string[]) => execFileSync('git', args, { cwd: scratch, stdio: 'ignore' });
      git(['init', '-q', '-b', 'main']);
      git(['config', 'user.email', 'fixture@example.com']);
      git(['config', 'user.name', 'Fixture']);
      writeFileSync(join(scratch, 'a.txt'), 'a');
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'one']);
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: scratch }).toString().trim();

      const reachable = mainAncestorShas({ cwd: scratch });

      // The legitimate case: a real commit on main resolves true, full and abbreviated both.
      expect(isCommitOnMain(sha, reachable)).toBe(true);
      expect(isCommitOnMain(sha.slice(0, 7), reachable)).toBe(true);

      // The injection payload the verifier reproduced against the old shell-string version:
      // refused before comparison, and nothing it names ever runs.
      expect(isCommitOnMain(`HEAD; touch ${marker}; echo`, reachable)).toBe(false);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(marker, { force: true });
    }
  });
});
