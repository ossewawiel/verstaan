// SPDX-License-Identifier: MPL-2.0
// node tools/console/test/run.mjs  — parser tests against fixtures. Exit 1 on any mismatch.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { parseFrontmatter, parseIssues, nextIssue, milestones, sideQuests, parseLessons, sideTask, pendingReviews, buildModel, parseWorktreePorcelain } from '../src/parse.mjs';
import { escapeIsland, renderConsole as renderPage } from '../src/render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, 'fixtures');
const files = readdirSync(fx).filter((n) => n.endsWith('.md')).map((name) => ({ name, content: readFileSync(join(fx, name), 'utf8') }));

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`));
  if (!ok) failed += 1;
}

check('frontmatter scalars and lists', parseFrontmatter('---\nissue: 3\ntitle: "A <script> title"\ndepends_on: [1, 2]\ncommit: null\n---\nbody'),
  { issue: 3, title: 'A <script> title', depends_on: [1, 2], commit: null });

const issues = parseIssues(files);
check('issue count excludes test-cases companions', issues.length, 4);
check('issues sorted', issues.map((i) => i.n), [1, 2, 3, 90]);
check('next is lowest open with deps done', nextIssue(issues)?.n, 2);
check('milestones grouped, side excluded', milestones(issues).map((m) => [m.name, m.won, m.total]), [['M0', 1, 2], ['M1', 0, 1]]);
check('side quests need deps met', sideQuests(issues).map((i) => i.n), [90]);
check('done-when ticks counted', issues[0].doneWhen, { total: 2, ticked: 2 });

const lessons = parseLessons('{"sig":"a","ts":"2026-09-08T10:00:00Z"}\n{"sig":"a","ts":"2026-09-08T11:00:00Z"}\n{"sig":"a","ts":"2026-09-08T09:00:00Z"}\nnot json\n{"sig":"b","ts":"x"}\n');
check('lessons grouped and ripe', [lessons.total, lessons.ripe, lessons.bySig[0].last], [4, ['a'], '2026-09-08T11:00:00Z']);

const reviews = pendingReviews(files);
check('pending reviews counted from companions', reviews.count, 2);
check('side task prefers reviews', sideTask({ issues, lessons, reviews }).kind, 'review');
check('side task falls to retro', sideTask({ issues, lessons, reviews: { count: 0, where: [] } }).kind, 'retro');
check('side task none', sideTask({ issues, lessons: { ripe: [] }, reviews: { count: 0, where: [] } }).kind, 'none');

const model = buildModel({ issueFiles: files, agentFiles: [{ name: 'x.md', content: '---\nname: x\nmodel: sonnet\neffort: low\ndescription: Does a thing. More.\n---' }], lessonsText: '', git: { head: 'abc', branch: 'main', dirty: 0, remote: 'no remote' }, stamp: { present: false, matches: false }, generated: 't' });
check('party parsed', model.party, [{ name: 'x', model: 'sonnet', effort: 'low', role: 'Does a thing' }]);
check('buildModel defaults worktrees to empty', model.worktrees, []);

const withTrees = buildModel({ issueFiles: files, agentFiles: [], lessonsText: '', git: { head: 'abc', branch: 'main', dirty: 0, remote: 'no remote' }, stamp: { present: false, matches: false }, generated: 't', worktrees: [{ path: '.', branch: 'main', head: 'abc', isRoot: true, dirty: 0, stampMatches: false, issue: null }] });
check('buildModel passes worktrees through', withTrees.worktrees.length, 1);

// issue schema: in-progress status and the worktree field (side quest 92)
const inProgress = parseIssues([{ name: '99-x.md', content: '---\nissue: 99\ntitle: "X"\nmilestone: Side\nstatus: in-progress\ndepends_on: []\nworktree: .worktrees/side-99-x\n---\n## What\nX.\n' }]);
check('in-progress status parsed', inProgress[0].status, 'in-progress');
check('worktree field parsed', inProgress[0].worktree, '.worktrees/side-99-x');
check('an open issue has a null worktree', issues[0].worktree, null);
check('nextIssue skips in-progress issues', nextIssue(inProgress), null);

// git worktree list --porcelain
const porcelain = 'worktree /repo\nHEAD abcdef1234567890\nbranch refs/heads/main\n\nworktree /repo/.worktrees/side-92-worktrees\nHEAD 1234567890abcdef\nbranch refs/heads/side-92-worktrees\n\nworktree /repo/.worktrees/detached-example\nHEAD deadbeef00000000\ndetached\n';
check('parseWorktreePorcelain', parseWorktreePorcelain(porcelain), [
  { path: '/repo', head: 'abcdef1', branch: 'main', detached: false },
  { path: '/repo/.worktrees/side-92-worktrees', head: '1234567', branch: 'side-92-worktrees', detached: false },
  { path: '/repo/.worktrees/detached-example', head: 'deadbee', branch: null, detached: true },
]);
check('parseWorktreePorcelain empty text', parseWorktreePorcelain(''), []);

const page = renderPage(model);
check('island escapes angle brackets', !page.includes('A <script> title') && page.includes('A \\u003cscript\\u003e title'), true);
check('escapeIsland', escapeIsland('<a>&'), '\\u003ca\\u003e\\u0026');

// markdown renderer
const { render: md, titleOf, slug } = await import('../src/markdown.mjs');
const { docHref } = await import('../src/render.mjs');
check('md escapes html', md('a <b>bold</b> & c').html, '<p>a &lt;b&gt;bold&lt;/b&gt; &amp; c</p>');
check('md heading ids and toc', md('# Title\n\n## Gate ladder\n\ntext').headings, [{ level: 1, text: 'Title', id: 'title' }, { level: 2, text: 'Gate ladder', id: 'gate-ladder' }]);
check('md table', md('| a | b |\n|---|---|\n| 1 | `x` |').html, '<div class="tablewrap"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><code>x</code></td></tr></tbody></table></div>');
check('md nested list and task', md('- one\n  - two\n- [x] done\n- [ ] open').html, '<ul>\n<li>one\n<ul>\n<li>two</li>\n</ul>\n</li>\n<li><span class="task task--done">●</span> done</li>\n<li><span class="task task--open">○</span> open</li>\n</ul>');
check('md fenced code keeps angle brackets escaped', md('```cpp\nint a<b>;\n```').html, '<pre data-lang="cpp"><code>int a&lt;b&gt;;</code></pre>');
check('md link javascript blocked', md('[x](javascript:alert)').html, '<p><a href="#">x</a></p>');
check('md link https kept', md('[x](https://a.b/c)').html, '<p><a href="https://a.b/c">x</a></p>');
check('md bold and inline code', md('**b** and `c`').html, '<p><strong>b</strong> and <code>c</code></p>');
check('titleOf', titleOf('---\nx: 1\n---\n# The `Plan`\n', 'f'), 'The Plan');
check('slug', slug('Gate ladder: 3 tiers'), 'gate-ladder-3-tiers');
check('docHref', docHref('.claude/agents/implementer.md'), 'docs/.claude--agents--implementer.html');

// readWorktrees() is IO (it shells out to git), so it is exercised against this real checkout
// rather than a fixture: the one invariant every clone has is a root tree, present and marked.
const { readWorktrees, resolveRootPath, isRootTree, normalizeTreePath, matchInProgressIssue, mergeIssuesAcrossWorktrees } = await import('../src/read.mjs');
// issues across worktrees: the most advanced status wins, and a quest that exists only on a
// worktree branch still reaches the root console
const mk = (name, status) => ({ name, content: `---\nissue: ${name.slice(0, 2)}\ntitle: "T"\nmilestone: Side\nstatus: ${status}\ndepends_on: []\n---\n## What\nx.\n` });
const merged = mergeIssuesAcrossWorktrees([mk('01-a.md', 'open'), mk('02-b.md', 'done')], [[mk('01-a.md', 'in-progress')], [mk('95-new.md', 'in-progress')]]);
check('merge prefers the more advanced status', merged.find((f) => f.name === '01-a.md').content.includes('status: in-progress'), true);
check('merge never regresses a done issue', merged.find((f) => f.name === '02-b.md').content.includes('status: done'), true);
check('merge includes worktree-only issues', merged.map((f) => f.name), ['01-a.md', '02-b.md', '95-new.md']);

const worktrees = readWorktrees();
check('readWorktrees finds at least the root tree', worktrees.length >= 1, true);
const root = worktrees.find((w) => w.isRoot);
check('readWorktrees marks the root tree', !!root, true);
check('readWorktrees root path is .', root && root.path, '.');
// A branch name, or null on a detached HEAD with `detached` saying so. `actions/checkout` detaches
// for a pull request, so a bare `typeof === 'string'` here could only ever pass on a developer's
// machine; it went green locally and failed on all three CI runners.
check('readWorktrees reports a branch for the root tree, or marks it detached',
  root && (typeof root.branch === 'string' ? !root.detached : root.branch === null && root.detached === true), true);
check('readWorktrees reports a dirty count as a number', typeof (root && root.dirty), 'number');

// Regression fixture for checkpoint 4 findings 1 and 2 (issue 92, reopened): isRoot must be
// decided from the shared `--git-common-dir`, never from wherever this module happens to be
// running, and the `worktree:` match must survive PowerShell's backslashes and never fall back
// to an unrelated in-progress issue.
const fakeRoot = join(fx, '__fake-root__');
const fakeSideTree = join(fakeRoot, '.worktrees', 'side-92-worktrees');
const fakeCommonDir = join(fakeRoot, '.git');
const fakeShFn = (cmd) => (cmd.includes('--git-common-dir') ? fakeCommonDir : '');
check('resolveRootPath derives the parent of --git-common-dir, not the caller\'s own tree', resolveRootPath(fakeShFn), fakeRoot);
check('isRootTree marks the true root even when the running tree is a worktree', isRootTree(fakeRoot, resolveRootPath(fakeShFn)), true);
check('isRootTree does not mark a worktree as root just because code is running from it', isRootTree(fakeSideTree, resolveRootPath(fakeShFn)), false);

check('normalizeTreePath turns PowerShell backslashes into forward slashes', normalizeTreePath('.worktrees\\side-92-worktrees'), '.worktrees/side-92-worktrees');
check('normalizeTreePath strips a leading ./', normalizeTreePath('./.worktrees/side-x'), '.worktrees/side-x');

const wtIssueFiles = [
  { name: '50-a.md', content: '---\nissue: 50\ntitle: "A"\nstatus: in-progress\nworktree: .worktrees\\side-50-a\n---\n## What\nA.\n' },
  { name: '51-b.md', content: '---\nissue: 51\ntitle: "B"\nstatus: in-progress\nworktree: .worktrees/side-51-b\n---\n## What\nB.\n' },
];
check('matchInProgressIssue matches a Windows-style worktree field against a forward-slash path', matchInProgressIssue(wtIssueFiles, '.worktrees/side-50-a'), { n: 50, title: 'A' });
check('matchInProgressIssue never falls back to an unrelated in-progress issue', matchInProgressIssue(wtIssueFiles, '.worktrees/side-52-c'), null);

// Round 2: the fixture functions above are correct in isolation, but readWorktrees() itself is
// the only caller and had no test pinning that it actually uses them — the round-1 bug (isRoot
// decided from the module's own REPO constant) can come straight back in this one wiring line
// without any test failing. Feed it a fully fake `git worktree list --porcelain` for the fixture
// root so isRoot and path are checked end to end, not just the helpers they are built from.
const fakePorcelain = `worktree ${fakeRoot}\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n\nworktree ${fakeSideTree}\nHEAD 2222222222222222222222222222222222222222\nbranch refs/heads/side-92-worktrees\n`;
const fakeListShFn = (cmd) => (cmd.includes('--git-common-dir') ? fakeCommonDir : cmd.includes('worktree list') ? fakePorcelain : '');
const fakeRows = readWorktrees({ shFn: fakeListShFn, shInFn: () => '' });
check('readWorktrees marks the fixture root tree as root, not the side tree', fakeRows.map((r) => [r.path, r.isRoot]), [['.', true], ['.worktrees/side-92-worktrees', false]]);
check('readWorktrees carries the branch name through for an attached tree', fakeRows.map((r) => [r.branch, r.detached]), [['main', false], ['side-92-worktrees', false]]);

// A detached root tree, which is exactly what `actions/checkout` produces for a pull request.
// `branch` is null and `detached` says why, so the console can tell "no branch" from "not read".
const detachedPorcelain = `worktree ${fakeRoot}\nHEAD 3333333333333333333333333333333333333333\ndetached\n`;
const detachedRows = readWorktrees({ shFn: (cmd) => (cmd.includes('--git-common-dir') ? fakeCommonDir : cmd.includes('worktree list') ? detachedPorcelain : ''), shInFn: () => '' });
check('readWorktrees reports a detached root tree as branch null, detached true', detachedRows.map((r) => [r.path, r.branch, r.detached]), [['.', null, true]]);

// mergeIssuesAcrossWorktrees: a status closed in a side quest's own worktree, unmerged anywhere
// else, must not disappear just because the console happens to be generated from a different
// tree (the bug reported against issue 91: "the console still shows #91 as open").
const openLocal = [{ name: '91-x.md', content: '---\nissue: 91\nstatus: open\n---\n## What\nX.\n' }];
const doneInOtherTree = [[{ name: '91-x.md', content: '---\nissue: 91\nstatus: done\n---\n## What\nX.\n' }]];
check('mergeIssuesAcrossWorktrees takes the more advanced status from another tree',
  mergeIssuesAcrossWorktrees(openLocal, doneInOtherTree)[0].content.includes('status: done'), true);

const doneLocal = [{ name: '91-x.md', content: '---\nissue: 91\nstatus: done\n---\n## What\nX.\n' }];
const openInOtherTree = [[{ name: '91-x.md', content: '---\nissue: 91\nstatus: open\n---\n## What\nX.\n' }]];
check('mergeIssuesAcrossWorktrees never regresses a status the local tree already has',
  mergeIssuesAcrossWorktrees(doneLocal, openInOtherTree)[0].content.includes('status: done'), true);

check('mergeIssuesAcrossWorktrees with no other trees returns local unchanged',
  mergeIssuesAcrossWorktrees(openLocal, [])[0].content, openLocal[0].content);

const unrelatedInOtherTree = [[{ name: '50-a.md', content: '---\nissue: 50\nstatus: done\n---\n## What\nA.\n' }]];
check('mergeIssuesAcrossWorktrees surfaces a file that exists only in another tree (a quest written on its branch)',
  mergeIssuesAcrossWorktrees(openLocal, unrelatedInOtherTree).map((f) => f.name), ['91-x.md', '50-a.md']);

// Known cost of the slice-1 change (checkpoint 4, issue 95): the same "surface a worktree-only
// file" rule that lets a new quest show before its branch merges also resurrects an issue file
// that was renamed on main but still exists, unmerged, under its old name in a stale worktree.
// This is not fixed here — a rename-aware merge is outside this quest — the test only pins that
// the console does this today, honestly, so nobody discovers it by surprise later.
const renamedAwayLocal = [{ name: '07-mirror-public-pages.md', content: '---\nissue: 7\nstatus: open\n---\n## What\nRenamed.\n' }];
const staleNameInOldWorktree = [[{ name: '07-mirror.md', content: '---\nissue: 7\nstatus: open\n---\n## What\nThe pre-rename filename, still on a week-old branch.\n' }]];
check('mergeIssuesAcrossWorktrees resurrects a renamed-away issue file from a stale worktree (known cost, not fixed here)',
  mergeIssuesAcrossWorktrees(renamedAwayLocal, staleNameInOldWorktree).map((f) => f.name), ['07-mirror-public-pages.md', '07-mirror.md']);

// the service: debounce collapses a burst into one event; watch paths cover every tree and git
const { debounce, watchPaths, watchDirectory, createConsoleServer } = await import('../src/serve.mjs');
let fired = 0;
const d = debounce(() => { fired += 1; }, 20);
d(); d(); d();
await new Promise((r) => setTimeout(r, 60));
check('debounce collapses a burst into one call', fired, 1);

// checkpoint 4: a continuous stream of calls at sub-debounce intervals must still deliver, capped
// by a maximum wait, instead of pushing the trailing-edge timer back forever.
let capped = 0;
const dCapped = debounce(() => { capped += 1; }, 500, 150);
const streamTimer = setInterval(() => dCapped(), 40); // faster than the 500 ms debounce window
await new Promise((r) => setTimeout(r, 500));
clearInterval(streamTimer);
check('debounce with a maximum wait still delivers during a continuous stream', capped >= 2, true);

// watchPaths: a real directory shape (issue 95 checkpoint 4, gap 3 — the old fixture had no
// docs/ tree at all, so every positive branch resolved to nothing and the assertion reduced to
// the one unconditionally-added common-dir entry). This one has a root tree, a worktree and a
// common git dir, each populated, so every add() in watchPaths is actually exercised.
const { mkdtempSync, mkdirSync: mkdirTest, rmSync: rmTest } = await import('node:fs');
const { tmpdir } = await import('node:os');
const wpBase = mkdtempSync(join(tmpdir(), 'verstaan-watchpaths-'));
const wpRoot = join(wpBase, 'root');
const wpWorktree = join(wpBase, 'wt');
const wpCommon = join(wpBase, 'common');
for (const dir of [
  join(wpRoot, 'docs', 'factory', 'issues'),
  join(wpRoot, '.claude', 'agents'),
  join(wpWorktree, 'docs', 'factory', 'issues'),
  join(wpCommon, 'refs'),
  join(wpCommon, 'worktrees'),
]) mkdirTest(dir, { recursive: true });
const wp = watchPaths(wpRoot, [{ path: '.' }, { path: wpWorktree }, { path: 'missing-tree' }], wpCommon);
check('watchPaths covers the root issues folder, docs tree, agents, every worktree\'s issues folder and the common git dir, deduplicated', wp, [
  join(wpRoot, 'docs', 'factory', 'issues'),
  join(wpRoot, 'docs', 'factory'),
  join(wpRoot, 'docs'),
  join(wpRoot, '.claude', 'agents'),
  join(wpWorktree, 'docs', 'factory', 'issues'),
  wpCommon,
  join(wpCommon, 'refs'),
  join(wpCommon, 'worktrees'),
]);
rmTest(wpBase, { recursive: true, force: true });

// watchDirectory: checkpoint 4 measured 157,494 tight-loop callbacks in 6 s after a
// `git worktree remove` on Windows, because the old code only caught fs.watch's own construction
// throwing, never a directory vanishing out from under an already-open watcher. Once the watched
// directory is gone, the watcher must close itself and stop calling back.
{
  const wdDir = mkdtempSync(join(tmpdir(), 'verstaan-watchdir-'));
  let calls = 0;
  const watchers = [];
  watchDirectory(wdDir, () => { calls += 1; }, watchers);
  rmTest(wdDir, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 300));
  const afterFirstSettle = calls;
  await new Promise((r) => setTimeout(r, 300));
  check('a watcher whose directory disappears stops calling back (no growth once it self-closes)', calls === afterFirstSettle, true);
  check('a watcher whose directory disappears removes itself from the watcher list', watchers.length, 0);
}

// generate.mjs's chain to the root tree's own generator, pulled out as chainDecision() so it can
// be pinned without shelling out to git or writing any file (issue 95 gap 2).
const { chainDecision, runChain } = await import('../src/chain.mjs');
const worktree = join(fx, '.worktrees', 'side-99-x');
const rootCommonDir = join(fx, '.git');
check('chainDecision chains from a worktree to the root generator', chainDecision(worktree, rootCommonDir, false, true),
  { chain: true, rootTree: fx, rootGen: join(fx, 'tools', 'console', 'src', 'generate.mjs') });
check('chainDecision does not chain from the root tree itself', chainDecision(fx, rootCommonDir, false, true).chain, false);
check('chainDecision does not chain when VERSTAAN_CONSOLE_NO_CHAIN is set', chainDecision(worktree, rootCommonDir, true, true).chain, false);
check('chainDecision does not chain when the root generator file is absent', chainDecision(worktree, rootCommonDir, false, false).chain, false);

// runChain: the wiring line itself (checkpoint 4, gap 7). generate.mjs used to build the root
// generator path twice — once to existsSync-check it, once to spawnSync it — so the two could
// drift apart. runChain reads chainDecision's one rootGen for both; this pins the caller, not
// just the pure decision inside it.
{
  const existsCalls = [];
  const spawnCalls = [];
  const decision = runChain(worktree, rootCommonDir, false, {
    existsSyncFn: (p) => { existsCalls.push(p); return true; },
    spawnSyncFn: (cmd, spawnArgs, opts) => { spawnCalls.push({ cmd, spawnArgs, opts }); return { status: 0 }; },
    env: {},
    log: () => {},
    logError: () => {},
  });
  check('runChain existsSync-checks chainDecision\'s own rootGen path', existsCalls[0], join(fx, 'tools', 'console', 'src', 'generate.mjs'));
  check('runChain spawns the same rootGen path it existence-checked', spawnCalls[0]?.spawnArgs?.[0], decision.rootGen);
  check('runChain passes a 15000 ms timeout to spawnSync so a stuck git cannot hang it', spawnCalls[0]?.opts?.timeout, 15000);
}
{
  const errors = [];
  runChain(worktree, rootCommonDir, false, {
    existsSyncFn: () => true,
    spawnSyncFn: () => ({ error: { code: 'ETIMEDOUT' } }),
    env: {},
    log: () => {},
    logError: (msg) => errors.push(msg),
  });
  check('runChain reports a spawnSync timeout instead of a silent hang', errors.some((m) => m.includes('timed out')), true);
}
check('runChain does not chain when VERSTAAN_CONSOLE_NO_CHAIN is set (no spawnSync call)',
  (() => { let called = false; runChain(worktree, rootCommonDir, true, { spawnSyncFn: () => { called = true; return { status: 0 }; }, env: {}, log: () => {}, logError: () => {} }); return called; })(), false);

// the request handler: node:http against a fixture repo, driven end to end (issue 95 gap 1).
// Titles below ("First", "Side thing") exist only in tools/console/test/fixtures/*.md, not in
// this checkout's own docs/factory/issues/ — so a response that carries one proves the fixture
// was actually read, not silently bypassed in favour of the live repo (checkpoint 4, gap 4).
let fixtureRepoCalls = 0;
const fixtureRepo = () => {
  fixtureRepoCalls += 1;
  return {
    issueFiles: files,
    agentFiles: [],
    lessonsText: '',
    library: [],
    artefacts: [],
    git: { head: 'abc1234', branch: 'main', dirty: 0, remote: 'no remote' },
    stamp: { present: false, matches: false },
    worktrees: [],
    generated: '2026-09-09T00:00:00Z',
  };
};
function httpGet(port, path, method = 'GET') {
  return new Promise((resolvePromise, rejectPromise) => {
    request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolvePromise({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', rejectPromise).end();
  });
}
{
  const { server, broadcast, onChange } = createConsoleServer({ readRepoFn: fixtureRepo });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const health = await httpGet(port, '/health');
  check('GET /health returns 200 ok <pid>', health.status === 200 && health.body.trim() === `ok ${process.pid}`, true);

  const home = await httpGet(port, '/');
  check('GET / returns 200', home.status, 200);
  check('GET / carries the EventSource live-reload script', home.body.includes("new EventSource('/events')"), true);
  check('GET / does not carry a meta refresh', home.body.includes('<meta http-equiv="refresh"'), false);

  const quests = await httpGet(port, '/quests.html');
  check('GET /quests.html carries a fixture-only title, proving the injected fixture was read',
    quests.body.includes('First') && quests.body.includes('Side thing'), true);

  const missing = await httpGet(port, '/nope-not-a-route');
  check('GET an unknown path returns 404', missing.status, 404);

  const posted = await httpGet(port, '/', 'POST');
  check('POST / is rejected (only GET and HEAD render)', posted.status, 405);

  // fixtureRepo() must run once (the first render), not once per request: getModel() caches the
  // model until the next onChange() (checkpoint 4, gap 5 — 4.275 s per GET / against the real
  // repo, unconditionally, before this cache existed).
  check('the rendered model is cached across requests instead of rebuilt each time', fixtureRepoCalls, 1);
  onChange();
  await httpGet(port, '/');
  check('onChange() invalidates the cache, so the next request rebuilds the model', fixtureRepoCalls, 2);

  const events = await new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(new Error('timed out waiting for data: reload')), 3000);
    const req = request({ host: '127.0.0.1', port, path: '/events', method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
        if (body.includes('data: reload')) {
          clearTimeout(timeout);
          req.destroy();
          resolvePromise({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', () => {});
    req.end();
    setTimeout(() => broadcast(), 50);
  });
  check('GET /events returns 200 text/event-stream', events.status === 200 && String(events.headers['content-type']).includes('text/event-stream'), true);
  check('a client connected to /events receives data: reload after broadcast()', events.body.includes('data: reload'), true);

  await new Promise((r) => server.close(r));
}

// GET //?q=1 (checkpoint 4, gap 2): `new URL(req.url, base)` threw ERR_INVALID_URL one line above
// the request handler's own try/catch, so the throw escaped the listener and killed the process.
// A raw socket, not node:http's client, sends the exact request line: http.request normalises a
// leading "//" before the server ever sees it.
{
  const { server } = createConsoleServer({ readRepoFn: fixtureRepo });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const net = await import('node:net');
  const raw = await new Promise((resolvePromise, rejectPromise) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write('GET //?q=1 HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    });
    let data = '';
    sock.on('data', (c) => { data += c; });
    sock.on('end', () => resolvePromise(data));
    sock.on('error', rejectPromise);
  });
  check('GET //?q=1 (a URL new URL() rejects) answers 400, not a dropped connection', raw.startsWith('HTTP/1.1 400'), true);

  const health = await httpGet(port, '/health');
  check('the service is still alive after a malformed request line', health.status, 200);
  await new Promise((r) => server.close(r));
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all green');
