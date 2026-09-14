// SPDX-License-Identifier: MPL-2.0
// The Quests room defaults to Status: Open (issue 159): a bare /quests visit shows only open
// quests, but an explicit status= (All), whether typed into the URL or picked from the dropdown,
// keeps showing everything and must not snap back to Open on a later render.
import { test, expect } from '@playwright/test';
import { setIssueStatus } from './fixture-repo';

test.describe.serial('Quests room status filter default', () => {
  test('a bare /quests visit defaults to Status: Open', async ({ page }) => {
    await page.goto('/quests');
    await expect(page.getByLabel('Status')).toHaveValue('open');
    // Quest 01 is done; quest 07 is open (fixture-repo.ts).
    await expect(page.locator('#quest-summary-07')).toBeVisible();
    await expect(page.locator('#quest-summary-01')).toHaveCount(0);
  });

  test('status=done shows only done quests, dropdown reads Done', async ({ page }) => {
    await page.goto('/quests?status=done');
    await expect(page.getByLabel('Status')).toHaveValue('done');
    await expect(page.locator('#quest-summary-01')).toBeVisible();
    await expect(page.locator('#quest-summary-07')).toHaveCount(0);
  });

  test('an explicit status= (All) shows every quest', async ({ page }) => {
    await page.goto('/quests?status=');
    await expect(page.getByLabel('Status')).toHaveValue('');
    await expect(page.locator('#quest-summary-01')).toBeVisible();
    await expect(page.locator('#quest-summary-07')).toBeVisible();
  });

  test('picking All from the dropdown clears the filter and survives a later refetch', async ({ page }) => {
    await page.goto('/quests');
    await expect(page.getByLabel('Status')).toHaveValue('open');
    await expect(page.locator('#quest-summary-01')).toHaveCount(0);

    await page.getByLabel('Status').selectOption('');
    await expect(page).toHaveURL(/status=(&|$)/);
    await expect(page.getByLabel('Status')).toHaveValue('');
    await expect(page.locator('#quest-summary-01')).toBeVisible();

    // An SSE-driven refetch (changing an unrelated issue) must not re-default the filter to Open.
    setIssueStatus(6, 'in-progress');
    await expect(page.locator('#quest-summary-06 .status-label:not([hidden])')).toHaveText('in progress', { timeout: 10_000 });
    await expect(page.getByLabel('Status')).toHaveValue('');
    await expect(page.locator('#quest-summary-01')).toBeVisible();

    setIssueStatus(6, 'open');
  });
});
