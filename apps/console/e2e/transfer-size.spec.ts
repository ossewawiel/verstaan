// SPDX-License-Identifier: MPL-2.0
// Cold load of / under 250 KB transferred (issue 99 acceptance criteria).
import { test, expect } from '@playwright/test';

test('cold load of / transfers under 250 KB', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  let total = 0;
  client.on('Network.loadingFinished', (event) => {
    total += event.encodedDataLength;
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Verstaan' })).toBeVisible();

  // Issue 99 first measured this with no fonts bundled. Issue 164 bundles two self-hosted
  // faces (~55 KB, latin subset, weights 400/700 only — DESIGN.md "Transfer budget"), so `total`
  // now includes them: the 250 KB ceiling was never a JS-only budget, and stays the ceiling for
  // the whole cold load, fonts included.
  console.log(`cold load transfer size: ${total} bytes (${(total / 1024).toFixed(1)} KB)`);
  expect(total).toBeLessThan(250 * 1024);
});
