// SPDX-License-Identifier: MPL-2.0
// The job runner (issue 100): spawns the allow-listed command a kind resolves to, buffers its
// output as plain text lines, and lets any number of SSE subscribers replay-then-follow a job.
// Never builds a shell string: `spawn(cmd, args, { shell: false })` throughout, so a value that
// passed a kind's `validateArgs` can only ever land in one argv slot, never be reinterpreted by a
// shell. See docs/adr/ for the standing rule this encodes.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { JOB_KINDS, JobArgsError, type JobKindDef } from './kinds.js';
import { runQuestSession, KILLED_SENTINEL, type QuestSessionHandle, type SdkRunnerFn } from './sdk-runner.js';

// Checkpoint-4 review, finding 2: how long a rebuilt process waits before resuming a `quest-run`
// job it loaded with `status: 'running'`, rather than resuming the instant its own constructor
// runs. A restart's new process is forked, and its own `JobManager` constructed, well before the
// *old* process actually exits: `scripts/restart-launch.mjs` only reports success back to the old
// process once the new one has stayed listening for its own `POST_LISTEN_GRACE_MS` (1500ms), and
// only then does the old process's `scheduleExit` (restart.ts) run, itself bounded by
// `exitFallbackMs` (500ms). Resuming immediately risks two live `query({ resume: sessionId })`
// calls on the same session id at once -- this process and the one about to exit. Comfortably
// longer than that known worst case (2000ms) so a genuinely still-alive old process has exited by
// the time this fires; a plain, unconditional first-server-start crash-recovery case (no old
// process to race at all) simply waits this long once, which costs nothing but startup latency.
export const RESTART_RESUME_GRACE_MS = 3000;

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'killed';

export interface JobLine {
  stream: 'stdout' | 'stderr' | 'meta';
  text: string;
  ts: number;
}

/** Issue 178 (ADR 0016): the one open checkpoint a `quest-run` job may be sitting on. Written by
 * `canUseTool`'s own `AskUserQuestion` interception instead of letting the call block silently;
 * cleared the moment `JobManager.answerQuestion` resolves it. `input` is the tool's own raw
 * payload (question text, options, whatever the model sent) -- rendered by the Jobs room, never
 * interpreted here. */
export interface JobQuestion {
  toolUseId: string;
  toolName: 'AskUserQuestion';
  input: Record<string, unknown>;
  askedAt: number;
}

export interface Job {
  id: string;
  kind: string;
  tree: string;
  args: Record<string, unknown>;
  status: JobStatus;
  exitCode: number | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  queuedReason: string | null;
  lines: JobLine[];
  /** Issue 178: the Agent SDK session id for a `quest-run` job, null for every other kind and
   * null until the session's first message reports one. `restart-gate.ts`'s resume-on-start path
   * is the only other reader: any `quest-run` job with this set and no terminal status resumes by
   * id (`query({ resume: sessionId, ... })`) once the server comes back. */
  sessionId: string | null;
  /** Issue 178: the open checkpoint, or null when the session is not currently waiting on one. */
  question: JobQuestion | null;
}

type Subscriber = (line: JobLine) => void;
type EndSubscriber = () => void;

export class JobRejected extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** Resolves the `gh auth token` once per job that needs it (`mirror`, `mirror-check`), never
 * logged and never stored on the `Job` object. Throws with one clear line when `gh` cannot
 * produce a token, matching the "credentials from the environment only" rule -- this reads from
 * the `gh` CLI's own auth store, not a bare environment variable, because that is the only way
 * `tools/factory/mirror_github.py` is ever authenticated (its own docstring: "there is no other
 * way to authenticate this script"). */
function ghToken(): string {
  try {
    return execFileSync('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    throw new JobRejected(400, 'mirror: gh auth token failed; run `gh auth login` in a terminal first.');
  }
}

export class JobManager {
  private jobs = new Map<string, Job>();
  private order: string[] = [];
  private subscribers = new Map<string, Set<Subscriber>>();
  private endSubscribers = new Map<string, Set<EndSubscriber>>();
  private runningByTree = new Map<string, string>(); // tree -> job id
  private queueByTree = new Map<string, string[]>(); // tree -> queued job ids, in order
  private children = new Map<string, ChildProcess>();
  private kinds: Record<string, JobKindDef>;
  private sdkRunnerFn: SdkRunnerFn;
  // Issue 178: resolves the promise `startSdkSession`'s own `onQuestion` callback is blocked on,
  // keyed by job id -- `answerQuestion` (below) is the only caller. A job can hold at most one
  // open question at a time (the SDK session itself is a single-threaded turn loop), so one
  // resolver per job id is enough.
  private pendingAnswers = new Map<string, (answer: string) => void>();
  // Checkpoint-4 review, finding 1: the interrupt handle for a running `quest-run` job, parallel
  // to `children` above -- `kill()` is the only reader, `startSdkSession` the only writer.
  // Present only while the job's session is actually live; absent for every other kind, and
  // absent for a `quest-run` job still waiting out its own `RESTART_RESUME_GRACE_MS` delay.
  private questSessions = new Map<string, QuestSessionHandle>();
  // Checkpoint-4 review, finding 2: the pending "resume after the grace delay" timer for a
  // restored `quest-run` job, keyed by job id -- `kill()` clears this instead of interrupting a
  // session that has not actually opened yet.
  private pendingResumes = new Map<string, ReturnType<typeof setTimeout>>();
  // Issue 178: where `quest-run` jobs are written back to disk so a restart can find them again
  // (`persistQuestRunJobs`/`restoreQuestRunJobs`). Undefined by default -- every existing test and
  // caller that never passes one keeps the old, in-memory-only behaviour unchanged.
  private persistPath?: string;
  private restartResumeGraceMs: number;

  constructor(
    kinds: Record<string, JobKindDef> = JOB_KINDS,
    sdkRunnerFn: SdkRunnerFn = runQuestSession,
    persistPath?: string,
    restartResumeGraceMs: number = RESTART_RESUME_GRACE_MS,
  ) {
    this.kinds = kinds;
    this.sdkRunnerFn = sdkRunnerFn;
    this.persistPath = persistPath;
    this.restartResumeGraceMs = restartResumeGraceMs;
    if (persistPath && existsSync(persistPath)) {
      try {
        const records = JSON.parse(readFileSync(persistPath, 'utf8')) as Job[];
        if (Array.isArray(records)) this.restoreQuestRunJobs(records);
      } catch (e) {
        // Checkpoint-4 review, finding 6: a corrupt or unreadable persistence file must never
        // stop the server from starting, but it must not be silent either -- a swallowed parse
        // failure here orphans every job that was running, with no trace of why the Jobs room
        // suddenly shows nothing. Logged and then treated as "no persisted jobs" (the file is
        // overwritten on the next successful `persistQuestRunJobs()` call); a developer who sees
        // this line knows to look for a stale `quest-run-jobs.json.tmp` from an interrupted write.
        console.error(`quest-run: failed to read persisted jobs from ${persistPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  list(): Job[] {
    return this.order.map((id) => this.jobs.get(id)!).slice(-200);
  }

  allowedKinds(): string[] {
    return Object.keys(this.kinds).sort();
  }

  hasKind(kind: string): boolean {
    return kind in this.kinds;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** The one job running anywhere, across every tree, or null. `POST /api/restart` (issue 162)
   * refuses while this is non-null: restarting the server kills whatever it is running, and a
   * killed job leaves no exit code -- the reason belongs in the refusal, not silently dropped. */
  runningJob(): { id: string; tree: string; kind: string } | null {
    for (const [tree, id] of this.runningByTree) {
      const job = this.jobs.get(id);
      // Issue 178 (ADR 0016): `quest-run` is exempt from the "no job may run across a restart"
      // rule. A restart kills this process's own event loop, and with it the async `query()` loop
      // driving the session -- but the session itself lives as a transcript the SDK can `resume`
      // by id, not as a child process this process owns the way every other kind's is. Refusing a
      // restart because a quest-run job is "running" would protect nothing: there is no exit code
      // to lose the way a killed spawned process loses one (the restart route's own message, still
      // correct for every other kind, doesn't apply here).
      if (job && job.kind !== 'quest-run') return { id, tree, kind: job.kind };
    }
    return null;
  }

  /** Validates kind and args, resolves the tree, and either starts the job immediately or queues
   * it behind whatever else is running in the same tree. Throws `JobRejected` for anything the
   * route must answer 400 to (issue 100: "any other kind is 400 with the allowed kinds named"). */
  create(kind: string, treeAbsPath: string, rawArgs: unknown): Job {
    const def = this.kinds[kind];
    if (!def) throw new JobRejected(400, `unknown job kind '${kind}'. Allowed: ${Object.keys(this.kinds).sort().join(', ')}`);
    let args: Record<string, unknown>;
    try {
      args = def.validateArgs(rawArgs);
    } catch (e) {
      if (e instanceof JobArgsError) throw new JobRejected(400, `${kind}: ${e.message}`);
      throw e;
    }

    const id = randomUUID();
    const job: Job = {
      id,
      kind,
      tree: treeAbsPath,
      args,
      status: 'queued',
      exitCode: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      queuedReason: null,
      lines: [],
      sessionId: null,
      question: null,
    };
    this.jobs.set(id, job);
    this.order.push(id);

    const running = this.runningByTree.get(treeAbsPath);
    if (running) {
      const q = this.queueByTree.get(treeAbsPath) ?? [];
      q.push(id);
      this.queueByTree.set(treeAbsPath, q);
      job.queuedReason = `queued behind #${running}`;
      this.pushLine(job, 'meta', job.queuedReason);
      if (job.kind === 'quest-run') this.persistQuestRunJobs();
      return job;
    }
    this.start(job, def);
    if (job.kind === 'quest-run') this.persistQuestRunJobs();
    return job;
  }

  private start(job: Job, def: JobKindDef): void {
    this.runningByTree.set(job.tree, job.id);
    job.status = 'running';
    job.startedAt = Date.now();

    if (def.sdkSession) {
      this.startSdkSession(job);
      return;
    }

    if (def.precheck) {
      const reason = def.precheck(job.tree);
      if (reason) {
        this.finish(job, 1, reason);
        return;
      }
    }

    let spawnSpec;
    try {
      spawnSpec = def.build(job.tree, job.args);
    } catch (e) {
      this.finish(job, 1, e instanceof Error ? e.message : String(e));
      return;
    }

    let env: NodeJS.ProcessEnv = process.env;
    if (spawnSpec.needsGhToken) {
      try {
        env = { ...process.env, GH_TOKEN: ghToken() };
      } catch (e) {
        this.finish(job, 1, e instanceof Error ? e.message : String(e));
        return;
      }
    }

    const child = spawn(spawnSpec.cmd, spawnSpec.args, { cwd: spawnSpec.cwd, env, shell: false });
    this.children.set(job.id, child);
    if (spawnSpec.input != null) {
      child.stdin.write(spawnSpec.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.stdout.on('data', (chunk: Buffer) => this.onOutput(job, 'stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => this.onOutput(job, 'stderr', chunk));
    child.on('error', (err) => this.finish(job, 1, `spawn failed: ${err.message}`));
    child.on('close', (code, signal) => {
      this.children.delete(job.id);
      if (job.status === 'killed') return;
      this.finish(job, code ?? (signal ? 1 : 0), null);
    });
  }

  /** The second spawn site (issue 178, ADR 0016): opens an Agent SDK session instead of a
   * `child_process`. `job.sessionId`, when already set (a resume after a restart -- see
   * `restoreQuestRunJobs`), is passed through as `resume`; otherwise the session starts fresh and
   * the runner's own `onSessionId` callback writes the id back the first time the SDK reports one.
   * The promise this kicks off is never awaited by a caller -- like the spawned-process path
   * above, `start()` returns immediately and `finish()` is reached later, from this promise's own
   * `.then`/`.catch`, not from this call's stack. */
  private startSdkSession(job: Job): void {
    const issue = String(job.args.issue).padStart(2, '0');
    const model = String(job.args.model);
    const effort = String(job.args.effort);
    const resume = job.sessionId ?? undefined;
    this.pushLine(
      job,
      'meta',
      `quest-run: opening an Agent SDK session for /factory-run ${issue} (${model}/${effort})${resume ? ` — resuming ${resume}` : ''}`,
    );
    const handle = this.sdkRunnerFn(
      { prompt: `/factory-run ${issue}`, model, effort, cwd: job.tree, resume },
      {
        onLine: (stream, text) => this.pushLine(job, stream, text),
        onSessionId: (sessionId) => {
          job.sessionId = sessionId;
          this.persistQuestRunJobs();
        },
        onQuestion: (toolUseId, input) =>
          new Promise<string>((resolve) => {
            job.question = { toolUseId, toolName: 'AskUserQuestion', input, askedAt: Date.now() };
            this.pendingAnswers.set(job.id, resolve);
            this.persistQuestRunJobs();
          }),
      },
    );
    // Checkpoint-4 review, finding 1: held so `kill()` has something to act on for exactly as
    // long as the session is actually open -- cleared the moment `done` settles, whether that is
    // a real completion, an error, or `kill()`'s own call to `interrupt()`.
    this.questSessions.set(job.id, handle);
    handle.done.then(
      (exitCode) => {
        this.questSessions.delete(job.id);
        // A kill already marked this job terminal (`endedAt` set) and released its tree slot; the
        // spawned-process path above guards the same race the same way (`if (job.status ===
        // 'killed') return;` in its own `child.on('close')`) -- `finish()`'s own re-entry guard
        // (`if (job.endedAt) return;`) makes this call a safe no-op either way, but skipping it
        // here avoids logging a second, misleading exit line after "killed (session interrupted)".
        if (job.status === 'killed') return;
        this.finish(job, exitCode, null);
      },
      (err) => {
        this.questSessions.delete(job.id);
        if (job.status === 'killed') return;
        this.finish(job, 1, err instanceof Error ? err.message : String(err));
      },
    );
  }

  /** Posts the owner's answer to the open question on `id`'s job, resolving the promise
   * `startSdkSession`'s `onQuestion` callback is blocked on (issue 178 acceptance: "submitting it
   * posts to the job and resolves the held promise"). False when the job is unknown or carries no
   * open question -- the route answers 404 either way, never 500. */
  answerQuestion(id: string, answer: string): boolean {
    const job = this.jobs.get(id);
    if (!job || !job.question) return false;
    const resolve = this.pendingAnswers.get(id);
    if (!resolve) return false;
    this.pendingAnswers.delete(id);
    job.question = null;
    this.pushLine(job, 'meta', `answered: ${answer}`);
    this.persistQuestRunJobs();
    resolve(answer);
    return true;
  }

  /** Issue 178 acceptance: "on server start, any `quest-run` job with a `sessionId` and no
   * terminal status resumes via `query({ resume: sessionId, ... })`". `records` are whatever the
   * last `persistQuestRunJobs()` call before the previous process exited wrote out -- every field
   * `Job` carries, restored verbatim, so the Jobs room shows this run's own history across the
   * restart, not just a fresh, empty entry.
   *
   * A `'running'` record with no `sessionId` never got far enough to be resumable (the old
   * process died before the SDK ever reported one); it is marked failed instead of resumed, so it
   * stops silently claiming to be running forever. A `'running'` record *with* a `sessionId`
   * resumes only after `restartResumeGraceMs` (checkpoint-4 review, finding 2): this constructor
   * runs the instant a restart's new process is forked, long before the *old* process (still
   * holding the same session open) has actually exited -- resuming immediately would open two
   * live `query({ resume: sessionId })` calls on the same id at once.
   *
   * A `'queued'` record never held a session and has no such race to avoid at all (checkpoint-4
   * review, finding 5): it needs (re-)starting, not resuming, so it re-enters the same
   * start-or-queue-behind-whatever-is-running decision `create()` makes for a brand new job,
   * handled in a second pass below once every `'running'` record has claimed its own tree.
   *
   * Any open question on a resumed job is cleared first: the answer channel it was waiting on
   * died with the old process, and if the model still needs one, `canUseTool` asks again once the
   * session resumes. */
  restoreQuestRunJobs(records: Job[]): void {
    const queuedJobs: Job[] = [];
    for (const job of records) {
      this.jobs.set(job.id, job);
      this.order.push(job.id);
      if (job.status === 'queued') {
        queuedJobs.push(job);
        continue;
      }
      if (job.status !== 'running') continue; // a terminal record: kept for the Jobs room's own history, nothing to do.
      job.question = null;
      if (!job.sessionId) {
        this.finish(job, 1, 'quest-run: the server restarted before this session reported an id; it cannot be resumed');
        continue;
      }
      this.runningByTree.set(job.tree, job.id);
      const timer = setTimeout(() => {
        this.pendingResumes.delete(job.id);
        if (job.status === 'running') this.startSdkSession(job);
      }, this.restartResumeGraceMs);
      this.pendingResumes.set(job.id, timer);
    }
    for (const job of queuedJobs) {
      const def = this.kinds[job.kind];
      if (!def) {
        this.finish(job, 1, `quest-run: kind '${job.kind}' is no longer in the allow-list after this restart`);
        continue;
      }
      const running = this.runningByTree.get(job.tree);
      if (running) {
        const q = this.queueByTree.get(job.tree) ?? [];
        q.push(job.id);
        this.queueByTree.set(job.tree, q);
        job.queuedReason = `queued behind #${running}`;
      } else {
        // Clears whatever `queuedReason` the old process last wrote (it may have named a job that
        // no longer exists in this process's own memory at all) before starting for real, the
        // same way a freshly created, never-queued job's `queuedReason` is null from `create()`.
        job.queuedReason = null;
        this.start(job, def);
      }
    }
  }

  /** Writes every `quest-run` job this process knows about to `persistPath`, verbatim, so a
   * restart (`restart-gate.ts`/`restart.ts`) has something to read back (`restoreQuestRunJobs`,
   * above). A no-op when no `persistPath` was given to the constructor -- every existing test and
   * every non-`quest-run` kind is unaffected; this never touches disk for them. */
  private persistQuestRunJobs(): void {
    if (!this.persistPath) return;
    const records = this.order.map((id) => this.jobs.get(id)!).filter((j) => j.kind === 'quest-run');
    // Checkpoint-4 review, finding 6: write to a sibling temp file and `renameSync` it into place
    // -- atomic on the same filesystem (POSIX and Windows both guarantee `rename` either lands the
    // whole new file or leaves the old one untouched, never a half-written mix of both). A plain
    // `writeFileSync` straight over the live path left a crash mid-write as truncated JSON, which
    // the constructor's own parse then silently swallowed, orphaning every running session with
    // no trace.
    const tmpPath = `${this.persistPath}.tmp`;
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      writeFileSync(tmpPath, JSON.stringify(records));
      renameSync(tmpPath, this.persistPath);
    } catch (e) {
      // Best-effort beyond this point: a write failure here (a full disk, a missing directory)
      // must never crash a running session over a persistence concern; the in-memory job
      // continues exactly as it would have before this quest existed. The next successful
      // mutation retries the write. Logged, not swallowed (finding 6's other half): silent here
      // would mean a session nobody can resume after the next restart, with nothing in the log to
      // say why.
      console.error(`quest-run: failed to persist jobs to ${this.persistPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private onOutput(job: Job, stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const text = chunk.toString('utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      if (rawLine.length === 0) continue;
      this.pushLine(job, stream, rawLine);
    }
  }

  private pushLine(job: Job, stream: JobLine['stream'], text: string): void {
    const line: JobLine = { stream, text, ts: Date.now() };
    job.lines.push(line);
    for (const sub of this.subscribers.get(job.id) ?? []) sub(line);
  }

  private finish(job: Job, exitCode: number, reason: string | null): void {
    // Re-entry guard: a spawn failure fires both the child's `error` event (which calls
    // `finish` with a useful reason) and then its `close` event for the same failure (which
    // would otherwise call `finish` again with a raw errno as the exit code, overwriting the
    // reason and sending a live SSE subscriber a second `exit` frame after the stream already
    // ended). `endedAt` is set once, at the bottom of this function, so a second call sees it
    // already set and returns without touching anything.
    if (job.endedAt) return;
    if (reason) this.pushLine(job, 'meta', reason);
    job.exitCode = exitCode;
    job.status = exitCode === 0 ? 'done' : 'failed';
    job.endedAt = Date.now();
    if (job.kind === 'quest-run') this.persistQuestRunJobs();
    for (const end of this.endSubscribers.get(job.id) ?? []) end();
    if (this.runningByTree.get(job.tree) === job.id) {
      this.runningByTree.delete(job.tree);
      const q = this.queueByTree.get(job.tree) ?? [];
      const nextId = q.shift();
      if (nextId) {
        const next = this.jobs.get(nextId);
        const def = next ? this.kinds[next.kind] : undefined;
        if (next && def) {
          next.queuedReason = null;
          this.start(next, def);
        }
      }
    }
  }

  /** Marks `job` killed and releases its tree slot, starting whatever was queued behind it, if
   * anything. The one piece every `kill()` branch below shares once it has decided a job really
   * is being killed right now (queued removal is its own, simpler case, handled inline instead). */
  private releaseTreeAndAdvance(job: Job): void {
    for (const end of this.endSubscribers.get(job.id) ?? []) end();
    if (this.runningByTree.get(job.tree) === job.id) {
      this.runningByTree.delete(job.tree);
      const q = this.queueByTree.get(job.tree) ?? [];
      const nextId = q.shift();
      if (nextId) {
        const next = this.jobs.get(nextId);
        const def = next ? this.kinds[next.kind] : undefined;
        if (next && def) {
          next.queuedReason = null;
          this.start(next, def);
        }
      }
    }
  }

  /** SIGTERM on a running job (or `interrupt()` for a `quest-run` job's own session, checkpoint-4
   * review finding 1); queued jobs are simply dropped from their queue. Returns false when the
   * job is unknown or already finished. */
  kill(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'queued') {
      const q = this.queueByTree.get(job.tree);
      if (q) {
        const idx = q.indexOf(id);
        if (idx !== -1) q.splice(idx, 1);
      }
      job.status = 'killed';
      job.endedAt = Date.now();
      this.pushLine(job, 'meta', 'cancelled while queued');
      for (const end of this.endSubscribers.get(job.id) ?? []) end();
      if (job.kind === 'quest-run') this.persistQuestRunJobs();
      return true;
    }
    if (job.kind === 'quest-run') {
      // Checkpoint-4 review, finding 1: before this fix, a running `quest-run` job had neither an
      // entry in `children` (no child process exists) nor one here, so `kill()` fell straight
      // through to the spawned-process branch below, found nothing, and returned false -- the
      // session kept running and spending, and `runningByTree` stayed pointed at this job's tree
      // forever (only a restart, which then still has to resume this same session, ever cleared
      // it).
      const pendingResumeTimer = this.pendingResumes.get(id);
      if (pendingResumeTimer) {
        // Still waiting out `RESTART_RESUME_GRACE_MS`: no session has actually opened yet, so
        // there is nothing to `interrupt()` -- just cancel the timer before it fires.
        clearTimeout(pendingResumeTimer);
        this.pendingResumes.delete(id);
      }
      const session = this.questSessions.get(id);
      if (!pendingResumeTimer && !session) return false; // not actually running (already finished, or never started)
      const pendingAnswer = this.pendingAnswers.get(id);
      if (pendingAnswer) {
        // Finding 1's own follow-on: an open question's promise must not be left hanging just
        // because the job was killed out from under it -- `canUseTool`'s own `await` needs to
        // settle one way or another for the `for await` loop (and so `done`) to ever resolve.
        this.pendingAnswers.delete(id);
        job.question = null;
        pendingAnswer(KILLED_SENTINEL);
      }
      job.status = 'killed';
      job.endedAt = Date.now();
      job.exitCode = null;
      this.pushLine(job, 'meta', 'killed (session interrupted)');
      this.persistQuestRunJobs();
      if (session) {
        this.questSessions.delete(id);
        void session.interrupt();
      }
      this.releaseTreeAndAdvance(job);
      return true;
    }
    const child = this.children.get(id);
    if (!child) return false;
    job.status = 'killed';
    job.endedAt = Date.now();
    job.exitCode = null;
    this.pushLine(job, 'meta', 'killed (SIGTERM)');
    child.kill('SIGTERM');
    this.releaseTreeAndAdvance(job);
    return true;
  }

  subscribe(id: string, onLine: Subscriber, onEnd: EndSubscriber): () => void {
    if (!this.subscribers.has(id)) this.subscribers.set(id, new Set());
    if (!this.endSubscribers.has(id)) this.endSubscribers.set(id, new Set());
    this.subscribers.get(id)!.add(onLine);
    this.endSubscribers.get(id)!.add(onEnd);
    return () => {
      this.subscribers.get(id)?.delete(onLine);
      this.endSubscribers.get(id)?.delete(onEnd);
    };
  }
}
