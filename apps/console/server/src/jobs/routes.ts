// SPDX-License-Identifier: MPL-2.0
// Wires the job runner and the openers onto a Fastify app. Every route here is the only door
// into `JobManager`; nothing else in the server ever spawns a process on the client's behalf.
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { JobManager, JobRejected } from './runner.js';
import { namesConsole } from './kinds.js';
import { resolveOpenUrl, repoSlug, OpenError, type OpenRequest } from './open.js';

export interface RouteDeps {
  jobs: JobManager;
  repoRoot: string;
  port: number;
  /** Absolute paths of every known worktree, root included. A `tree` a request names must
   * resolve into this list; nothing else is a legal target (safety: "the allow-list is the only
   * way to run anything" covers the tree as much as the kind). */
  treeRoots: () => string[];
}

/** True when the request's own `Host` header names this server's own loopback address (issue
 * 100 ADR 0011, "Not resolved" follow-up): binding to 127.0.0.1 keeps a remote attacker out, but
 * not a same-machine page on another origin that DNS-rebinds to 127.0.0.1 and POSTs here with no
 * CORS preflight (a state-changing `POST`/`DELETE` with a `content-type: application/json` body
 * is a "simple request" by the fetch spec, so the browser never asks this server first). A CORS
 * header would only ever stop a browser that already sent the request -- the job would already be
 * running. Checking `Host` against the port this server itself is bound to rejects the request
 * before anything else happens, the same way a CSRF-token check would, without needing one. */
function isLoopbackHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.split(':')[0];
  return (host === '127.0.0.1' || host === 'localhost') && hostHeader === `${host}:${port}`;
}

function resolveTree(relOrAbs: string | undefined, roots: string[], repoRoot: string): string {
  const candidate = relOrAbs ? resolve(repoRoot, relOrAbs) : repoRoot;
  const match = roots.find((r) => r === candidate);
  if (!match) throw new JobRejected(400, `tree '${relOrAbs}' is not a known worktree`);
  return match;
}

function jobJson(job: import('./runner.js').Job) {
  return {
    id: job.id,
    kind: job.kind,
    tree: job.tree,
    args: job.args,
    status: job.status,
    exitCode: job.exitCode,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    durationMs: job.startedAt ? (job.endedAt ?? Date.now()) - job.startedAt : null,
    queuedReason: job.queuedReason,
  };
}

export function registerJobRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { jobs, repoRoot, port } = deps;

  app.post('/api/jobs', async (req, reply) => {
    if (!isLoopbackHost(req.headers.host, port)) {
      return reply.code(400).send({ error: 'refused: Host header does not name this server' });
    }
    const body = (req.body ?? {}) as { kind?: string; tree?: string; args?: unknown };
    const kind = body.kind;
    if (!kind || !jobs.hasKind(kind)) {
      return reply.code(400).send({ error: `unknown job kind '${kind}'. Allowed: ${jobs.allowedKinds().join(', ')}` });
    }
    // service stop naming the console is refused before anything else runs, whatever else the
    // body carries (issue 100 acceptance criterion, tested literally).
    if (kind === 'service-stop' || kind === 'service-start') {
      const name = (body.args as { name?: unknown } | undefined)?.name;
      if (typeof name === 'string' && namesConsole(name, port)) {
        return reply.code(400).send({
          error: `${kind}: refused. The console cannot stop itself; use console.sh in a terminal, or wait for the next SessionStart.`,
        });
      }
    }
    let treeAbs: string;
    try {
      treeAbs = resolveTree(body.tree, deps.treeRoots(), repoRoot);
    } catch (e) {
      if (e instanceof JobRejected) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
    try {
      const job = jobs.create(kind, treeAbs, body.args);
      return reply.code(201).send({ id: job.id });
    } catch (e) {
      if (e instanceof JobRejected) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  app.get('/api/jobs', async (_req, reply) => {
    reply.type('application/json').send(jobs.list().map(jobJson));
  });

  app.get('/api/jobs/:id', async (req, reply) => {
    const job = jobs.get((req.params as { id: string }).id);
    if (!job) return reply.code(404).send({ error: 'job not found' });
    reply.type('application/json').send(jobJson(job));
  });

  app.delete('/api/jobs/:id', async (req, reply) => {
    if (!isLoopbackHost(req.headers.host, port)) {
      return reply.code(400).send({ error: 'refused: Host header does not name this server' });
    }
    const ok = jobs.kill((req.params as { id: string }).id);
    if (!ok) return reply.code(404).send({ error: 'job not found or already finished' });
    reply.code(204).send();
  });

  // SSE: stdout/stderr lines as they arrive, an initial replay of everything already buffered, a
  // final `exit` event with the code. Lines travel as JSON inside `data:`, never as raw HTML, so
  // a line containing `<script>` reaches the client as the literal seven characters of text
  // inside a JSON string -- there is no point in this pipe where it could be parsed as markup.
  app.get('/api/jobs/:id/stream', { compress: false }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const job = jobs.get(id);
    if (!job) return reply.code(404).send({ error: 'job not found' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    reply.raw.write(': connected\n\n');

    for (const line of job.lines) {
      reply.raw.write(`event: line\ndata: ${JSON.stringify(line)}\n\n`);
    }
    if (job.status === 'done' || job.status === 'failed' || job.status === 'killed') {
      reply.raw.write(`event: exit\ndata: ${JSON.stringify({ status: job.status, exitCode: job.exitCode })}\n\n`);
      reply.raw.end();
      return;
    }

    const unsubscribe = jobs.subscribe(
      id,
      (line) => reply.raw.write(`event: line\ndata: ${JSON.stringify(line)}\n\n`),
      () => {
        const finished = jobs.get(id);
        reply.raw.write(`event: exit\ndata: ${JSON.stringify({ status: finished?.status, exitCode: finished?.exitCode ?? null })}\n\n`);
        reply.raw.end();
      },
    );
    req.raw.on('close', unsubscribe);
  });

  app.get('/api/open', async (req, reply) => {
    const q = req.query as OpenRequest;
    try {
      const url = resolveOpenUrl(q, { slug: repoSlug(repoRoot), treeRoots: deps.treeRoots(), repoRoot });
      reply.type('application/json').send({ url });
    } catch (e) {
      if (e instanceof OpenError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });
}
