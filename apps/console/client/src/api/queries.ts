// SPDX-License-Identifier: MPL-2.0
// Query-key wrappers, kept in one file so useChangeStream's SECTION_KEYS map stays true to what
// each room actually subscribes to.
import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export const useStateQuery = () => useQuery({ queryKey: ['state'], queryFn: api.state });
export const useIssuesQuery = () => useQuery({ queryKey: ['issues'], queryFn: api.issues });
export const useIssueQuery = (n: number) => useQuery({ queryKey: ['issues', n], queryFn: () => api.issue(n), enabled: Number.isFinite(n) });
export const useDocQuery = (path: string) => useQuery({ queryKey: ['docs', path], queryFn: () => api.doc(path), enabled: !!path });
export const useLibraryQuery = () => useQuery({ queryKey: ['library'], queryFn: api.library });
export const useWorktreesQuery = () => useQuery({ queryKey: ['worktrees'], queryFn: api.worktrees });
export const useLedgerQuery = () => useQuery({ queryKey: ['ledger'], queryFn: api.ledger });
export const useEventsQuery = () => useQuery({ queryKey: ['events'], queryFn: api.events });
// GitHub is a live dependency (ADR 0014), not a file the change stream watches, so this polls on
// its own timer rather than waiting for an SSE section that never fires for it. Thirty seconds:
// often enough that a login regained mid-session is noticed soon, rare enough it never competes
// with the jobs poll's one-request-a-second budget.
export const useGithubStatusQuery = () => useQuery({ queryKey: ['github-status'], queryFn: api.githubStatus, refetchInterval: 30_000 });
// Jobs are not part of the change stream (issue 100 is its own room, running commands the file
// watcher never sees start or end), so this polls instead: a job typically runs for seconds to
// minutes, and one request per second is cheap next to the process it is watching.
export const useJobsQuery = () => useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list, refetchInterval: 1000 });
