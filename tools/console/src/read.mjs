// SPDX-License-Identifier: MPL-2.0
// IO: reads the repo. The one place that knows where the truth lives.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { parseWorktreePorcelain, parseFrontmatter } from './parse.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.md')).map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') }));
}

function sh(cmd) {
  try { return execSync(cmd, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}

function shIn(cwd, cmd) {
  try { return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}

/** The repository's root tree, independent of which tree this code happens to be running from.
 * `--git-common-dir` is shared by every `git worktree` tree off one repository and resolves to
 * the root tree's own `.git` directory (this repo's root layout is not bare), so its parent is
 * the root tree's path. `shFn` is injectable so the derivation can be unit-tested without a real
 * git checkout (see test/run.mjs). */
export function resolveRootPath(shFn = sh) {
  const commonDir = shFn('git rev-parse --path-format=absolute --git-common-dir');
  return commonDir ? resolve(commonDir, '..') : REPO;
}

/** Pure: is this tree the root tree? Both paths are resolved so trailing separators or relative
 * segments don't cause a false negative. */
export function isRootTree(treeAbsPath, rootAbsPath) {
  return resolve(treeAbsPath) === resolve(rootAbsPath);
}

/** Pure: normalise a worktree path for comparison — backslash to forward slash (a PowerShell
 * session types `git worktree add .worktrees\side-x`), and strip a leading `./`. */
export function normalizeTreePath(p) {
  if (p == null) return null;
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Pure: given a tree's own `docs/factory/issues/*.md` files (as `{name, content}`) and that
 * tree's path relative to the root, find the one issue whose `worktree:` field names this tree.
 * Never falls back to an unrelated in-progress issue: a session that has not yet written
 * `worktree:` back simply does not show up here, rather than being attributed to the wrong tree. */
export function matchInProgressIssue(issueFiles, treeRelPath) {
  const want = normalizeTreePath(treeRelPath);
  for (const f of issueFiles) {
    if (!f.name.endsWith('.md') || /-test-cases\.md$/.test(f.name)) continue;
    const fm = parseFrontmatter(f.content);
    if (!fm || fm.status !== 'in-progress') continue;
    if (normalizeTreePath(fm.worktree) === want) return { n: Number(fm.issue), title: String(fm.title ?? '') };
  }
  return null;
}

export function readGit() {
  const head = sh('git rev-parse --short HEAD') || 'none';
  const branch = sh('git branch --show-current') || 'none';
  const dirty = sh('git status --porcelain').split('\n').filter(Boolean).length;
  const remote = sh('git remote') ? sh('git remote -v').split('\n')[0] : 'no remote';
  return { head, branch, dirty, remote };
}

export function readStamp(gitHead) {
  const dir = sh('git rev-parse --git-dir');
  if (!dir) return { present: false, matches: false };
  const p = resolve(REPO, dir, 'verstaan-gate-stamp');
  if (!existsSync(p)) return { present: false, matches: false };
  const full = sh('git rev-parse HEAD');
  return { present: true, matches: readFileSync(p, 'utf8').trim() === full && gitHead !== 'none' };
}

/** Scan a tree's own checkout of docs/factory/issues for the one issue file that names this tree
 * as its worktree. Returns {n, title} or null; see matchInProgressIssue for the matching rule. */
function inProgressIssueOf(treeAbsPath, treeRelPath) {
  const dir = join(treeAbsPath, 'docs', 'factory', 'issues');
  if (!existsSync(dir)) return null;
  return matchInProgressIssue(readDir(dir), treeRelPath);
}

/** `git worktree list --porcelain` plus, per tree, dirty count, gate-stamp match and the
 * in-progress issue found by reading that tree's own files on disk. The root tree (this repo's
 * own checkout) is marked `isRoot`. One row per `git worktree add`; a gate stamp made in one tree
 * never matches another because each tree has its own `.git` (or `.git` pointer) file. */
export function readWorktrees({ shFn = sh, shInFn = shIn, rootPath = resolveRootPath(shFn) } = {}) {
  const list = parseWorktreePorcelain(shFn('git worktree list --porcelain'));
  return list.map((w) => {
    const abs = resolve(w.path);
    const rel = relative(rootPath, abs).split(sep).join('/') || '.';
    const isRoot = isRootTree(abs, rootPath);
    const dirty = shInFn(abs, 'git status --porcelain').split('\n').filter(Boolean).length;
    const gitDir = shInFn(abs, 'git rev-parse --git-dir');
    const full = shInFn(abs, 'git rev-parse HEAD');
    let stampMatches = false;
    if (gitDir) {
      const stampPath = resolve(abs, gitDir, 'verstaan-gate-stamp');
      stampMatches = existsSync(stampPath) && full && readFileSync(stampPath, 'utf8').trim() === full;
    }
    return { path: rel, branch: w.branch, head: w.head, isRoot, dirty, stampMatches, issue: inProgressIssueOf(abs, rel) };
  });
}

/** The library: every project document, grouped. Order here is the order on the page. */
export const LIBRARY = [
  { group: 'Start here', blurb: 'Read these first in any session.', items: ['CLAUDE.md', 'docs/factory/STATE.md', 'docs/factory/README.md', 'docs/factory/playbook.md', 'docs/glossary.md'] },
  { group: 'Plan and specification', blurb: 'What we decided and the contracts agents build to.', items: ['docs/factory/PLAN.md', 'docs/factory/SPEC.md', 'docs/factory/git-workflow.md', 'verstaan.md'] },
  { group: 'Architecture', blurb: 'How the pieces fit. Grown per milestone.', dir: 'docs/architecture' },
  { group: 'Decisions', blurb: 'One decision per file. The title is the decision.', dir: 'docs/adr' },
  { group: 'Standards', blurb: 'How we write C++, data, tests and prose.', dir: 'docs/standards' },
  { group: 'UNL reference', blurb: 'Agent-readable UNL specifications and formats, produced by M1.', dir: 'docs/unl-reference', recursive: true },
  { group: 'Licences and contributing', blurb: 'The legal seam between the two halves of the repo.', items: ['README.md', 'CLA.md', 'TRADEMARK.md', 'CONTRIBUTORS.md'] },
  { group: 'The party', blurb: 'Each agent\'s brief, as the agent reads it.', dir: '.claude/agents' },
  { group: 'Skills and commands', blurb: 'The procedures the party follows.', items: ['.claude/skills/factory-run/SKILL.md', '.claude/skills/factory-retro/SKILL.md', '.claude/commands/factory-status.md', '.claude/commands/factory-run.md', '.claude/commands/gate.md', '.claude/commands/factory-retro.md'] },
];

function walk(dir, recursive) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (recursive) out.push(...walk(p, true)); continue; }
    if (n.endsWith('.md')) out.push(p);
  }
  return out;
}

export function readLibrary() {
  return LIBRARY.map((g) => {
    const paths = g.dir ? walk(join(REPO, g.dir), g.recursive) : g.items.map((p) => join(REPO, p));
    const docs = paths.filter((p) => existsSync(p)).map((p) => ({ path: relative(REPO, p).split(sep).join('/'), content: readFileSync(p, 'utf8') }));
    return { group: g.group, blurb: g.blurb, docs };
  });
}

/** Non-markdown artefacts worth a link from the library. */
export function readArtefacts() {
  const list = [
    { title: 'Interrogation brief', path: 'docs/decisions/2026-09-08-verstaan/interrogation.html', blurb: 'The five-turn interrogation that produced the plan.' },
    { title: 'Lessons ledger', path: 'docs/factory/lessons.jsonl', blurb: 'One line per fast-gate failure.' },
  ];
  return list.filter((a) => existsSync(join(REPO, a.path)));
}

export function readRepo() {
  const git = readGit();
  const lessonsPath = join(REPO, 'docs', 'factory', 'lessons.jsonl');
  return {
    issueFiles: readDir(join(REPO, 'docs', 'factory', 'issues')),
    agentFiles: readDir(join(REPO, '.claude', 'agents')),
    lessonsText: existsSync(lessonsPath) ? readFileSync(lessonsPath, 'utf8') : '',
    library: readLibrary(),
    artefacts: readArtefacts(),
    git,
    stamp: readStamp(git.head),
    worktrees: readWorktrees(),
    generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };
}
