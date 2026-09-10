// SPDX-License-Identifier: MPL-2.0
// node tools/console/test/run.mjs  — parser tests against fixtures. Exit 1 on any mismatch.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseIssues, nextIssue, milestones, sideQuests, parseLessons, sideTask, pendingReviews, buildModel, parseWorktreePorcelain, inProgressQuests } from '../src/parse.mjs';
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
check('buildModel carries inProgress, empty with no in-progress issue', model.inProgress, []);

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

// inProgressQuests (issue 110): every in-progress issue, paired with the tree readWorktrees()
// found it in. mkTree/mkInProgressIssue build the minimal shapes each side needs.
const mkInProgressIssue = (n, title) => ({
  n, file: `${n}-x.md`, title, milestone: 'Side', status: 'in-progress', worktree: null, dependsOn: [],
  agent: null, agents: [], model: null, effort: null, checkpoint: null, commit: null, what: '', doneWhen: { total: 0, ticked: 0 },
});
const mkTree = (over) => ({ path: '.', branch: null, detached: false, head: 'abc', isRoot: false, dirty: 0, stampMatches: false, merged: false, issue: null, ...over });

const oneQuest = [mkInProgressIssue(50, 'A')];
const oneTree = [mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', issue: { n: 50, title: 'A' } })];
check('inProgressQuests reports the tree of a single in-progress quest',
  inProgressQuests(oneQuest, oneTree), [{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: 'side-50-a' }]);

const twoQuests = [mkInProgressIssue(50, 'A'), mkInProgressIssue(51, 'B')];
const twoTrees = [
  mkTree({ path: '.worktrees/side-51-b', branch: 'side-51-b', issue: { n: 51, title: 'B' } }),
  mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', issue: { n: 50, title: 'A' } }),
];
check('inProgressQuests reports both quests, lowest number first',
  inProgressQuests(twoQuests, twoTrees).map((q) => [q.n, q.tree]), [[50, 'side-50-a'], [51, 'side-51-b']]);

const mergedOnlyTree = [mkTree({ path: '.worktrees/side-50-a', branch: 'side-50-a', merged: true, issue: { n: 50, title: 'A' } })];
check('inProgressQuests drops a quest in-progress only in a merged tree',
  inProgressQuests(oneQuest, mergedOnlyTree), []);

check('inProgressQuests returns an empty list when no issue is in-progress', inProgressQuests([], []), []);

check('inProgressQuests names a detached tree by its path, not a branch',
  inProgressQuests(oneQuest, [mkTree({ path: '.worktrees/side-50-a', branch: null, detached: true, issue: { n: 50, title: 'A' } })]),
  [{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: '.worktrees/side-50-a' }]);

check('inProgressQuests reports tree: null when only the root tree names the quest',
  inProgressQuests(oneQuest, [mkTree({ path: '.', branch: 'main', isRoot: true, issue: { n: 50, title: 'A' } })]),
  [{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: null }]);

check('inProgressQuests reports tree: null when no worktree claims the quest at all',
  inProgressQuests(oneQuest, []), [{ n: 50, title: 'A', agent: null, model: null, effort: null, tree: null }]);

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

// merged: true when a non-root tree's HEAD is an ancestor of main (issue 109). shInOkFn stands in
// for `git merge-base --is-ancestor <head> main`, whose signal is the exit code, not stdout, so it
// is injected as its own function rather than reusing shInFn.
const mergedRows = readWorktrees({ shFn: fakeListShFn, shInFn: () => '', shInOkFn: (cwd) => cwd === fakeSideTree });
check('readWorktrees marks a tree whose head is an ancestor of main as merged',
  mergedRows.find((r) => r.path === '.worktrees/side-92-worktrees')?.merged, true);
check('readWorktrees always reports the root tree as merged: false, even when the ancestor check would say yes',
  mergedRows.find((r) => r.isRoot)?.merged, false);

const unmergedRows = readWorktrees({ shFn: fakeListShFn, shInFn: () => '', shInOkFn: () => false });
check('readWorktrees marks a tree whose head is not an ancestor of main as merged: false',
  unmergedRows.find((r) => !r.isRoot)?.merged, false);

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

// The service tests (debounce, watchPaths, watchDirectory, the node:http request handler) lived
// here against tools/console/src/serve.mjs. Issue 99 removed serve.mjs: the console's live
// service is now apps/console/server (its own Vitest suite, apps/console/server/test/), and the
// file console (this directory) goes back to being generate.mjs's static output only, read
// straight from disk with no server of its own. `mkdtempSync`/`mkdirTest`/`rmTest` and the
// `node:fs`/`node:os` imports that only those removed tests needed went with them.

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

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all green');
