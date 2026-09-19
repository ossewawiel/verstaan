// SPDX-License-Identifier: MPL-2.0
// The one staleness-and-install-and-build check console.sh, console.cmd, console.ps1 and
// `POST /api/restart` all run (issues 162 and 179): an install is needed when `node_modules` is
// missing, or `package.json`/`package-lock.json` is newer than the last install known to have
// exited 0; a build is needed when `dist`/`dist-server` is missing, or when any file under
// `client/src` or `server/src` is newer than the last build known to have exited 0 -- the same
// rule console.sh has always made with `find -newer`, ported to Node so it can never drift
// between callers. `ensureBuilt` runs the install decision before the build decision, in that
// order: a merge that adds a dependency (issue 179's own repro, `@anthropic-ai/claude-agent-sdk`)
// must land in `node_modules` before `tsc` ever runs against it.
import { existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Newest mtime (ms) of any file under `dir`, walked recursively. Null when `dir` does not exist
 * or holds no files, so the caller can tell "nothing here" from "everything here is very old". */
function newestMtime(dir) {
  if (!existsSync(dir)) return null;
  let newest = null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = newestMtime(p);
      if (sub != null && (newest == null || sub > newest)) newest = sub;
    } else if (newest == null || st.mtimeMs > newest) {
      newest = st.mtimeMs;
    }
  }
  return newest;
}

/** Where `ensureBuilt` records "the last build through here exited 0" (checkpoint-4 review,
 * finding 2). Under `dist-server`, not `dist`: `npm run build` is `build:client && build:server
 * && typecheck` (package.json) -- vite's client build runs first and always writes
 * `dist/index.html` on its own success, even when `build:server`'s tsc fails afterwards with a
 * nonzero exit. Trusting `dist/index.html`'s own mtime as "the build succeeded" is exactly the
 * bug: a failed build already advanced it, so a second `isStale` call right after a failed build
 * would wrongly read "fresh" and skip straight to spawning the still-broken, half-built output. */
function stampPath(appDir) {
  return join(appDir, 'dist-server', '.build-stamp');
}

/** Where `ensureInstalled` records "the last `npm ci` through here exited 0", the same stamp
 * shape as `stampPath` above and for the same reason (issue 179): a failed install must never
 * read as fresh. Lives beside `node_modules`, not inside it -- `npm ci` removes and recreates
 * `node_modules` from scratch on every run, which would delete a stamp written inside it before
 * the install that wrote it had even finished. */
function installStampPath(appDir) {
  return join(appDir, 'node_modules', '.install-stamp');
}

/** True when `appDir`'s `node_modules` is missing, or the stamp of the last install known (via
 * `ensureInstalled`, below) to have exited 0 is missing or older than `package.json` or
 * `package-lock.json`. No stamp at all is treated as stale, the same reasoning as `isStale`'s own
 * "no stamp" case: one harmless extra install the first time `ensureInstalled` runs against a
 * tree installed some other way, never a false "fresh" on an install that never finished. */
export function isInstallStale(appDir) {
  if (!existsSync(join(appDir, 'node_modules'))) return true;
  const stamp = installStampPath(appDir);
  if (!existsSync(stamp)) return true;
  const baseline = statSync(stamp).mtimeMs;
  for (const file of [join(appDir, 'package.json'), join(appDir, 'package-lock.json')]) {
    if (existsSync(file) && statSync(file).mtimeMs > baseline) return true;
  }
  return false;
}

/** True when `appDir`'s build output is missing, or the stamp of the last build known (via
 * `ensureBuilt`, below) to have exited 0 is missing or older than the newest file under
 * `client/src` or `server/src`. No stamp at all -- a tree built some other way, e.g. by hand,
 * before this stamp existed -- is treated as stale: one harmless extra rebuild the first time
 * `ensureBuilt` runs against it, never a false "fresh" on a build that never actually finished. */
export function isStale(appDir) {
  const distIndex = join(appDir, 'dist', 'index.html');
  const serverEntry = join(appDir, 'dist-server', 'server', 'src', 'index.js');
  if (!existsSync(distIndex) || !existsSync(serverEntry)) return true;
  const stamp = stampPath(appDir);
  if (!existsSync(stamp)) return true;
  const baseline = statSync(stamp).mtimeMs;
  for (const src of [join(appDir, 'client', 'src'), join(appDir, 'server', 'src')]) {
    const newest = newestMtime(src);
    if (newest != null && newest > baseline) return true;
  }
  return false;
}

/** Runs `npm run build` in `appDir`, only when `isStale` says so. Returns whether a build ran.
 * Throws with the build's own stdout+stderr on a nonzero exit, so a syntax error in
 * `server/src` reaches whoever called this: console.sh prints it and stops; the restart route
 * (apps/console/server/scripts/restart-launch.mjs) reports it back to the still-running old server
 * before that server ever considers exiting. Only a verified zero exit writes the stamp `isStale`
 * judges freshness against next time (finding 2): a failed build's own partial writes into
 * `dist`/`dist-server` are left exactly as the build tools left them, but never mistaken for
 * success by anything reading this tree afterwards. */
// Checkpoint-4 review (second pass), finding 5: `restart.test.ts` already documents a launcher
// that "deliberately never emits 'close'", commenting that the request is "deliberately left
// pending" -- that shape is real production behaviour, not just a test fixture, whenever `npm run
// build` itself hangs (a wedged dev tool, a flaky filesystem). Generous but finite: a real build
// of this tree runs in low single-digit seconds; this is far above that, never above what a
// developer would tolerate waiting for a restart button before giving up anyway.
export const BUILD_TIMEOUT_MS = 120_000;

// `npm ci` on a cold cache can take noticeably longer than a build of this tree's own source;
// generous but finite for the same reason as `BUILD_TIMEOUT_MS` -- a wedged install must not hang
// a restart, or the gate, forever.
export const INSTALL_TIMEOUT_MS = 180_000;

/** Runs `npm ci` in `appDir`, only when `isInstallStale` says so. Returns whether an install ran.
 * Throws with the install's own stdout+stderr on a nonzero exit, mirroring `ensureBuilt` below in
 * every particular: only a verified zero exit writes the stamp `isInstallStale` judges freshness
 * against next time, so a failed `npm ci` is never mistaken for a good install by anything reading
 * this tree afterwards. */
export function ensureInstalled(appDir, spawnFn = spawnSync) {
  if (!isInstallStale(appDir)) return { installed: false };
  const result = spawnFn('npm', ['ci'], { cwd: appDir, encoding: 'utf8', shell: false, timeout: INSTALL_TIMEOUT_MS });
  if (result.error) throw taggedError(result.error, 'install');
  if (result.signal) {
    throw taggedError(new Error(`npm ci did not finish within ${INSTALL_TIMEOUT_MS}ms and was killed (${result.signal})`), 'install');
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw taggedError(new Error(output || `npm ci exited ${result.status}`), 'install');
  }
  writeFileSync(installStampPath(appDir), String(Date.now()));
  return { installed: true };
}

/** Tags an error with which phase (issue 179) threw it, so a caller reporting the failure -- the
 * CLI entry point below, restart-launch.mjs -- can name the install specifically instead of
 * calling every failure a "build failed", without having to guess from the message text. */
function taggedError(error, phase) {
  error.phase = phase;
  return error;
}

export function ensureBuilt(appDir, spawnFn = spawnSync) {
  // Install before build, in that order (issue 179): a merge that added a dependency must land it
  // in `node_modules` before `tsc` or vite ever run against the new import. `ensureInstalled`'s
  // own `spawnFn` throw already carries the install's own output, tagged `phase: 'install'` above,
  // and is left to propagate as-is -- the caller (restart-launch.mjs, console.sh/.cmd/.ps1)
  // reports it exactly as it would a failed build, so the message and the phase both tell the two
  // apart.
  const { installed } = ensureInstalled(appDir, spawnFn);
  if (!isStale(appDir)) return { installed, built: false };
  const result = spawnFn('npm', ['run', 'build'], { cwd: appDir, encoding: 'utf8', shell: false, timeout: BUILD_TIMEOUT_MS });
  if (result.error) throw taggedError(result.error, 'build');
  if (result.signal) {
    // `spawnSync`'s own timeout fired: `status` is null, not a nonzero exit, so the branch below
    // would otherwise report a confusing "exited null". Node sends this signal itself when the
    // timeout elapses (see the `timeout` option above), not something the build tool chose.
    throw taggedError(new Error(`npm run build did not finish within ${BUILD_TIMEOUT_MS}ms and was killed (${result.signal})`), 'build');
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw taggedError(new Error(output || `npm run build exited ${result.status}`), 'build');
  }
  writeFileSync(stampPath(appDir), String(Date.now()));
  return { installed, built: true };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const appDir = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  try {
    const { installed, built } = ensureBuilt(appDir);
    const parts = [];
    parts.push(installed ? 'installed' : null, built ? 'built' : null);
    console.log(parts.some(Boolean) ? `console: ${parts.filter(Boolean).join(', ')}` : 'console: up to date, nothing to install or build');
    process.exit(0);
  } catch (e) {
    const phase = e && e.phase === 'install' ? 'install' : 'build';
    console.error(`console: ${phase} failed:\n${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
