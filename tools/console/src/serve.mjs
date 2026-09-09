// SPDX-License-Identifier: MPL-2.0
// node tools/console/src/serve.mjs [--port 7864]
// The console as a local service: one URL, rendered on every request from the root tree and every
// worktree, with live reload pushed over server-sent events. Nothing is written to disk. Zero
// dependencies. Binds to 127.0.0.1 only; nothing on it is writable, so there is no login.
import { createServer, get } from 'node:http';
import { readFileSync, existsSync, watch } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRepo, REPO, resolveRootPath, readWorktrees } from './read.mjs';
import { buildModel } from './parse.mjs';
import { renderConsole, renderQuests, renderLibrary, renderDoc, renderRoomFromDoc, docHref } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const theme = resolve(here, '..', 'theme');
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = (portFlag !== -1 ? Number(args[portFlag + 1]) : NaN) || Number(process.env.VERSTAAN_CONSOLE_PORT) || 7864;
const HOST = '127.0.0.1';

// A four-line listener the served pages carry: reload when the server says so, reconnect quietly.
const LIVE = `<script>(function(){try{var s=new EventSource('/events');s.onmessage=function(e){if(e.data==='reload')location.reload();};}catch(e){}})();</script>`;

/** Trailing-edge debounce: a call resets the `ms` timer, so a burst inside one `ms` window
 * collapses to a single `fn()`. `maxMs` bounds how long a *continuous* stream of calls can push
 * that timer back — checkpoint 4 measured 3.6 million calls in two minutes with no bound, because
 * `clearTimeout` always wins the race against a timer that has not yet elapsed. With `maxMs` set,
 * `fn()` fires at most `maxMs` after the first call of a run, however many calls follow. The
 * default `Infinity` keeps every existing caller's behaviour unchanged. */
export function debounce(fn, ms, maxMs = Infinity) {
  let t = null;
  let first = null;
  return () => {
    const now = Date.now();
    if (first == null) first = now;
    if (t) clearTimeout(t);
    const wait = Math.min(ms, Math.max(0, maxMs - (now - first)));
    t = setTimeout(() => { t = null; first = null; fn(); }, wait);
  };
}

/** Paths whose change means the console is stale: this tree's factory files, every worktree's
 * issue files, and the shared git directory (HEAD, refs, worktrees). */
export function watchPaths(root, worktrees, commonDir) {
  const set = new Set();
  const add = (p) => { if (p && existsSync(p)) set.add(p); };
  add(join(root, 'docs', 'factory', 'issues'));
  add(join(root, 'docs', 'factory'));
  add(join(root, 'docs'));
  add(join(root, '.claude', 'agents'));
  for (const w of worktrees) add(join(resolve(root, w.path), 'docs', 'factory', 'issues'));
  add(commonDir);
  add(join(commonDir, 'refs'));
  add(join(commonDir, 'worktrees'));
  return [...set];
}

/** Watch one directory. `fs.watch`'s own construction can throw (caught by the caller); what it
 * cannot always do is tell you the directory is *gone*. On Windows, `git worktree remove` does
 * not raise from an existing watcher — it fires the change callback in a tight loop instead
 * (checkpoint 4 measured 157,494 callbacks in 6 s from one removal). Each callback here checks
 * `existsSync` first: once the directory is gone, it closes itself, drops itself from `watchers`,
 * and calls `onChange()` exactly once more for the removal, instead of forever. Returns the
 * watcher, or `null` if the path could not be watched at all. */
export function watchDirectory(p, onChange, watchers) {
  let w = null;
  try {
    w = watch(p, { persistent: true }, () => {
      if (!existsSync(p)) {
        try { w.close(); } catch { /* already closed */ }
        const idx = watchers.indexOf(w);
        if (idx !== -1) watchers.splice(idx, 1);
        onChange();
        return;
      }
      onChange();
    });
    watchers.push(w);
  } catch { /* a path that cannot be watched at all is skipped */ }
  return w;
}

// Routes render() can possibly answer for. Anything else (a favicon, a stray path) is a 404 that
// costs nothing: checkpoint 4 measured a 404 at 5.9 s because every request, matched or not, paid
// for a full readRepo() first. Checking the shape of the path before touching the model fixes the
// unmatched case; getModel()'s own cache (below) fixes the matched one.
function routable(pathname) {
  return pathname === '/' || pathname === '/index.html' || pathname === '/quests.html' || pathname === '/library.html'
    || pathname === '/playbook.html' || pathname === '/glossary.html' || pathname.startsWith('/docs/');
}

function render(pathname, getModel) {
  if (!routable(pathname)) return null;
  const { repo, model, allDocs } = getModel();
  const known = new Set(allDocs.map((d) => d.path));
  const find = (p) => allDocs.find((d) => d.path === p);
  let html = null;
  if (pathname === '/' || pathname === '/index.html') html = renderConsole(model).replace('<meta http-equiv="refresh" content="120">\n', '');
  else if (pathname === '/quests.html') html = renderQuests(model, repo.issueFiles, known);
  else if (pathname === '/library.html') html = renderLibrary(model, repo.library, repo.artefacts);
  else if (pathname === '/playbook.html' && find('docs/factory/playbook.md')) html = renderRoomFromDoc('playbook', find('docs/factory/playbook.md'), model, known, { band: 'Playbook · how the game is played', lede: 'The moving parts as a player meets them: the map, an encounter, the gates, the checkpoints, and how the factory levels up.' });
  else if (pathname === '/glossary.html' && find('docs/glossary.md')) html = renderRoomFromDoc('glossary', find('docs/glossary.md'), model, known, { band: 'Glossary · the domain language', lede: 'One term, one meaning, for code, data, issues, chat and this console. Add a term to docs/glossary.md rather than inventing a synonym.' });
  else if (pathname.startsWith('/docs/')) {
    const d = allDocs.find((x) => '/' + docHref(x.path) === pathname);
    if (d) html = renderDoc(d, model, known);
  }
  return html == null ? null : html.replace('</body>', LIVE + '\n</body>');
}

const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8' };

// readRepoFn is injectable so the request handler can be tested against a fixture repo
// (tools/console/test/run.mjs) instead of this checkout's own docs/factory. Its default is the
// real readRepo(), so the running service behaves exactly as before.
export function createConsoleServer({ readRepoFn = readRepo } = {}) {
  const clients = new Set();

  // The rendered model (readRepo() + buildModel(), both expensive: readRepo shells out to git per
  // worktree and reads every doc) is cached across requests and invalidated by the same signal
  // that drives reload — a raw watch callback, not the debounced broadcast, so the very first
  // request after a change is never served stale. Checkpoint 4 measured 4.275 s for one `GET /`
  // paying for this on every request; the cache pays once per change instead.
  let cache = null;
  let readCalls = 0;
  const getModel = () => {
    if (!cache) {
      readCalls += 1;
      const repo = readRepoFn();
      const model = buildModel(repo);
      const allDocs = repo.library.flatMap((g) => g.docs);
      cache = { repo, model, allDocs };
    }
    return cache;
  };
  const invalidate = () => { cache = null; };

  // Windows delivers directory change notifications in batches that can arrive later than the
  // change itself; two touches 200 ms apart produced two reloads at 500 ms. 800 ms collapses them.
  // 2000 ms is the maximum wait (see debounce()): a continuous stream of writes — a long `git
  // fetch --all` touching the watched `refs/` directory, say — still gets a reload at least that
  // often, instead of never.
  const broadcast = debounce(() => { for (const res of clients) res.write('data: reload\n\n'); }, 800, 2000);
  // The signal every watcher calls: invalidate the cache immediately, then queue the (debounced)
  // reload notification.
  const onChange = () => { invalidate(); broadcast(); };

  const server = createServer((req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' });
        return res.end('method not allowed');
      }
      let url;
      try { url = new URL(req.url, `http://${HOST}`); }
      catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('bad request'); }
      const p = url.pathname;
      if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`ok ${process.pid}`); }
      if (p === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (['/theme.css', '/console.css', '/console.js'].includes(p)) {
        res.writeHead(200, { 'content-type': MIME[extname(p)], 'cache-control': 'no-cache' });
        return res.end(readFileSync(join(theme, p.slice(1))));
      }
      const html = render(p, getModel);
      if (html == null) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      res.end(html);
    } catch (e) {
      // The exception's own message can carry an absolute path on the owner's disk (a Node `fs`
      // error, say); log that detail, but never put it on the wire.
      console.error(`console: render failed: ${e && e.stack ? e.stack : e}`);
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('console: internal error');
    }
  });
  return { server, broadcast, onChange, invalidate, clients, getReadCalls: () => readCalls };
}

function startWatching(broadcast, onChange) {
  const root = resolveRootPath();
  const common = (() => { try { return dirname(resolve(root, '.git', 'HEAD')); } catch { return null; } })();
  const paths = watchPaths(root, readWorktrees(), common);
  const watchers = [];
  for (const p of paths) watchDirectory(p, onChange, watchers);
  // Worktrees come and go; rescan the list every 30 s, watch new issue folders, and drop paths
  // that vanished between scans (a belt-and-braces prune: watchDirectory's own callback usually
  // catches this first, on the next change under the vanished directory).
  setInterval(() => {
    for (let i = paths.length - 1; i >= 0; i--) {
      if (!existsSync(paths[i])) paths.splice(i, 1);
    }
    for (const w of readWorktrees()) {
      const dir = join(resolve(root, w.path), 'docs', 'factory', 'issues');
      if (existsSync(dir) && !paths.includes(dir)) { paths.push(dir); watchDirectory(dir, onChange, watchers); }
    }
  }, 30000).unref();
  return paths;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server, broadcast, onChange } = createConsoleServer();
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') { console.error(`console: ${e.message}`); process.exit(1); }
    get(`http://${HOST}:${PORT}/health`, (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { console.log(`console: already running on http://${HOST}:${PORT} (${b.trim()})`); process.exit(0); });
    }).on('error', () => { console.error(`console: port ${PORT} is taken by something else`); process.exit(1); });
  });
  server.listen(PORT, HOST, () => {
    const paths = startWatching(broadcast, onChange);
    console.log(`console: serving http://${HOST}:${PORT} from ${REPO}`);
    console.log(`console: watching ${paths.length} paths; live reload on /events`);
  });
}
