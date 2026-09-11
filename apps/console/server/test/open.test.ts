// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import { resolveOpenUrl, parseOwnerRepo, OpenError } from '../src/jobs/open.js';

describe('resolveOpenUrl', () => {
  const ctx = { slug: { owner: 'ossewawiel', name: 'verstaan' }, treeRoots: ['/repo', '/repo/.worktrees/side-1'] };

  it('doc opens in-app, under /library/', () => {
    expect(resolveOpenUrl({ what: 'doc', path: 'docs/standards/testing.md' }, ctx)).toBe('/library/docs/standards/testing.md');
  });

  it('artifact opens in-app, under /artifacts/', () => {
    expect(resolveOpenUrl({ what: 'artifact', path: 'docs/decisions/2026-09-08-verstaan/interrogation.html' }, ctx)).toBe(
      '/artifacts/docs/decisions/2026-09-08-verstaan/interrogation.html',
    );
  });

  it('tree opens VS Code, as a vscode://file/ URL, only for a path inside a known worktree', () => {
    const real = process.cwd();
    const url = resolveOpenUrl({ what: 'tree', path: real }, { ...ctx, treeRoots: [real] });
    expect(url).toBe(`vscode://file/${real}`);
  });

  it('tree refuses a path outside every known worktree', () => {
    expect(() => resolveOpenUrl({ what: 'tree', path: '/etc/passwd' }, ctx)).toThrow(OpenError);
  });

  it('pr opens the GitHub pull request URL', () => {
    expect(resolveOpenUrl({ what: 'pr', n: 74 }, ctx)).toBe('https://github.com/ossewawiel/verstaan/pull/74');
  });

  it('issue opens the GitHub issue URL', () => {
    expect(resolveOpenUrl({ what: 'issue', n: 32 }, ctx)).toBe('https://github.com/ossewawiel/verstaan/issues/32');
  });

  it('run opens the GitHub Actions run URL', () => {
    expect(resolveOpenUrl({ what: 'run', id: 12345 }, ctx)).toBe('https://github.com/ossewawiel/verstaan/actions/runs/12345');
  });

  it('an unknown opener is refused', () => {
    expect(() => resolveOpenUrl({ what: 'nonsense' }, ctx)).toThrow(OpenError);
  });
});

describe('parseOwnerRepo', () => {
  it('parses an https remote', () => {
    expect(parseOwnerRepo('https://github.com/ossewawiel/verstaan.git')).toEqual({ owner: 'ossewawiel', name: 'verstaan' });
  });

  it('parses an ssh remote', () => {
    expect(parseOwnerRepo('git@github.com:ossewawiel/verstaan.git')).toEqual({ owner: 'ossewawiel', name: 'verstaan' });
  });
});
