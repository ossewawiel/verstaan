// SPDX-License-Identifier: MPL-2.0
// Tests for the staleness rule console.sh, console.cmd, console.ps1 and POST /api/restart all run
// through scripts/build-if-stale.mjs (issues 162 and 179), so they can never disagree about when
// an install or a rebuild is needed. ensureBuilt and ensureInstalled both take an injectable
// spawnFn, mirroring restart.ts's own spawnFn injection for runLauncher, so these tests can drive
// a fake npm ci / npm run build outcome without ever shelling out to a real one; a real install
// and build is covered by the report manual proofs, which need a real, buildable apps/console
// tree.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A dynamic import of an absolute `file://` URL, not a bare relative specifier (checkpoint-4
// review): every attempt to reach `build-if-stale.mjs` via a relative path -- a static `import
// ... from '../scripts/build-if-stale.mjs'`, a dynamic `import(...)` at module top level, a
// dynamic `import(...)` inside `beforeAll` -- reproducibly hit a "SyntaxError: Invalid or
// unexpected token" on Windows CI only, and each time the reported location tracked that exact
// import call precisely (never a red herring past the first attempt). Every other server/test
// file imports a compiled .js/.ts sibling with a relative specifier and works everywhere; this is
// the only one loading a plain .mjs script, so a relative specifier resolving it is the one
// factor common to every failure. Handing `import()` an absolute `file://` URL instead bypasses
// whatever in Vite/Vitest's own specifier resolution mishandles this case on Windows -- Node's
// own dynamic import has always accepted an absolute URL regardless of platform.
const buildIfStaleUrl = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/build-if-stale.mjs')).href;
let isStale: typeof import('../scripts/build-if-stale.mjs').isStale;
let ensureBuilt: typeof import('../scripts/build-if-stale.mjs').ensureBuilt;
let isInstallStale: typeof import('../scripts/build-if-stale.mjs').isInstallStale;
let ensureInstalled: typeof import('../scripts/build-if-stale.mjs').ensureInstalled;
beforeAll(async () => {
  ({ isStale, ensureBuilt, isInstallStale, ensureInstalled } = await import(/* @vite-ignore */ buildIfStaleUrl));
});

/** Marks `dir` as "already installed successfully through ensureInstalled" -- `node_modules`
 * present with a stamp no `package.json`/`package-lock.json` in these fixtures is ever newer
 * than. Called by every fixture below that is not itself testing the install decision, so those
 * tests exercise the build decision in isolation, the way they did before issue 179 added the
 * install decision in front of it. */
function withFreshInstall(dir: string): void {
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', '.install-stamp'), '0');
}

/** A fixture with `dist`/`dist-server` already present *and* a build stamp already written, i.e.
 * "already built successfully through ensureBuilt" -- the state `isStale` must read as fresh
 * when nothing has changed since. Also already installed (see `withFreshInstall`), so tests using
 * this fixture exercise only the build decision. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
  mkdirSync(join(dir, 'dist'), { recursive: true });
  mkdirSync(join(dir, 'dist-server', 'server', 'src'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>\n');
  writeFileSync(join(dir, 'dist-server', 'server', 'src', 'index.js'), '// stub\n');
  writeFileSync(join(dir, 'dist-server', '.build-stamp'), '0');
  withFreshInstall(dir);
  return dir;
}

describe('isStale', () => {
  it('is stale when dist/index.html is missing', () => {
    const dir = fixture();
    try {
      rmSync(join(dir, 'dist', 'index.html'));
      expect(isStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is stale when dist-server/server/src/index.js is missing', () => {
    const dir = fixture();
    try {
      rmSync(join(dir, 'dist-server', 'server', 'src', 'index.js'));
      expect(isStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is stale when the build output exists but no build stamp does (never built through ensureBuilt)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      mkdirSync(join(dir, 'dist'), { recursive: true });
      mkdirSync(join(dir, 'dist-server', 'server', 'src'), { recursive: true });
      writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>\n');
      writeFileSync(join(dir, 'dist-server', 'server', 'src', 'index.js'), '// stub\n');
      expect(isStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is not stale when the build stamp is newer than every source file', () => {
    const dir = fixture();
    try {
      mkdirSync(join(dir, 'server', 'src'), { recursive: true });
      const old = new Date('2020-01-01');
      writeFileSync(join(dir, 'server', 'src', 'index.ts'), '// old\n');
      utimesSync(join(dir, 'server', 'src', 'index.ts'), old, old);
      expect(isStale(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is stale when a file under server/src is newer than the build stamp', () => {
    const dir = fixture();
    try {
      mkdirSync(join(dir, 'server', 'src'), { recursive: true });
      const future = new Date(Date.now() + 60_000);
      writeFileSync(join(dir, 'server', 'src', 'index.ts'), '// edited\n');
      utimesSync(join(dir, 'server', 'src', 'index.ts'), future, future);
      expect(isStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is stale when a file under client/src is newer than the build stamp', () => {
    const dir = fixture();
    try {
      mkdirSync(join(dir, 'client', 'src'), { recursive: true });
      const future = new Date(Date.now() + 60_000);
      writeFileSync(join(dir, 'client', 'src', 'App.tsx'), '// edited\n');
      utimesSync(join(dir, 'client', 'src', 'App.tsx'), future, future);
      expect(isStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ensureBuilt', () => {
  it('does nothing and reports built:false when nothing is stale', () => {
    const dir = fixture();
    const spawnFn = vi.fn();
    try {
      expect(ensureBuilt(dir, spawnFn)).toEqual({ installed: false, built: false });
      expect(spawnFn).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Checkpoint-4 review, finding 2: a failed `npm run build` -- `build:client && build:server &&
  // typecheck` -- can still have vite's client step already touch dist/index.html's mtime before
  // the later server/typecheck step fails. A second `isStale` call right after must not be fooled
  // by that mtime into reporting "fresh".
  it('a failed build writes no stamp, so the tree is still read as stale afterwards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      withFreshInstall(dir);
      mkdirSync(join(dir, 'server', 'src'), { recursive: true });
      writeFileSync(join(dir, 'server', 'src', 'index.ts'), '// source, present from the start\n');
      expect(isStale(dir)).toBe(true); // no dist at all yet

      // The fake `npm run build`: behaves like the real one on a source that fails typecheck --
      // it still writes (touches) dist/index.html and the server entry point, as vite and a
      // no-noEmitOnError tsc both would, then reports a nonzero exit.
      const failingBuild = vi.fn(() => {
        mkdirSync(join(dir, 'dist'), { recursive: true });
        mkdirSync(join(dir, 'dist-server', 'server', 'src'), { recursive: true });
        writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>\n');
        writeFileSync(join(dir, 'dist-server', 'server', 'src', 'index.js'), '// half-built\n');
        return { status: 1, stdout: '', stderr: 'server/src/index.ts(12,3): error TS2322' };
      });

      expect(() => ensureBuilt(dir, failingBuild)).toThrow(/TS2322/);
      expect(failingBuild).toHaveBeenCalledTimes(1);
      expect(existsSync(join(dir, 'dist-server', '.build-stamp'))).toBe(false);
      // The exact bug: dist/index.html's own mtime was just advanced by the failed build. A
      // second call must not read that as "fresh" -- it must run the build again.
      expect(isStale(dir)).toBe(true);

      const secondAttempt = vi.fn(() => ({ status: 1, stdout: '', stderr: 'still broken' }));
      expect(() => ensureBuilt(dir, secondAttempt)).toThrow(/still broken/);
      expect(secondAttempt).toHaveBeenCalledTimes(1);

      // A failed build is tagged "build", not "install" -- ensureInstalled already succeeded
      // (withFreshInstall, above) before this build ever ran, so the tag must name the phase that
      // actually failed.
      try {
        ensureBuilt(dir, secondAttempt);
        throw new Error('expected ensureBuilt to throw');
      } catch (e) {
        expect((e as Error & { phase?: string }).phase).toBe('build');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a successful build writes the stamp, so a later call with an unchanged source is not stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      withFreshInstall(dir);
      mkdirSync(join(dir, 'server', 'src'), { recursive: true });
      writeFileSync(join(dir, 'server', 'src', 'index.ts'), '// source\n');

      const succeedingBuild = vi.fn(() => {
        mkdirSync(join(dir, 'dist'), { recursive: true });
        mkdirSync(join(dir, 'dist-server', 'server', 'src'), { recursive: true });
        writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>\n');
        writeFileSync(join(dir, 'dist-server', 'server', 'src', 'index.js'), '// built\n');
        return { status: 0, stdout: '', stderr: '' };
      });

      expect(ensureBuilt(dir, succeedingBuild)).toEqual({ installed: false, built: true });
      expect(existsSync(join(dir, 'dist-server', '.build-stamp'))).toBe(true);
      expect(isStale(dir)).toBe(false);

      const shouldNotRun = vi.fn();
      expect(ensureBuilt(dir, shouldNotRun)).toEqual({ installed: false, built: false });
      expect(shouldNotRun).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Checkpoint-4 review (second pass), finding 5: `restart.test.ts` already documents a launcher
  // that never emits 'close' -- a hung `npm run build` is real production behaviour, not just a
  // test fixture. `ensureBuilt` must pass a bounded `timeout` through to `spawnSync`, so a wedged
  // build cannot hang the restart request (and the gate) forever.
  it('passes a finite timeout through to spawnSync', () => {
    const dir = fixture();
    try {
      mkdirSync(join(dir, 'server', 'src'), { recursive: true });
      const future = new Date(Date.now() + 60_000);
      writeFileSync(join(dir, 'server', 'src', 'index.ts'), '// edited\n');
      utimesSync(join(dir, 'server', 'src', 'index.ts'), future, future);
      const spawnFn = vi.fn(() => ({ status: 0, stdout: '', stderr: '' }));
      ensureBuilt(dir, spawnFn);
      expect(spawnFn).toHaveBeenCalledTimes(1);
      const options = spawnFn.mock.calls[0][2] as { timeout?: number };
      expect(options.timeout).toBeGreaterThan(0);
      expect(Number.isFinite(options.timeout)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Checkpoint-4 review (second pass), finding 5: when `spawnSync`'s own `timeout` elapses, it
  // kills the child and reports a `signal`, not a `status` -- `result.status` is `null`, which the
  // existing "nonzero exit" branch would report as a confusing "npm run build exited null".
  it('reports a clear timeout error, not "exited null", when spawnSync times out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      withFreshInstall(dir);
      mkdirSync(join(dir, 'server', 'src'), { recursive: true });
      writeFileSync(join(dir, 'server', 'src', 'index.ts'), '// source\n');
      const timedOutBuild = vi.fn(() => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }));
      expect(() => ensureBuilt(dir, timedOutBuild)).toThrow(/did not finish within.*SIGTERM/);
      expect(existsSync(join(dir, 'dist-server', '.build-stamp'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Issue 179's own repro: a merge lands a new dependency in package.json/package-lock.json, but
  // the tree's own node_modules is unchanged until an install runs. ensureBuilt must run that
  // install before it ever asks whether the build itself is stale.
  it('installs before building when node_modules is missing, in that order', () => {
    const dir = fixture();
    try {
      rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
      const calls: string[][] = [];
      const spawnFn = vi.fn((_cmd: string, args: string[]) => {
        calls.push(args);
        if (args[0] === 'ci') {
          mkdirSync(join(dir, 'node_modules'), { recursive: true });
        }
        return { status: 0, stdout: '', stderr: '' };
      });
      expect(ensureBuilt(dir, spawnFn)).toEqual({ installed: true, built: false }); // build itself is still fresh
      expect(calls).toEqual([['ci']]);
      expect(existsSync(join(dir, 'node_modules', '.install-stamp'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('isInstallStale', () => {
  it('is stale when node_modules is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      expect(isInstallStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is stale when node_modules exists but no install stamp does (never installed through ensureInstalled)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      expect(isInstallStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is not stale when the install stamp is newer than package.json and package-lock.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      const old = new Date('2020-01-01');
      writeFileSync(join(dir, 'package.json'), '{}\n');
      writeFileSync(join(dir, 'package-lock.json'), '{}\n');
      utimesSync(join(dir, 'package.json'), old, old);
      utimesSync(join(dir, 'package-lock.json'), old, old);
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', '.install-stamp'), '0');
      expect(isInstallStale(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The acceptance criteria's own scenario (issue 179): a merge lands a moved lockfile after the
  // last known-good install.
  it('is stale when package-lock.json is newer than the install stamp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', '.install-stamp'), '0');
      const future = new Date(Date.now() + 60_000);
      writeFileSync(join(dir, 'package-lock.json'), '{}\n');
      utimesSync(join(dir, 'package-lock.json'), future, future);
      expect(isInstallStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is stale when package.json is newer than the install stamp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', '.install-stamp'), '0');
      const future = new Date(Date.now() + 60_000);
      writeFileSync(join(dir, 'package.json'), '{}\n');
      utimesSync(join(dir, 'package.json'), future, future);
      expect(isInstallStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ensureInstalled', () => {
  it('does nothing and reports installed:false when nothing is stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      withFreshInstall(dir);
      const spawnFn = vi.fn();
      expect(ensureInstalled(dir, spawnFn)).toEqual({ installed: false });
      expect(spawnFn).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs npm ci and writes the stamp on a verified zero exit, never a real npm ci', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      const spawnFn = vi.fn((cmd: string, args: string[]) => {
        expect(cmd).toBe('npm');
        expect(args).toEqual(['ci']);
        mkdirSync(join(dir, 'node_modules'), { recursive: true });
        return { status: 0, stdout: '', stderr: '' };
      });
      expect(ensureInstalled(dir, spawnFn)).toEqual({ installed: true });
      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(existsSync(join(dir, 'node_modules', '.install-stamp'))).toBe(true);

      const shouldNotRun = vi.fn();
      expect(ensureInstalled(dir, shouldNotRun)).toEqual({ installed: false });
      expect(shouldNotRun).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Mirrors ensureBuilt's own "a failed build writes no stamp" case: a failed npm ci must never
  // read as a good install afterwards.
  it('a failed install writes no stamp, so the tree is still read as stale afterwards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      mkdirSync(join(dir, 'node_modules'), { recursive: true }); // partially written, as a failed npm ci leaves it
      const failingInstall = vi.fn(() => ({ status: 1, stdout: '', stderr: 'npm ERR! network timeout' }));
      expect(() => ensureInstalled(dir, failingInstall)).toThrow(/network timeout/);
      expect(existsSync(join(dir, 'node_modules', '.install-stamp'))).toBe(false);
      expect(isInstallStale(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A failed install must be reported as an install failure, not a generic "build failed" --
  // restart-launch.mjs and the build-if-stale.mjs CLI entry point both read this tag to name the
  // install specifically (issue 179's own acceptance criteria).
  it('tags its thrown error with phase "install", not "build"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verstaan-build-if-stale-'));
    try {
      const failingInstall = vi.fn(() => ({ status: 1, stdout: '', stderr: 'npm ERR! network timeout' }));
      try {
        ensureInstalled(dir, failingInstall);
        throw new Error('expected ensureInstalled to throw');
      } catch (e) {
        expect((e as Error & { phase?: string }).phase).toBe('install');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
