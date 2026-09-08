// SPDX-License-Identifier: MPL-2.0
// node tools/console/test/run.mjs  — parser tests against fixtures. Exit 1 on any mismatch.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const worktrees = readWorktrees();
check('readWorktrees finds at least the root tree', worktrees.length >= 1, true);
const root = worktrees.find((w) => w.isRoot);
check('readWorktrees marks the root tree', !!root, true);
check('readWorktrees root path is .', root && root.path, '.');
check('readWorktrees reports a branch for the root tree', typeof (root && root.branch), 'string');
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
check('mergeIssuesAcrossWorktrees does not surface a file local does not already have',
  mergeIssuesAcrossWorktrees(openLocal, unrelatedInOtherTree).map((f) => f.name), ['91-x.md']);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all green');
