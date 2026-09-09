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

/** Stamps are tree-independent: `/gate` writes an empty file named after the commit hash under
 * `<git-common-dir>/verstaan-gate-stamps/`. `present` means at least one commit ever passed;
 * `matches` means HEAD did. */
export function readStamp(gitHead, { shFn = sh, cwd = REPO } = {}) {
  const common = shFn('git rev-parse --path-format=absolute --git-common-dir');
  if (!common) return { present: false, matches: false };
  const dir = resolve(cwd, common, 'verstaan-gate-stamps');
  if (!existsSync(dir)) return { present: false, matches: false };
  const full = shFn('git rev-parse HEAD');
  return { present: true, matches: gitHead !== 'none' && !!full && existsSync(join(dir, full)) };
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
 * own checkout) is marked `isRoot`. One row per `git worktree add`. The stamp store is shared
 * (`<git-common-dir>/verstaan-gate-stamps/<sha>`), so `stampMatches` asks one question per tree:
 * did this tree's HEAD commit pass the gate, wherever it was gated. */
export function readWorktrees({ shFn = sh, shInFn = shIn, rootPath = resolveRootPath(shFn) } = {}) {
  const list = parseWorktreePorcelain(shFn('git worktree list --porcelain'));
  const common = shFn('git rev-parse --path-format=absolute --git-common-dir');
  return list.map((w) => {
    const abs = resolve(w.path);
    const rel = relative(rootPath, abs).split(sep).join('/') || '.';
    const isRoot = isRootTree(abs, rootPath);
    const dirty = shInFn(abs, 'git status --porcelain').split('\n').filter(Boolean).length;
    const full = shInFn(abs, 'git rev-parse HEAD');
    const stampMatches = !!common && !!full && existsSync(resolve(rootPath, common, 'verstaan-gate-stamps', full));
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

const STATUS_RANK = { open: 0, 'in-progress': 1, done: 2 };

function issueStatusRank(content) {
  return STATUS_RANK[parseFrontmatter(content)?.status] ?? -1;
}

/** Every worktree keeps its own on-disk copy of `docs/factory/issues/*.md`. An issue closed on
 * its own branch, in its own tree (a side quest, say), has not merged anywhere yet — so a console
 * generated from a different tree would otherwise render it as still open, or "the console is not
 * updated" as an operator would see it, even though the close commit genuinely exists (issue 91,
 * checkpoint-4 follow-up). This folds every other tree's copy of each issue file into `local`,
 * keeping whichever copy's status is furthest along (done > in-progress > open); a tie or an
 * unparsable file keeps `local`'s own copy untouched. A file that exists only in another tree (a
 * new quest written on its branch, not merged yet) is appended, so the root console shows every
 * quest on every tree; until 2026-09-09 such files were hidden, and the owner could not see a
 * quest until its branch merged. */
export function mergeIssuesAcrossWorktrees(local, otherFileLists) {
  const byName = new Map(local.map((f) => [f.name, f]));
  for (const files of otherFileLists) {
    for (const f of files) {
      const existing = byName.get(f.name);
      if (!existing || issueStatusRank(f.content) > issueStatusRank(existing.content)) {
        byName.set(f.name, f);
      }
    }
  }
  // Issues that exist only in a worktree (a new quest written on its branch) are part of the map
  // too; without them the root console cannot show a quest until its branch merges.
  const localNames = new Set(local.map((f) => f.name));
  const onlyElsewhere = [...byName.values()].filter((f) => !localNames.has(f.name));
  return [...local.map((f) => byName.get(f.name) ?? f), ...onlyElsewhere];
}

export function readRepo() {
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
