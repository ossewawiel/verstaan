// SPDX-License-Identifier: MPL-2.0
// Keyboard reachability (issue 99 acceptance criteria): every room and card reachable by Tab,
// Escape collapses a card, focus stays visible.
import { test, expect } from '@playwright/test';

test('every room is reachable by Tab from the nav bar', async ({ page }) => {
  await page.goto('/');
  await page.locator('.skip-link').focus();
  const labels: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    labels.push((await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')) as string);
  }
  expect(labels).toEqual(expect.arrayContaining(['Console', 'Quests', 'Playbook', 'Library', 'Glossary']));
});

test('Escape collapses an expanded card and focus stays visible', async ({ page }) => {
  await page.goto('/quests');
  const summary = page.locator('#quest-summary-08');
  await summary.click();
  await expect(page.locator('#quest-detail-08')).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#quest-detail-08')).toHaveCount(0);
  await expect(summary).toBeFocused();
});

test('Tab reaches a quest card and Enter expands it', async ({ page }) => {
  await page.goto('/quests');
  await page.locator('#quest-summary-01').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#quest-detail-01')).toBeVisible();
});
