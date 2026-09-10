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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
