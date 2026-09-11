// SPDX-License-Identifier: MPL-2.0
// Tests for the job runner (issue 100): the allow-list, the service-stop refusal, output
// escaping, queueing order, and openers URL shapes. Uses `buildApp` exactly as the real server
// does, against a throwaway fixture repo so nothing here ever touches this checkout's own git
// state or spawns a real gate.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Fastify from 'fastify';
import { buildApp, PORT } from '../src/index.js';
import type { RepoModel } from '../src/model/parse.js';
import { JobManager } from '../src/jobs/runner.js';
import { registerJobRoutes } from '../src/jobs/routes.js';


// Every POST/DELETE now checks Host (issue 100, finding 08): app.inject's simulated request
// carries no Host header by default, so every mutating call below states one explicitly, naming
// this same loopback port the real server binds to.
const LOOPBACK_HOST = { host: '127.0.0.1:7864' };

function fixtureRepo(): RepoModel {
  return {
    issueFiles: [],
    agentFiles: [],
    lessonsText: '',
    library: [],
    artefacts: [],
    git: { head: 'abc1234', branch: 'main', dirty: 0, remote: 'origin' },
    stamp: { present: false, matches: false },
    worktrees: [],
    generated: '2026-09-09T00:00:00Z',
  };
}

describe('POST /api/jobs: allow-list', () => {
  const { app } = buildApp({ readRepoFn: fixtureRepo });
  afterAll(() => app.close());

  it('rejects an unknown kind with 400 and names the allowed kinds', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'rm-rf', tree: '.', args: {} } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('rm-rf');
    expect(body.error).toContain('gate-fast');
    expect(body.error).toContain('worktree-list');
  });

  it('rejects a tree that is not a known worktree', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'worktree-list', tree: '../../etc', args: {} } });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/jobs: service stop cannot name the console', () => {
  const { app } = buildApp({ readRepoFn: fixtureRepo });
  afterAll(() => app.close());

  it('refuses "console" by name, whatever else the body carries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: LOOPBACK_HOST,
      payload: { kind: 'service-stop', tree: '.', args: { name: 'console', force: true, confirm: 'yes', extra: 'anything' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/console cannot stop itself/);
  });

  it('refuses the console by its own port', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: LOOPBACK_HOST,
      payload: { kind: 'service-stop', tree: '.', args: { name: String(PORT) } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('a real, unregistered service name is accepted by the allow-list but fails for a different reason (no such service)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: LOOPBACK_HOST,
      payload: { kind: 'service-stop', tree: '.', args: { name: 'translator-daemon' } },
    });
    expect(res.statusCode).toBe(201);
    const job = await app.inject({ method: 'GET', url: `/api/jobs/${res.json().id}` });
    expect(job.json().status).toBe('failed');
    const stream = await app.inject({ method: 'GET', url: `/api/jobs/${res.json().id}/stream` });
    expect(stream.payload).toContain('no local service named');
    expect(stream.payload).not.toMatch(/console cannot stop itself/);
  });
});

describe('POST /api/jobs: Host must name this server (finding 08, ADR 0011)', () => {
  const { app } = buildApp({ readRepoFn: fixtureRepo });
  afterAll(() => app.close());

  it('a request with no Host header at all is refused', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { kind: 'worktree-list', tree: '.', args: {} } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Host header/);
  });

  it('a request whose Host names a different origin (DNS-rebinding shape) is refused', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { host: 'evil.example.com' },
      payload: { kind: 'worktree-list', tree: '.', args: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Host header/);
  });

  it('a request whose Host names this server\'s own loopback address is accepted', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'worktree-list', tree: '.', args: {} } });
    expect(res.statusCode).toBe(201);
  });
});

describe('worktree-list end to end: creation, listing, streaming, escaped text', () => {
  const { app } = buildApp({ readRepoFn: fixtureRepo });
  afterAll(() => app.close());
  let id: string;

  it('creates a job', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'worktree-list', tree: '.', args: {} } });
    expect(res.statusCode).toBe(201);
    id = res.json().id;
    expect(id).toBeTruthy();
  });

  it('lists it in GET /api/jobs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.json().some((j: { id: string }) => j.id === id)).toBe(true);
  });

  it('GET /api/jobs/:id/stream replays buffered lines and ends with an exit event, once the process has finished', async () => {
    await new Promise((r) => setTimeout(r, 300));
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${id}/stream` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('event: exit');
  });
});

describe('a line containing <script> round-trips as text, never as markup', () => {
  // A job kind outside the real allow-list, wired into its own app, so this test can post a line
  // containing `<script>...</script>` without waiting on a slow real command. The SSE framing it
  // exercises (routes.ts's `event: line\ndata: ${JSON.stringify(line)}`) is the same code path
  // every real kind's output goes through.
  const xssKinds = {
    echo: {
      kind: 'echo',
      label: 'echo (test only)',
      treeScoped: true,
      validateArgs: () => ({}),
      build: (tree: string) => ({ cmd: 'node', args: ['-e', 'process.stdout.write("<script>alert(1)</script>\\n")'], cwd: tree }),
    },
  };
  const jobs = new JobManager(xssKinds as never);
  const app = Fastify({ logger: false });
  registerJobRoutes(app, { jobs, repoRoot: process.cwd(), port: 7864, treeRoots: () => [process.cwd()] });
  afterAll(() => app.close());

  it('posts a line containing <script> and reads it back as text, inside a JSON string', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'echo', tree: '.', args: {} } });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    await new Promise((r) => setTimeout(r, 500));
    const stream = await app.inject({ method: 'GET', url: `/api/jobs/${id}/stream` });
    expect(stream.payload).toContain('"text":"<script>alert(1)</script>"');
    // The literal bytes `<script>` appear only inside a `data:` JSON payload (as `\"text\":\"` or
    // `data: {`), never as the start of real markup a browser's HTML parser would act on -- there
    // is no `<script>` immediately preceded by a newline or `>` the way a real injected tag would
    // need to be to execute.
    expect(stream.payload).not.toMatch(/\n<script>/);
    const job = jobs.get(id)!;
    expect(job.lines.some((l) => l.text === '<script>alert(1)</script>')).toBe(true);
  });
});

describe('two jobs on one tree run in order', () => {
  const slowKinds = {
    slow: {
      kind: 'slow',
      label: 'slow (test only)',
      treeScoped: true,
      validateArgs: () => ({}),
      build: (tree: string) => ({ cmd: 'node', args: ['-e', 'setTimeout(() => {}, 400)'], cwd: tree }),
    },
  };
  const jobs = new JobManager(slowKinds as never);
  const app = Fastify({ logger: false });
  registerJobRoutes(app, { jobs, repoRoot: process.cwd(), port: 7864, treeRoots: () => [process.cwd()] });
  afterAll(() => app.close());

  it('the second request queues behind the first, named by id', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'slow', tree: '.', args: {} } });
    const second = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'slow', tree: '.', args: {} } });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstId = first.json().id;
    const secondId = second.json().id;
    const secondJob = jobs.get(secondId)!;
    expect(secondJob.status).toBe('queued');
    expect(secondJob.queuedReason).toBe(`queued behind #${firstId}`);
    await new Promise((r) => setTimeout(r, 900));
    expect(jobs.get(secondId)!.status).not.toBe('queued');
  });
});

describe('gate: missing CMakeUserPresets.json fails before cmake ever runs', () => {
  it('the precheck names the missing file', async () => {
    const { JOB_KINDS } = await import('../src/jobs/kinds.js');
    const tmp = mkdtempSync(join(tmpdir(), 'verstaan-gate-precheck-'));
    try {
      const reason = JOB_KINDS.gate.precheck!(tmp);
      expect(reason).toMatch(/CMakeUserPresets\.json is missing/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a job created for gate in such a tree fails immediately, with that reason, and writes no stamp', async () => {
    const { JOB_KINDS } = await import('../src/jobs/kinds.js');
    const tmp = mkdtempSync(join(tmpdir(), 'verstaan-gate-precheck-job-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: tmp });
      const jobs = new JobManager(JOB_KINDS);
      const job = jobs.create('gate', tmp, {});
      expect(job.status).toBe('failed');
      expect(job.exitCode).toBe(1);
      expect(job.lines.some((l) => l.text.includes('CMakeUserPresets.json is missing'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
