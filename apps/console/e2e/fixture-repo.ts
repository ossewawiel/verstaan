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

// Ship systems fixtures (issue 175): one agent, one skill, one command, two hooks (one referenced
// by an event, one not -- a visible gap in each direction), and a settings.json whose one event
// names a hook file that does not exist on disk (the other direction's gap).
export const SHIP_SYSTEMS_FIXTURE_AGENT = 'fixture-agent';

function writeShipSystemsFixtures(): void {
  const claude = join(FIXTURE_REPO, '.claude');
  mkdirSync(join(claude, 'agents'), { recursive: true });
  mkdirSync(join(claude, 'skills', 'fixture-skill'), { recursive: true });
  mkdirSync(join(claude, 'commands'), { recursive: true });
  mkdirSync(join(claude, 'hooks'), { recursive: true });

  writeFileSync(
    join(claude, 'agents', `${SHIP_SYSTEMS_FIXTURE_AGENT}.md`),
    '---\nname: fixture-agent\ndescription: A fixture agent for the console e2e suite.\ntools: Read, Grep\nmodel: sonnet\neffort: low\ncolor: green\n---\n## Read first\n',
  );
  writeFileSync(
    join(claude, 'skills', 'fixture-skill', 'SKILL.md'),
    '---\nname: fixture-skill\ndescription: A fixture skill for the console e2e suite.\nargument-hint: [a seed]\n---\nFixture skill body.\n',
  );
  writeFileSync(
    join(claude, 'commands', 'fixture-command.md'),
    '---\ndescription: A fixture command for the console e2e suite.\n---\n1. Do the fixture thing.\n',
  );
  writeFileSync(join(claude, 'hooks', 'fixture-referenced.sh'), '#!/bin/sh\necho referenced\n');
  writeFileSync(join(claude, 'hooks', 'fixture-orphan.sh'), '#!/bin/sh\necho orphan\n');
  writeFileSync(
    join(claude, 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            {
              hooks: [
                { type: 'command', command: 'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/fixture-referenced.sh"' },
                { type: 'command', command: 'bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/fixture-missing.sh"' },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );
}

/** Adds a second fixture agent file after the fact (issue 175 acceptance criteria: "adding an
 * agent file appears on next load with no console code change"). Never called by
 * `buildFixtureRepo()` itself -- only the one e2e test that proves this needs it, so every other
 * spec's agent list stays exactly the one `writeShipSystemsFixtures()` wrote. */
export function addFixtureAgent(name: string): void {
  writeFileSync(
    join(FIXTURE_REPO, '.claude', 'agents', `${name}.md`),
    `---\nname: ${name}\ndescription: A second fixture agent, added mid-suite.\ntools: Read\nmodel: haiku\neffort: low\n---\n## Read first\n`,
  );
}

// Debrief (issue 176): two signatures, one repeated with a later `ts` than the other's only
// entry, so the room's own "newest group first, with a count" claim has something to prove.
function writeLessonsFixture(): void {
  const dir = join(FIXTURE_REPO, 'docs', 'factory');
  mkdirSync(dir, { recursive: true });
  const lines = [
    { sig: 'fixture-sig-old', ts: '2026-01-01T00:00:00Z', detail: 'An old, one-off failure.' },
    { sig: 'fixture-sig-new', ts: '2026-01-05T00:00:00Z', detail: 'A newer, repeated failure.' },
    { sig: 'fixture-sig-new', ts: '2026-01-06T00:00:00Z', detail: 'The same failure again.' },
  ];
  writeFileSync(join(dir, 'lessons.jsonl'), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
}

export function buildFixtureRepo(): void {
  mkdirSync(join(FIXTURE_REPO, 'docs', 'factory', 'issues'), { recursive: true });
  mkdirSync(join(FIXTURE_REPO, '.claude', 'agents'), { recursive: true });
  for (let n = 1; n <= 10; n += 1) {
    writeFileSync(issuePath(n), issueMd(n, `Fixture quest ${n}`, n <= 5 ? 'done' : 'open'));
  }
  writeFileSync(join(FIXTURE_REPO, 'docs', 'glossary.md'), '# Glossary\n\nOne term, one meaning.\n');
  writeFileSync(
    join(FIXTURE_REPO, 'docs', 'factory', 'playbook.md'),
    '# Playbook\n\nHow the game is played.\n\n## The map\n\nFixture map text.\n\n## An encounter, start to finish\n\nFixture encounter text.\n\n## The gate ladder\n\nFixture ladder text.\n',
  );
  writeShipSystemsFixtures();
  writeLessonsFixture();
}

export function setIssueStatus(n: number, status: string): void {
  writeFileSync(issuePath(n), issueMd(n, `Fixture quest ${n}`, status));
}

// A second, real working tree of FIXTURE_REPO, checked out at `main`'s own current commit — no
// commit ahead, none behind — proving issue 112: a fresh tree with no work of its own yet is
// exactly as "merged" to `git merge-base --is-ancestor` as a tree whose work has already landed
// and merged, so the Now row must decide from the issue file, never from ancestry.
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
