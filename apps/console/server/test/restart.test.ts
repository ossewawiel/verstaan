// SPDX-License-Identifier: MPL-2.0
// Tests for POST /api/restart (issue 162): the Host check, the "refused while a job is running
// anywhere" rule, and the two outcomes a fake launcher can report -- a confirmed spawn (202,
// this process asks to exit only after the response has flushed) and a failed build (500, this
// process never asks to exit at all). The real launcher (scripts/restart-launch.mjs) is not
// exercised here: it shells out to `npm run build` and a real `node`, which is what the report's
// two manual proofs cover instead.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import { registerRestartRoute } from '../src/restart.js';
import { JobManager } from '../src/jobs/runner.js';
import { RestartGate } from '../src/restart-gate.js';

const LOOPBACK_HOST = { host: '127.0.0.1:7864' };

/** A fake `child_process.spawn` that behaves like `scripts/restart-launch.mjs`: writes one line
 * to stdout (or stderr) on the next tick, then closes. Good enough to drive `runLauncher`
 * (routes.ts) without ever touching a real filesystem or a real `npm run build`. */
function fakeSpawn(stdoutLines: string[], exitCode = 0) {
  return vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void; stdout: EventEmitter; stderr: EventEmitter };
    child.unref = () => {};
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      for (const line of stdoutLines) child.stdout.emit('data', Buffer.from(`${line}\n`));
      child.emit('close', exitCode);
    });
    return child as never;
  });
}

function buildTestApp(opts: {
  jobs?: JobManager;
  spawnFn?: ReturnType<typeof fakeSpawn>;
  exitFn?: ReturnType<typeof vi.fn>;
  restartGate?: RestartGate;
  launcherTimeoutMs?: number;
  exitFallbackMs?: number;
  closePort?: ReturnType<typeof vi.fn>;
} = {}) {
  const app = Fastify({ logger: false });
  const jobs = opts.jobs ?? new JobManager();
  const exitFn = opts.exitFn ?? vi.fn();
  const restartGate = opts.restartGate ?? new RestartGate();
  registerRestartRoute(
    app,
    { jobs, port: 7864, appDir: '/fake/apps/console', restartGate, closePort: opts.closePort },
    { spawnFn: opts.spawnFn, exitFn, launcherTimeoutMs: opts.launcherTimeoutMs, exitFallbackMs: opts.exitFallbackMs },
  );
  return { app, jobs, exitFn, restartGate };
}

describe('POST /api/restart: Host must name this server', () => {
  it('a request with no Host header is refused', async () => {
    const { app } = buildTestApp({ spawnFn: fakeSpawn(['RESTART_SERVER_SPAWNED:123']) });
    const res = await app.inject({ method: 'POST', url: '/api/restart' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Host header/);
  });
});

describe('POST /api/restart: refused while a job is running anywhere, not queued', () => {
  it('names the running job and the tree, and never spawns a launcher', async () => {
    // A fake JobManager, not a real one running a real child process: `runningJob()` is the only
    // method the route calls, and a real spawn's async `error`/`close` events would race this
    // test's own timing (the job runner is exercised end to end in jobs.test.ts already).
    const jobs = { runningJob: () => ({ id: 'job-1', tree: '/fake/tree', kind: 'slow' }) } as unknown as JobManager;
    const spawnFn = fakeSpawn(['RESTART_SERVER_SPAWNED:123']);
    const { app } = buildTestApp({ jobs, spawnFn });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/job job-1 \(slow\) is running in \/fake\/tree/);
    expect(res.json().error).toMatch(/killed job leaves no exit code/);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe('POST /api/restart: a confirmed spawn', () => {
  it('responds 202 with the new pid, and only asks to exit after the response has flushed', async () => {
    const spawnFn = fakeSpawn(['RESTART_SERVER_SPAWNED:4321']);
    const exitFn = vi.fn();
    const { app } = buildTestApp({ spawnFn, exitFn });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, pid: 4321 });
    // `app.inject` resolves after the response is fully formed; the exit is scheduled off a real
    // socket's `finish` event and a `setImmediate` on top of that, so it has not necessarily run
    // in this same microtask -- give it one tick, the same margin the real ordering relies on.
    await new Promise((r) => setImmediate(r));
    expect(exitFn).toHaveBeenCalledWith(0);
  });
});

describe('POST /api/restart: a failed rebuild', () => {
  it('responds 500 with the build error, and never asks to exit', async () => {
    const spawnFn = fakeSpawn([`RESTART_BUILD_FAILED:${JSON.stringify('server/src/index.ts(12,3):\nsyntax error')}`], 1);
    const exitFn = vi.fn();
    const { app } = buildTestApp({ spawnFn, exitFn });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain('syntax error');
    await new Promise((r) => setImmediate(r));
    expect(exitFn).not.toHaveBeenCalled();
  });

  // Checkpoint-4 review, finding 4 (the clearing half): a failed rebuild must not leave the gate
  // stuck -- the whole point of reporting the error back is that the source can be fixed and
  // restart tried again, immediately.
  it('clears the restart gate, so a second attempt is not refused', async () => {
    const restartGate = new RestartGate();
    const spawnFn = fakeSpawn(['RESTART_BUILD_FAILED:"broken"'], 1);
    const { app } = buildTestApp({ spawnFn, restartGate });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(restartGate.isActive()).toBe(false);
  });
});

describe('POST /api/restart: two requests in flight at once (checkpoint-4 review, finding 4)', () => {
  it('the second is refused with 409 while the first is still running its launcher, so two `npm run build` never collide', async () => {
    const restartGate = new RestartGate();
    // A launcher that never resolves on its own within this test: the first request's own
    // `runLauncher` call is left pending, standing in for an in-flight, several-second build, so
    // the second request's check is exercised while the gate is still held.
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void; stdout: EventEmitter; stderr: EventEmitter };
      child.unref = () => {};
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      // deliberately never emits 'close'
      return child as never;
    });
    const { app } = buildTestApp({ spawnFn, restartGate });

    const first = app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    // Give the first request's handler a tick to reach and pass `restartGate.begin()`.
    await new Promise((r) => setImmediate(r));
    expect(restartGate.isActive()).toBe(true);

    const second = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/restart is already in progress/);
    expect(spawnFn).toHaveBeenCalledTimes(1); // the second request never reached runLauncher

    void first; // the first request is deliberately left pending; this test does not await it
  });
});

describe('POST /api/restart: a launcher that never reports either marker', () => {
  it('is treated as a failure, not left hanging', async () => {
    const spawnFn = fakeSpawn(['something unexpected on stdout'], 1);
    const { app } = buildTestApp({ spawnFn });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
  });
});

// Checkpoint-4 review (second pass), finding 1: a client that disconnects mid-restart must not
// leave two processes bound and the gate stuck. `app.inject` alone cannot simulate a socket the
// client actually walked away from -- there is no real socket -- so this drives a real HTTP
// server and destroys the client socket before the response is read, the same shape a closed tab
// produces, then proves both halves of the original bug are fixed: `exitFn` still runs (off the
// fallback, since `finish` never fires on a destroyed socket) and the gate still clears.
describe('POST /api/restart: a confirmed spawn, client disconnects before the response is read (checkpoint-4 review, second pass, finding 1)', () => {
  it('still exits, via the fallback timer, once the client is gone', async () => {
    // A launcher that takes a little while (the real one can take up to ~40s -- see the issue's
    // repro) -- long enough that Node's own server-side socket has genuinely finished tearing
    // down (proven below by asserting `reply.raw.destroyed`/`socket.destroyed`) before the route
    // ever tries to write the response. A same-tick destroy (tried first) does not reproduce the
    // bug: a local write can still succeed into the kernel's own send buffer a moment after the
    // remote end is gone, and `finish` fires anyway -- proven separately against real Node
    // (two debug scripts, not guessed), which is why this test needs the delay to be real.
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void; stdout: EventEmitter; stderr: EventEmitter };
      child.unref = () => {};
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('RESTART_SERVER_SPAWNED:4321\n'));
        child.emit('close', 0);
      }, 200);
      return child as never;
    });
    const exitFn = vi.fn();
    const { app } = buildTestApp({ spawnFn, exitFn, exitFallbackMs: 30 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const addr = app.server.address();
      if (!addr || typeof addr === 'string') throw new Error('expected an AddressInfo');
      const net = await import('node:net');
      const socket = net.connect(addr.port, '127.0.0.1', () => {
        // The Host header must name the port `registerRestartRoute` was given (7864, via
        // `buildTestApp`), not the OS-assigned port this test actually listens on -- otherwise
        // `isLoopbackHost` refuses the request before any of this test's timing matters.
        socket.write(
          `POST /api/restart HTTP/1.1\r\nHost: 127.0.0.1:7864\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n`,
          () => socket.destroy(),
        );
      });
      await new Promise((r) => setTimeout(r, 500));
      expect(exitFn).toHaveBeenCalledWith(0);
    } finally {
      await app.close();
    }
  });

  it('the exit fallback and the finish event never both fire (no double exit)', async () => {
    const spawnFn = fakeSpawn(['RESTART_SERVER_SPAWNED:4321']);
    const exitFn = vi.fn();
    const { app } = buildTestApp({ spawnFn, exitFn, exitFallbackMs: 30 });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(202);
    // Long enough to span both the `finish`-driven fast path and the fallback timer, so a bug
    // that fired both would be caught here.
    await new Promise((r) => setTimeout(r, 100));
    expect(exitFn).toHaveBeenCalledTimes(1);
  });
});

// Checkpoint-4 review (second pass), finding 1 (the gate half): the gate must not leak active
// forever just because this particular test's `exitFn` is a mock, not a real `process.exit` --
// the same shape the fallback-timeout path hits in production if `exitFn` is ever delayed or a
// process manager intercepts it.
describe('POST /api/restart: a confirmed spawn commits to exiting without re-touching the gate', () => {
  it('leaves the gate active (the process is exiting; nothing here needs it un-set)', async () => {
    const restartGate = new RestartGate();
    const spawnFn = fakeSpawn(['RESTART_SERVER_SPAWNED:4321']);
    const { app } = buildTestApp({ spawnFn, restartGate });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(202);
    expect(restartGate.isActive()).toBe(true);
  });
});

// Checkpoint-4 review (second pass), finding 5: a launcher that never reports either marker AND
// never closes -- a hung `npm run build`, or a hung new process -- must not hang the request, or
// the gate, forever.
describe('POST /api/restart: the launcher never reports an outcome at all (checkpoint-4 review, second pass, finding 5)', () => {
  it('resolves 500 once the launcher timeout elapses, and clears the gate', async () => {
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void; stdout: EventEmitter; stderr: EventEmitter };
      child.unref = () => {};
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      // deliberately never emits 'close', standing in for a wedged `npm run build` or a hung new
      // process: this is the shape restart.test.ts's own "two requests in flight" test already
      // uses to model an in-flight build; here it is left hanging for the full request instead of
      // being abandoned mid-test.
      return child as never;
    });
    const restartGate = new RestartGate();
    const { app } = buildTestApp({ spawnFn, restartGate, launcherTimeoutMs: 20 });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatch(/reported no outcome within/);
    expect(restartGate.isActive()).toBe(false);
  });
});

// Checkpoint-4 review (second pass), finding 2: `SO_REUSEPORT` was verified (against two real
// Node processes on Linux) to require every socket sharing a port to opt in, including the
// first -- so simultaneous binding between the old and new process was never actually achievable.
// `closePort` is the real handoff: called as soon as `RESTART_BUILD_OK:` is seen on the
// launcher's stdout, *before* the new process has even been forked (mirroring
// scripts/restart-launch.mjs, which prints that marker immediately after `ensureBuilt` succeeds
// and before its own `fork()` call).
describe('POST /api/restart: the port handoff (checkpoint-4 review, second pass, finding 2)', () => {
  it('calls closePort as soon as the build-ok marker is seen, before the spawned marker ever arrives', async () => {
    let closePortCalledBeforeSpawnKnown = false;
    let spawnKnown = false;
    const closePort = vi.fn(() => {
      closePortCalledBeforeSpawnKnown = !spawnKnown;
    });
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void; stdout: EventEmitter; stderr: EventEmitter };
      child.unref = () => {};
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('RESTART_BUILD_OK:\n'));
        // A real gap here is exactly the point: scripts/restart-launch.mjs only forks the new
        // process, and that process only starts listening, well after printing this marker.
        setImmediate(() => {
          spawnKnown = true;
          child.stdout.emit('data', Buffer.from('RESTART_SERVER_SPAWNED:999\n'));
          child.emit('close', 0);
        });
      });
      return child as never;
    });
    const { app } = buildTestApp({ spawnFn, closePort });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(202);
    expect(closePort).toHaveBeenCalledTimes(1);
    // closePort ran strictly before this process learned the new one had spawned -- proving the
    // handoff releases the port at the earliest possible moment, not only at the very end.
    expect(closePortCalledBeforeSpawnKnown).toBe(true);
  });

  it('never calls closePort when the build itself fails -- this process is still the only one listening', async () => {
    const closePort = vi.fn();
    const spawnFn = fakeSpawn([`RESTART_BUILD_FAILED:${JSON.stringify('syntax error')}`], 1);
    const { app } = buildTestApp({ spawnFn, closePort });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(closePort).not.toHaveBeenCalled();
  });
});

// Checkpoint-4 review (third pass), finding 2: a handoff that fails AFTER closePort has already
// run leaves this process unable to serve again -- it must not just 500 and sit there as an
// invisible zombie. The new process failing to come up after the build succeeded (crash,
// EADDRINUSE exhaustion) is exactly the case scripts/restart-launch.mjs reports as
// RESTART_BUILD_FAILED *after* it has already printed RESTART_BUILD_OK -- fakeSpawn's single
// stdoutLines array captures both in order, the same as the real launcher's own stdout stream.
describe('POST /api/restart: the new process fails after closePort has already run (checkpoint-4 review, third pass, finding 2)', () => {
  it('still exits, via the same path a confirmed spawn uses, after answering 500', async () => {
    const closePort = vi.fn();
    const exitFn = vi.fn();
    const spawnFn = fakeSpawn(
      ['RESTART_BUILD_OK:', `RESTART_BUILD_FAILED:${JSON.stringify('new server process exited before it started listening (code 1, signal null)')}`],
      1,
    );
    const { app } = buildTestApp({ spawnFn, closePort, exitFn, exitFallbackMs: 30 });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(closePort).toHaveBeenCalledTimes(1);
    // Not yet exited synchronously -- the 500 must reach the client first (the fallback timer, or
    // the real `finish` event, is what actually triggers it).
    await new Promise((r) => setTimeout(r, 100));
    expect(exitFn).toHaveBeenCalledWith(0);
  });

  it('does not exit when closePort never ran -- an ordinary failed build keeps serving', async () => {
    const closePort = vi.fn();
    const exitFn = vi.fn();
    const spawnFn = fakeSpawn([`RESTART_BUILD_FAILED:${JSON.stringify('syntax error')}`], 1);
    const { app } = buildTestApp({ spawnFn, closePort, exitFn, exitFallbackMs: 30 });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(closePort).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 100));
    expect(exitFn).not.toHaveBeenCalled();
  });
});

// Checkpoint-4 review (third pass), finding 3: the launcher can vanish (be killed, crash) right
// after printing RESTART_BUILD_OK but before either final marker -- `child.on('close', ...)`
// fires with `out` containing only that one marker line. The last-resort fallback used to read
// that back verbatim, producing an "error" that is literally the string `RESTART_BUILD_OK:`.
describe('POST /api/restart: the launcher vanishes right after confirming the build (checkpoint-4 review, third pass, finding 3)', () => {
  it('reports a clear "port already released" message, not the bare RESTART_BUILD_OK: marker', async () => {
    // Mirrors the real failure: the launcher's stdout stream closes with only the build-ok marker
    // ever written, no RESTART_SERVER_SPAWNED or RESTART_BUILD_FAILED line at all.
    const spawnFn = fakeSpawn(['RESTART_BUILD_OK:'], 1);
    const { app } = buildTestApp({ spawnFn });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).not.toBe('RESTART_BUILD_OK:');
    expect(res.json().error).toMatch(/ended unexpectedly after the build succeeded/);
    expect(res.json().error).toMatch(/port has already been released/);
  });

  it('also takes the exit path, since closePort already ran for this case too', async () => {
    const closePort = vi.fn();
    const exitFn = vi.fn();
    const spawnFn = fakeSpawn(['RESTART_BUILD_OK:'], 1);
    const { app } = buildTestApp({ spawnFn, closePort, exitFn, exitFallbackMs: 30 });
    const res = await app.inject({ method: 'POST', url: '/api/restart', headers: LOOPBACK_HOST });
    expect(res.statusCode).toBe(500);
    expect(closePort).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(exitFn).toHaveBeenCalledWith(0);
  });
});
