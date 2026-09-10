// SPDX-License-Identifier: MPL-2.0
// A disposable fixture "repo" the e2e suite points the server at (VERSTAAN_CONSOLE_TEST_REPO), so
// no test ever writes into this checkout's own docs/factory/issues. Built at config-load time,
// before Playwright's webServer starts the server against it.
//
// Playwright evaluates playwright.config.ts more than once per run: the CLI process imports it
// to read `webServer` before starting that server, and each worker process imports it again,
// afresh, before running any test in it (a separate Node process, a separate module cache — this
// is not a bug in this file, it is how Playwright's architecture works). `buildFixtureRepo()`
// therefore runs more than once. The old version called `rmSync` on the whole directory first:
// the worker's second call deleted and recreated `docs/factory/issues` out from under the
// server's `fs.watch` handle, which had already been opened against the first call's directory.
// The handle then silently watched nothing — SSE test that changed a fixture file, run after
// worker start (i.e. every real test), no event ever arrived, and the timeout looked exactly
// like a server-side SSE bug (it took real debugging with a repeatable Node script, page.goto
// against a running server, to find this). Never delete the directory here; only ensure it
// exists and (re)write each fixture file's content, so a second call is a no-op change to
// files the watcher already knows about, not a missing directory.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

export const FIXTURE_REPO = join(tmpdir(), 'verstaan-console-e2e-fixture');

export function issuePath(n: number): string {
  return join(FIXTURE_REPO, 'docs', 'factory', 'issues', `${String(n).padStart(2, '0')}-fixture.md`);
}

function issueMd(n: number, title: string, status: string): string {
  // Issue 9 alone has no loadout, so the suite can prove the card flags a quest file that lacks one.
  const loadout = n === 9 ? '' : 'model: sonnet\neffort: low\n';
  // Issues 9 and 10 are side quests (issue 104). 10 waits on main quest 7; main quest 8 waits on
  // side quest 9: one cross-divide block in each direction for the suite to find on the cards.
  const milestone = n >= 9 ? 'Side' : 'Fixture';
  const deps = n === 10 ? '[7]' : n === 8 ? '[9]' : '[]';
  return `---\nissue: ${n}\ntitle: "${title}"\nmilestone: ${milestone}\nstatus: ${status}\ndepends_on: ${deps}\nagent: implementer\n${loadout}---\n## What\n\nFixture issue ${n} for the console's own e2e suite.\n\n## Done when\n\n- [ ] one\n`;
}

export function buildFixtureRepo(): void {
  mkdirSync(join(FIXTURE_REPO, 'docs', 'factory', 'issues'), { recursive: true });
  mkdirSync(join(FIXTURE_REPO, '.claude', 'agents'), { recursive: true });
  for (let n = 1; n <= 10; n += 1) {
    writeFileSync(issuePath(n), issueMd(n, `Fixture quest ${n}`, n <= 5 ? 'done' : 'open'));
  }
  writeFileSync(join(FIXTURE_REPO, 'docs', 'glossary.md'), '# Glossary\n\nOne term, one meaning.\n');
  writeFileSync(join(FIXTURE_REPO, 'docs', 'factory', 'playbook.md'), '# Playbook\n\nHow the game is played.\n');
}

export function setIssueStatus(n: number, status: string): void {
  writeFileSync(issuePath(n), issueMd(n, `Fixture quest ${n}`, status));
}

// A second, real working tree of FIXTURE_REPO, checked out at `main`'s own current commit — no
// commit ahead, none behind — proving issue 112: a fresh tree with no work of its own yet is
// exactly as "merged" to `git merge-base --is-ancestor` as a tree whose work has already landed
// by squash merge, so the Now row must decide from the issue file, never from ancestry.
const HEAD_TREE_REL = '.worktrees/head-quest';
const HEAD_TREE_ABS = join(FIXTURE_REPO, HEAD_TREE_REL);
export const HEAD_QUEST_N = 11;

function git(args: string[], cwd: string = FIXTURE_REPO): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/** Called once, before Playwright's webServer starts (playwright.config.ts), so the server's own
 * worktree scan already knows about this tree at startup (server/src/index.ts's `startWatching`
 * calls `readWorktrees()` once, at boot, to decide what to watch). Idempotent for the same reason
 * `buildFixtureRepo()` is: config-load runs more than once per Playwright invocation. */
export function buildHeadWorktree(): void {
  if (!existsSync(join(FIXTURE_REPO, '.git'))) {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'fixture@example.com']);
    git(['config', 'user.name', 'Fixture']);
    writeFileSync(join(FIXTURE_REPO, '.gitignore'), '.worktrees/\n');
  }
  git(['add', '-A']);
  try {
    git(['commit', '-q', '-m', 'fixture']);
  } catch {
    // Nothing changed since the last call (buildFixtureRepo()'s files are the same every time).
  }
  if (!existsSync(HEAD_TREE_ABS)) {
    git(['worktree', 'add', '-q', '--detach', HEAD_TREE_ABS, 'HEAD']);
  }
  const issuesDir = join(HEAD_TREE_ABS, 'docs', 'factory', 'issues');
  mkdirSync(issuesDir, { recursive: true });
  setHeadQuestStatus('in-progress');
}

function headQuestPath(): string {
  return join(HEAD_TREE_ABS, 'docs', 'factory', 'issues', `${String(HEAD_QUEST_N).padStart(2, '0')}-head-quest.md`);
}

/** Toggled off by now-row.spec.ts's "Nothing in progress" test, which needs every quest,
 * including this one, out of flight, and back on by nothing else — this fixture's whole point is
 * to sit in-progress at a tree that has never committed. */
export function setHeadQuestStatus(status: string): void {
  writeFileSync(
    headQuestPath(),
    `---\nissue: ${HEAD_QUEST_N}\ntitle: "Head quest"\nmilestone: Side\nstatus: ${status}\ndepends_on: []\nagent: implementer\nmodel: sonnet\neffort: low\nworktree: ${HEAD_TREE_REL}\n---\n## What\n\nFixture issue proving a tree at main's own head still shows in the Now row (issue 112).\n\n## Done when\n\n- [ ] one\n`,
  );
}
