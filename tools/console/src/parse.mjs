// SPDX-License-Identifier: MPL-2.0
// Pure parsers. No IO. Tested by test/run.mjs.

/** Parse a YAML-ish frontmatter block of scalars and simple [a, b] lists. */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v === '' || v === 'null' || v === '~') v = null;
    else if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).map(coerce);
    else v = coerce(v);
    out[kv[1]] = v;
  }
  return out;
}

function coerce(v) {
  if (/^"(.*)"$/.test(v)) return v.slice(1, -1);
  if (/^'(.*)'$/.test(v)) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/** files: [{name, content}] → issues sorted by number. */
export function parseIssues(files) {
  const issues = [];
  for (const f of files) {
    if (!/^\d+-.*\.md$/.test(f.name) || /-test-cases\.md$/.test(f.name)) continue;
    const fm = parseFrontmatter(f.content);
    if (!fm || fm.issue == null) continue;
    const what = /## What\r?\n+([\s\S]*?)(?:\r?\n## |\s*$)/.exec(f.content);
    const done = [...f.content.matchAll(/^- \[( |x)\] /gm)];
    issues.push({
      n: Number(fm.issue),
      file: f.name,
      title: String(fm.title ?? ''),
      milestone: String(fm.milestone ?? ''),
      status: fm.status === 'done' ? 'done' : fm.status === 'in-progress' ? 'in-progress' : 'open',
      worktree: fm.worktree ?? null,
      dependsOn: Array.isArray(fm.depends_on) ? fm.depends_on.map(Number) : [],
      agent: fm.agent ?? null,
      agents: Array.isArray(fm.agents) ? fm.agents : fm.agent ? [fm.agent] : [],
      model: fm.model ?? null,
      effort: fm.effort ?? null,
      checkpoint: fm.checkpoint ?? null,
      commit: fm.commit ?? null,
      what: what ? what[1].trim().split(/\r?\n/)[0] : '',
      doneWhen: { total: done.length, ticked: done.filter((d) => d[1] === 'x').length },
    });
  }
  issues.sort((a, b) => a.n - b.n);
  return issues;
}

const SIDE = new Set(['Side', 'Post-M6']);

/** The same rule /factory-status uses: lowest open issue whose dependencies are all done. */
export function nextIssue(issues) {
  const done = new Set(issues.filter((i) => i.status === 'done').map((i) => i.n));
  return issues.find((i) => i.status === 'open' && !SIDE.has(i.milestone) && i.dependsOn.every((d) => done.has(d))) ?? null;
}

export function lastCompleted(issues) {
  const done = issues.filter((i) => i.status === 'done');
  return done.length ? done[done.length - 1] : null;
}

/** Group main-quest issues by milestone, in first-seen order. */
export function milestones(issues) {
  const order = [];
  const by = new Map();
  for (const i of issues) {
    if (SIDE.has(i.milestone)) continue;
    if (!by.has(i.milestone)) { by.set(i.milestone, []); order.push(i.milestone); }
    by.get(i.milestone).push(i);
  }
  return order.map((name) => {
    const list = by.get(name);
    const won = list.filter((i) => i.status === 'done').length;
    return { name, total: list.length, won, issues: list };
  });
}

export function sideQuests(issues) {
  const done = new Set(issues.filter((i) => i.status === 'done').map((i) => i.n));
  return issues.filter((i) => SIDE.has(i.milestone) && i.status === 'open' && i.dependsOn.every((d) => done.has(d)));
}

/** lessons.jsonl text → {total, bySig: [{sig, count, last}], ripe: [sig...]} */
export function parseLessons(text) {
  const by = new Map();
  let total = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    total += 1;
    const cur = by.get(o.sig) ?? { sig: o.sig, count: 0, last: '' };
    cur.count += 1;
    if (String(o.ts ?? '') > cur.last) cur.last = String(o.ts ?? '');
    by.set(o.sig, cur);
  }
  const bySig = [...by.values()].sort((a, b) => b.count - a.count);
  return { total, bySig, ripe: bySig.filter((s) => s.count >= 3).map((s) => s.sig) };
}

/** agent files [{name, content}] → party roster. */
export function parseAgents(files) {
  return files
    .filter((f) => /\.md$/.test(f.name))
    .map((f) => {
      const fm = parseFrontmatter(f.content) ?? {};
      return { name: String(fm.name ?? f.name.replace(/\.md$/, '')), model: fm.model ?? '?', effort: fm.effort ?? '?', role: String(fm.description ?? '').split(/\.\s/)[0] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** test-cases companions [{name, content}] → count of rows with review: pending. */
export function pendingReviews(files) {
  let n = 0;
  const where = [];
  for (const f of files) {
    if (!/-test-cases\.md$/.test(f.name)) continue;
    const c = (f.content.match(/review:\s*pending/g) ?? []).length;
    if (c) { n += c; where.push({ file: f.name, count: c }); }
  }
  return { count: n, where };
}

/** Pick one side task under ten minutes that only the owner can do. */
export function sideTask({ issues, lessons, reviews }) {
  const cp = issues.find((i) => i.status === 'open' && i.checkpoint != null && i.doneWhen.ticked > 0);
  if (reviews.count > 0) return { kind: 'review', text: `Review ${reviews.count} pending test sentence${reviews.count === 1 ? '' : 's'} in ${reviews.where[0].file}.`, command: null };
  if (lessons.ripe.length > 0) return { kind: 'retro', text: `Signature "${lessons.ripe[0]}" has reached three failures. Approve or decline its rule.`, command: '/factory-retro' };
  if (cp) return { kind: 'checkpoint', text: `Checkpoint ${cp.checkpoint} on #${pad(cp.n)} is waiting for your read.`, command: `/factory-run ${pad(cp.n)}` };
  return { kind: 'none', text: 'No side task under ten minutes is open.', command: null };
}

export function pad(n) { return String(n).padStart(2, '0'); }

/** `git worktree list --porcelain` text → [{path, head, branch, detached}]. One block per tree,
 * blocks separated by a blank line. `path` is whatever git printed (absolute). */
export function parseWorktreePorcelain(text) {
  return String(text ?? '')
    .split(/\r?\n\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const out = { path: '', head: '', branch: null, detached: false };
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) out.path = line.slice('worktree '.length).trim();
        else if (line.startsWith('HEAD ')) out.head = line.slice('HEAD '.length).trim().slice(0, 7);
        else if (line.startsWith('branch ')) out.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
        else if (line === 'detached') out.detached = true;
      }
      return out;
    });
}

/** Assemble the whole model. */
export function buildModel({ issueFiles, agentFiles, lessonsText, git, stamp, generated, worktrees = [] }) {
  const issues = parseIssues(issueFiles);
  const next = nextIssue(issues);
  const lessons = parseLessons(lessonsText);
  const reviews = pendingReviews(issueFiles);
  const ms = milestones(issues);
  const main = ms.find((m) => m.won < m.total) ?? ms[ms.length - 1] ?? null;
  return {
    generated,
    git,
    stamp,
    worktrees,
    issues,
    milestones: ms,
    mainQuest: main,
    sideQuests: sideQuests(issues),
    party: parseAgents(agentFiles),
    lessons,
    reviews,
    next: next ? { n: next.n, title: next.title, agent: next.agent, model: next.model, effort: next.effort, command: `/factory-run ${pad(next.n)}` } : null,
    last: lastCompleted(issues),
    sideTask: sideTask({ issues, lessons, reviews }),
    totals: { issues: issues.length, done: issues.filter((i) => i.status === 'done').length },
  };
}
