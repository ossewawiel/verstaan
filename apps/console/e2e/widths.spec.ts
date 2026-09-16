// SPDX-License-Identifier: MPL-2.0
// Three widths, tested (issue 164 acceptance criteria): 1440 (a full screen), 960 (half of
// 1920), 720 (half of 1440). At every width, on both rooms: no horizontal scroll, no text
// clipped by its own container, the nav in one row or a deliberate collapsed form, every button
// reachable and labelled.
//
// The assertions themselves live in width-helpers.ts (issue 173): the bridge's own spec reuses
// the exact same proof, rather than a second, drifting copy.
import { test, expect } from '@playwright/test';
import { WIDTHS, assertNoOverflow, assertNavIsOneRow, assertEveryButtonIsLabelled } from './width-helpers';

const ROOMS = ['/', '/quests'];

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
