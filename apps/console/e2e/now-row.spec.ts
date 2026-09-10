// SPDX-License-Identifier: MPL-2.0
// The Now row names every quest in flight and clears when none is (issue 110).
import { test, expect } from '@playwright/test';
import { setIssueStatus } from './fixture-repo';

test.describe.serial('Now row', () => {
  test('names an in-progress quest, linked to its card', async ({ page }) => {
    setIssueStatus(6, 'in-progress');
    await page.goto('/');
    const now = page.getByText('Now', { exact: true }).locator('..');
    await expect(now).toContainText('#06 Fixture quest 6', { timeout: 10_000 });
    await now.getByRole('link', { name: /Fixture quest 6/ }).click();
    await expect(page).toHaveURL(/\/quests\/06/);
  });

  test('reads "Nothing in progress" once the quest is no longer in flight', async ({ page }) => {
    setIssueStatus(6, 'open');
    await page.goto('/');
    const now = page.getByText('Now', { exact: true }).locator('..');
    await expect(now).toContainText('Nothing in progress', { timeout: 10_000 });
  });
});
