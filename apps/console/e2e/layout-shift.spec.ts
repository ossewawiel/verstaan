// SPDX-License-Identifier: MPL-2.0
// No layout shift on update (issue 99 acceptance criteria), measured with `layout-shift` entries
// from the Layout Instability API while an SSE-driven update actually lands and changes the page.
import { test, expect } from '@playwright/test';
import { setIssueStatus } from './fixture-repo';

test('an SSE-driven status change produces zero layout-shift entries', async ({ page }) => {
  // See flicker.spec.ts: SSE has no event replay, so the test must wait for the connection to
  // open before it writes the file, or the one broadcast it depends on can be missed forever.
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
  // `:not([hidden])`, not `.status-label` alone: all three status labels are always in the DOM
  // (see console.css and IssueCard.tsx), one visible per status, so the raw class matches three
  // elements and only the CSS `hidden` attribute picks out the one actually on screen.
  await expect(page.getByRole('listitem').filter({ hasText: '#06' }).locator('.status-label:not([hidden])')).toHaveText('open');

  await page.evaluate(() => {
    (window as unknown as { __shifts: number[] }).__shifts = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) (window as unknown as { __shifts: number[] }).__shifts.push(entry.value);
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
    (window as unknown as { __shiftObserver: PerformanceObserver }).__shiftObserver = observer;
  });

  setIssueStatus(6, 'in-progress');

  // Confirm the update actually landed before reading the shift log — a page that never
  // updates would trivially report zero shifts, proving nothing.
  await expect(page.getByRole('listitem').filter({ hasText: '#06' }).locator('.status-label:not([hidden])')).toHaveText('in progress', {
    timeout: 10_000,
  });

  const shifts: number[] = await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts);
  expect(shifts).toHaveLength(0);
});
