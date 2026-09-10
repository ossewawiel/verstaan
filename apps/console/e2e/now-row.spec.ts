// SPDX-License-Identifier: MPL-2.0
// The Now row names every quest in flight and clears when none is (issue 110).
import { test, expect } from '@playwright/test';
import { setIssueStatus, setHeadQuestStatus, HEAD_QUEST_N } from './fixture-repo';

test.describe.serial('Now row', () => {
  test('names an in-progress quest, linked to its card', async ({ page }) => {
    setIssueStatus(6, 'in-progress');
    await page.goto('/');
    const now = page.getByText('Now', { exact: true }).locator('..');
    await expect(now).toContainText('#06 Fixture quest 6', { timeout: 10_000 });
    await now.getByRole('link', { name: /Fixture quest 6/ }).click();
    await expect(page).toHaveURL(/\/quests\/06/);
  });

  // issue 112: a tree at `main`'s own head — no commit of its own yet — reads exactly as
  // "merged" to `git merge-base --is-ancestor` as a tree whose work has already landed. The Now
  // row must still name a quest whose only claimant is such a tree: buildHeadWorktree() (see
  // fixture-repo.ts) built that tree, at the repo's own HEAD, before the server started, with its
  // own docs/factory/issues file marking this quest in-progress and naming the tree. It stays
  // in-progress for the whole suite (see setHeadQuestStatus), so it is live for this test whether
  // or not the previous test has run yet.
  test('names a quest whose tree sits at main\'s own head', async ({ page }) => {
    await page.goto('/');
    const now = page.getByText('Now', { exact: true }).locator('..');
    const n = String(HEAD_QUEST_N).padStart(2, '0');
    await expect(now).toContainText(`#${n} Head quest`, { timeout: 10_000 });
    await expect(now).toContainText('head-quest');
  });

  test('reads "Nothing in progress" once every quest is no longer in flight', async ({ page }) => {
    setIssueStatus(6, 'open');
    setHeadQuestStatus('open');
    await page.goto('/');
    const now = page.getByText('Now', { exact: true }).locator('..');
    await expect(now).toContainText('Nothing in progress', { timeout: 10_000 });
  });
});
