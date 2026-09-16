// SPDX-License-Identifier: MPL-2.0
// ADR 0014: GitHub is a live dependency. Two calls live here: the bridge's reachability chip
// (issue 173), and the atlas's cleared-for-jump read (issue 177) -- open pull requests and each
// one's `gate.yml` check-run conclusion. Neither reads issue state, milestones or labels; the
// mirror owns that direction, one way, per the ADR's own "Decision".
import { execFileSync } from 'node:child_process';

export const GITHUB_REACHABILITY_TIMEOUT_MS = 3000;

/** `gh auth token`, read fresh, or `null` when `gh` is missing or logged out. Unlike
 * `runner.ts`'s own `ghToken()`, this never throws: a missing login is the ordinary "comms-lost"
 * case here (ADR 0014's "a missing `gh` login shows as comms-lost, not as an error"), not a job
 * to refuse. Never logged, never held past the one request that calls it. */
export function ghAuthToken(execFileSyncFn: typeof execFileSync = execFileSync): string | null {
  try {
    const out = execFileSyncFn('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

/** One GET against the authenticated rate-limit endpoint. GitHub does not charge this endpoint
 * against the 5,000/hour authenticated budget, so it costs nothing to poll. A short timeout means
 * a network that is simply gone never holds up a page load. Every failure -- no token, no
 * network, a non-2xx reply, a timeout -- reports `false`: the bridge's one comms-lost chip, never
 * an error state (ADR 0014's "Consequences"). */
export async function checkGithubReachable({
  token,
  fetchFn = fetch,
  timeoutMs = GITHUB_REACHABILITY_TIMEOUT_MS,
}: {
  token: string | null;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!token) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn('https://api.github.com/rate_limit', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The one function `/api/github-status` calls: resolves the token, then the reachability
 * check. Both halves are injectable so a test never needs a real `gh` login or a real network
 * call (ADR 0014's "Any Playwright test of the atlas or the bridge must run with GitHub
 * stubbed"). */
export async function isGithubReachable({
  tokenFn = ghAuthToken,
  fetchFn = fetch,
  timeoutMs = GITHUB_REACHABILITY_TIMEOUT_MS,
}: {
  tokenFn?: () => string | null;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<boolean> {
  return checkGithubReachable({ token: tokenFn(), fetchFn, timeoutMs });
}

export const DEFAULT_REPO_SLUG = 'ossewawiel/verstaan';

// A pull request's head branch names its issue by SPEC.md §7's own pattern, `m<K>-NN-<slug>`
// for a milestone issue or `side-NN-<slug>` for a side quest (issue 165, one branch per issue).
const BRANCH_ISSUE_RE = /^(?:m\d+|side)-(\d+)-/;

/** Every open pull request whose `gate.yml` check run named `gate` has concluded, keyed by the
 * issue number its branch name carries. A PR whose branch does not match the naming pattern, or
 * whose check runs have not resolved yet, is left out -- absence reads as "not cleared", the
 * same as a `false`. Returns an empty map on no token, on any non-2xx reply, on a timeout, or on
 * the network being gone outright: the atlas's cleared-for-jump tier degrades to nothing, never
 * an error (ADR 0014's "Consequences"). Injectable `fetchFn`, same seam as `checkGithubReachable`,
 * so a test never needs a real network call. */
export async function openPullRequestGateStates({
  token,
  repo = DEFAULT_REPO_SLUG,
  fetchFn = fetch,
  timeoutMs = GITHUB_REACHABILITY_TIMEOUT_MS,
}: {
  token: string | null;
  repo?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<Map<number, boolean>> {
  const gateGreenByIssue = new Map<number, boolean>();
  if (!token) return gateGreenByIssue;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  try {
    const prsRes = await fetchFn(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`, {
      headers,
      signal: controller.signal,
    });
    if (!prsRes.ok) return gateGreenByIssue;
    const prs = (await prsRes.json()) as { head?: { ref?: string; sha?: string } }[];
    for (const pr of prs) {
      const match = BRANCH_ISSUE_RE.exec(pr.head?.ref ?? '');
      const sha = pr.head?.sha;
      if (!match || !sha) continue;
      const checksRes = await fetchFn(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, {
        headers,
        signal: controller.signal,
      });
      if (!checksRes.ok) continue;
      const checks = (await checksRes.json()) as { check_runs?: { name?: string; conclusion?: string | null }[] };
      const gateRun = (checks.check_runs ?? []).find((run) => run.name === 'gate');
      gateGreenByIssue.set(Number(match[1]), gateRun?.conclusion === 'success');
    }
    return gateGreenByIssue;
  } catch {
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}
