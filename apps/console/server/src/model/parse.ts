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
  /** The mirrored GitHub issue number (SPEC.md §6, `tools/factory/mirror_github.py`), or null
   * before the first mirror run writes it back. Read here only so the client can build the
   * `issue` opener's URL (issue 100) without re-parsing frontmatter itself. */
  githubIssue: number | null;
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
      githubIssue: typeof fm.github_issue === 'number' ? fm.github_issue : null,
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

export interface InProgressItem {
  n: number;
  title: string;
  agent: string | null;
  model: string | null;
  effort: string | null;
  tree: string | null;
}

/** Every issue with `status: in-progress`, ordered by number, paired with the tree it runs in
 * (issue 110). The issue file decides what is in flight (issue 112): every in-progress issue
 * appears, with no tree flag consulted and no git ancestry asked. `worktrees` (readWorktrees()'s
 * output) already carries, per tree, the one in-progress issue whose own `worktree:` field names
 * that tree (see `matchInProgressIssue`), read straight off that tree's own files on disk. When a
 * tree claims the issue this way, its name is shown; when none does — root's own copy says
 * in-progress, but no separate worktree exists for it, or the issue predates issue 110's
 * `worktree:` field — the quest still appears, with `tree: null`. */
export function inProgressQuests(issues: Issue[], worktrees: WorktreeSummary[]): InProgressItem[] {
  const out: InProgressItem[] = [];
  for (const i of issues) {
    if (i.status !== 'in-progress') continue;
    const live = worktrees.find((w) => w.issue && w.issue.n === i.n) ?? null;
    const tree = live ? (live.isRoot ? null : live.branch ?? live.path) : null;
    out.push({ n: i.n, title: i.title, agent: i.agent, model: i.model, effort: i.effort, tree });
  }
  return out;
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

export interface AgentDetail {
  name: string;
  description: string;
  model: string;
  effort: string;
  tools: string[];
  color: string | null;
}

/** agent files [{name, content}] -> full detail (issue 175's Ship systems room), every field the
 * Party panel's parseAgents trims away for its one-line card: the whole description, and the
 * tools list. Kept as its own function rather than widening PartyMember, so the Party panel's
 * one-clause role summary is untouched. */
export function parseAgentDetails(files: DocFile[]): AgentDetail[] {
  return files
    .filter((f) => /\.md$/.test(f.name))
    .map((f) => {
      const fm = parseFrontmatter(f.content) ?? {};
      const toolsRaw = fm.tools;
      const tools = Array.isArray(toolsRaw)
        ? toolsRaw.map(String)
        : typeof toolsRaw === 'string'
          ? toolsRaw.split(',').map((t) => t.trim()).filter(Boolean)
          : [];
      return {
        name: String(fm.name ?? f.name.replace(/\.md$/, '')),
        description: String(fm.description ?? ''),
        model: String(fm.model ?? '?'),
        effort: String(fm.effort ?? '?'),
        tools,
        color: (fm.color as string) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SkillDoc {
  name: string;
  description: string;
  argumentHint: string | null;
}

/** skill files [{name: "<dir>/SKILL.md", content}] -> one row per skill, name from the file's own
 * front matter, falling back to the directory name (the same fallback shape parseAgentDetails and
 * parseCommands use for a file that carries no `name:` field). `argument-hint` is a bracketed
 * phrase (`[issue-number] [--resume]`) -- `parseFrontmatter`'s generic `[a, b]`-list rule reads
 * any value shaped `[...]` as a list, not a special case for this one key, so the raw value can
 * come back as a one-item array here; both shapes are normalised to a single string. */
export function parseSkills(files: DocFile[]): SkillDoc[] {
  return files
    .filter((f) => /SKILL\.md$/.test(f.name))
    .map((f) => {
      const fm = parseFrontmatter(f.content) ?? {};
      const dirName = f.name.replace(/\/SKILL\.md$/, '');
      const hint = fm['argument-hint'];
      return {
        name: String(fm.name ?? dirName),
        description: String(fm.description ?? ''),
        argumentHint: hint == null ? null : Array.isArray(hint) ? hint.map(String).join(', ') : String(hint),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface CommandDoc {
  name: string;
  description: string;
}

/** command files [{name, content}] -> one row per command. `.claude/commands/*.md` front matter
 * carries no `name:` field (issue 175's brief), so the command's name is always the file name,
 * the way the owner types it (`/factory-status`, `/gate`). */
export function parseCommands(files: DocFile[]): CommandDoc[] {
  return files
    .filter((f) => /\.md$/.test(f.name))
    .map((f) => {
      const fm = parseFrontmatter(f.content) ?? {};
      return {
        name: f.name.replace(/\.md$/, ''),
        description: String(fm.description ?? ''),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface HookEventEntry {
  event: string;
  matcher: string | null;
  hooks: { command: string; file: string | null; exists: boolean }[];
}

export interface HookFileEntry {
  file: string;
  referencedByEvents: string[];
}

export interface HooksCrossReference {
  events: HookEventEntry[];
  files: HookFileEntry[];
}

const HOOK_FILE_RE = /\.claude\/hooks\/([^"'\s]+)/;

/** One command string from `.claude/settings.json` -> the hook file name it names, or null if the
 * command does not reference `.claude/hooks/` at all (a command is free-form shell, in principle;
 * every command this repo actually registers does name a file there, but this stays honest about
 * the pattern being read out of a string, not a structural guarantee). */
function hookFileOf(command: string): string | null {
  const m = HOOK_FILE_RE.exec(command);
  return m ? m[1] : null;
}

/** `.claude/settings.json` text -> `{event, matcher, commands}[]`, one row per matcher group
 * under one event. Malformed or missing JSON reads as no events registered, the same "visible
 * gap, not a crash" shape the rest of this parser family uses for a missing frontmatter block. */
function parseHookEvents(settingsJsonText: string): { event: string; matcher: string | null; commands: string[] }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(settingsJsonText);
  } catch {
    return [];
  }
  const hooks = (parsed as { hooks?: Record<string, unknown> } | null)?.hooks;
  if (!hooks || typeof hooks !== 'object') return [];
  const out: { event: string; matcher: string | null; commands: string[] }[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const g = group as { matcher?: string; hooks?: { command?: string }[] };
      const commands = Array.isArray(g.hooks) ? g.hooks.map((h) => String(h.command ?? '')).filter(Boolean) : [];
      out.push({ event, matcher: g.matcher ?? null, commands });
    }
  }
  return out;
}

/** `.claude/hooks/*` file names, cross-referenced against the hook events named in
 * `.claude/settings.json` (issue 175): every event names the hook file(s) it fires, flagged
 * `exists: false` when that file is not among `hookFileNames` (an event pointing at nothing); and
 * every hook file names the events that reference it, an empty list meaning the file sits in the
 * directory unreferenced by anything `settings.json` registers. Both directions are gaps this
 * function surfaces, never silently drops. */
export function crossReferenceHooks(hookFileNames: string[], settingsJsonText: string): HooksCrossReference {
  const known = new Set(hookFileNames);
  const rawEvents = parseHookEvents(settingsJsonText);
  const referencedBy = new Map<string, Set<string>>();
  const events: HookEventEntry[] = rawEvents.map(({ event, matcher, commands }) => {
    const hooks = commands.map((command) => {
      const file = hookFileOf(command);
      if (file) {
        if (!referencedBy.has(file)) referencedBy.set(file, new Set());
        referencedBy.get(file)!.add(event);
      }
      return { command, file, exists: file != null && known.has(file) };
    });
    return { event, matcher, hooks };
  });
  const files: HookFileEntry[] = hookFileNames
    .slice()
    .sort()
    .map((file) => ({ file, referencedByEvents: [...(referencedBy.get(file) ?? new Set())].sort() }));
  return { events, files };
}

export interface PlaybookStation {
  name: string;
}

/** `render()`'s own `##` headings, in file order -> the playbook lane's stations (issue 175):
 * station names come straight from the file, never hardcoded, so a heading renamed or reordered
 * in playbook.md moves the lane with it on the next load. */
export function playbookLane(headings: { level: number; text: string }[]): PlaybookStation[] {
  return headings.filter((h) => h.level === 2).map((h) => ({ name: h.text }));
}

export interface ShipSystemsModel {
  generated: string;
  agents: AgentDetail[];
  skills: SkillDoc[];
  commands: CommandDoc[];
  hooks: HooksCrossReference;
  playbookLane: PlaybookStation[];
}

/** Assembles the whole Ship systems room's model (issue 175) from the four folders it reads plus
 * the playbook's own headings, already rendered by model/markdown.ts's render() (so this stays a
 * pure function of already-read text, like buildModel()). */
export function buildShipSystems({
  agentFiles,
  skillFiles,
  commandFiles,
  hookFileNames,
  settingsJsonText,
  playbookHeadings,
  generated,
}: {
  agentFiles: DocFile[];
  skillFiles: DocFile[];
  commandFiles: DocFile[];
  hookFileNames: string[];
  settingsJsonText: string;
  playbookHeadings: { level: number; text: string }[];
  generated: string;
}): ShipSystemsModel {
  return {
    generated,
    agents: parseAgentDetails(agentFiles),
    skills: parseSkills(skillFiles),
    commands: parseCommands(commandFiles),
    hooks: crossReferenceHooks(hookFileNames, settingsJsonText),
    playbookLane: playbookLane(playbookHeadings),
  };
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

export interface EventItem {
  n: number;
  title: string;
  commit: unknown;
}

/** The last `limit` landed quests, newest first (issue 173's bridge, `GET /api/events`). `Issue`
 * carries no landing timestamp, so recency is read off the quest number, the same proxy
 * `QuestsRoom`'s own loot log uses client-side (issue 164's DESIGN.md) -- the backlog is numbered
 * in the order quests are filed and, in practice, in the order they land. The full `done` list is
 * sorted before it is ever sliced, so a caller can never see fewer than `limit` rows when more
 * exist (issue 173 acceptance criteria: "no client-side truncation bug"). */
export function lastEvents(issues: Issue[], limit = 5): EventItem[] {
  return issues
    .filter((i) => i.status === 'done')
    .slice()
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((i) => ({ n: i.n, title: i.title, commit: i.commit }));
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
  finished: boolean;
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
  // Ship systems (issue 175): the four folders the room reads, plus settings.json's raw text
  // (cross-referenced against hookFiles) and playbook.md's raw text (its `##` headings become the
  // lane's stations, read via model/markdown.ts's render() where this is used, not here -- this
  // module stays IO-free).
  skillFiles: DocFile[];
  commandFiles: DocFile[];
  hookFiles: DocFile[];
  settingsJsonText: string;
  playbookText: string;
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
  inProgress: InProgressItem[];
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
    inProgress: inProgressQuests(issues, worktrees),
    sideTask: sideTask({ issues, lessons, reviews }),
    totals: { issues: issues.length, done: issues.filter((i) => i.status === 'done').length },
  };
}
