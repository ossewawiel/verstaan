// SPDX-License-Identifier: MPL-2.0
// Pure renderers. The console page carries the model as an inline JSON data island that
// console.js turns into DOM with textContent only. The other rooms are static HTML rendered
// here from the project's own Markdown through markdown.mjs, which escapes everything first.
import { render as md, splitFrontmatter, titleOf, escapeHtml, slug } from './markdown.mjs';

export function escapeIsland(json) {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export const ROOMS = [
  { id: 'index', file: 'index.html', label: 'Console', blurb: 'Where you are, what to type next.' },
  { id: 'quests', file: 'quests.html', label: 'Quests', blurb: 'Every encounter with its full brief.' },
  { id: 'playbook', file: 'playbook.html', label: 'Playbook', blurb: 'How an encounter, a gate and a level work.' },
  { id: 'library', file: 'library.html', label: 'Library', blurb: 'Every project document, grouped.' },
  { id: 'glossary', file: 'glossary.html', label: 'Glossary', blurb: 'One term, one meaning.' },
];

/** Map a repo path to its rendered page path inside the console. */
export function docHref(repoPath) {
  return 'docs/' + repoPath.replace(/\.md$/, '').replace(/[^A-Za-z0-9/_.-]/g, '-').replace(/\//g, '--') + '.html';
}

function nav(roomId, depth = 0) {
  const pre = depth ? '../'.repeat(depth) : '';
  return ROOMS.map((r) => (r.id === roomId ? `<span class="cic-bar__here">${r.label}</span>` : `<a href="${pre}${r.file}">${r.label}</a>`)).join('\n    ');
}

function shell({ roomId, title, main, depth = 0, island = null, script = false, sub = 'rendered from the files' }) {
  const pre = depth ? '../'.repeat(depth) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Verstaan console</title>
<link rel="stylesheet" href="${pre}theme.css">
<link rel="stylesheet" href="${pre}console.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="cic-bar">
  <span class="cic-bar__sigil" aria-hidden="true">◈</span>
  <div class="cic-bar__id">
    <span class="cic-bar__proj">Verstaan</span>
    <span class="cic-bar__sub">${escapeHtml(sub)}</span>
  </div>
  <nav class="cic-bar__nav" aria-label="Rooms">
    ${nav(roomId, depth)}
  </nav>
</header>
${main}
${island ? `<script id="console-data" type="application/json">${island}</script>` : ''}
${script ? `<script src="${pre}console.js"></script>` : ''}
</body>
</html>
`;
}

export function renderConsole(model) {
  const island = escapeIsland(JSON.stringify(model));
  const main = `<main id="main" class="room">
  <p class="altitude__band" id="band">Loading</p>
  <h1 class="headline" id="headline">Verstaan</h1>
  <p class="lede" id="lede"></p>

  <section id="rail" class="panel rail" aria-labelledby="rail-title">
    <h2 class="panel__title" id="rail-title">Next move</h2>
    <div class="rail__grid">
      <div class="rail__main">
        <p class="rail__label">Encounter</p>
        <p class="rail__cmd mono" id="rail-cmd"></p>
        <p class="rail__text" id="rail-text"></p>
        <p class="rail__link"><a id="rail-link" href="quests.html">Read the brief</a></p>
      </div>
      <div class="rail__side">
        <p class="rail__label">Side task, under ten minutes</p>
        <p class="rail__cmd mono" id="side-cmd"></p>
        <p class="rail__text" id="side-text"></p>
      </div>
    </div>
  </section>

  <section class="tiles" id="tiles" aria-label="Status tiles"></section>

  <section id="map" class="panel" aria-labelledby="map-title">
    <h2 class="panel__title" id="map-title">Map</h2>
    <p class="panel__ctx">The main quest is the current milestone branch. Each encounter is one issue and one commit. Explored ground is merged code. Click an encounter for its brief.</p>
    <div id="map-body"></div>
  </section>

  <section id="side" class="panel" aria-labelledby="side-title">
    <h2 class="panel__title" id="side-title">Side quests</h2>
    <p class="panel__ctx">Open issues off the main path whose dependencies are met.</p>
    <div id="side-body"></div>
  </section>

  <section class="tiles rooms" aria-label="Rooms">
    ${ROOMS.filter((r) => r.id !== 'index').map((r) => `<a class="tile" href="${r.file}"><span class="tile__corner"></span><h3 class="tile__title">${r.label}</h3><p class="tile__blurb">${r.blurb}</p></a>`).join('\n    ')}
  </section>

  <section id="party" class="panel" aria-labelledby="party-title">
    <h2 class="panel__title" id="party-title">Party</h2>
    <p class="panel__ctx">Each member is costed to a model and an effort. The routing table in PLAN.md §6.2 decides who takes an encounter. Click a name for the brief.</p>
    <div id="party-body"></div>
  </section>

  <section id="ledger" class="panel" aria-labelledby="ledger-title">
    <h2 class="panel__title" id="ledger-title">Ledger</h2>
    <p class="panel__ctx">Every fast-gate failure lands here as one line. At three of a kind the retro proposes a rule. A promoted rule is a level gained.</p>
    <div id="ledger-body"></div>
  </section>

  <footer class="cic-foot"><p class="cic-foot__note" id="foot"></p></footer>
</main>`;
  return shell({ roomId: 'index', title: 'Console', main, island, script: true, sub: 'command console · rendered from docs/factory' });
}

const GLYPH = { done: ['●', 'won'], next: ['◐', 'next'], open: ['○', 'open'], blocked: ['◇', 'blocked'] };

function issueState(issue, model) {
  if (issue.status === 'done') return 'done';
  if (model.next && model.next.n === issue.n) return 'next';
  const done = new Set(model.issues.filter((i) => i.status === 'done').map((i) => i.n));
  return issue.dependsOn.every((d) => done.has(d)) ? 'open' : 'blocked';
}

export function renderQuests(model, issueFiles, known = new Set()) {
  const byN = new Map(issueFiles.map((f) => [f.name, f.content]));
  const groups = [...model.milestones.map((m) => ({ name: m.name, issues: m.issues, main: model.mainQuest && m.name === model.mainQuest.name })),
    { name: 'Side quests', issues: model.issues.filter((i) => ['Side', 'Post-M6'].includes(i.milestone)), main: false }];
  const sections = groups.filter((g) => g.issues.length).map((g) => {
    const cards = g.issues.map((i) => {
      const s = issueState(i, model);
      const { body } = splitFrontmatter(byN.get(i.file) ?? '');
      const html = md(body, { codeLink: makeCodeLink(known, '') }).html;
      const meta = [`${GLYPH[s][1]}`, i.agent ? `${i.agent} / ${i.model} / ${i.effort}` : null, i.dependsOn.length ? `after ${i.dependsOn.map((d) => '#' + String(d).padStart(2, '0')).join(', ')}` : 'no dependencies', i.checkpoint != null ? `checkpoint ${i.checkpoint}` : null, i.commit ? `commit ${i.commit}` : null].filter(Boolean).join(' · ');
      return `<details class="quest-card quest-card--${s}" id="issue-${String(i.n).padStart(2, '0')}"${s === 'next' ? ' open' : ''}>
  <summary><span class="enc__glyph">${GLYPH[s][0]}</span><span class="enc__n mono">#${String(i.n).padStart(2, '0')}</span><span class="quest-card__title">${escapeHtml(i.title)}</span><span class="enc__meta">${escapeHtml(meta)}</span></summary>
  <div class="prose quest-card__body">${html}</div>
</details>`;
    }).join('\n');
    return `<section class="panel${g.main ? ' quest-panel--main' : ''}"><h2 class="panel__title">${g.main ? 'Main quest · ' : ''}${escapeHtml(g.name)}</h2>${cards}</section>`;
  }).join('\n');
  const main = `<main id="main" class="room">
  <p class="altitude__band">Quests · ${model.totals.done} of ${model.totals.issues} encounters won</p>
  <h1 class="headline">Quest list</h1>
  <p class="lede">Every issue file, whole. The one marked next is open by default. An encounter is won when its work commit and its close commit both exist; the issue file records the hash.</p>
  ${sections}
  <footer class="cic-foot"><p class="cic-foot__note">Rendered ${escapeHtml(model.generated)} from docs/factory/issues. The files are the truth.</p></footer>
</main>`;
  return shell({ roomId: 'quests', title: 'Quests', main, sub: 'quest list · docs/factory/issues' });
}

function toc(headings) {
  const hs = headings.filter((h) => h.level >= 2 && h.level <= 3);
  if (hs.length < 2) return '';
  return `<nav class="toc" aria-label="On this page"><p class="toc__label">On this page</p><ol>${hs.map((h) => `<li class="toc__l${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></nav>`;
}

/** Backtick paths like `docs/factory/SPEC.md` link to the rendered page when the file is in the library. */
function makeCodeLink(known, prefix) {
  return (text) => {
    const p = text.trim().replace(/^\.\//, '');
    return known.has(p) ? prefix + docHref(p) : null;
  };
}

/** Rewrite relative .md links to rendered pages when the target is in the library. */
function makeLinkMap(known, fromPath) {
  return (href) => {
    if (/^(https?:|#|mailto:)/.test(href)) return href;
    const [p, hash] = href.split('#');
    if (!p) return href;
    const base = fromPath.split('/').slice(0, -1);
    const parts = [...base];
    for (const seg of p.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
    const target = parts.join('/');
    if (known.has(target)) return '../' + docHref(target) + (hash ? '#' + hash : '');
    return '../../../' + target;
  };
}

export function renderDoc(doc, model, known) {
  const { front, body } = splitFrontmatter(doc.content);
  const title = titleOf(doc.content, doc.path.split('/').pop());
  const r = md(body, { linkMap: makeLinkMap(known, doc.path), codeLink: makeCodeLink(known, '../') });
  const frontHtml = front ? `<pre class="front" data-lang="frontmatter"><code>${escapeHtml(front)}</code></pre>` : '';
  const main = `<main id="main" class="room room--doc">
  <p class="altitude__band">Library · ${escapeHtml(doc.path)}</p>
  <div class="doc">
    <article class="prose">${frontHtml}${r.html}</article>
    <aside class="doc__aside">${toc(r.headings)}<p class="muted">Source: <code>${escapeHtml(doc.path)}</code>. Edit the file, then regenerate. <a href="../library.html">Back to the library</a>.</p></aside>
  </div>
  <footer class="cic-foot"><p class="cic-foot__note">Rendered ${escapeHtml(model.generated)}.</p></footer>
</main>`;
  return shell({ roomId: 'library', title, main, depth: 1, sub: 'library · ' + doc.path });
}

export function renderLibrary(model, library, artefacts) {
  const groups = library.map((g) => `<section class="panel"><h2 class="panel__title">${escapeHtml(g.group)}</h2><p class="panel__ctx">${escapeHtml(g.blurb)}</p>
  ${g.docs.length ? '<ul class="lib">' + g.docs.map((d) => `<li><a href="${docHref(d.path)}">${escapeHtml(titleOf(d.content, d.path.split('/').pop()))}</a><span class="lib__path mono">${escapeHtml(d.path)}</span></li>`).join('') + '</ul>' : '<p class="empty">Nothing here yet.</p>'}
</section>`).join('\n');
  const art = artefacts.length ? `<section class="panel"><h2 class="panel__title">Artefacts</h2><p class="panel__ctx">Pages and files that are not Markdown.</p><ul class="lib">${artefacts.map((a) => `<li><a href="../../../${escapeHtml(a.path)}">${escapeHtml(a.title)}</a><span class="lib__path mono">${escapeHtml(a.path)}</span><span class="lib__blurb">${escapeHtml(a.blurb)}</span></li>`).join('')}</ul></section>` : '';
  const main = `<main id="main" class="room">
  <p class="altitude__band">Library · the second brain</p>
  <h1 class="headline">Library</h1>
  <p class="lede">Every project document, rendered from the repository. If a page here and the file disagree, the file is right and the page is stale: regenerate.</p>
  ${groups}
  ${art}
  <footer class="cic-foot"><p class="cic-foot__note">Rendered ${escapeHtml(model.generated)}.</p></footer>
</main>`;
  return shell({ roomId: 'library', title: 'Library', main, sub: 'library · every document' });
}

export function renderRoomFromDoc(roomId, doc, model, known, { band, lede }) {
  const { body } = splitFrontmatter(doc.content);
  const r = md(body, { linkMap: (h) => makeLinkMap(known, doc.path)(h).replace(/^\.\.\//, ''), codeLink: makeCodeLink(known, '') });
  const title = titleOf(doc.content, roomId);
  const main = `<main id="main" class="room room--doc">
  <p class="altitude__band">${escapeHtml(band)}</p>
  <div class="doc">
    <article class="prose">${r.html.replace(/^<h1[^>]*>.*?<\/h1>\n?/, `<h1 class="headline">${escapeHtml(title)}</h1><p class="lede">${escapeHtml(lede)}</p>`)}</article>
    <aside class="doc__aside">${toc(r.headings)}<p class="muted">Source: <code>${escapeHtml(doc.path)}</code>.</p></aside>
  </div>
  <footer class="cic-foot"><p class="cic-foot__note">Rendered ${escapeHtml(model.generated)}.</p></footer>
</main>`;
  return shell({ roomId, title, main, sub: roomId + ' · ' + doc.path });
}

export { slug };
