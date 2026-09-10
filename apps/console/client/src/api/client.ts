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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  state: () => getJson<StateModel>('/api/state'),
  issues: () => getJson<Issue[]>('/api/issues'),
  issue: (n: number) => getJson<IssueDetail>(`/api/issues/${String(n).padStart(2, '0')}`),
  doc: (path: string) => getJson<DocPage>(`/api/docs/${path}`),
  library: () => getJson<LibraryGroup[]>('/api/library'),
  worktrees: () => getJson<WorktreeSummary[]>('/api/worktrees'),
  ledger: () => getJson<{ lessons: StateModel['lessons']; reviews: StateModel['reviews'] }>('/api/ledger'),
};
