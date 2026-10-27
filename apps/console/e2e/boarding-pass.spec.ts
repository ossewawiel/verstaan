// SPDX-License-Identifier: MPL-2.0
// The boarding pass (issue 174, L1): a Launch button, on the bridge's next-quest row and on the
// flight deck's per-quest card, copies `claude --model sonnet "/factory-run NN first pass: ..."`
// to the clipboard and shows a toast. Issue 191: the session boards at Sonnet whatever the quest's
// model; the pass shows "orchestrator sonnet" and "first pass <agent> <model> <effort>". Fixture quest 6 (fixture-repo.ts): open, milestone "Fixture",
// model sonnet -- the same quest the bridge names as `next` (bridge.spec.ts), which is why one
// fixture quest proves both surfaces.
import { test, expect } from '@playwright/test';

const EXPECTED_LINE = 'claude --model sonnet "/factory-run 06 first pass: agent=implementer model=sonnet effort=low"';

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

test('the bridge: the pass shows the orchestrator and the first pass on two lines (issue 191)', async ({ page }) => {
  await page.goto('/');
  const next = page.getByText('Next', { exact: true }).locator('..');
  await expect(next).toContainText('#06 Fixture quest 6', { timeout: 10_000 });
  await expect(next.getByText('orchestrator sonnet', { exact: true })).toBeVisible();
  await expect(next.getByText('first pass implementer sonnet low', { exact: true })).toBeVisible();
});

test('the flight deck: the pass shows the same two lines (issue 191)', async ({ page }) => {
  await page.goto('/quests/06');
  const card = page.locator('#quest-detail-06');
  await expect(card.getByText('orchestrator sonnet', { exact: true })).toBeVisible();
  await expect(card.getByText('first pass implementer sonnet low', { exact: true })).toBeVisible();
});

test('an opus quest still boards at sonnet; the first pass line names opus (issue 191)', async ({ page }) => {
  await page.goto('/quests/10');
  const card = page.locator('#quest-detail-10');
  await expect(card.getByText('orchestrator sonnet', { exact: true })).toBeVisible();
  await expect(card.getByText('first pass implementer opus high', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Launch' }).click();
  await expect(card.getByText('Copied to clipboard')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe('claude --model sonnet "/factory-run 10 first pass: agent=implementer model=opus effort=high"');
});
