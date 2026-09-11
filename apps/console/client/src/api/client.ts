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
};
