// SPDX-License-Identifier: MPL-2.0
// The flicker proof (issue 99 acceptance criteria): with /quests open and card 08 expanded,
// changing issue 07's status on disk produces an SSE event; a MutationObserver counts fewer than
// 20 added or removed nodes; card 08 stays expanded; scroll and focus are unchanged.
import { test, expect } from '@playwright/test';
import { setIssueStatus } from './fixture-repo';

test('changing one issue mutates fewer than 20 DOM nodes and leaves an open card alone', async ({ page }) => {
  // The app's own EventSource connects in a useEffect after first render, asynchronously. SSE
  // has no event replay: a change written before that connection finishes is missed forever, not
  // delayed. This flags the moment it opens, so the test can wait for a live subscription before
  // touching the fixture file, instead of racing it.
  await page.addInitScript(() => {
    const OriginalEventSource = window.EventSource;
    window.EventSource = new Proxy(OriginalEventSource, {
      construct(target, args) {
        const instance = new target(...(args as ConstructorParameters<typeof EventSource>));
        instance.addEventListener('open', () => {
          (window as unknown as { __sseOpen: boolean }).__sseOpen = true;
        });
        return instance;
      },
    });
  });

  await page.goto('/quests');
  await page.waitForFunction(() => (window as unknown as { __sseOpen?: boolean }).__sseOpen === true);
  await page.getByRole('button', { name: /#08/ }).click();
  await expect(page.locator('#quest-detail-08')).toBeVisible();

  // Scroll card 08 out of the very top so a scroll reset would be visible, then focus its
  // summary button.
  await page.locator('#quest-summary-08').scrollIntoViewIfNeeded();
  await page.locator('#quest-summary-08').focus();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const focusedBefore = await page.evaluate(() => document.activeElement?.id);

  await page.evaluate(() => {
    (window as unknown as { __mutations: number }).__mutations = 0;
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        (window as unknown as { __mutations: number }).__mutations += r.addedNodes.length + r.removedNodes.length;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as unknown as { __observer: MutationObserver }).__observer = observer;
  });

  setIssueStatus(7, 'in-progress');

  // The status label for #07 is the one thing that must change.
  await expect(page.getByRole('listitem').filter({ hasText: '#07' }).locator('.status-label:not([hidden])')).toHaveText('in progress', { timeout: 10_000 });

  const mutations = await page.evaluate(() => (window as unknown as { __mutations: number }).__mutations);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const focusedAfter = await page.evaluate(() => document.activeElement?.id);

  expect(mutations).toBeLessThan(20);
  expect(scrollAfter).toBe(scrollBefore);
  expect(focusedAfter).toBe(focusedBefore);
  await expect(page.locator('#quest-detail-08')).toBeVisible();

  console.log(`flicker proof: ${mutations} DOM node(s) added or removed`);
});
