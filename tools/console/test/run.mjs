// SPDX-License-Identifier: MPL-2.0
// node tools/console/test/run.mjs  — parser tests against fixtures. Exit 1 on any mismatch.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseIssues, nextIssue, milestones, sideQuests, parseLessons, sideTask, pendingReviews, buildModel } from '../src/parse.mjs';
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

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all green');
