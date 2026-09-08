// SPDX-License-Identifier: MPL-2.0
// A small Markdown renderer for the project's own documents. Escapes everything first, then
// recognises: frontmatter (stripped, returned), headings, paragraphs, bullet and numbered lists
// (nested by two spaces), tables, fenced code, blockquotes, rules, bold, italics, inline code,
// links. Enough for this repo; not a general renderer.

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function slug(text) {
  return String(text).toLowerCase().replace(/`/g, '').replace(/[^a-z0-9À-ɏ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section';
}

/** Split off frontmatter. Returns {front: string|null, body}. */
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? { front: m[1], body: text.slice(m[0].length) } : { front: null, body: text };
}

function inline(s, linkMap, codeLink) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, (_, c) => {
    const href = codeLink ? codeLink(c) : null;
    return href ? `<a class="code-link" href="${escapeHtml(href)}"><code>${c}</code></a>` : `<code>${c}</code>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    const h = linkMap ? linkMap(href) : href;
    const safe = /^(https?:|mailto:|#|\.\.?\/|[\w.-])/.test(h) && !/^[a-z]+:/i.test(h.replace(/^(https?|mailto):/, '')) ? h : '#';
    return `<a href="${escapeHtml(safe)}">${t}</a>`;
  });
  return out;
}

/** Render Markdown body → {html, headings:[{level,text,id}]} */
export function render(md, { linkMap, codeLink } = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const ids = new Map();
  let i = 0;

  const uniq = (base) => { const n = (ids.get(base) ?? 0) + 1; ids.set(base, n); return n === 1 ? base : `${base}-${n}`; };

  function para(buf) { if (buf.length) { out.push(`<p>${inline(buf.join(' '), linkMap, codeLink)}</p>`); buf.length = 0; } }

  function list(startIndent) {
    // Parses a list starting at lines[i]. Returns when indentation drops below startIndent.
    const ordered = /^\s*\d+[.)]\s/.test(lines[i]);
    out.push(ordered ? '<ol>' : '<ul>');
    while (i < lines.length) {
      const m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
      if (!m || m[1].length < startIndent) break;
      if (m[1].length > startIndent) { list(m[1].length); continue; }
      const item = m[3];
      let text = item;
      const task = /^\[( |x)\]\s+(.*)$/.exec(item);
      if (task) text = `<span class="task task--${task[1] === 'x' ? 'done' : 'open'}">${task[1] === 'x' ? '●' : '○'}</span> ${task[2]}`;
      i += 1;
      // continuation lines (indented, not a new item)
      const cont = [];
      while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s*([-*]|\d+[.)])\s/.exec(lines[i])) { cont.push(lines[i].trim()); i += 1; }
      const body = task ? text.replace(task[2], inline(task[2], linkMap, codeLink)) : inline([text, ...cont].join(' '), linkMap, codeLink);
      if (i < lines.length && /^(\s*)([-*]|\d+[.)])\s/.test(lines[i]) && /^(\s*)/.exec(lines[i])[1].length > startIndent) {
        out.push(`<li>${body}`); list(/^(\s*)/.exec(lines[i])[1].length); out.push('</li>');
      } else out.push(`<li>${body}</li>`);
    }
    out.push(ordered ? '</ol>' : '</ul>');
  }

  const buf = [];
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { para(buf); i += 1; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      para(buf);
      const level = m[1].length; const text = m[2]; const id = uniq(slug(text));
      headings.push({ level, text: text.replace(/`/g, ''), id });
      out.push(`<h${level} id="${id}">${inline(text, linkMap, codeLink)}</h${level}>`); i += 1; continue;
    }
    if (/^```/.test(line)) {
      para(buf); const lang = line.slice(3).trim(); const code = [];
      i += 1; while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1; out.push(`<pre${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(code.join('\n'))}</code></pre>`); continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { para(buf); out.push('<hr>'); i += 1; continue; }
    if (/^>/.test(line)) {
      para(buf); const q = [];
      while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      const inner = render(q.join('\n'), { linkMap, codeLink }).html; out.push(`<blockquote>${inner}</blockquote>`); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      para(buf);
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      out.push('<div class="tablewrap"><table><thead><tr>' + head.map((h) => `<th>${inline(h, linkMap, codeLink)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c, linkMap, codeLink)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) { para(buf); list(/^(\s*)/.exec(line)[1].length); continue; }
    if (/^<!--/.test(line)) { while (i < lines.length && !/-->/.test(lines[i])) i += 1; i += 1; continue; }
    buf.push(line.trim()); i += 1;
  }
  para(buf);
  return { html: out.join('\n'), headings };
}

/** Title of a document: first H1, else the file name. */
export function titleOf(md, fallback) {
  const { body } = splitFrontmatter(md);
  const m = /^#\s+(.+?)\s*$/m.exec(body);
  return m ? m[1].replace(/`/g, '') : fallback;
}
