// SPDX-License-Identifier: MPL-2.0
// Typed fetch wrappers over the Fastify API (apps/console/server). TanStack Query owns caching
// and refetching; these functions are the query functions it calls.

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
  githubIssue: number | null;
}

export interface IssueDetail extends Issue {
  content: string;
}

export interface Milestone {
  name: string;
  total: number;
  won: number;
  issues: Issue[];
}

export interface StateModel {
  generated: string;
  git: { head: string; branch: string; dirty: number; remote: string };
  stamp: { present: boolean; matches: boolean };
  worktrees: WorktreeSummary[];
  issues: Issue[];
  milestones: Milestone[];
  mainQuest: Milestone | null;
  sideQuests: Issue[];
  party: { name: string; model: string; effort: string; role: string }[];
  lessons: { total: number; bySig: { sig: string; count: number; last: string }[]; ripe: string[] };
  reviews: { count: number; where: { file: string; count: number }[] };
  next: { n: number; title: string; agent: string | null; model: string | null; effort: string | null; command: string } | null;
  last: Issue | null;
  inProgress: { n: number; title: string; agent: string | null; model: string | null; effort: string | null; tree: string | null }[];
  sideTask: { kind: string; text: string; command: string | null };
  totals: { issues: number; done: number };
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

export interface EventItem {
  n: number;
  title: string;
  commit: unknown;
}

export interface GithubStatus {
  reachable: boolean;
}

// The atlas (ADR 0015, issue 177): docs/factory/map.yaml, painted with each tile's state already
// decided server-side (model/atlas.ts) -- the client never computes a state, only renders one.
export type TileState = 'lit' | 'cleared-for-jump' | 'contact';

export interface AtlasRegion {
  id: string;
  name: string;
  goal: string;
  x: number;
  y: number;
  size: number;
  fogged: boolean;
}

export interface AtlasTile {
  id: string;
  region: string;
  title: string;
  x: number;
  y: number;
  size: number;
  issueN: number;
  state: TileState;
}

export interface Atlas {
  regions: AtlasRegion[];
  tiles: AtlasTile[];
  githubReachable: boolean;
}

export interface DocPage {
  path: string;
  title: string;
  html: string;
  headings: { level: number; text: string; id: string }[];
}

export interface LibraryGroup {
  group: string;
  blurb: string;
  docs: string[];
}

export interface AgentDetail {
  name: string;
  description: string;
  model: string;
  effort: string;
  tools: string[];
  color: string | null;
}

export interface SkillDoc {
  name: string;
  description: string;
  argumentHint: string | null;
}

export interface CommandDoc {
  name: string;
  description: string;
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

export interface PlaybookStation {
  name: string;
}

export interface ShipSystemsModel {
  generated: string;
  agents: AgentDetail[];
  skills: SkillDoc[];
  commands: CommandDoc[];
  hooks: HooksCrossReference;
  playbookLane: PlaybookStation[];
}

export interface CodexIntelItem {
  kind: 'adr' | 'glossary';
  text: string;
  href: string;
}

export interface Codex {
  n: number;
  title: string;
  objective: string;
  intel: CodexIntelItem[];
  loadout: { agent: string | null; model: string | null; effort: string | null; checkpoint: unknown };
  orders: { acceptanceCriteria: string; notInScope: string };
  afterAction: { doneWhen: { total: number; ticked: number }; commit: unknown; verifier: string | null };
}

export interface DebriefGroup {
  sig: string;
  count: number;
  last: string;
  detail: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'killed';

export interface JobSummary {
  id: string;
  kind: string;
  tree: string;
  args: Record<string, unknown>;
  status: JobStatus;
  exitCode: number | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  queuedReason: string | null;
}

export interface JobLine {
  stream: 'stdout' | 'stderr' | 'meta';
  text: string;
  ts: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${url}: ${res.status}`);
  return json as T;
}

export const api = {
  state: () => getJson<StateModel>('/api/state'),
  issues: () => getJson<Issue[]>('/api/issues'),
  issue: (n: number) => getJson<IssueDetail>(`/api/issues/${String(n).padStart(2, '0')}`),
  doc: (path: string) => getJson<DocPage>(`/api/docs/${path}`),
  library: () => getJson<LibraryGroup[]>('/api/library'),
  worktrees: () => getJson<WorktreeSummary[]>('/api/worktrees'),
  ledger: () => getJson<{ lessons: StateModel['lessons']; reviews: StateModel['reviews'] }>('/api/ledger'),
  events: () => getJson<EventItem[]>('/api/events'),
  shipSystems: () => getJson<ShipSystemsModel>('/api/ship-systems'),
  codex: (n: number) => getJson<Codex>(`/api/codex/${String(n).padStart(2, '0')}`),
  debrief: () => getJson<DebriefGroup[]>('/api/debrief'),
  githubStatus: () => getJson<GithubStatus>('/api/github-status'),
  atlas: () => getJson<Atlas>('/api/atlas'),
  jobs: {
    list: () => getJson<JobSummary[]>('/api/jobs'),
    get: (id: string) => getJson<JobSummary>(`/api/jobs/${id}`),
    create: (kind: string, tree: string, args: Record<string, unknown> = {}) =>
      postJson<{ id: string }>('/api/jobs', { kind, tree, args }),
    kill: async (id: string) => {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`kill ${id}: ${res.status}`);
    },
  },
  open: async (what: string, params: Record<string, string | number> = {}): Promise<string> => {
    const qs = new URLSearchParams({ what, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const { url } = await getJson<{ url: string }>(`/api/open?${qs.toString()}`);
    return url;
  },
  // POST /api/restart (issue 162). A 202 body carries the new process's pid, for the record only;
  // a non-2xx body carries `error` -- either "refused" (a job is running) or the rebuild's own
  // output (a syntax error in server/src), and `postJson` already turns that into a thrown Error.
  restart: () => postJson<{ ok: true; pid: number }>('/api/restart', {}),
  // GET /health as text ("ok <pid>"), for the client-side poll that waits for a new pid to answer
  // after a restart. Rejects on any non-2xx or network failure -- the expected shape while the
  // old process has exited and the new one has not bound yet.
  health: async (): Promise<{ pid: number }> => {
    const res = await fetch('/health');
    if (!res.ok) throw new Error(`/health: ${res.status}`);
    const text = await res.text();
    const pid = Number(text.trim().split(/\s+/)[1]);
    return { pid: Number.isFinite(pid) ? pid : -1 };
  },
};
