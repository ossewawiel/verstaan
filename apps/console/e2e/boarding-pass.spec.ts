// SPDX-License-Identifier: MPL-2.0
// The boarding pass (issue 174, L1): a Launch button, on the bridge's next-quest row and on the
// flight deck's per-quest card, copies `claude --model <model> "/factory-run NN"` to the
// clipboard and shows a toast. Fixture quest 6 (fixture-repo.ts): open, milestone "Fixture",
// model sonnet -- the same quest the bridge names as `next` (bridge.spec.ts), which is why one
// fixture quest proves both surfaces.
import { test, expect } from '@playwright/test';

const EXPECTED_LINE = 'claude --model sonnet "/factory-run 06"';

test('the bridge: Launch on the next quest copies the line and shows a toast', async ({ page }) => {
  await page.goto('/');
  const next = page.getByText('Next', { exact: true }).locator('..');
  await expect(next).toContainText('#06 Fixture quest 6', { timeout: 10_000 });

  await next.getByRole('button', { name: 'Launch' }).click();
  await expect(next.getByText('Copied to clipboard')).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(EXPECTED_LINE);
});

test('the flight deck: Launch on an open quest card copies the same line', async ({ page }) => {
  await page.goto('/quests/06');
  const card = page.locator('#quest-detail-06');
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Launch' }).click();
  await expect(card.getByText('Copied to clipboard')).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(EXPECTED_LINE);
});

test('the flight deck: a done quest carries no Launch button (nothing left to launch)', async ({ page }) => {
  // The bare status filter defaults to Open (issue 159); an explicit empty value asks for All, so
  // a done quest's own card is still on the page to deep-link to.
  await page.goto('/quests/01?status=');
  const card = page.locator('#quest-detail-01');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Launch' })).toHaveCount(0);
});
