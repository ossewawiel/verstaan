// SPDX-License-Identifier: MPL-2.0
// apps/console/server: a Fastify server with a read-only JSON API over this repository's own
// state, and a change stream over SSE. Nothing here writes to the repo (issue 99); the write
// layer is quest 100. Binds to 127.0.0.1 only.
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import { REPO, readRepo, resolveRootPath, readWorktrees } from './model/read.js';
import { buildModel } from './model/parse.js';
import { render, titleOf, splitFrontmatter } from './model/markdown.js';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
export const PORT = (portFlag !== -1 ? Number(args[portFlag + 1]) : NaN) || Number(process.env.VERSTAAN_CONSOLE_PORT) || 7864;
export const HOST = '127.0.0.1';

/** Trailing-edge debounce, ported from tools/console/src/serve.mjs: a call resets the `ms`
 * timer; `maxMs` bounds how long a continuous stream of calls can push it back. The last
 * section named before the timer fires is the one `fn` receives, so a burst that touches only
 * the issues directory still names `issues`, not a generic `state`. */
export function debounce(fn: (section: string) => void, ms: number, maxMs = Infinity): (section: string) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  let first: number | null = null;
  let lastSection = 'state';
  return (section: string) => {
    lastSection = section;
    const now = Date.now();
    if (first == null) first = now;
    if (t) clearTimeout(t);
    const wait = Math.min(ms, Math.max(0, maxMs - (now - first)));
    t = setTimeout(() => {
      t = null;
      first = null;
      fn(lastSection);
    }, wait);
  };
}

/** Each watched path is paired with the API section it invalidates, so `/events` can name what
 * changed (issue 99: "sends `state` with the changed section named"). */
export function watchPaths(root: string, worktrees: { path: string }[], commonDir: string | null): { path: string; section: string }[] {
  const set = new Map<string, string>();
  const add = (p: string | null | undefined, section: string) => {
    if (p && existsSync(p)) set.set(p, section);
  };
  add(join(root, 'docs', 'factory', 'issues'), 'issues');
  add(join(root, 'docs', 'factory'), 'state');
  add(join(root, 'docs'), 'docs');
  add(join(root, '.claude', 'agents'), 'party');
  for (const w of worktrees) add(join(resolve(root, w.path), 'docs', 'factory', 'issues'), 'issues');
  if (commonDir) {
    add(commonDir, 'git');
    add(join(commonDir, 'refs'), 'git');
    add(join(commonDir, 'worktrees'), 'worktrees');
  }
  return [...set].map(([path, section]) => ({ path, section }));
}

export function watchDirectory(p: string, onChange: (section: string) => void, section: string, watchers: FSWatcher[]): FSWatcher | null {
  let w: FSWatcher | null = null;
  const drop = () => {
    try {
      w?.close();
    } catch {
      /* already closed */
    }
    const idx = w ? watchers.indexOf(w) : -1;
    if (idx !== -1) watchers.splice(idx, 1);
  };
  try {
    w = watch(p, { persistent: true }, () => {
      if (!existsSync(p)) {
        drop();
        onChange(section);
        return;
      }
      onChange(section);
    });
    w.on('error', () => {
      drop();
      onChange(section);
    });
    watchers.push(w);
  } catch {
    /* a path that cannot be watched at all is skipped */
  }
  return w;
}

type Client = { write: (chunk: string) => void };

export function buildApp({ readRepoFn = readRepo }: { readRepoFn?: typeof readRepo } = {}) {
  const app = Fastify({ logger: false });
  // gzip/brotli the built client and the JSON API (issue 99: cold load under 250 KB
  // transferred). SSE is excluded: compressing a stream that must flush per-event would buffer
  // it instead.
  app.register(fastifyCompress, { global: true, encodings: ['br', 'gzip', 'deflate'] });
  const clients = new Set<Client>();

  type Cache = { repo: ReturnType<typeof readRepo>; model: ReturnType<typeof buildModel>; allDocs: { path: string; content: string }[] };
  let cache: Cache | null = null;
  const getModel = (): Cache => {
    if (cache) return cache;
    const repo = readRepoFn();
    const model = buildModel(repo);
    const allDocs = repo.library.flatMap((g) => g.docs);
    const fresh: Cache = { repo, model, allDocs };
    cache = fresh;
    return fresh;
  };
  const invalidate = () => {
    cache = null;
  };

  const broadcast = debounce((section: string) => {
    for (const res of clients) res.write(`event: state\ndata: {"section":"${section}"}\n\n`);
  }, 800, 2000);
  const onChange = (section: string) => {
    invalidate();
    broadcast(section);
  };

  app.get('/health', async (_req, reply) => {
    reply.type('text/plain').send(`ok ${process.pid}`);
  });

  app.get('/api/state', async (_req, reply) => {
    const { model } = getModel();
    reply.type('application/json').send(model);
  });

  app.get('/api/issues', async (_req, reply) => {
    const { model } = getModel();
    reply.type('application/json').send(model.issues);
  });

  app.get('/api/issues/:nn', async (req, reply) => {
    const { model } = getModel();
    const n = Number((req.params as { nn: string }).nn);
    const issue = model.issues.find((i) => i.n === n);
    if (!issue) return reply.code(404).send({ error: 'issue not found' });
    const { repo } = getModel();
    const file = repo.issueFiles.find((f) => f.name === issue.file);
    reply.type('application/json').send({ ...issue, content: file?.content ?? '' });
  });

  app.get('/api/docs/*', async (req, reply) => {
    const path = (req.params as { '*': string })['*'];
    const { allDocs } = getModel();
    const doc = allDocs.find((d) => d.path === path);
    if (!doc) return reply.code(404).send({ error: 'document not found' });
    const { body } = splitFrontmatter(doc.content);
    const { html, headings } = render(body, {});
    reply.type('application/json').send({ path: doc.path, title: titleOf(doc.content, doc.path), html, headings });
  });

  app.get('/api/library', async (_req, reply) => {
    const { repo } = getModel();
    reply.type('application/json').send(
      repo.library.map((g) => ({ group: g.group, blurb: g.blurb, docs: g.docs.map((d) => d.path) })),
    );
  });

  app.get('/api/worktrees', async (_req, reply) => {
    const { model } = getModel();
    reply.type('application/json').send(model.worktrees);
  });

  app.get('/api/ledger', async (_req, reply) => {
    const { model } = getModel();
    reply.type('application/json').send({ lessons: model.lessons, reviews: model.reviews });
  });

  app.get('/events', { compress: false }, async (req, reply) => {
    // Tell Fastify to leave the raw response alone: without this, Fastify considers the request
    // finished once this async handler returns (there is no `reply.send()`) and ends the
    // response itself a moment later, closing the SSE stream right after the first comment.
    // `compress: false` matters more than hijack does here: a browser's real `Accept-Encoding:
    // gzip` (curl sends none by default, which is why a curl-only check missed this) made
    // @fastify/compress's global hook gzip this hijacked stream, and a gzip stream buffers until
    // enough data accumulates to flush a block — the event never arrived in time to matter.
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    reply.raw.write(': connected\n\n');
    const client: Client = { write: (chunk: string) => reply.raw.write(chunk) };
    clients.add(client);
    req.raw.on('close', () => clients.delete(client));
  });

  return { app, getModel, invalidate, broadcast, onChange, clients };
}

function startWatching(onChange: (section: string) => void) {
  const root = resolveRootPath();
  const commonDir = (() => {
    try {
      const out = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: root }).toString().trim();
      return out || null;
    } catch {
      return null;
    }
  })();
  const paths = watchPaths(root, readWorktrees(), commonDir);
  const watchers: FSWatcher[] = [];
  for (const { path, section } of paths) watchDirectory(path, onChange, section, watchers);
  setInterval(() => {
    for (let i = paths.length - 1; i >= 0; i--) {
      if (!existsSync(paths[i].path)) paths.splice(i, 1);
    }
    for (const w of readWorktrees()) {
      const dir = join(resolve(root, w.path), 'docs', 'factory', 'issues');
      if (existsSync(dir) && !paths.some((x) => x.path === dir)) {
        paths.push({ path: dir, section: 'issues' });
        watchDirectory(dir, onChange, 'issues', watchers);
      }
    }
  }, 30000).unref();
  return paths;
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const { app, onChange } = buildApp();

  // Serve the built client, if it exists (npm run build). Old room URLs from the file console
  // redirect to the new app's routes (issue 99 "Done when"). Resolved from process.cwd(), the
  // same reasoning as REPO in model/read.ts: every launcher runs this server from apps/console.
  const appDir = process.cwd();
  const distDir = resolve(appDir, 'dist');
  const REDIRECTS: Record<string, string> = {
    '/index.html': '/',
    '/quests.html': '/quests',
    '/playbook.html': '/playbook',
    '/library.html': '/library',
    '/glossary.html': '/glossary',
  };
  app.addHook('onRequest', async (req, reply) => {
    const redirect = REDIRECTS[req.url];
    if (redirect) {
      reply.redirect(redirect, 301);
    }
  });

  if (existsSync(distDir)) {
    app.register(fastifyStatic, { root: distDir, wildcard: false });
    // SPA fallback: any GET that isn't /api, /events or a static file falls back to index.html so
    // React Router's own paths (/quests/07, /library/docs/...) resolve on a hard refresh.
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/events')) {
        return reply.code(404).send({ error: 'not found' });
      }
      reply.type('text/html').send(readFileSync(join(distDir, 'index.html'), 'utf8'));
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      reply.code(404).type('text/plain').send('console: apps/console/dist is missing. Run `npm run build` in apps/console.');
    });
  }

  app.listen({ port: PORT, host: HOST }, (err) => {
    if (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.log(`console: already running on http://${HOST}:${PORT}`);
        process.exit(0);
      }
      console.error(`console: ${err.message}`);
      process.exit(1);
    }
    const paths = startWatching(onChange);
    console.log(`console: serving http://${HOST}:${PORT} from ${REPO}`);
    console.log(`console: watching ${paths.length} paths; change stream on /events`);
  });
}
