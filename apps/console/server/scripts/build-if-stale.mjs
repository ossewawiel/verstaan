// SPDX-License-Identifier: MPL-2.0
// The one staleness-and-build check console.sh and `POST /api/restart` both run (issue 162): a
// build is needed when `dist`/`dist-server` is missing, or when any file under `client/src` or
// `server/src` is newer than the last build known to have exited 0 -- the same rule console.sh
// has always made with `find -newer`, ported to Node so it can never drift between the two
// callers. Nothing here touches `node_modules`: a restart runs long after the first `npm ci`, so
// installing dependencies again is out of scope (see the issue's "Not in scope").
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

export function ensureBuilt(appDir, spawnFn = spawnSync) {
  if (!isStale(appDir)) return { built: false };
  const result = spawnFn('npm', ['run', 'build'], { cwd: appDir, encoding: 'utf8', shell: false, timeout: BUILD_TIMEOUT_MS });
  if (result.error) throw result.error;
  if (result.signal) {
    // `spawnSync`'s own timeout fired: `status` is null, not a nonzero exit, so the branch below
    // would otherwise report a confusing "exited null". Node sends this signal itself when the
    // timeout elapses (see the `timeout` option above), not something the build tool chose.
    throw new Error(`npm run build did not finish within ${BUILD_TIMEOUT_MS}ms and was killed (${result.signal})`);
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(output || `npm run build exited ${result.status}`);
  }
  writeFileSync(stampPath(appDir), String(Date.now()));
  return { built: true };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const appDir = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  try {
    const { built } = ensureBuilt(appDir);
    console.log(built ? 'console: built' : 'console: build is up to date');
    process.exit(0);
  } catch (e) {
    console.error(`console: build failed:\n${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
