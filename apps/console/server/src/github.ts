// SPDX-License-Identifier: MPL-2.0
// ADR 0014: GitHub is a live dependency, and the bridge shows one chip for whether it answers.
// This is the only new GitHub call issue 173 adds -- the reachability check ADR 0014 already
// names, never anything that reads issue state, milestones or labels (the mirror owns that
// direction, one way, per the ADR's own "Decision").
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
