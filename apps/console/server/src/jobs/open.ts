// SPDX-License-Identifier: MPL-2.0
// Openers (issue 100 "Shape"): `GET /api/open` turns `{what, ...}` into one URL the client opens.
// A document opens in-app (the room the client already renders); a tree or a file opens VS Code
// on this machine (loopback only, so "this machine" is the one the browser tab runs on); a pull
// request, an issue or a CI run opens the GitHub URL. Nothing here writes anything; it only shapes
// a string.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export type Opener = 'doc' | 'artifact' | 'tree' | 'pr' | 'issue' | 'run';

export class OpenError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** Parses `owner/name` out of the `origin` remote, the same shape
 * `tools/factory/mirror_github.py --repo` expects when it is not given explicitly. */
export function parseOwnerRepo(remoteUrl: string): { owner: string; name: string } | null {
  const m = remoteUrl.match(/[/:]([^/:]+)\/([^/]+?)(\.git)?$/);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

export function repoSlug(repoRoot: string): { owner: string; name: string } | null {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot }).toString().trim();
    return parseOwnerRepo(url);
  } catch {
    return null;
  }
}

export interface OpenRequest {
  what: string;
  path?: string;
  n?: string | number;
  id?: string | number;
  search?: string;
}

/** Pure: takes the repo slug and a validated absolute tree root so it never has to shell out or
 * touch the filesystem itself (that happens in the caller, once). Throws `OpenError` for a bad
 * request. */
export function resolveOpenUrl(
  req: OpenRequest,
  ctx: { slug: { owner: string; name: string } | null; treeRoots: string[]; repoRoot?: string },
): string {
  switch (req.what as Opener) {
    case 'doc': {
      if (!req.path) throw new OpenError(400, 'doc: path is required');
      return `/library/${req.path}`;
    }
    case 'artifact': {
      if (!req.path) throw new OpenError(400, 'artifact: path is required');
      return `/artifacts/${req.path}`;
    }
    case 'tree': {
      if (!req.path) throw new OpenError(400, 'tree: path is required');
      const abs = req.path.startsWith('/') ? resolve(req.path) : resolve(ctx.repoRoot ?? '.', req.path);
      const inKnownRoot = ctx.treeRoots.some((root) => abs === root || abs.startsWith(root + '/'));
      if (!inKnownRoot) throw new OpenError(400, 'tree: path is not inside a known worktree');
      if (!existsSync(abs)) throw new OpenError(404, 'tree: path does not exist');
      return `vscode://file/${abs}`;
    }
    case 'pr': {
      if (!ctx.slug) throw new OpenError(400, 'pr: no origin remote to resolve owner/repo from');
      if (req.n != null) return `https://github.com/${ctx.slug.owner}/${ctx.slug.name}/pull/${req.n}`;
      // No PR number is tracked per quest (only the mirrored issue number is); a quest card's
      // "open its PR" instead opens GitHub's own search for a pull request whose body references
      // this issue, which is the closest correct answer without a second field to keep in sync.
      if (req.search != null) return `https://github.com/${ctx.slug.owner}/${ctx.slug.name}/pulls?q=${encodeURIComponent(`is:pr ${req.search}`)}`;
      throw new OpenError(400, 'pr: n or search is required');
    }
    case 'issue': {
      if (req.n == null) throw new OpenError(400, 'issue: n is required (the GitHub issue number)');
      if (!ctx.slug) throw new OpenError(400, 'issue: no origin remote to resolve owner/repo from');
      return `https://github.com/${ctx.slug.owner}/${ctx.slug.name}/issues/${req.n}`;
    }
    case 'run': {
      if (req.id == null) throw new OpenError(400, 'run: id is required (the CI run id)');
      if (!ctx.slug) throw new OpenError(400, 'run: no origin remote to resolve owner/repo from');
      return `https://github.com/${ctx.slug.owner}/${ctx.slug.name}/actions/runs/${req.id}`;
    }
    default:
      throw new OpenError(400, `unknown opener '${req.what}'. Allowed: doc, artifact, tree, pr, issue, run`);
  }
}
