// SPDX-License-Identifier: MPL-2.0
// Keyboard-completeness for issue 100's Actions rail: every action reachable by Tab, a
// non-destructive one fires on the first Enter, a destructive one arms on the first Enter and
// only fires on a second, and focus stays on the button throughout (the same shape
// keyboard.spec.ts already proves for Escape and card expansion).
import { test, expect, type Page } from '@playwright/test';

/** Presses Tab up to `max` times, stopping the moment the focused element's own text matches
 * `text` exactly. Real Tab traversal, not `.focus()`: this is what proves the action is actually
 * reachable in the page's tab order, not merely present in the DOM. */
async function tabToButtonNamed(page: Page, text: string, max = 60): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const found = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (found === text) return;
    await page.keyboard.press('Tab');
  }
  const last = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '(none)');
  throw new Error(`Tab never reached a button named "${text}" within ${max} presses (last focus: "${last}")`);
}

test('a non-destructive action in the Actions rail is reachable by Tab and fires on the first Enter', async ({ page }) => {
  await page.goto('/');
  await tabToButtonNamed(page, 'List worktrees');
  const button = page.locator('.action-button', { hasText: 'List worktrees' });
  await expect(button).toBeFocused();

  await page.keyboard.press('Enter');

  // Non-destructive: one activation is enough. The rail navigates to the Jobs room the moment the
  // job is created, so the URL changing to /jobs/<id> is the first-activation proof; the job kind
  // itself (`git worktree list`) is real and always succeeds against the fixture's own git repo,
  // so the stream then shows it done.
  await expect(page).toHaveURL(/\/jobs\/.+/);
  await expect(page.locator('.job-detail__actions')).toBeVisible();
  await expect(page.locator('.job-list__item--done, .job-list__item--running').first()).toBeVisible({ timeout: 10_000 });
});

test('a destructive action arms on the first Enter (does not fire), and fires on the second', async ({ page }) => {
  await page.goto('/');
  await tabToButtonNamed(page, 'Sync to GitHub');
  const button = page.locator('.action-button', { hasText: 'Sync to GitHub' });
  await expect(button).toBeFocused();

  // First activation: arms, does not run, does not navigate. `aria-pressed` and the label both
  // announce the armed state, so a screen reader user hears the change too, not just sees it.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  const armed = page.locator('.action-button.action-button--armed', { hasText: 'Confirm: sync to GitHub' });
  await expect(armed).toBeVisible();
  await expect(armed).toHaveAttribute('aria-pressed', 'true');
  // Same element, still focused: arming never moved focus off the button.
  await expect(armed).toBeFocused();

  // Second activation, within the five-second confirm window: fires for real.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/jobs\/.+/);
});

test('the destructive action fires on Space too, and stays armed until a second activation', async ({ page }) => {
  await page.goto('/');
  await tabToButtonNamed(page, 'Sync to GitHub');
  const button = page.locator('.action-button', { hasText: 'Sync to GitHub' });

  await page.keyboard.press('Space');
  const armed = page.locator('.action-button.action-button--armed', { hasText: 'Confirm: sync to GitHub' });
  await expect(armed).toBeVisible();
  await expect(armed).toBeFocused();
  // Still on the Console room: the armed state alone never ran anything.
  await expect(page).toHaveURL('/');

  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/\/jobs\/.+/);
});
