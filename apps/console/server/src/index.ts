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
import { REPO, readRepo, resolveRootPath, readWorktrees, msSinceLastGitCommand, isCommitOnMain, mainAncestorShas } from './model/read.js';
import { buildModel, buildShipSystems, lastEvents, buildCodex, debriefGroups, parseGlossaryTerms } from './model/parse.js';
import { render, titleOf, splitFrontmatter } from './model/markdown.js';
import { parseMapYaml, buildAtlas } from './model/atlas.js';
import { JobManager } from './jobs/runner.js';
import { registerJobRoutes } from './jobs/routes.js';
import { registerRestartRoute } from './restart.js';
import { RestartGate } from './restart-gate.js';
import { isGithubReachable, ghAuthToken, openPullRequestGateStates } from './github.js';

// Test-only seam (e2e/atlas-offline.spec.ts): forces the atlas's GitHub read to read as
// unreachable, the same shape a missing `gh` login or a dead network produces, so a Playwright
// run can prove the offline behaviour ADR 0014 asks for without depending on this machine's own
// `gh` login state (issue 177). Unset in every other path, including console.cmd and the gate.
const FORCE_GITHUB_UNREACHABLE = process.env.VERSTAAN_CONSOLE_FORCE_GITHUB_UNREACHABLE === '1';

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
/** Node's `fs.watch` `recursive` option only works on Windows and macOS; on Linux (and IBM i) it
 * throws `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`. Watched recursively where supported, the `docs`
 * section catches a change to a doc nested below the top level, such as
 * `docs/standards/voice.md`; elsewhere it falls back to a top-level-only watch, same as before. */
export const RECURSIVE_WATCH_SUPPORTED = process.platform === 'win32' || process.platform === 'darwin';

export function watchPaths(
  root: string,
  worktrees: { path: string }[],
  commonDir: string | null,
): { path: string; section: string; recursive?: boolean }[] {
  const set = new Map<string, { section: string; recursive?: boolean }>();
  const add = (p: string | null | undefined, section: string, recursive?: boolean) => {
    if (p && existsSync(p)) set.set(p, { section, recursive });
  };
  add(join(root, 'docs', 'factory', 'issues'), 'issues');
  add(join(root, 'docs', 'factory'), 'state');
  add(join(root, 'docs'), 'docs', true);
  add(join(root, '.claude', 'agents'), 'party');
  // Ship systems (issue 175): the three remaining folders the room reads, plus settings.json's
  // own file (not a directory, so it needs its own `add()`, same as `commonDir` below). All four
  // share one section name -- a change to any of them invalidates the same query client-side
  // (SECTION_KEYS's `ship-systems` entry).
  add(join(root, '.claude', 'skills'), 'ship-systems', true);
  add(join(root, '.claude', 'commands'), 'ship-systems');
  add(join(root, '.claude', 'hooks'), 'ship-systems');
  add(join(root, '.claude', 'settings.json'), 'ship-systems');
  // The directory that *contains* every worktree, not any one tree's own files. `/factory-run`
  // creates `.worktrees/side-NN-<slug>` mid-run; a change here is the earliest local signal that
  // a new tree exists, well before that tree's own `docs/factory/issues` has anything watchable
  // in it. Labelled `issues`, not `worktrees`: the `.git/worktrees` admin dir (below) carries the
  // `worktrees` section, and `shouldIgnoreGitEcho` suppresses that section for a short window
  // after this process's own `git worktree` calls. A new tree appearing is never such an echo —
  // this process never runs `git worktree add` itself — so it must never be dropped, and giving
  // it a distinct section is simpler than teaching the echo filter a carve-out.
  add(join(root, '.worktrees'), 'issues');
  for (const w of worktrees) add(join(resolve(root, w.path), 'docs', 'factory', 'issues'), 'issues');
  if (commonDir) {
    add(commonDir, 'git');
    add(join(commonDir, 'refs'), 'git');
    add(join(commonDir, 'worktrees'), 'worktrees');
  }
  return [...set].map(([path, { section, recursive }]) => ({ path, section, recursive }));
}

/** How long after this process's own `git` command a `git`/`worktrees`-section watch event is
 * treated as an echo of that command, not a real external change (see `msSinceLastGitCommand`
 * in model/read.ts). Comfortably longer than a `readRepo()` pass across a handful of worktrees,
 * short enough that a branch switch or commit made in a terminal a couple of seconds later still
 * wakes the console promptly. */
export const GIT_ECHO_QUIET_MS = 1500;

/** True when a watch event on the `git` or `worktrees` section is plausibly just this process
 * hearing its own `git status`/`git worktree list` calls (issue: self-feeding change stream).
 * Sections driven by file writes made outside this process (`issues`, `docs`, `state`, `party`)
 * are never ignored. */
export function shouldIgnoreGitEcho(section: string, msSinceGitCommand: number, quietMs = GIT_ECHO_QUIET_MS): boolean {
  return (section === 'git' || section === 'worktrees') && msSinceGitCommand < quietMs;
}

export function watchDirectory(
  p: string,
  onChange: (section: string) => void,
  section: string,
  watchers: FSWatcher[],
  recursive?: boolean,
): FSWatcher | null {
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
    w = watch(p, { persistent: true, recursive: !!recursive && RECURSIVE_WATCH_SUPPORTED }, () => {
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

export function buildApp({
  readRepoFn = readRepo,
  appDir = process.cwd(),
  githubReachableFn = FORCE_GITHUB_UNREACHABLE ? async () => false : isGithubReachable,
  mainAncestorShasFn = mainAncestorShas,
  ghAuthTokenFn = ghAuthToken,
  openPullRequestGateStatesFn = openPullRequestGateStates,
}: {
  readRepoFn?: typeof readRepo;
  appDir?: string;
  githubReachableFn?: typeof isGithubReachable;
  mainAncestorShasFn?: typeof mainAncestorShas;
  ghAuthTokenFn?: typeof ghAuthToken;
  openPullRequestGateStatesFn?: typeof openPullRequestGateStates;
} = {}) {
  const app = Fastify({ logger: false });
  // gzip/brotli the built client and the JSON API (issue 99: cold load under 250 KB
  // transferred). SSE is excluded: compressing a stream that must flush per-event would buffer
  // it instead.
  app.register(fastifyCompress, { global: true, encodings: ['br', 'gzip', 'deflate'] });
  const clients = new Set<Client>();

  type Cache = {
    repo: ReturnType<typeof readRepo>;
    model: ReturnType<typeof buildModel>;
    allDocs: { path: string; content: string }[];
    shipSystems: ReturnType<typeof buildShipSystems>;
    adrPaths: string[];
    glossaryTerms: string[];
  };
  let cache: Cache | null = null;
  const getModel = (): Cache => {
    if (cache) return cache;
    const repo = readRepoFn();
    const model = buildModel(repo);
    const allDocs = repo.library.flatMap((g) => g.docs);
    // Codex intel (issue 176): the ADR files the library already walks (docs/adr/*.md) and the
    // glossary's own term list, read once here rather than reparsed on every /api/codex/:nn call.
    const adrPaths = (repo.library.find((g) => g.group === 'Decisions')?.docs ?? []).map((d) => d.path);
    const glossaryDoc = allDocs.find((d) => d.path === 'docs/glossary.md');
    const glossaryTerms = parseGlossaryTerms(glossaryDoc?.content ?? '');
    // The playbook lane's stations (issue 175) come from the same heading extraction every doc
    // page already uses (model/markdown.ts's render()), not a second parser -- frontmatter is
    // stripped first, the same way /api/docs/* does it, so a stray `---` in the front matter block
    // is never mistaken for a heading.
    const { headings: playbookHeadings } = render(splitFrontmatter(repo.playbookText).body, {});
    const shipSystems = buildShipSystems({
      agentFiles: repo.agentFiles,
      skillFiles: repo.skillFiles,
      commandFiles: repo.commandFiles,
      hookFileNames: repo.hookFiles.map((f) => f.name),
      settingsJsonText: repo.settingsJsonText,
      playbookHeadings,
      generated: repo.generated,
    });
    const fresh: Cache = { repo, model, allDocs, shipSystems, adrPaths, glossaryTerms };
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

  // The Codex briefing (issue 176): the same issue file read at a higher density -- objective,
  // intel, loadout, orders, after-action -- sourced from its own headings and front matter, no
  // new field invented. Read-only, same as the Quests room's own /api/issues/:nn.
  app.get('/api/codex/:nn', async (req, reply) => {
    const { model, repo, adrPaths, glossaryTerms } = getModel();
    const n = Number((req.params as { nn: string }).nn);
    const issue = model.issues.find((i) => i.n === n);
    if (!issue) return reply.code(404).send({ error: 'issue not found' });
    const file = repo.issueFiles.find((f) => f.name === issue.file);
    reply.type('application/json').send(buildCodex(issue, file?.content ?? '', adrPaths, glossaryTerms));
  });

  // The Debrief room (issue 176): lessons.jsonl grouped by sig, newest group first.
  app.get('/api/debrief', async (_req, reply) => {
    const { repo } = getModel();
    reply.type('application/json').send(debriefGroups(repo.lessonsText));
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

  // Artifacts (issue 100): the interrogation brief and similar generated pages, served read-only
  // and only if `readArtefacts()` already names them -- the same allow-list the Library uses for
  // documents, so `/api/artifacts/*` can never be used to read an arbitrary repo file.
  app.get('/api/artifacts/*', async (req, reply) => {
    const path = (req.params as { '*': string })['*'];
    const { repo } = getModel();
    const known = repo.artefacts.find((a) => a.path === path);
    if (!known) return reply.code(404).send({ error: 'artifact not found' });
    const full = join(REPO, path);
    if (!existsSync(full)) return reply.code(404).send({ error: 'artifact not found' });
    const content = readFileSync(full, 'utf8');
    reply.type(path.endsWith('.html') ? 'text/html' : 'text/plain').send(content);
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

  // The bridge's last-five events (issue 173): the last five landed quests, newest first, sorted
  // over every done issue before it is ever sliced (see lastEvents's own comment).
  app.get('/api/events', async (_req, reply) => {
    const { model } = getModel();
    reply.type('application/json').send(lastEvents(model.issues));
  });

  // The bridge's GitHub-reachable chip (ADR 0014): the one GitHub call this quest adds, and the
  // only one it may add ("Not in scope"). Never blocks the rest of `/api/state` or any other
  // route -- a bad network degrades this one chip, never the page.
  app.get('/api/github-status', async (_req, reply) => {
    const reachable = await githubReachableFn();
    reply.type('application/json').send({ reachable });
  });

  // The atlas (ADR 0015, issue 177): docs/factory/map.yaml painted, computing nothing itself.
  // Lit is decided against every `done` issue's own commit, checked against the set of commits
  // `main` can reach -- one `git rev-list main` call per request (mainAncestorShasFn), not one
  // `git` subprocess per issue (105 done issues measured ~628ms before this, and each of those
  // calls also reset the git-echo-suppression window read.ts's own msSinceLastGitCommand()
  // drives, swallowing real change-stream events for 1.5s apiece). Cleared-for-jump only when
  // GitHub answers (ADR 0014) -- a comms-lost machine still paints every lit and contact tile,
  // and simply skips the one GitHub round trip below.
  app.get('/api/atlas', async (_req, reply) => {
    const { repo, model } = getModel();
    const mapDoc = parseMapYaml(repo.mapYamlText);
    const reachable = await githubReachableFn();
    const gateGreenByIssue = reachable
      ? await openPullRequestGateStatesFn({ token: ghAuthTokenFn() })
      : new Map<number, boolean>();
    const mainShas = mainAncestorShasFn();
    const doneOnMain = new Set(
      model.issues
        .filter((i) => i.status === 'done' && isCommitOnMain(typeof i.commit === 'string' ? i.commit : null, mainShas))
        .map((i) => i.n),
    );
    const atlas = buildAtlas({ mapDoc, issues: model.issues, isOnMain: (n) => doneOnMain.has(n), gateGreenByIssue });
    reply.type('application/json').send({ ...atlas, githubReachable: reachable });
  });

  // Ship systems (issue 175): the factory's own machinery, read-only -- agents, skills, commands,
  // hooks cross-referenced against settings.json's events, and the playbook's own encounter lane.
  // No job-runner call, no mutation surface (the issue's "Not in scope").
  app.get('/api/ship-systems', async (_req, reply) => {
    const { shipSystems } = getModel();
    reply.type('application/json').send(shipSystems);
  });

  const jobs = new JobManager();
  const rootPath = resolveRootPath();
  // Shared between the two routes below (issue 162, checkpoint-4 review findings 3 and 4): the
  // one flag that gates a job start and a second restart, both, for the whole time a restart's
  // own rebuild is running.
  const restartGate = new RestartGate();
  registerJobRoutes(app, {
    jobs,
    repoRoot: rootPath,
    port: PORT,
    restartGate,
    treeRoots: () => {
      const { repo } = getModel();
      return [rootPath, ...repo.worktrees.map((w) => resolve(rootPath, w.path))];
    },
  });

  // POST /api/restart (issue 162): not a job-runner kind, its own narrower route. Registered
  // after `jobs` exists, since a restart must refuse while any job is running anywhere.
  //
  // `closePort` (checkpoint-4 review, second pass, finding 2): the actual port handoff mechanism,
  // now that simultaneous `reusePort` binding is verified unworkable (see index.ts's own listen
  // comment below) -- called by restart.ts the moment the rebuild is confirmed good, so this
  // process stops accepting new connections and releases the port for the new process to bind,
  // before this process itself has any confirmation the new one is even up yet. `app.server` is
  // Fastify's own underlying `http.Server`, created at `Fastify({...})` construction time, so
  // this closure is valid even though `app.listen` has not necessarily been called yet at the
  // point this route is registered (it always has been by the time a real restart can happen).
  registerRestartRoute(app, { jobs, port: PORT, appDir, restartGate, closePort: () => app.server.close() });

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

  return { app, getModel, invalidate, broadcast, onChange, clients, jobs };
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
  // Filter out watch events that are plausibly this process's own `git status` / `git worktree
  // list` calls landing on `.git/index` and friends, so reading the repo never feeds its own
  // change stream (see msSinceLastGitCommand in model/read.ts).
  const filteredOnChange = (section: string) => {
    if (shouldIgnoreGitEcho(section, msSinceLastGitCommand())) return;
    onChange(section);
  };
  const paths = watchPaths(root, readWorktrees(), commonDir);
  const watchers: FSWatcher[] = [];
  for (const { path, section, recursive } of paths) watchDirectory(path, filteredOnChange, section, watchers, recursive);
  setInterval(() => {
    for (let i = paths.length - 1; i >= 0; i--) {
      if (!existsSync(paths[i].path)) paths.splice(i, 1);
    }
    for (const w of readWorktrees()) {
      const dir = join(resolve(root, w.path), 'docs', 'factory', 'issues');
      if (existsSync(dir) && !paths.some((x) => x.path === dir)) {
        paths.push({ path: dir, section: 'issues' });
        watchDirectory(dir, filteredOnChange, 'issues', watchers);
        // A tree the 30-second rescan just found is new to this server: whatever brought it here
        // (a `/factory-run` mid-way through writing `status: in-progress`) already happened, and
        // no future filesystem event is guaranteed to fire soon. Without this, a connected
        // browser holds its stale `/api/state` until some unrelated path changes.
        filteredOnChange('issues');
      }
    }
  }, 30000).unref();
  return paths;
}

/** The SPA fallback registered on the built client's `dist/` directory: any GET that isn't
 * `/api`, `/events` or a static file falls back to `index.html` so React Router's own paths
 * (`/quests/07`, `/library/docs/...`) resolve on a hard refresh. Extracted from the `isMain`
 * block below so it is independently testable (checkpoint-4 review, third pass, finding 4). */
export function spaFallbackHandler(distDir: string) {
  return (req: { method: string; url: string }, reply: { code: (n: number) => typeof reply; type: (t: string) => typeof reply; send: (b: unknown) => void }) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/events')) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    // Checkpoint-4 review (third pass), finding 4: mid a restart's own rebuild, vite's
    // `emptyOutDir: true` clears `dist/` before rewriting `index.html` -- a page load or refresh
    // landing in that window used to hit an unhandled ENOENT, surfaced as a raw 500 with a full
    // filesystem path in the stack trace, instead of anything a developer watching the console
    // could make sense of.
    let html: string;
    try {
      html = readFileSync(join(distDir, 'index.html'), 'utf8');
    } catch {
      reply.code(503).type('text/plain').send('console: rebuilding, try again in a moment');
      return;
    }
    reply.type('text/html').send(html);
  };
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
    app.setNotFoundHandler(spaFallbackHandler(distDir));
  } else {
    app.setNotFoundHandler((req, reply) => {
      reply.code(404).type('text/plain').send('console: apps/console/dist is missing. Run `npm run build` in apps/console.');
    });
  }

  // A restart (issue 162) spawns this process while the old one is, briefly, still bound to
  // PORT. VERSTAAN_CONSOLE_RESTART=1 (set only by scripts/restart-launch.mjs) is what tells this
  // process it is such a case, rather than a second, ordinary `console.sh` finding a real
  // instance already up -- that case still exits 0 immediately, unchanged from before this issue.
  //
  // Checkpoint-4 review (second pass), finding 2: an earlier version of this fix tried to bind
  // this port with `reusePort: true` *while the old process was still bound to it*, to prove this
  // process was really listening before the old one exited. Verified against two real Node
  // processes on Linux (not assumed): `SO_REUSEPORT` requires *every* socket sharing a port to
  // set the option, including the first one to bind (man 7 socket says so outright, and a plain
  // bind followed by a second, `reusePort`-only bind reproducibly hits EADDRINUSE). The old
  // process's own bind, at its own ordinary start, had no way to know in advance a restart was
  // coming, and deliberately does not set `reusePort` (see this function's own default listen
  // call, unchanged from before this issue) -- setting it on *every* start instead broke the
  // existing "second console.sh exits with 'already running'" contract outright (two ordinary,
  // unrelated starts would silently join instead of the second one refusing). So simultaneous
  // binding was never actually achievable here; the real handoff mechanism is in restart.ts and
  // scripts/restart-launch.mjs: the old process closes its own listening socket as soon as the
  // rebuild is confirmed good, *before* this process ever attempts to bind, freeing the port for
  // this bind to claim outright, the same way an ordinary start always has. `isRestart` is what
  // this retry loop below is for: a brief EADDRINUSE window right after that handoff, in case
  // this process's own first bind attempt lands a beat before the old process's `close()` has
  // fully released the port (proven together with `server.close()` taking about a millisecond in
  // practice -- comfortably inside one 250ms retry interval, so this loop is not expected to run
  // more than once or twice in the ordinary case).
  const isRestart = process.env.VERSTAAN_CONSOLE_RESTART === '1';
  const RESTART_RETRY_MS = 250;
  const RESTART_RETRY_LIMIT = 40; // 10s: comfortably longer than the old process needs to release the port.
  // Checkpoint-4 review (second pass), finding 4: a running console that predates this whole
  // handoff mechanism (an old build, from before this feature existed at all) never closes its
  // socket for a restart, so this retry loop is certain to exhaust the very first time someone
  // tries the restart button after pulling a build with this feature in it. Exiting 0 in that
  // case (the old, "assume another instance is fine" code) would make restart.ts /
  // restart-launch.mjs read this as a normal already-running exit and misreport the outcome. This
  // exit code is exclusive to "the retry loop under VERSTAAN_CONSOLE_RESTART=1 ran out" so
  // scripts/restart-launch.mjs can tell that case apart and print a message that says what to
  // actually do about it. Kept in sync by hand with the same constant in
  // scripts/restart-launch.mjs (the two are separate module systems: this file compiles into
  // dist-server, that one runs as a plain .mjs script, so neither can import the other's
  // constant without running the other's top-level code).
  const RESTART_PORT_RETRY_EXHAUSTED_EXIT_CODE = 87;
  let retries = 0;
  const tryListen = () => {
    const listenOptions: { port: number; host: string } = { port: PORT, host: HOST };
    app.listen(listenOptions, (err) => {
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          if (isRestart && retries < RESTART_RETRY_LIMIT) {
            retries++;
            setTimeout(tryListen, RESTART_RETRY_MS);
            return;
          }
          if (isRestart) {
            // The retry loop ran out and this is a restart's own new process: the old process
            // never released (or never shared) the port. See the exit code's own comment above.
            console.error(`console: gave up waiting for the port after a restart (${RESTART_RETRY_LIMIT * RESTART_RETRY_MS}ms)`);
            process.exit(RESTART_PORT_RETRY_EXHAUSTED_EXIT_CODE);
          }
          console.log(`console: already running on http://${HOST}:${PORT}`);
          process.exit(0);
        }
        console.error(`console: ${err.message}`);
        process.exit(1);
      }
      // Checkpoint-4 review (second pass), finding 3(a): everything in this callback that could
      // throw runs BEFORE the IPC `listening` message is sent, so a failure here (e.g.
      // `startWatching` throwing) is never reported to the launcher as a success. `startWatching`
      // also has no reason to run only after the IPC send -- nothing in it depends on that
      // ordering -- so moving it earlier costs nothing.
      const paths = startWatching(onChange);
      // A restart's own launcher (scripts/restart-launch.mjs) `fork()`s this process with an IPC
      // channel and waits for exactly this signal before it ever reports success back to the old
      // process (issue 162, checkpoint-4 review finding 1). An earlier version of this fix polled
      // this process's own /health over the network instead, back when both processes briefly
      // shared the port via `reusePort`; that turned out to be unreliable in practice -- proven
      // with two real processes, not a guess -- because the kernel's own SO_REUSEPORT hash could
      // stick a long run of requests from the very same launcher process onto the *old* socket
      // alone, so a network-only proof timed out even once the new process was genuinely
      // listening. `reusePort` is gone now (checkpoint-4 review, second pass, finding 2 -- see
      // this function's own comment above), but IPC remains the right proof regardless: it has no
      // ambiguity at all, unlike a network poll. `process.connected` (checkpoint-4
      // review, second pass, finding 6) is only true when this process was started via that
      // `fork()` call *and* the channel is still open; an ordinary `console.sh` start has no IPC
      // channel at all, and this silently does nothing in that case. The callback form routes a
      // delivery error (e.g. the launcher already exited) to the callback instead of an uncaught
      // `process` event that would otherwise crash this new process.
      if (process.connected) process.send?.({ type: 'listening', pid: process.pid }, () => {});
      console.log(`console: serving http://${HOST}:${PORT} from ${REPO}`);
      console.log(`console: watching ${paths.length} paths; change stream on /events`);
    });
  };
  tryListen();
}
