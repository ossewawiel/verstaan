#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// The detached launcher `POST /api/restart` spawns (issue 162). Installs and rebuilds only if
// stale (the same rule as console.sh, shared via build-if-stale.mjs -- issue 179 added the install
// half, in front of the build), then starts a new server on the same port as a further detached
// process, and prints exactly one marker line so the still-running old server can learn the
// outcome before it decides whether to exit.
//
// This process is itself detached from the old server the moment it is spawned (routes/restart.ts
// passes `detached: true` and calls `unref()`), so a build that takes a while never risks being
// killed by anything the old server does afterwards. It is not detached from *its own* stdout,
// which is how the old server reads the marker line below.
//
// Checkpoint-4 review, finding 1: printing SPAWNED_MARKER the instant `spawn()` returns a pid
// proves nothing -- the new process can crash on startup (a bad import, a thrown top-level
// error) well after `spawn()` has already handed back a pid, and restart.ts was letting the old
// process exit on that lie. This script now waits for the new process itself to confirm it is
// listening before it ever prints SPAWNED_MARKER: `fork()`, not `spawn()`, gives this script an
// IPC channel straight to the new process, which sends `{ type: 'listening' }` the moment its own
// `app.listen` callback succeeds (index.ts).
//
// Checkpoint-4 review (second pass), finding 2: an earlier version of this whole file relied on
// both the old and the new process binding the port at once via `reusePort`. Verified against two
// real Node processes on Linux (not assumed): `SO_REUSEPORT` requires *every* socket sharing a
// port to set the option, including the first one -- man 7 socket says so outright, and a careful
// repro (a plain bind, then a second bind with only `reusePort: true`) reproducibly hits
// EADDRINUSE. Since the *old* process's own bind happened at its ordinary, non-restart start
// (before it had any way to know a restart was coming, and deliberately without `reusePort` --
// see index.ts's own comment for why that matters for the "second console.sh exits" contract),
// simultaneous binding was never actually achievable here. `BUILD_OK_MARKER` (below) is the fix:
// printed the moment the build is confirmed good, *before* this script forks the new process at
// all, so the still-running old server (reading this stdout line by line, in restart.ts) can
// close its own listening socket right then -- freeing the port for the new process's own bind,
// which follows immediately after. This trades true zero-downtime overlap (never actually
// possible without either both sides opting into `reusePort` from every ordinary start, or
// passing the listening socket's own file descriptor between processes -- a larger redesign, not
// done here) for a real, working handoff with only a very brief gap: proven against two real
// Node processes, `server.close()` frees the port in about a millisecond, well inside the retry
// loop below's own polling interval.
import { fork, execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureBuilt } from './build-if-stale.mjs';

export const SPAWNED_MARKER = 'RESTART_SERVER_SPAWNED:';
export const FAILED_MARKER = 'RESTART_BUILD_FAILED:';
// Checkpoint-4 review (second pass), finding 2: printed as soon as the build is confirmed good --
// see the header comment above for why this, not simultaneous `reusePort` binding, is the actual
// port handoff mechanism. `restart.ts`'s `runLauncher` watches for this line mid-stream (not only
// at the end, unlike the other two markers) and reacts to it immediately by closing the old
// process's own listening socket, before this script has forked anything at all.
export const BUILD_OK_MARKER = 'RESTART_BUILD_OK:';

// Checkpoint-4 review (second pass), finding 4: kept in sync by hand with the identical constant
// in server/src/index.ts -- see that file's own comment for why neither side can import the
// other's copy. The exit code the new process uses exclusively for "gave up waiting for the port
// after a restart", so this script can tell that case apart from an ordinary crash and report
// something the developer can actually act on.
const RESTART_PORT_RETRY_EXHAUSTED_EXIT_CODE = 87;

const appDir = resolve(process.argv[2] ?? process.cwd());
const port = process.argv[3] ?? '7864';

// JSON-encoded so a multi-line compiler error (the common case) still lands on exactly one line
// -- the parent reads this stdout line by line, and a raw multi-line message would have its
// later lines mistaken for lines with no marker at all.
function fail(message) {
  console.log(`${FAILED_MARKER}${JSON.stringify(message)}`);
  process.exit(1);
}

try {
  ensureBuilt(appDir);
} catch (e) {
  // A failed install or a failed build never spawns a new server: nothing here has touched the
  // port, and the old process (still reading this stdout) is the only thing there is to answer
  // the client with. Crucially, `BUILD_OK_MARKER` is never printed on this path, so the old
  // process never closes its own listening socket either -- it is still the only thing serving
  // the port, unchanged. `ensureBuilt`'s own error message already distinguishes the two: a
  // failed `npm ci` carries the install's own stdout+stderr (npm's own "npm ERR!" lines), a
  // failed build carries the compiler's or bundler's own error text -- neither is generic, so the
  // client sees which one failed without this script needing to guess or relabel it.
  fail(e instanceof Error ? e.message : String(e));
}

// The build is good. From this line on, the old process (see restart.ts's `runLauncher`) is
// expected to close its own listening socket -- so the new process below must bind the port
// itself, not assume it is still free of anyone else. `VERSTAAN_CONSOLE_RESTART=1` tells the new
// process's own `app.listen` (index.ts) it is such a case, so an EADDRINUSE from binding a beat
// too early (the old process's `close()` racing this fork()) retries for a few seconds instead of
// assuming a second, unrelated instance is already running and exiting immediately.
console.log(BUILD_OK_MARKER);

// Checkpoint-4 review (third pass), finding 1: the new process's stdout/stderr used to be
// discarded outright (`stdio: ['ignore', 'ignore', 'ignore', 'ipc']`). If it throws before
// listening, that discards the one thing that explains why -- the old process (restart.ts) only
// ever learns an exit code and a signal, and a developer chasing a failed restart had nothing to
// go on. `console-serve.log` is the same file console.sh already writes to and already names to
// the developer on every ordinary start; appending here means a developer who goes looking after
// a failed restart finds the new process's own crash right where they already know to look, with
// no new log file to discover. `git rev-parse --path-format=absolute --git-common-dir` is the
// same derivation console.sh uses, run from `appDir` so it resolves the same repo regardless of
// which worktree this console started from.
const logPath = (() => {
  try {
    const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: appDir })
      .toString()
      .trim();
    return commonDir ? resolve(commonDir, 'console-serve.log') : null;
  } catch {
    // Not inside a git repo, or git is unavailable: logging to file is best-effort only, and the
    // in-memory tail captured below still flows back into the failure message either way.
    return null;
  }
})();

// Checkpoint-4 review (third pass), finding 1 (continued): a bounded in-memory tail of the same
// bytes, so `waitForNewProcess`'s `onExit` below can fold the actual crash text into the message
// that flows back through `FAILED_MARKER` to the browser, not only into the log file a developer
// has to go looking for.
const CAPTURE_TAIL_MAX_CHARS = 4000;
let capturedOutput = '';
function captureAndLog(chunk) {
  const text = chunk.toString('utf8');
  capturedOutput += text;
  if (capturedOutput.length > CAPTURE_TAIL_MAX_CHARS) {
    capturedOutput = capturedOutput.slice(-CAPTURE_TAIL_MAX_CHARS);
  }
  if (logPath) {
    try {
      appendFileSync(logPath, text);
    } catch {
      /* best-effort: losing the log write must never take the restart down with it */
    }
  }
}

const child = fork(resolve(appDir, 'dist-server', 'server', 'src', 'index.js'), ['--port', String(port)], {
  cwd: appDir,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: { ...process.env, VERSTAAN_CONSOLE_RESTART: '1' },
});
child.stdout?.on('data', captureAndLog);
child.stderr?.on('data', captureAndLog);
child.unref();

const LISTEN_TIMEOUT_MS = 15000; // comfortably longer than a cold Fastify start needs.
// Checkpoint-4 review (second pass), finding 3(b): "sent the IPC message" is not the same proof
// as "is still up a moment later" -- a process can signal listening and then die immediately
// after (e.g. an exception thrown just after `app.listen`'s callback, in code that used to run
// after the IPC send and now runs before it, per that same review's finding 3(a) -- this grace
// window is the belt to that fix's suspenders, for any future code added to that callback).
// Comfortably longer than any realistic post-listen synchronous work, short enough that a real
// restart is not perceptibly slower.
const POST_LISTEN_GRACE_MS = 1500;

/** Resolves once the new process sends `{ type: 'listening' }` over its IPC channel *and* stays
 * up for a further `POST_LISTEN_GRACE_MS` with no `exit`, or rejects -- on the new child exiting
 * before listening at all (a startup crash, the concrete case the checkpoint-4 review reproduced
 * with a script that just throws), on the child exiting during the post-listen grace window (a
 * crash moments after binding), or on running out of time before ever signalling listening. */
function waitForNewProcess() {
  return new Promise((resolveWait, rejectWait) => {
    let settled = false;
    let graceTimer = null;
    let heardListening = false;
    const cleanup = () => {
      clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
    };
    const finishOk = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveWait(child.pid);
    };
    const finishFail = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectWait(new Error(message));
    };
    const onMessage = (msg) => {
      if (settled || heardListening) return;
      if (msg && typeof msg === 'object' && msg.type === 'listening') {
        heardListening = true;
        graceTimer = setTimeout(finishOk, POST_LISTEN_GRACE_MS);
      }
    };
    const onExit = (code, signal) => {
      // Checkpoint-4 review (second pass), finding 4: a plain exit 0 here (no listening message
      // ever heard) from a process started with VERSTAAN_CONSOLE_RESTART=1 whose EADDRINUSE
      // retry loop ran out is reported with its own message, not folded into the generic
      // "exited before it started listening" one, since the fix here is different (restart the
      // console once by hand) from every other cause of this branch (fix the code, rebuild).
      // Checkpoint-4 review (third pass), finding 1: fold in whatever of the new process's own
      // stdout/stderr was captured, so the actual crash text reaches the browser (via
      // FAILED_MARKER) and not just an exit code and a signal -- the full text is still in
      // console-serve.log either way, this is only a tail for the inline message.
      const tail = capturedOutput.trim();
      const tailSuffix = tail ? `; captured output:\n${tail}` : '';
      if (!heardListening && code === RESTART_PORT_RETRY_EXHAUSTED_EXIT_CODE) {
        finishFail(
          'the running console predates this feature (it never released the port for a handoff); ' +
            'restart it once by hand (stop it, then run console.sh or console.cmd again), then the restart button will work.' +
            tailSuffix,
        );
        return;
      }
      const when = heardListening ? 'shortly after it signalled it was listening' : 'before it started listening';
      finishFail(`new server process exited ${when} (code ${code}, signal ${signal})${tailSuffix}`);
    };
    child.on('message', onMessage);
    child.once('exit', onExit);
    const timer = setTimeout(
      () => finishFail(`new server process (pid ${child.pid}) never signalled listening within ${LISTEN_TIMEOUT_MS}ms`),
      LISTEN_TIMEOUT_MS,
    );
  });
}

waitForNewProcess()
  .then((pid) => {
    console.log(`${SPAWNED_MARKER}${pid}`);
    process.exit(0);
  })
  .catch((e) => fail(e instanceof Error ? e.message : String(e)));
