// SPDX-License-Identifier: MPL-2.0
// Pure parsers, ported from tools/console/src/parse.mjs. No IO. Tested by server/test/*.
// Kept in step with the .mjs originals by hand; the .mjs files remain the source for the
// file-based console (tools/console/) and are not imported here (ADR: the console is an app).

export interface DocFile {
  name: string;
  content: string;
}

/** A library document, addressed by its repo-relative path rather than a bare file name (the
 * library walks whole directory trees, so two documents can share a name). */
export interface LibDoc {
  path: string;
  content: string;
}

export type Frontmatter = Record<string, unknown>;

/** Parse a YAML-ish frontmatter block of scalars and simple [a, b] lists. */
export function parseFrontmatter(text: string): Frontmatter | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out: Frontmatter = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v: unknown = kv[2].trim();
    if (v === '' || v === 'null' || v === '~') v = null;
    else if (/^\[.*\]$/.test(v as string))
      v = (v as string)
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(coerce);
    else v = coerce(v as string);
    out[kv[1]] = v;
  }
  return out;
}

function coerce(v: string): unknown {
  if (/^"(.*)"$/.test(v)) return v.slice(1, -1);
  if (/^'(.*)'$/.test(v)) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

export interface Issue {
  n: number;
  file: string;
  title: string;
  milestone: string;
  status: 'done' | 'in-progress' | 'open';
  worktree: string | null;
  dependsOn: number[];
  agent: string | null;
  agents: string[];
  model: string | null;
  effort: string | null;
  checkpoint: unknown;
  commit: unknown;
  what: string;
  doneWhen: { total: number; ticked: number };
}

/** files: [{name, content}] -> issues sorted by number. */
export function parseIssues(files: DocFile[]): Issue[] {
  const issues: Issue[] = [];
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
      worktree: (fm.worktree as string) ?? null,
      dependsOn: Array.isArray(fm.depends_on) ? (fm.depends_on as unknown[]).map(Number) : [],
      agent: (fm.agent as string) ?? null,
      agents: Array.isArray(fm.agents) ? (fm.agents as string[]) : fm.agent ? [fm.agent as string] : [],
      model: (fm.model as string) ?? null,
      effort: (fm.effort as string) ?? null,
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
export function nextIssue(issues: Issue[]): Issue | null {
  const done = new Set(issues.filter((i) => i.status === 'done').map((i) => i.n));
  return issues.find((i) => i.status === 'open' && !SIDE.has(i.milestone) && i.dependsOn.every((d) => done.has(d))) ?? null;
}

export function lastCompleted(issues: Issue[]): Issue | null {
  const done = issues.filter((i) => i.status === 'done');
  return done.length ? done[done.length - 1] : null;
}

export interface Milestone {
  name: string;
  total: number;
  won: number;
  issues: Issue[];
}

/** Group main-quest issues by milestone, in first-seen order. */
export function milestones(issues: Issue[]): Milestone[] {
  const order: string[] = [];
  const by = new Map<string, Issue[]>();
  for (const i of issues) {
    if (SIDE.has(i.milestone)) continue;
    if (!by.has(i.milestone)) {
      by.set(i.milestone, []);
      order.push(i.milestone);
    }
    by.get(i.milestone)!.push(i);
  }
  return order.map((name) => {
    const list = by.get(name)!;
    const won = list.filter((i) => i.status === 'done').length;
    return { name, total: list.length, won, issues: list };
  });
}

export function sideQuests(issues: Issue[]): Issue[] {
  const done = new Set(issues.filter((i) => i.status === 'done').map((i) => i.n));
  return issues.filter((i) => SIDE.has(i.milestone) && i.status === 'open' && i.dependsOn.every((d) => done.has(d)));
}

export interface LessonsSummary {
  total: number;
  bySig: { sig: string; count: number; last: string }[];
  ripe: string[];
}

/** lessons.jsonl text -> {total, bySig: [{sig, count, last}], ripe: [sig...]} */
export function parseLessons(text: string): LessonsSummary {
  const by = new Map<string, { sig: string; count: number; last: string }>();
  let total = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    total += 1;
    const cur = by.get(o.sig) ?? { sig: o.sig, count: 0, last: '' };
    cur.count += 1;
    if (String(o.ts ?? '') > cur.last) cur.last = String(o.ts ?? '');
    by.set(o.sig, cur);
  }
  const bySig = [...by.values()].sort((a, b) => b.count - a.count);
  return { total, bySig, ripe: bySig.filter((s) => s.count >= 3).map((s) => s.sig) };
}

export interface PartyMember {
  name: string;
  model: string;
  effort: string;
  role: string;
}

/** agent files [{name, content}] -> party roster. */
export function parseAgents(files: DocFile[]): PartyMember[] {
  return files
    .filter((f) => /\.md$/.test(f.name))
    .map((f) => {
      const fm = parseFrontmatter(f.content) ?? {};
      return {
        name: String(fm.name ?? f.name.replace(/\.md$/, '')),
        model: String(fm.model ?? '?'),
        effort: String(fm.effort ?? '?'),
        role: String(fm.description ?? '').split(/\.\s/)[0],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface Reviews {
  count: number;
  where: { file: string; count: number }[];
}

/** test-cases companions [{name, content}] -> count of rows with review: pending. */
export function pendingReviews(files: DocFile[]): Reviews {
  let n = 0;
  const where: { file: string; count: number }[] = [];
  for (const f of files) {
    if (!/-test-cases\.md$/.test(f.name)) continue;
    const c = (f.content.match(/review:\s*pending/g) ?? []).length;
    if (c) {
      n += c;
      where.push({ file: f.name, count: c });
    }
  }
  return { count: n, where };
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export interface SideTask {
  kind: 'review' | 'retro' | 'checkpoint' | 'none';
  text: string;
  command: string | null;
}

/** Pick one side task under ten minutes that only the owner can do. */
export function sideTask({ issues, lessons, reviews }: { issues: Issue[]; lessons: LessonsSummary; reviews: Reviews }): SideTask {
  const cp = issues.find((i) => i.status === 'open' && i.checkpoint != null && i.doneWhen.ticked > 0);
  if (reviews.count > 0)
    return {
      kind: 'review',
      text: `Review ${reviews.count} pending test sentence${reviews.count === 1 ? '' : 's'} in ${reviews.where[0].file}.`,
      command: null,
    };
  if (lessons.ripe.length > 0)
    return { kind: 'retro', text: `Signature "${lessons.ripe[0]}" has reached three failures. Approve or decline its rule.`, command: '/factory-retro' };
  if (cp) return { kind: 'checkpoint', text: `Checkpoint ${cp.checkpoint} on #${pad(cp.n)} is waiting for your read.`, command: `/factory-run ${pad(cp.n)}` };
  return { kind: 'none', text: 'No side task under ten minutes is open.', command: null };
}

export interface WorktreeRow {
  path: string;
  head: string;
  branch: string | null;
  detached: boolean;
}

/** `git worktree list --porcelain` text -> [{path, head, branch, detached}]. */
export function parseWorktreePorcelain(text: string): WorktreeRow[] {
  return String(text ?? '')
    .split(/\r?\n\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const out: WorktreeRow = { path: '', head: '', branch: null, detached: false };
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) out.path = line.slice('worktree '.length).trim();
        else if (line.startsWith('HEAD ')) out.head = line.slice('HEAD '.length).trim().slice(0, 7);
        else if (line.startsWith('branch ')) out.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
        else if (line === 'detached') out.detached = true;
      }
      return out;
    });
}

export interface GitInfo {
  head: string;
  branch: string;
  dirty: number;
  remote: string;
}

export interface StampInfo {
  present: boolean;
  matches: boolean;
}

export interface WorktreeSummary {
  path: string;
  branch: string | null;
  detached: boolean;
  head: string;
  isRoot: boolean;
  dirty: number;
  stampMatches: boolean;
  issue: { n: number; title: string } | null;
}

export interface RepoModel {
  issueFiles: DocFile[];
  agentFiles: DocFile[];
  lessonsText: string;
  library: { group: string; blurb: string; docs: LibDoc[] }[];
  artefacts: { title: string; path: string; blurb: string }[];
  git: GitInfo;
  stamp: StampInfo;
  worktrees: WorktreeSummary[];
  generated: string;
}

export interface BuiltModel {
  generated: string;
  git: GitInfo;
  stamp: StampInfo;
  worktrees: WorktreeSummary[];
  issues: Issue[];
  milestones: Milestone[];
  mainQuest: Milestone | null;
  sideQuests: Issue[];
  party: PartyMember[];
  lessons: LessonsSummary;
  reviews: Reviews;
  next: { n: number; title: string; agent: string | null; model: string | null; effort: string | null; command: string } | null;
  last: Issue | null;
  sideTask: SideTask;
  totals: { issues: number; done: number };
}

/** Assemble the whole model, the same shape tools/console/src/parse.mjs's buildModel produces. */
export function buildModel(repo: Pick<RepoModel, 'issueFiles' | 'agentFiles' | 'lessonsText' | 'git' | 'stamp' | 'generated'> & { worktrees?: WorktreeSummary[] }): BuiltModel {
  const { issueFiles, agentFiles, lessonsText, git, stamp, generated, worktrees = [] } = repo;
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
