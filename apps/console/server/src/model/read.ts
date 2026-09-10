// SPDX-License-Identifier: MPL-2.0
// IO: reads the repo. Ported from tools/console/src/read.mjs. The one place in this app that
// knows where the truth lives.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';
import {
  parseWorktreePorcelain,
  parseFrontmatter,
  type DocFile,
  type LibDoc,
  type GitInfo,
  type StampInfo,
  type WorktreeSummary,
  type RepoModel,
} from './parse.js';

// Repo root is two levels above apps/console. Derived from process.cwd(), not from this file's
// own location: `dirname(import.meta.url)` differs by one segment between `tsx` running this
// source directly (server/src/model) and node running the compiled output
// (dist-server/server/src/model, one directory deeper), and silently landing one level too
// shallow — apps/, not the repo root — is not the kind of bug a directory that happens to exist
// fails loudly on. Every launcher (npm scripts, console.cmd, console.ps1, playwright.config.ts)
// runs this server with apps/console as its working directory, so cwd is the one thing that stays
// the same shape in both dev and prod.
// VERSTAAN_CONSOLE_TEST_REPO is a test-only seam (e2e/*.spec.ts): it points the server at a
// disposable fixture tree instead of this checkout, so a Playwright test can edit an "issue
// file" without ever touching this repository's own docs/factory/issues. Unset in every other
// path, including console.cmd and the gate.
export const REPO = process.env.VERSTAAN_CONSOLE_TEST_REPO ? resolve(process.env.VERSTAAN_CONSOLE_TEST_REPO) : resolve(process.cwd(), '..', '..');

function readDir(dir: string): DocFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') }));
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function shIn(cwd: string, cmd: string): string {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export function resolveRootPath(shFn: (cmd: string) => string = sh): string {
  const commonDir = shFn('git rev-parse --path-format=absolute --git-common-dir');
  return commonDir ? resolve(commonDir, '..') : REPO;
}

export function isRootTree(treeAbsPath: string, rootAbsPath: string): boolean {
  return resolve(treeAbsPath) === resolve(rootAbsPath);
}

export function normalizeTreePath(p: string | null | undefined): string | null {
  if (p == null) return null;
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

export function matchInProgressIssue(issueFiles: DocFile[], treeRelPath: string): { n: number; title: string } | null {
  const want = normalizeTreePath(treeRelPath);
  for (const f of issueFiles) {
    if (!f.name.endsWith('.md') || /-test-cases\.md$/.test(f.name)) continue;
    const fm = parseFrontmatter(f.content);
    if (!fm || fm.status !== 'in-progress') continue;
    if (normalizeTreePath(fm.worktree as string) === want) return { n: Number(fm.issue), title: String(fm.title ?? '') };
  }
  return null;
}

export function readGit(): GitInfo {
  const head = sh('git rev-parse --short HEAD') || 'none';
  const branch = sh('git branch --show-current') || 'none';
  const dirty = sh('git status --porcelain').split('\n').filter(Boolean).length;
  const remote = sh('git remote') ? sh('git remote -v').split('\n')[0] : 'no remote';
  return { head, branch, dirty, remote };
}

export function readStamp(gitHead: string, { shFn = sh, cwd = REPO }: { shFn?: (cmd: string) => string; cwd?: string } = {}): StampInfo {
  const common = shFn('git rev-parse --path-format=absolute --git-common-dir');
  if (!common) return { present: false, matches: false };
  const dir = resolve(cwd, common, 'verstaan-gate-stamps');
  if (!existsSync(dir)) return { present: false, matches: false };
  const full = shFn('git rev-parse HEAD');
  return { present: true, matches: gitHead !== 'none' && !!full && existsSync(join(dir, full)) };
}

function inProgressIssueOf(treeAbsPath: string, treeRelPath: string): { n: number; title: string } | null {
  const dir = join(treeAbsPath, 'docs', 'factory', 'issues');
  if (!existsSync(dir)) return null;
  return matchInProgressIssue(readDir(dir), treeRelPath);
}

export function readWorktrees({
  shFn = sh,
  shInFn = shIn,
  rootPath = resolveRootPath(shFn),
}: { shFn?: (cmd: string) => string; shInFn?: (cwd: string, cmd: string) => string; rootPath?: string } = {}): WorktreeSummary[] {
  const list = parseWorktreePorcelain(shFn('git worktree list --porcelain'));
  const common = shFn('git rev-parse --path-format=absolute --git-common-dir');
  return list.map((w) => {
    const abs = resolve(w.path);
    const rel = relative(rootPath, abs).split(sep).join('/') || '.';
    const isRoot = isRootTree(abs, rootPath);
    const dirty = shInFn(abs, 'git status --porcelain').split('\n').filter(Boolean).length;
    const full = shInFn(abs, 'git rev-parse HEAD');
    const stampMatches = !!common && !!full && existsSync(resolve(rootPath, common, 'verstaan-gate-stamps', full));
    return { path: rel, branch: w.branch, detached: w.detached, head: w.head, isRoot, dirty, stampMatches, issue: inProgressIssueOf(abs, rel) };
  });
}

export const LIBRARY: { group: string; blurb: string; items?: string[]; dir?: string; recursive?: boolean }[] = [
  { group: 'Start here', blurb: 'Read these first in any session.', items: ['CLAUDE.md', 'docs/factory/STATE.md', 'docs/factory/README.md', 'docs/factory/playbook.md', 'docs/glossary.md'] },
  { group: 'Plan and specification', blurb: 'What we decided and the contracts agents build to.', items: ['docs/factory/PLAN.md', 'docs/factory/SPEC.md', 'docs/factory/git-workflow.md', 'verstaan.md'] },
  { group: 'Architecture', blurb: 'How the pieces fit. Grown per milestone.', dir: 'docs/architecture' },
  { group: 'Decisions', blurb: 'One decision per file. The title is the decision.', dir: 'docs/adr' },
  { group: 'Standards', blurb: 'How we write C++, data, tests and prose.', dir: 'docs/standards' },
  { group: 'UNL reference', blurb: 'Agent-readable UNL specifications and formats, produced by M1.', dir: 'docs/unl-reference', recursive: true },
  { group: 'Licences and contributing', blurb: "The legal seam between the two halves of the repo.", items: ['README.md', 'CLA.md', 'TRADEMARK.md', 'CONTRIBUTORS.md'] },
  { group: 'The party', blurb: "Each agent's brief, as the agent reads it.", dir: '.claude/agents' },
  { group: 'Skills and commands', blurb: 'The procedures the party follows.', items: ['.claude/skills/factory-run/SKILL.md', '.claude/skills/factory-retro/SKILL.md', '.claude/commands/factory-status.md', '.claude/commands/factory-run.md', '.claude/commands/gate.md', '.claude/commands/factory-retro.md'] },
];

function walk(dir: string, recursive?: boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (recursive) out.push(...walk(p, true));
      continue;
    }
    if (n.endsWith('.md')) out.push(p);
  }
  return out;
}

export function readLibrary(): { group: string; blurb: string; docs: LibDoc[] }[] {
  return LIBRARY.map((g) => {
    const paths = g.dir ? walk(join(REPO, g.dir), g.recursive) : (g.items ?? []).map((p) => join(REPO, p));
    const docs = paths
      .filter((p) => existsSync(p))
      .map((p) => ({ path: relative(REPO, p).split(sep).join('/'), content: readFileSync(p, 'utf8') }));
    return { group: g.group, blurb: g.blurb, docs };
  });
}

export function readArtefacts(): { title: string; path: string; blurb: string }[] {
  const list = [
    { title: 'Interrogation brief', path: 'docs/decisions/2026-09-08-verstaan/interrogation.html', blurb: 'The five-turn interrogation that produced the plan.' },
    { title: 'Lessons ledger', path: 'docs/factory/lessons.jsonl', blurb: 'One line per fast-gate failure.' },
  ];
  return list.filter((a) => existsSync(join(REPO, a.path)));
}

const STATUS_RANK: Record<string, number> = { open: 0, 'in-progress': 1, done: 2 };

function issueStatusRank(content: string): number {
  const fm = parseFrontmatter(content);
  return STATUS_RANK[(fm?.status as string) ?? ''] ?? -1;
}

export function mergeIssuesAcrossWorktrees(local: DocFile[], otherFileLists: DocFile[][]): DocFile[] {
  const byName = new Map(local.map((f) => [f.name, f]));
  for (const files of otherFileLists) {
    for (const f of files) {
      const existing = byName.get(f.name);
      if (!existing || issueStatusRank(f.content) > issueStatusRank(existing.content)) {
        byName.set(f.name, f);
      }
    }
  }
  const localNames = new Set(local.map((f) => f.name));
  const onlyElsewhere = [...byName.values()].filter((f) => !localNames.has(f.name));
  return [...local.map((f) => byName.get(f.name) ?? f), ...onlyElsewhere];
}

export function readRepo(): RepoModel {
  const git = readGit();
  const worktrees = readWorktrees();
  const rootPath = resolveRootPath();
  const localIssueFiles = readDir(join(REPO, 'docs', 'factory', 'issues'));
  const otherIssueFiles = worktrees
    .filter((w) => resolve(rootPath, w.path) !== resolve(REPO))
    .map((w) => readDir(join(resolve(rootPath, w.path), 'docs', 'factory', 'issues')));
  const lessonsPath = join(REPO, 'docs', 'factory', 'lessons.jsonl');
  return {
    issueFiles: mergeIssuesAcrossWorktrees(localIssueFiles, otherIssueFiles),
    agentFiles: readDir(join(REPO, '.claude', 'agents')),
    lessonsText: existsSync(lessonsPath) ? readFileSync(lessonsPath, 'utf8') : '',
    library: readLibrary(),
    artefacts: readArtefacts(),
    git,
    stamp: readStamp(git.head),
    worktrees,
    generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };
}
