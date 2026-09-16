// SPDX-License-Identifier: MPL-2.0
// The width-safety assertions issue 164's widths.spec.ts introduced, factored out here so a
// second spec (issue 173's bridge.spec.ts) can reuse the exact same proof instead of a second,
// drifting copy. No behaviour changed from widths.spec.ts's own original versions.
import { expect, type Page } from '@playwright/test';

export const WIDTHS = [1440, 960, 720];

/** Selectors whose content must never exceed the box that clips it (issue 164 acceptance
 * criteria's own list). A `scrollWidth` a hair over `clientWidth` from subpixel rounding is not
 * a real clip; the 1px slack matches how browsers themselves report the two values for text that
 * merely touches its edge. */
export const CLIP_CANDIDATES = ['.panel', '.tile', '.story__summary', '.cic-bar__nav'];

export async function assertNoOverflow(page: Page): Promise<void> {
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

export async function assertNavIsOneRow(page: Page): Promise<void> {
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

export async function assertEveryButtonIsLabelled(page: Page): Promise<void> {
  const buttons = page.locator('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const name = await buttons.nth(i).evaluate((el) => (el as HTMLElement).textContent?.trim() || el.getAttribute('aria-label') || '');
    expect(name, `button #${i} has no accessible name`).not.toBe('');
  }
}
