// SPDX-License-Identifier: MPL-2.0
// The quests room is two halves, main quests and side quests, and a block that crosses the line
// between them is marked on both cards it joins (issue 104).
import { test, expect } from '@playwright/test';

test('the room is split into main quests and side quests', async ({ page }) => {
  await page.goto('/quests');
  const main = page.getByRole('region', { name: 'Main quests' });
  const side = page.getByRole('region', { name: 'Side quests' });
  await expect(main.locator('#quest-summary-07')).toBeVisible();
  await expect(side.locator('#quest-summary-10')).toBeVisible();
  await expect(main.locator('#quest-summary-10')).toHaveCount(0);
  await expect(side.locator('#quest-summary-07')).toHaveCount(0);
});

test('a side quest waiting on a main quest says so, and the main quest says what it holds up', async ({ page }) => {
  await page.goto('/quests');
  await expect(page.locator('#quest-summary-10')).toContainText('⚔ blocked by #07 (main quest, open)');
  await expect(page.locator('#quest-summary-07')).toContainText('⚔ blocks #10 (side quest, open)');
});

test('a main quest waiting on a side quest is marked as crossing the line', async ({ page }) => {
  await page.goto('/quests');
  await expect(page.locator('#quest-summary-08')).toContainText('⚔ blocked by #09 (side quest, open)');
  await expect(page.locator('#quest-summary-09')).toContainText('⚔ blocks #08 (main quest, open)');
});

test('a done dependency blocks nothing', async ({ page }) => {
  await page.goto('/quests');
  await expect(page.locator('#quest-summary-01')).not.toContainText('blocks');
  await expect(page.locator('#quest-summary-01')).not.toContainText('blocked by');
});
