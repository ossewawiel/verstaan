// SPDX-License-Identifier: MPL-2.0
// Tests for the harness (issue 178, ADR 0016): `quest-run`'s own `validateArgs`, the canUseTool
// question/answer round trip end to end against a stubbed SDK, the cost line landing in the job
// log, the restart exemption, and resume-on-start from a persisted session id. No real SDK
// network call anywhere in this file ("Not in scope"): every `query()` these tests exercise is a
// plain stub function this file writes, injected through `JobManager`'s own `sdkRunnerFn` seam.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { JobManager } from '../src/jobs/runner.js';
import { registerJobRoutes } from '../src/jobs/routes.js';
import { findQuestIssueFile, validateQuestRunArgs, JobArgsError, JOB_KINDS, type JobKindDef } from '../src/jobs/kinds.js';
import { runQuestSession, KILLED_SENTINEL, type QueryFn, type SdkRunnerFn } from '../src/jobs/sdk-runner.js';

const LOOPBACK_HOST = { host: '127.0.0.1:7864' };
// Checkpoint-4 review, finding 2: real production code waits `RESTART_RESUME_GRACE_MS` (3000ms,
// runner.ts) before resuming a restored session. Every test in this file that exercises the
// restore path passes a tiny grace period instead, so it resumes within a tick or two -- the
// mechanism under test is "does it wait for the grace period and then resume with `resume:
// sessionId`", not "does it wait exactly three real seconds".
const TEST_RESUME_GRACE_MS = 5;

function fixtureIssuesDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'verstaan-quest-run-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

/** A `quest-run` table row whose own `validateArgs` reads from a throwaway fixture directory
 * instead of this checkout's real `docs/factory/issues` -- the same seam `lesson-promote`'s own
 * tests already use for `lessons.jsonl` (jobs.test.ts). */
function kindsWithFixtureIssues(issuesDir: string): Record<string, JobKindDef> {
  return { ...JOB_KINDS, 'quest-run': { ...JOB_KINDS['quest-run'], validateArgs: (args: unknown) => validateQuestRunArgs(args, issuesDir) } };
}

describe('findQuestIssueFile / validateQuestRunArgs (issue 178, ADR 0016)', () => {
  const dir = fixtureIssuesDir({
    '42-open-quest.md': '---\nissue: 42\nstatus: open\nmodel: sonnet\neffort: high\n---\n## What\n',
    '43-in-progress.md': '---\nissue: 43\nstatus: in-progress\nmodel: sonnet\neffort: medium\n---\n## What\n',
    '44-bad-model.md': '---\nissue: 44\nstatus: open\nmodel: gpt-5\neffort: high\n---\n## What\n',
    '45-no-effort.md': '---\nissue: 45\nstatus: open\nmodel: sonnet\n---\n## What\n',
  });

  it("reads a real open issue file's model and effort", () => {
    expect(findQuestIssueFile(42, dir)).toEqual({ file: '42-open-quest.md', model: 'sonnet', effort: 'high', status: 'open' });
  });

  it('returns null for an issue number with no file', () => {
    expect(findQuestIssueFile(99, dir)).toBeNull();
  });

  it('validateArgs accepts an open issue with a known model and effort', () => {
    expect(validateQuestRunArgs({ issue: 42 }, dir)).toEqual({ issue: 42, model: 'sonnet', effort: 'high', file: '42-open-quest.md' });
  });

  it('validateArgs refuses an issue whose front matter status is not open', () => {
    expect(() => validateQuestRunArgs({ issue: 43 }, dir)).toThrow(JobArgsError);
  });

  it('validateArgs refuses a model outside the allow-list', () => {
    expect(() => validateQuestRunArgs({ issue: 44 }, dir)).toThrow(JobArgsError);
  });

  it('validateArgs refuses a missing effort', () => {
    expect(() => validateQuestRunArgs({ issue: 45 }, dir)).toThrow(JobArgsError);
  });

  it('validateArgs refuses an issue number with no file at all', () => {
    expect(() => validateQuestRunArgs({ issue: 99 }, dir)).toThrow(JobArgsError);
  });

  it('validateArgs refuses a non-integer issue before any file is even read', () => {
    expect(() => validateQuestRunArgs({ issue: 'six' }, dir)).toThrow(JobArgsError);
  });
});

describe('POST /api/jobs: an unrecognised kind is still 400 and names quest-run (regression, alongside quest-start\'s own)', () => {
  it('the allow-list POST /api/jobs names includes quest-run', async () => {
    const jobs = new JobManager();
    const app = Fastify({ logger: false });
    registerJobRoutes(app, { jobs, repoRoot: process.cwd(), port: 7864, treeRoots: () => [process.cwd()] });
    const res = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'rm-rf', tree: '.', args: {} } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('quest-run');
  });
});

/** A stub `queryFn` (sdk-runner.ts's own injection seam) shaped like the real SDK just enough for
 * `runQuestSession` to drive it: an async generator that reports a session id, calls the
 * `canUseTool` callback it was handed exactly like the real SDK calls it for `AskUserQuestion`,
 * and finishes with a `result` message carrying `total_cost_usd`. `answerCapture` records what
 * `canUseTool` returned, so the test can prove the owner's answer really reached the tool call. */
function stubQueryWithQuestion(sessionId: string, cost: number, answerCapture: { value?: unknown }): QueryFn {
  return ((params: { options?: { canUseTool?: (name: string, input: Record<string, unknown>, opts: { toolUseID: string }) => Promise<unknown> } }) => {
    async function* gen() {
      yield { type: 'system', subtype: 'init', session_id: sessionId };
      const result = await params.options!.canUseTool!('AskUserQuestion', { question: 'Ship it?', options: ['yes', 'no'] }, { toolUseID: 'tu-1' });
      answerCapture.value = result;
      yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: cost };
    }
    return gen();
  }) as unknown as QueryFn;
}

describe('quest-run: canUseTool question/answer round trip end to end against a stubbed SDK (issue 178)', () => {
  it('AskUserQuestion writes a question onto the job, POST .../answer resolves it, and the run finishes with the cost line in the log', async () => {
    const dir = fixtureIssuesDir({ '50-quest.md': '---\nissue: 50\nstatus: open\nmodel: sonnet\neffort: medium\n---\n## What\n' });
    try {
      const answerCapture: { value?: unknown } = {};
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => runQuestSession(params, callbacks, stubQueryWithQuestion('sess-abc', 0.1234, answerCapture));
      const jobs = new JobManager(kindsWithFixtureIssues(dir), sdkRunnerFn);
      const app = Fastify({ logger: false });
      registerJobRoutes(app, { jobs, repoRoot: process.cwd(), port: 7864, treeRoots: () => [process.cwd()] });

      const create = await app.inject({ method: 'POST', url: '/api/jobs', headers: LOOPBACK_HOST, payload: { kind: 'quest-run', tree: '.', args: { issue: 50 } } });
      expect(create.statusCode).toBe(201);
      const id = create.json().id;

      // Give the stub's async generator a moment to reach the canUseTool call and park there,
      // waiting on the same promise a real interactive checkpoint would also be waiting on.
      await new Promise((r) => setImmediate(r));
      let job = jobs.get(id)!;
      expect(job.sessionId).toBe('sess-abc');
      expect(job.question).not.toBeNull();
      expect(job.question!.toolName).toBe('AskUserQuestion');
      expect(job.question!.input).toEqual({ question: 'Ship it?', options: ['yes', 'no'] });
      // The route's own JSON shape (routes.ts) carries the question through, so the Jobs room can
      // render the card without a second endpoint.
      const getJob = await app.inject({ method: 'GET', url: `/api/jobs/${id}` });
      expect(getJob.json().question).toEqual(job.question);

      const answerRes = await app.inject({ method: 'POST', url: `/api/jobs/${id}/answer`, headers: LOOPBACK_HOST, payload: { answer: 'yes, ship it' } });
      expect(answerRes.statusCode).toBe(204);

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      job = jobs.get(id)!;
      expect(job.question).toBeNull();
      expect(job.status).toBe('done');
      expect(answerCapture.value).toEqual({ behavior: 'deny', message: 'yes, ship it' });
      expect(job.lines.some((l) => l.text.includes('cost: $0.1234 total_cost_usd'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('answering a job with no open question is refused with 404, not 500', async () => {
    const jobs = new JobManager();
    const app = Fastify({ logger: false });
    registerJobRoutes(app, { jobs, repoRoot: process.cwd(), port: 7864, treeRoots: () => [process.cwd()] });
    const res = await app.inject({ method: 'POST', url: '/api/jobs/does-not-exist/answer', headers: LOOPBACK_HOST, payload: { answer: 'x' } });
    expect(res.statusCode).toBe(404);
  });

  it('POST .../answer with no Host header is refused, same as every other mutating job route', async () => {
    const jobs = new JobManager();
    const app = Fastify({ logger: false });
    registerJobRoutes(app, { jobs, repoRoot: process.cwd(), port: 7864, treeRoots: () => [process.cwd()] });
    const res = await app.inject({ method: 'POST', url: '/api/jobs/anything/answer', payload: { answer: 'x' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('quest-run is exempt from "no job may run across a restart" (issue 178, ADR 0016)', () => {
  it('runningJob() (restart.ts\'s own check) skips a running quest-run job', async () => {
    const dir = fixtureIssuesDir({ '51-quest.md': '---\nissue: 51\nstatus: open\nmodel: sonnet\neffort: low\n---\n## What\n' });
    try {
      const neverEndingQuery: QueryFn = (() => {
        async function* gen() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-hold' };
          await new Promise(() => {
            /* never resolves: the session is still "running" for the life of this test */
          });
        }
        return gen();
      }) as unknown as QueryFn;
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => runQuestSession(params, callbacks, neverEndingQuery);
      const jobs = new JobManager(kindsWithFixtureIssues(dir), sdkRunnerFn);
      jobs.create('quest-run', process.cwd(), { issue: 51 });
      await new Promise((r) => setImmediate(r));
      expect(jobs.get(jobs.list()[0].id)!.status).toBe('running');
      expect(jobs.runningJob()).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runQuestSession: a real assistant-message frame reaches the job log (checkpoint-4 review, finding 3)', () => {
  it('logs the text block(s) from message.message.content, not a non-existent top-level message.text', async () => {
    // Shaped like the real SDK's own `SDKAssistantMessage` (sdk.d.ts): a `type: 'assistant'`
    // frame wrapping a `BetaMessage`-shaped `message`, whose text lives in
    // `message.content[].text`, one block per `type: 'text'` entry -- there is no top-level
    // `text` field on any member of the real `SDKMessage` union.
    const assistantFrame = {
      type: 'assistant',
      session_id: 'sess-text',
      uuid: 'uuid-1',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading the issue file now.' },
          { type: 'tool_use', id: 'tu-9', name: 'Read', input: {} },
          { type: 'text', text: 'Found it.' },
        ],
      },
    };
    const stubQuery: QueryFn = (() => {
      async function* gen() {
        yield assistantFrame;
        yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.02 };
      }
      return gen();
    }) as unknown as QueryFn;

    const lines: { stream: string; text: string }[] = [];
    const handle = runQuestSession(
      { prompt: '/factory-run 70', model: 'sonnet', effort: 'medium', cwd: process.cwd() },
      {
        onLine: (stream, text) => lines.push({ stream, text }),
        onSessionId: () => {},
        onQuestion: async () => 'unused',
      },
      stubQuery,
    );
    const exitCode = await handle.done;
    expect(exitCode).toBe(0);
    expect(lines.some((l) => l.stream === 'stdout' && l.text === 'Reading the issue file now.')).toBe(true);
    expect(lines.some((l) => l.stream === 'stdout' && l.text === 'Found it.')).toBe(true);
    // The `tool_use` block carries no text and must not produce a line of its own.
    expect(lines.some((l) => l.text.includes('tool_use'))).toBe(false);
  });

  it('a message shape this runner does not recognise yields no lines, rather than throwing', async () => {
    const stubQuery: QueryFn = (() => {
      async function* gen() {
        yield { type: 'assistant', session_id: 's', message: { role: 'assistant', content: 'not an array' } };
        yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0 };
      }
      return gen();
    }) as unknown as QueryFn;
    const handle = runQuestSession(
      { prompt: '/factory-run 71', model: 'sonnet', effort: 'medium', cwd: process.cwd() },
      { onLine: () => {}, onSessionId: () => {}, onQuestion: async () => 'unused' },
      stubQuery,
    );
    await expect(handle.done).resolves.toBe(0);
  });
});

describe('kill() on a running quest-run job (checkpoint-4 review, finding 1)', () => {
  it('interrupts the session, resolves an open question with the killed sentinel, marks the job killed, and frees the tree for the next queued job', async () => {
    const dir = fixtureIssuesDir({
      '52-quest.md': '---\nissue: 52\nstatus: open\nmodel: sonnet\neffort: low\n---\n## What\n',
    });
    try {
      let interruptCalls = 0;
      const answerCapture: { value?: unknown } = {};
      const neverEndingQueryWithQuestion: QueryFn = ((params: { options?: { canUseTool?: (name: string, input: Record<string, unknown>, opts: { toolUseID: string }) => Promise<unknown> } }) => {
        async function* gen() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-kill-me' };
          answerCapture.value = await params.options!.canUseTool!('AskUserQuestion', { question: 'proceed?' }, { toolUseID: 'tu-1' });
          // A real interrupt() rejects the in-flight generator's own await, so the `for await`
          // loop this stub stands in for never yields again after this point.
          await new Promise(() => {});
        }
        return gen();
      }) as unknown as QueryFn;
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => {
        const handle = runQuestSession(params, callbacks, neverEndingQueryWithQuestion);
        const realInterrupt = handle.interrupt;
        return {
          done: handle.done,
          interrupt: async () => {
            interruptCalls += 1;
            await realInterrupt();
          },
        };
      };
      const jobs = new JobManager(kindsWithFixtureIssues(dir), sdkRunnerFn);
      const tree = process.cwd();
      const runningJob = jobs.create('quest-run', tree, { issue: 52 });
      const queuedJob = jobs.create('quest-run', tree, { issue: 52 });
      await new Promise((r) => setImmediate(r));
      expect(jobs.get(runningJob.id)!.question).not.toBeNull();
      expect(jobs.get(queuedJob.id)!.status).toBe('queued');

      const killed = jobs.kill(runningJob.id);
      expect(killed).toBe(true);
      await new Promise((r) => setImmediate(r));

      const job = jobs.get(runningJob.id)!;
      expect(job.status).toBe('killed');
      expect(job.question).toBeNull();
      expect(answerCapture.value).toEqual({ behavior: 'deny', message: KILLED_SENTINEL });
      expect(interruptCalls).toBe(1);
      // The tree slot is freed and the job queued behind it now gets to start (before this fix,
      // `runningByTree` stayed pointed at the killed job forever).
      expect(jobs.get(queuedJob.id)!.status).toBe('running');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('killing a quest-run job with no open question still interrupts and frees the tree', async () => {
    const dir = fixtureIssuesDir({ '53-quest.md': '---\nissue: 53\nstatus: open\nmodel: sonnet\neffort: low\n---\n## What\n' });
    try {
      let interruptCalls = 0;
      const neverEndingQuery: QueryFn = (() => {
        async function* gen() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-hold-2' };
          await new Promise(() => {});
        }
        return gen();
      }) as unknown as QueryFn;
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => {
        const handle = runQuestSession(params, callbacks, neverEndingQuery);
        return { done: handle.done, interrupt: async () => { interruptCalls += 1; await handle.interrupt(); } };
      };
      const jobs = new JobManager(kindsWithFixtureIssues(dir), sdkRunnerFn);
      const job = jobs.create('quest-run', process.cwd(), { issue: 53 });
      await new Promise((r) => setImmediate(r));
      expect(jobs.kill(job.id)).toBe(true);
      expect(interruptCalls).toBe(1);
      expect(jobs.get(job.id)!.status).toBe('killed');
      expect(jobs.runningJob()).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('killing an already-finished quest-run job is a no-op, returning false', async () => {
    const dir = fixtureIssuesDir({ '54-quest.md': '---\nissue: 54\nstatus: open\nmodel: sonnet\neffort: low\n---\n## What\n' });
    try {
      const finishesImmediately: QueryFn = (() => {
        async function* gen() {
          yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01 };
        }
        return gen();
      }) as unknown as QueryFn;
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => runQuestSession(params, callbacks, finishesImmediately);
      const jobs = new JobManager(kindsWithFixtureIssues(dir), sdkRunnerFn);
      const job = jobs.create('quest-run', process.cwd(), { issue: 54 });
      await new Promise((r) => setImmediate(r));
      expect(jobs.get(job.id)!.status).toBe('done');
      expect(jobs.kill(job.id)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('restoreQuestRunJobs / persistence (issue 178 acceptance: resume by id after a rebuild)', () => {
  it('a quest-run job with a sessionId and no terminal status resumes via query({ resume: sessionId })', async () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'verstaan-quest-run-store-'));
    const storePath = join(storeDir, 'quest-run-jobs.json');
    writeFileSync(
      storePath,
      JSON.stringify([
        {
          id: 'job-resume-1',
          kind: 'quest-run',
          tree: process.cwd(),
          args: { issue: 60, model: 'sonnet', effort: 'high' },
          status: 'running',
          exitCode: null,
          createdAt: 1,
          startedAt: 1,
          endedAt: null,
          queuedReason: null,
          lines: [],
          sessionId: 'sess-old',
          question: { toolUseId: 'x', toolName: 'AskUserQuestion', input: {}, askedAt: 1 },
        },
      ]),
    );
    try {
      const resumeArgs: (string | undefined)[] = [];
      const stubQuery: QueryFn = ((params: { options?: { resume?: string } }) => {
        resumeArgs.push(params.options?.resume);
        async function* gen() {
          yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01 };
        }
        return gen();
      }) as unknown as QueryFn;
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => runQuestSession(params, callbacks, stubQuery);
      const jobs = new JobManager(JOB_KINDS, sdkRunnerFn, storePath, TEST_RESUME_GRACE_MS);
      // The open question the old process left behind died with it; resuming clears it so a
      // stale, unanswerable card never lingers in the Jobs room.
      expect(jobs.get('job-resume-1')!.question).toBeNull();
      // Checkpoint-4 review, finding 2: resuming is deliberately not immediate -- it waits out
      // `restartResumeGraceMs` first, so nothing has called `query({ resume })` yet right after
      // construction.
      expect(resumeArgs).toEqual([]);
      await new Promise((r) => setTimeout(r, TEST_RESUME_GRACE_MS + 20));
      expect(resumeArgs).toEqual(['sess-old']);
      expect(jobs.get('job-resume-1')!.status).toBe('done');
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('a persisted job with no sessionId is marked failed instead of resumed', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'verstaan-quest-run-store-'));
    const storePath = join(storeDir, 'quest-run-jobs.json');
    writeFileSync(
      storePath,
      JSON.stringify([
        {
          id: 'job-orphan-1',
          kind: 'quest-run',
          tree: process.cwd(),
          args: { issue: 61, model: 'sonnet', effort: 'high' },
          status: 'running',
          exitCode: null,
          createdAt: 1,
          startedAt: 1,
          endedAt: null,
          queuedReason: null,
          lines: [],
          sessionId: null,
          question: null,
        },
      ]),
    );
    try {
      const jobs = new JobManager(JOB_KINDS, undefined, storePath);
      const job = jobs.get('job-orphan-1')!;
      expect(job.status).toBe('failed');
      expect(job.lines.some((l) => l.text.includes('cannot be resumed'))).toBe(true);
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('a persisted queued job (never started before the restart) re-enters start-or-queue instead of failing (finding 5)', async () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'verstaan-quest-run-store-'));
    const storePath = join(storeDir, 'quest-run-jobs.json');
    const tree = process.cwd();
    writeFileSync(
      storePath,
      JSON.stringify([
        {
          id: 'job-queued-1',
          kind: 'quest-run',
          tree,
          args: { issue: 63, model: 'sonnet', effort: 'high' },
          status: 'queued',
          exitCode: null,
          createdAt: 1,
          startedAt: null,
          endedAt: null,
          queuedReason: 'queued behind #whatever-was-running-before-the-restart',
          lines: [],
          sessionId: null,
          question: null,
        },
      ]),
    );
    try {
      const started: string[] = [];
      const finishesImmediately: QueryFn = (() => {
        started.push('started');
        async function* gen() {
          yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01 };
        }
        return gen();
      }) as unknown as QueryFn;
      const sdkRunnerFn: SdkRunnerFn = (params, callbacks) => runQuestSession(params, callbacks, finishesImmediately);
      const jobs = new JobManager(JOB_KINDS, sdkRunnerFn, storePath, TEST_RESUME_GRACE_MS);
      // A queued record has no session and no handoff race to avoid -- it starts immediately
      // (nothing else is running in its tree), not after the resume grace delay.
      await new Promise((r) => setImmediate(r));
      expect(started).toEqual(['started']);
      const job = jobs.get('job-queued-1')!;
      expect(job.status).toBe('done');
      expect(job.queuedReason).toBeNull();
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('a persisted queued job re-queues behind a running record restored in the same tree, instead of starting twice at once', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'verstaan-quest-run-store-'));
    const storePath = join(storeDir, 'quest-run-jobs.json');
    const tree = process.cwd();
    const runningRecord = {
      id: 'job-running-1',
      kind: 'quest-run',
      tree,
      args: { issue: 64, model: 'sonnet', effort: 'high' },
      status: 'running',
      exitCode: null,
      createdAt: 1,
      startedAt: 1,
      endedAt: null,
      queuedReason: null,
      lines: [],
      sessionId: 'sess-still-open',
      question: null,
    };
    const queuedRecord = {
      id: 'job-queued-2',
      kind: 'quest-run',
      tree,
      args: { issue: 65, model: 'sonnet', effort: 'high' },
      status: 'queued',
      exitCode: null,
      createdAt: 2,
      startedAt: null,
      endedAt: null,
      queuedReason: 'queued behind #job-running-1',
      lines: [],
      sessionId: null,
      question: null,
    };
    writeFileSync(storePath, JSON.stringify([runningRecord, queuedRecord]));
    try {
      // No sdkRunnerFn override needed: the running record's own resume never fires within this
      // synchronous test (it waits `restartResumeGraceMs`), so nothing here needs to stub `query`.
      const jobs = new JobManager(JOB_KINDS, undefined, storePath, 60_000);
      expect(jobs.get('job-queued-2')!.status).toBe('queued');
      expect(jobs.get('job-queued-2')!.queuedReason).toBe('queued behind #job-running-1');
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('a done quest-run job from a previous process is loaded but never resumed', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'verstaan-quest-run-store-'));
    const storePath = join(storeDir, 'quest-run-jobs.json');
    writeFileSync(
      storePath,
      JSON.stringify([
        {
          id: 'job-done-1',
          kind: 'quest-run',
          tree: process.cwd(),
          args: { issue: 62, model: 'sonnet', effort: 'high' },
          status: 'done',
          exitCode: 0,
          createdAt: 1,
          startedAt: 1,
          endedAt: 2,
          queuedReason: null,
          lines: [],
          sessionId: 'sess-finished',
          question: null,
        },
      ]),
    );
    try {
      const jobs = new JobManager(JOB_KINDS, undefined, storePath);
      expect(jobs.get('job-done-1')!.status).toBe('done');
      expect(jobs.list()).toHaveLength(1);
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });
});
