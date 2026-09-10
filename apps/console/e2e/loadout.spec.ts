// SPDX-License-Identifier: MPL-2.0
// Every quest card shows its loadout, the agent / model / effort it is embarked with, on the
// summary row before the card is opened (issue 103). A quest file missing any of the three is
// flagged on the card, not left blank. The Next row on the console shows the same.
import { test, expect } from '@playwright/test';

test('a quest card shows agent / model / effort without being opened', async ({ page }) => {
  await page.goto('/quests');
  const card = page.locator('#quest-summary-07');
  await expect(card).toContainText('implementer / sonnet / low');
  await expect(page.locator('#quest-detail-07')).toHaveCount(0);
});

test('a quest file without a loadout is flagged on its card', async ({ page }) => {
  await page.goto('/quests');
  await expect(page.locator('#quest-summary-09')).toContainText('no loadout: model, effort missing');
});

test('the Next row on the console carries the loadout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Next', { exact: true }).locator('..')).toContainText('implementer / sonnet / low');
});
