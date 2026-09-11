// SPDX-License-Identifier: MPL-2.0
// The job runner (issue 100): spawns the allow-listed command a kind resolves to, buffers its
// output as plain text lines, and lets any number of SSE subscribers replay-then-follow a job.
// Never builds a shell string: `spawn(cmd, args, { shell: false })` throughout, so a value that
// passed a kind's `validateArgs` can only ever land in one argv slot, never be reinterpreted by a
// shell. See docs/adr/ for the standing rule this encodes.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { JOB_KINDS, JobArgsError, type JobKindDef } from './kinds.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'killed';

export interface JobLine {
  stream: 'stdout' | 'stderr' | 'meta';
  text: string;
  ts: number;
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

  constructor(kinds: Record<string, JobKindDef> = JOB_KINDS) {
    this.kinds = kinds;
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
      return job;
    }
    this.start(job, def);
    return job;
  }

  private start(job: Job, def: JobKindDef): void {
    this.runningByTree.set(job.tree, job.id);
    job.status = 'running';
    job.startedAt = Date.now();

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

  /** SIGTERM on a running job; queued jobs are simply dropped from their queue. Returns false
   * when the job is unknown or already finished. */
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
      return true;
    }
    const child = this.children.get(id);
    if (!child) return false;
    job.status = 'killed';
    job.endedAt = Date.now();
    job.exitCode = null;
    this.pushLine(job, 'meta', 'killed (SIGTERM)');
    child.kill('SIGTERM');
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
