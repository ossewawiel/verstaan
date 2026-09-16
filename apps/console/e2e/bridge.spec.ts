// SPDX-License-Identifier: MPL-2.0
// The bridge (issue 173): a cold visitor names the next quest, with its milestone, agent, model
// and effort; sees the last five events, newest first; reads a status line (branch, dirty count,
// gate-stamp freshness, GitHub reachability); and watches a boot sequence that plays once per
// page load and is skipped entirely under `prefers-reduced-motion`.
//
// ADR 0014: "Any Playwright test of the atlas or the bridge must run with GitHub stubbed; the
// gate never depends on GitHub answering." This spec never asserts which state the GitHub chip
// is in -- only that it renders one of the two states the bridge is allowed to show -- so it
// passes identically whether or not this machine has a `gh` login or a network at all.
import { test, expect } from '@playwright/test';
import { WIDTHS, assertNoOverflow, assertNavIsOneRow, assertEveryButtonIsLabelled } from './width-helpers';

const BOOT_SELECTOR = '[data-testid="boot-sequence"]';

test.describe('The bridge names the next quest, the last five events and the ship status', () => {
  test('the next quest shows its milestone, agent, model and effort, without scrolling', async ({ page }) => {
    await page.goto('/');
    const next = page.getByText('Next', { exact: true }).locator('..');
    // Fixture quest 6 (fixture-repo.ts): open, milestone "Fixture", deps met, the lowest such
    // number -- so it is the one /api/state's buildModel() names as `next`, never hardcoded here.
    await expect(next).toContainText('#06 Fixture quest 6', { timeout: 10_000 });
    await expect(next).toContainText('Fixture');
    await expect(next).toContainText('implementer / sonnet / low');
    await expect(next).toBeInViewport();
  });

  test('the last five events show, newest first, without scrolling', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByText('Recent events', { exact: true }).locator('..');
    await expect(panel).toBeInViewport();
    // Fixture quests 1-5 are done (fixture-repo.ts); exactly five exist, so this also proves the
    // list is never truncated below five when five (or more) are available.
    const items = panel.locator('.loot-log__item');
    await expect(items).toHaveCount(5, { timeout: 10_000 });
    await expect(items.first()).toContainText('#05 Fixture quest 5');
    await expect(items.last()).toContainText('#01 Fixture quest 1');
  });

  test('the status line carries branch, dirty count, gate-stamp freshness and a GitHub chip', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lede')).toContainText('Branch');
    await expect(page.locator('.lede')).toContainText(/clean|dirty/);
    await expect(page.getByText('Gate stamp', { exact: true }).locator('..')).toContainText(/stamp|no stamp/);
    const github = page.getByText('GitHub', { exact: true }).locator('..');
    await expect(github.locator('.status-chip')).toBeVisible();
    // Comms-lost is a valid, non-error state here (ADR 0014): only the wording is asserted, not
    // which of the two states this machine happens to be in.
    await expect(github.locator('.status-chip')).toHaveText(/reachable|comms-lost/);
  });
});

test.describe('The boot sequence', () => {
  test('plays once per page load, and does not repeat on a later re-render', async ({ page }) => {
    await page.goto('/');
    // Rendered synchronously on first mount, before the sequence's own timer ever fires.
    await expect(page.locator(BOOT_SELECTOR)).toBeVisible();
    // The sequence removes itself once its lines have all played (BootSequence.tsx: four lines,
    // finishing well under two seconds).
    await expect(page.locator(BOOT_SELECTOR)).toHaveCount(0, { timeout: 3_000 });

    // The bridge re-renders once a second on its own (the active-encounter elapsed-time clock),
    // with no navigation and no remount involved. If the sequence played again on a re-render,
    // it would reappear here.
    await page.waitForTimeout(2_200);
    await expect(page.locator(BOOT_SELECTOR)).toHaveCount(0);
  });

  test('is skipped entirely when the visitor prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Verstaan' })).toBeVisible();
    // Never rendered at all -- not rendered-then-hidden -- so a reduced-motion visitor spends no
    // animation frame on it (issue 173 acceptance criteria).
    await expect(page.locator(BOOT_SELECTOR)).toHaveCount(0);
  });
});

for (const width of WIDTHS) {
  test(`the bridge at ${width}x900: no overflow, one-row nav, every button labelled`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.cic-bar')).toBeVisible();
    // The boot sequence is a fixed, non-scrolling overlay (console.css) and carries no button of
    // its own, but this waits it out anyway so every width check below measures the room's own
    // finished layout, not a transient frame of the overlay on top of it.
    await expect(page.locator(BOOT_SELECTOR)).toHaveCount(0, { timeout: 3_000 });

    await assertNoOverflow(page);
    await assertNavIsOneRow(page);
    await assertEveryButtonIsLabelled(page);
  });
}
