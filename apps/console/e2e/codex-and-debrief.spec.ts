// SPDX-License-Identifier: MPL-2.0
// The Codex briefing and the Debrief room (issue 176), both read-only over files this suite's own
// fixture repo already writes (fixture-repo.ts's issueMd() and its lessons.jsonl).
import { test, expect } from '@playwright/test';
import { WIDTHS, assertNoOverflow, assertNavIsOneRow } from './width-helpers';

test.describe('Codex briefing', () => {
  test('renders the objective and the after-action section from the issue file', async ({ page }) => {
    await page.goto('/codex/01');
    await expect(page.getByRole('heading', { name: /#01 Fixture quest 1/ })).toBeVisible();
    await expect(page.getByText("Fixture issue 1 for the console's own e2e suite.")).toBeVisible();
    await expect(page.getByText('Done when: 0 / 1')).toBeVisible();
  });

  test('the room makes no write request (POST/PUT/DELETE/PATCH) on load', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (req) => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
    });
    await page.goto('/codex/01');
    await expect(page.getByRole('heading', { name: /#01 Fixture quest 1/ })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(writes, 'no write request should fire loading a read-only room').toEqual([]);
  });

  for (const width of WIDTHS) {
    test(`codex at ${width}x900: no overflow, one-row nav`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/codex/01');
      await expect(page.locator('.cic-bar')).toBeVisible();
      await assertNoOverflow(page);
      await assertNavIsOneRow(page);
    });
  }
});

test.describe('Debrief', () => {
  test('groups lessons.jsonl by sig, newest group first, with a count per group', async ({ page }) => {
    await page.goto('/debrief');
    const rows = page.locator('.debrief-group');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('fixture-sig-new');
    await expect(rows.nth(0)).toContainText('2×');
    await expect(rows.nth(1)).toContainText('fixture-sig-old');
    await expect(rows.nth(1)).toContainText('1×');
  });

  // Issue 176 acceptance: promote writes nothing until the owner approves. Opening a group and
  // typing into its form issues no request at all -- only "Promote" (armed, then confirmed) would.
  test('opening a group and drafting a promotion makes no write request', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (req) => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
    });
    await page.goto('/debrief');
    await page.getByText('fixture-sig-new', { exact: false }).click();
    await page.getByPlaceholder('- The exact line to append.').fill('- A drafted rule, not yet confirmed.');
    await page.waitForTimeout(500);
    expect(writes, 'drafting a promotion should not itself write anything').toEqual([]);
  });
});
