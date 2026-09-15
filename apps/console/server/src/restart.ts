// SPDX-License-Identifier: MPL-2.0
// The one place the console restarts itself (issue 162, reopening the non-goal issue 100 left in
// place: "the console cannot stop itself"). `POST /api/restart` spawns a detached launcher that
// rebuilds only if stale (apps/console/server/scripts/build-if-stale.mjs, the same rule console.sh uses)
// and starts a new server on the same port, all before this process ever decides to exit. Not a
// job-runner kind: it never goes through `JobManager`/`JOB_KINDS`, so it adds no allow-list entry
// and `service stop` naming the console stays refused exactly as issue 100 left it (kinds.ts,
// namesConsole).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { isLoopbackHost } from './jobs/routes.js';
import type { JobManager } from './jobs/runner.js';
import { RestartGate } from './restart-gate.js';

export interface RestartDeps {
  jobs: JobManager;
  port: number;
  /** apps/console: the cwd every launcher (console.sh, console.cmd, npm scripts) already runs
   * this server from (see REPO's own comment in model/read.ts). Injectable for tests. */
  appDir: string;
  /** Shared with `registerJobRoutes` (issue 162, checkpoint-4 review findings 3 and 4): set for
   * the whole `runLauncher` call, so neither a second `POST /api/restart` nor a `POST /api/jobs`
   * can land mid-build. Defaults to a fresh, always-inactive gate so existing callers/tests that
   * do not pass one keep working unchanged. */
  restartGate?: RestartGate;
  /** Checkpoint-4 review (second pass), finding 2: the actual port handoff. Called once, the
   * moment `scripts/restart-launch.mjs` reports the rebuild is good (`BUILD_OK_MARKER`, seen
   * mid-stream, before the new process is even forked) -- releasing this process's own listening
   * socket right then, so the new process's own bind can claim the port outright, the same way an
   * ordinary start always has (simultaneous `reusePort` binding is verified unworkable; see
   * index.ts's own listen comment for the real-process proof). Defaults to a no-op so existing
   * callers/tests that never emit that marker (and so never need it) keep working unchanged;
   * production wiring (index.ts) always supplies a real one. */
  closePort?: () => void;
}

const SPAWNED_MARKER = 'RESTART_SERVER_SPAWNED:';
const FAILED_MARKER = 'RESTART_BUILD_FAILED:';
// Checkpoint-4 review (second pass), finding 2: kept in sync by hand with the identical constant
// in scripts/restart-launch.mjs (see that file's own comment for why neither side can import the
// other's copy). Unlike the other two markers, `runLauncher` (below) watches for this one
// mid-stream, not only once the launcher's stdout has fully closed -- the entire point is to act
// on it as early as possible, before the new process has even been forked.
const BUILD_OK_MARKER = 'RESTART_BUILD_OK:';

// Checkpoint-4 review (third pass), finding 3: the last-resort error fallback in `runLauncher`
// below reads back accumulated stdout when neither final marker was ever seen. Once
// `RESTART_BUILD_OK:` has been printed (see `announcedBuildReady`), that stdout is guaranteed
// non-empty and misleading on its own -- it contains a marker line reporting a step that
// succeeded. Stripped out here so the fallback (used only for the *other* case, no marker of any
// kind seen at all) never surfaces one.
function stripMarkerLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith(SPAWNED_MARKER) && !line.startsWith(FAILED_MARKER) && !line.startsWith(BUILD_OK_MARKER))
    .join('\n');
}

// Checkpoint-4 review (second pass), finding 5: kept comfortably above the sum of everything the
// launcher can legitimately take -- `build-if-stale.mjs`'s own `BUILD_TIMEOUT_MS` (120s) plus
// `restart-launch.mjs`'s `LISTEN_TIMEOUT_MS` (15s) plus its `POST_LISTEN_GRACE_MS` (1.5s) -- with
// margin for process startup and IPC round trips. Not imported from either (this file is TS
// compiled into dist-server; those are plain .mjs scripts run as a separate process), so this
// is, like the exit code shared with index.ts/restart-launch.mjs, kept in sync by hand.
export const RUN_LAUNCHER_TIMEOUT_MS = 150_000;

export type LauncherResult = { ok: true; pid: number } | { ok: false; error: string };

/** Runs `scripts/restart-launch.mjs` detached and resolves once it reports one of its two
 * outcomes down its own stdout: a build failure (nothing further happened -- the port is still
 * this process's own), or a new server process spawned (its pid, for the record only; this
 * process never depends on that pid living). `detached: true` plus `unref()` happen immediately,
 * before anything is awaited, so a build that runs long never risks this request's timeout or
 * this process's own eventual exit taking the launcher down with it.
 *
 * Checkpoint-4 review (second pass), finding 5: a launcher that never reports either marker --
 * `npm run build` wedged, or the new process itself hanging before it ever exits -- used to leave
 * this promise (and so the HTTP request, and the restart gate) pending forever. `timeoutMs` bounds
 * that: past it, this resolves `{ ok: false }` on its own, so the route can clear the gate and
 * answer the client, even though the detached launcher (already unref()'d, already independent of
 * this process) may still be running in the background. */
export function runLauncher(
  appDir: string,
  port: number,
  spawnFn: typeof spawn = spawn,
  timeoutMs: number = RUN_LAUNCHER_TIMEOUT_MS,
  onBuildReady: () => void = () => {},
): Promise<LauncherResult> {
  return new Promise((resolvePromise) => {
    const script = resolve(appDir, 'server', 'scripts', 'restart-launch.mjs');
    const child = spawnFn(process.execPath, [script, appDir, String(port)], {
      cwd: appDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.unref();
    let out = '';
    let err = '';
    let settled = false;
    let announcedBuildReady = false;
    const settle = (result: LauncherResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    const timer = setTimeout(() => {
      settle({
        ok: false,
        error: `restart: the launcher reported no outcome within ${timeoutMs}ms (a hung build or a hung new process); this process is still serving on its own.`,
      });
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString('utf8');
      // Checkpoint-4 review (second pass), finding 2: react to the build succeeding as soon as
      // it is reported, not only once the launcher's whole stdout stream has closed -- releasing
      // this process's own port a build's worth of seconds earlier than that would otherwise
      // allow, which is the entire reason the port handoff works at all now (see this marker's
      // own comment above).
      if (!announcedBuildReady && out.includes(BUILD_OK_MARKER)) {
        announcedBuildReady = true;
        onBuildReady();
      }
    });
    child.stderr?.on('data', (d: Buffer) => (err += d.toString('utf8')));
    child.on('error', (e) => settle({ ok: false, error: `launcher failed to start: ${e.message}` }));
    child.on('close', () => {
      const spawnedLine = out.split('\n').find((l) => l.startsWith(SPAWNED_MARKER));
      if (spawnedLine) {
        settle({ ok: true, pid: Number(spawnedLine.slice(SPAWNED_MARKER.length).trim()) });
        return;
      }
      const failedLine = out.split('\n').find((l) => l.startsWith(FAILED_MARKER));
      if (failedLine) {
        // JSON-encoded on the launcher's side (scripts/restart-launch.mjs) precisely so a
        // multi-line compiler error survives being read back here as one line.
        let message = failedLine.slice(FAILED_MARKER.length);
        try {
          message = JSON.parse(message);
        } catch {
          /* older or hand-typed launcher output: fall back to the raw text */
        }
        settle({ ok: false, error: message });
        return;
      }
      // Checkpoint-4 review (third pass), finding 3: `announcedBuildReady` means the build was
      // already confirmed good and this process already closed its own listening socket
      // (`onBuildReady`, below) -- so the launcher vanishing here without ever printing either
      // final marker is a real outage, not an ordinary build failure: the port is already gone
      // and nothing is coming to claim it. The generic fallback below would otherwise read back
      // `out`, which now necessarily contains `RESTART_BUILD_OK:` (the marker that got us into
      // this branch in the first place) and nothing else -- a string that looks like an error but
      // actually reports a step that succeeded.
      if (announcedBuildReady) {
        settle({
          ok: false,
          error:
            "restart: the launcher process ended unexpectedly after the build succeeded, before confirming " +
            "the new server started -- the console's own port has already been released; a manual restart is needed.",
        });
        return;
      }
      settle({ ok: false, error: err.trim() || stripMarkerLines(out).trim() || 'restart: launcher exited with no result' });
    });
  });
}

export function registerRestartRoute(
  app: FastifyInstance,
  deps: RestartDeps,
  opts: {
    spawnFn?: typeof spawn;
    exitFn?: (code: number) => void;
    /** Test-only override of `runLauncher`'s own timeout, so a "launcher never reports" case
     * (finding 5) can be exercised without a real test waiting out the 150s production value. */
    launcherTimeoutMs?: number;
    /** Test-only override of the exit fallback delay (finding 1), for the same reason. */
    exitFallbackMs?: number;
  } = {},
): void {
  const { jobs, port, appDir, restartGate = new RestartGate(), closePort = () => {} } = deps;
  const exitFn = opts.exitFn ?? ((code: number) => process.exit(code));
  const exitFallbackMs = opts.exitFallbackMs ?? 500;

  app.post('/api/restart', async (req, reply) => {
    if (!isLoopbackHost(req.headers.host, port)) {
      return reply.code(400).send({ error: 'refused: Host header does not name this server' });
    }
    const running = jobs.runningJob();
    if (running) {
      return reply.code(409).send({
        error: `restart refused: job ${running.id} (${running.kind}) is running in ${running.tree}; a killed job leaves no exit code, so restart does not queue behind it.`,
      });
    }
    // Finding 4 (checkpoint-4 review): two POST /api/restart in flight at once would both run
    // `npm run build` in the same directory, and vite's `emptyOutDir: true` means one build's
    // output can be wiped mid-write by the other's. `begin()` is the check-and-set: only the
    // first request through here proceeds.
    if (!restartGate.begin()) {
      return reply.code(409).send({ error: 'restart refused: a restart is already in progress.' });
    }

    // Checkpoint-4 review (third pass), finding 2: `closePort` (below) tells this process to stop
    // listening, but nothing used to remember that it actually ran. On the failure path this
    // matters: once `closePort` has fired, this process can never listen again (`tryListen` in
    // index.ts only runs once, at module load), so it must not just answer 500 and sit there --
    // see the exit-scheduling note further down.
    let portClosed = false;

    // Checkpoint-4 review (second pass), finding 1 / (third pass), finding 2: exiting used to be
    // gated on `reply.raw`'s own `finish` event alone, which never fires if the client goes away
    // mid-request (a closed tab, a navigation, an ordinary network blip -- not rare across the
    // tens of seconds a rebuild can take). `doExit` runs from whichever of two races fires first
    // -- the real `finish` event, or a fallback timer -- and either one cancels the other, so this
    // process reliably exits soon after it is scheduled, whether or not the client is still there
    // to see the response. Shared by the confirmed-spawn path and, since the third-pass review,
    // the "closePort already ran but the new process never came up" failure path too: both leave
    // this process unable to serve again.
    const scheduleExit = () => {
      let exited = false;
      const doExit = () => {
        if (exited) return;
        exited = true;
        clearTimeout(fallbackTimer);
        exitFn(0);
      };
      reply.raw.once('finish', () => setImmediate(doExit));
      const fallbackTimer = setTimeout(doExit, exitFallbackMs);
    };

    let result: LauncherResult;
    try {
      result = await runLauncher(appDir, port, opts.spawnFn, opts.launcherTimeoutMs, () => {
        portClosed = true;
        closePort();
      });
    } catch (e) {
      // Belt for the (currently unreachable, `runLauncher` never rejects) case of it throwing
      // instead of resolving `{ ok: false }`: still clear the gate rather than leak it.
      restartGate.end();
      throw e;
    }
    if (!result.ok) {
      // Two genuinely different cases land here, and they are not equally safe:
      //   - The build itself failed (or the whole launcher never even reported an outcome --
      //     finding 5): `closePort` was never called (`BUILD_OK_MARKER` is never printed on a
      //     failed build -- see restart-launch.mjs), so this process is still the one listening,
      //     and the response below reaches a live server exactly as any other request would. The
      //     gate clears and this process keeps serving, unchanged.
      //   - The build succeeded but the *new* process then failed to come up (crashed after
      //     listening, exhausted its own EADDRINUSE retry loop, or the launcher itself vanished
      //     right after confirming the build -- findings 3 and 4, and third-pass finding 3): by
      //     this point `closePort` has already run (`portClosed` is true). This process is still
      //     alive and can still answer *this* request (its own connection was already accepted
      //     before the socket closed), but it is no longer listening for new connections at all,
      //     and any `/events` SSE clients are left believing it still is -- nothing serves this
      //     port, and nothing tells a connected tab to reconnect, until a human intervenes.
      //     Checkpoint-4 review (third pass), finding 2: previously this process just sat there,
      //     a zombie a developer running console.sh to recover could never see or reap. It cannot
      //     serve again, so -- once the 500 below has actually reached the client -- it takes the
      //     same exit path the success case does, so a developer's next console.sh start (or an
      //     external process manager watching for the exit) actually gets a fresh process instead
      //     of an invisible orphan still watching the repo.
      restartGate.end();
      const sent = reply.code(500).send({ error: result.error });
      if (portClosed) scheduleExit();
      return sent;
    }

    // The new process is confirmed listening (scripts/restart-launch.mjs `fork()`ed it and got
    // its own `{ type: 'listening' }` message back over IPC, and stayed up through a further
    // grace window -- see that script for why a bare network poll, or the message alone, does not
    // prove this on its own) before this handler does anything else. From here on this process
    // is committed to exiting -- the new process already owns the port -- so `end()` is never
    // called again: whichever path below actually exits does not need to un-gate a process that
    // is about to stop existing, and every un-gated path already returned above.
    scheduleExit();
    return reply.code(202).send({ ok: true, pid: result.pid });
  });
}
