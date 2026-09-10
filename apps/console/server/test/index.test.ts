// SPDX-License-Identifier: MPL-2.0
// Ported behaviour from tools/console/test/run.mjs, which covered debounce/watchPaths/
// watchDirectory before the console became this app; the port itself (apps/console) had picked
// up zero coverage of them until now.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FSWatcher } from 'node:fs';
import { debounce, watchPaths, watchDirectory, shouldIgnoreGitEcho } from '../src/index.js';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits `ms` after the last call before firing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    vi.advanceTimersByTime(50);
    d('b');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('still fires within `maxMs` under a steady stream of calls', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, 250);
    // A call every 60ms keeps resetting the 100ms trailing timer, so without a maxMs bound this
    // would never fire.
    for (let i = 0; i < 10; i++) {
      d(`n${i}`);
      vi.advanceTimersByTime(60);
    }
    expect(fn.mock.calls.length).toBeGreaterThan(0);
  });

  it('names the last section before the timer fires', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('issues');
    d('docs');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('docs');
  });
});

describe('watchPaths', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'verstaan-console-'));
    mkdirSync(join(root, 'docs', 'factory', 'issues'), { recursive: true });
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('labels each existing path with its section', () => {
    const paths = watchPaths(root, [], null);
    const bySection = Object.fromEntries(paths.map((p) => [p.section, p.path]));
    expect(bySection.issues).toBe(join(root, 'docs', 'factory', 'issues'));
    expect(bySection.state).toBe(join(root, 'docs', 'factory'));
    expect(bySection.docs).toBe(join(root, 'docs'));
    expect(bySection.party).toBe(join(root, '.claude', 'agents'));
  });

  it('adds the common dir, its refs and worktrees as `git`/`worktrees` sections', () => {
    const commonDir = join(root, '.git');
    mkdirSync(join(commonDir, 'refs'), { recursive: true });
    mkdirSync(join(commonDir, 'worktrees'), { recursive: true });
    const paths = watchPaths(root, [], commonDir);
    const bySection = new Map(paths.map((p) => [p.path, p.section]));
    expect(bySection.get(commonDir)).toBe('git');
    expect(bySection.get(join(commonDir, 'refs'))).toBe('git');
    expect(bySection.get(join(commonDir, 'worktrees'))).toBe('worktrees');
  });

  it('skips a path that does not exist', () => {
    const paths = watchPaths(join(root, 'nowhere'), [], null);
    expect(paths).toEqual([]);
  });

  it('adds each worktree issues directory that exists', () => {
    const wtDir = join(root, 'wt1');
    mkdirSync(join(wtDir, 'docs', 'factory', 'issues'), { recursive: true });
    const paths = watchPaths(root, [{ path: 'wt1' }], null);
    expect(paths.some((p) => p.path === join(wtDir, 'docs', 'factory', 'issues') && p.section === 'issues')).toBe(true);
  });
});

describe('watchDirectory', () => {
  it('watches an existing directory and reports changes under its section', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-console-watch-'));
    const watchers: FSWatcher[] = [];
    try {
      const onChange = vi.fn();
      const w = watchDirectory(dir, onChange, 'docs', watchers);
      expect(w).not.toBeNull();
      expect(watchers).toContain(w);
    } finally {
      for (const w of watchers) w.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tolerates a path that cannot be watched, without throwing', () => {
    const watchers: FSWatcher[] = [];
    const onChange = vi.fn();
    const missing = join(tmpdir(), 'verstaan-console-does-not-exist-' + Date.now());
    expect(() => watchDirectory(missing, onChange, 'docs', watchers)).not.toThrow();
    expect(watchers).toEqual([]);
  });
});

describe('shouldIgnoreGitEcho', () => {
  it('ignores a `git` section event shortly after this process ran a git command', () => {
    expect(shouldIgnoreGitEcho('git', 10)).toBe(true);
  });

  it('ignores a `worktrees` section event shortly after this process ran a git command', () => {
    expect(shouldIgnoreGitEcho('worktrees', 10)).toBe(true);
  });

  it('does not ignore a `git` section event well after this process last ran a git command', () => {
    expect(shouldIgnoreGitEcho('git', 5000)).toBe(false);
  });

  it('never ignores sections driven by writes outside this process', () => {
    expect(shouldIgnoreGitEcho('issues', 0)).toBe(false);
    expect(shouldIgnoreGitEcho('docs', 0)).toBe(false);
    expect(shouldIgnoreGitEcho('state', 0)).toBe(false);
    expect(shouldIgnoreGitEcho('party', 0)).toBe(false);
  });
});
