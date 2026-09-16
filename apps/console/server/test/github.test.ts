// SPDX-License-Identifier: MPL-2.0
// ADR 0014: GitHub down shows comms-lost, never an error. Every case here proves `false` on
// failure, not a thrown error, and proves the network is never touched without a token first.
import { describe, it, expect, vi } from 'vitest';
import { ghAuthToken, checkGithubReachable, isGithubReachable, openPullRequestGateStates } from '../src/github.js';

describe('ghAuthToken', () => {
  it('returns the trimmed token on success', () => {
    const exec = vi.fn(() => Buffer.from('gho_abc123\n'));
    expect(ghAuthToken(exec as unknown as typeof import('node:child_process').execFileSync)).toBe('gho_abc123');
  });

  it('returns null when gh is missing or logged out, instead of throwing', () => {
    const exec = vi.fn(() => {
      throw new Error('gh: command not found');
    });
    expect(ghAuthToken(exec as unknown as typeof import('node:child_process').execFileSync)).toBeNull();
  });
});

describe('checkGithubReachable', () => {
  it('reports false without ever calling fetch when there is no token', async () => {
    const fetchFn = vi.fn();
    const reachable = await checkGithubReachable({ token: null, fetchFn: fetchFn as unknown as typeof fetch });
    expect(reachable).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports true when the rate-limit endpoint answers ok', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }) as Response);
    const reachable = await checkGithubReachable({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(reachable).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/rate_limit',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer tok' }) }),
    );
  });

  it('reports false, not a thrown error, when the reply is a non-2xx', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false }) as Response);
    const reachable = await checkGithubReachable({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(reachable).toBe(false);
  });

  it('reports false, not a thrown error, when fetch itself rejects (network gone)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ENOTFOUND api.github.com');
    });
    const reachable = await checkGithubReachable({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(reachable).toBe(false);
  });
});

describe('isGithubReachable', () => {
  it('composes the token lookup and the reachability check', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }) as Response);
    const reachable = await isGithubReachable({ tokenFn: () => 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(reachable).toBe(true);
  });

  it('never calls fetch when the token lookup itself returns null', async () => {
    const fetchFn = vi.fn();
    const reachable = await isGithubReachable({ tokenFn: () => null, fetchFn: fetchFn as unknown as typeof fetch });
    expect(reachable).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// The atlas's cleared-for-jump read (ADR 0015, issue 177). Every case is injectable-fetch, the
// same seam as checkGithubReachable's own tests: no case here ever needs a real network call.
describe('openPullRequestGateStates', () => {
  function jsonResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response;
  }

  it('returns an empty map without ever calling fetch when there is no token', async () => {
    const fetchFn = vi.fn();
    const result = await openPullRequestGateStates({ token: null, fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps an open PR on a milestone branch to its gate check-run conclusion', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ head: { ref: 'm7-177-atlas', sha: 'deadbeef' } }]))
      .mockResolvedValueOnce(jsonResponse({ check_runs: [{ name: 'gate', conclusion: 'success' }] }));
    const result = await openPullRequestGateStates({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.get(177)).toBe(true);
  });

  it('maps a side-quest branch too, and reads a non-success conclusion as not cleared', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ head: { ref: 'side-91-source-control', sha: 'cafef00d' } }]))
      .mockResolvedValueOnce(jsonResponse({ check_runs: [{ name: 'gate', conclusion: 'failure' }] }));
    const result = await openPullRequestGateStates({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.get(91)).toBe(false);
  });

  it('skips a PR whose branch does not name an issue, and one still missing a gate check-run', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([{ head: { ref: 'renovate/deps', sha: 'x' } }, { head: { ref: 'm7-178-harness', sha: 'y' } }]),
      )
      .mockResolvedValueOnce(jsonResponse({ check_runs: [{ name: 'lint', conclusion: 'success' }] }));
    const result = await openPullRequestGateStates({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.size).toBe(1);
    expect(result.get(178)).toBe(false);
  });

  it('returns an empty map, not a thrown error, on a non-2xx reply from the pull list', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse([], false));
    const result = await openPullRequestGateStates({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.size).toBe(0);
  });

  it('returns an empty map, not a thrown error, when fetch itself rejects (network gone)', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('ENOTFOUND api.github.com'));
    const result = await openPullRequestGateStates({ token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.size).toBe(0);
  });
});
