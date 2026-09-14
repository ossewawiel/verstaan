// SPDX-License-Identifier: MPL-2.0
// Three widths, tested (issue 164 acceptance criteria): 1440 (a full screen), 960 (half of
// 1920), 720 (half of 1440). At every width, on both rooms: no horizontal scroll, no text
// clipped by its own container, the nav in one row or a deliberate collapsed form, every button
// reachable and labelled.
import { test, expect, type Page } from '@playwright/test';

const WIDTHS = [1440, 960, 720];
const ROOMS = ['/', '/quests'];

/** Selectors whose content must never exceed the box that clips it (issue 164 acceptance
 * criteria's own list). A `scrollWidth` a hair over `clientWidth` from subpixel rounding is not
 * a real clip; the 1px slack matches how browsers themselves report the two values for text that
 * merely touches its edge. */
const CLIP_CANDIDATES = ['.panel', '.tile', '.story__summary', '.cic-bar__nav'];

async function assertNoOverflow(page: Page) {
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(docOverflow, 'document.documentElement.scrollWidth must not exceed window.innerWidth').toBe(true);

  for (const selector of CLIP_CANDIDATES) {
    const clipped = await page.evaluate((sel) => {
      const bad: string[] = [];
      document.querySelectorAll(sel).forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1) bad.push(el.outerHTML.slice(0, 120));
      });
      return bad;
    }, selector);
    expect(clipped, `${selector} element(s) with content wider than their own box`).toEqual([]);
  }
}

async function assertNavIsOneRow(page: Page) {
  const nav = page.locator('.cic-bar__nav');
  const isCollapsed = await nav.evaluate((el) => el.classList.contains('cic-bar__nav--collapsed'));
  if (isCollapsed) return;

  const navBox = await nav.boundingBox();
  const linkBox = await nav.getByRole('link').first().boundingBox();
  expect(navBox).not.toBeNull();
  expect(linkBox).not.toBeNull();
  // "One row tall": the nav's own box is no taller than one link's box plus a little padding
  // slack, not the two-or-more rows a wrap would produce. A ragged wrap (issue 164's bug) at
  // least doubles this height.
  expect(navBox!.height).toBeLessThan(linkBox!.height * 1.8);
}

async function assertEveryButtonIsLabelled(page: Page) {
  const buttons = page.locator('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const name = await buttons.nth(i).evaluate((el) => (el as HTMLElement).textContent?.trim() || el.getAttribute('aria-label') || '');
    expect(name, `button #${i} has no accessible name`).not.toBe('');
  }
}

for (const width of WIDTHS) {
  for (const room of ROOMS) {
    test(`${room === '/' ? 'Console' : 'Quests'} room at ${width}x900: no overflow, one-row nav, every button labelled`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      // The Quests room's side half only shows the loot log once its filter is empty; the
      // default Open filter already leaves it empty in the fixture repo, so no extra filtering
      // is needed here to exercise that branch.
      await page.goto(room);
      await expect(page.locator('.cic-bar')).toBeVisible();

      await assertNoOverflow(page);
      await assertNavIsOneRow(page);
      await assertEveryButtonIsLabelled(page);
    });
  }
}
