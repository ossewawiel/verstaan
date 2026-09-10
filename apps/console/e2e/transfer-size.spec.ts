// SPDX-License-Identifier: MPL-2.0
// Cold load of / under 250 KB transferred, excluding fonts (issue 99 acceptance criteria).
import { test, expect } from '@playwright/test';

test('cold load of / transfers under 250 KB, excluding fonts', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  let total = 0;
  client.on('Network.loadingFinished', (event) => {
    total += event.encodedDataLength;
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Verstaan' })).toBeVisible();

  // No fonts are loaded by this app (theme.css uses only system/monospace stacks), so `total`
  // already excludes them; nothing to subtract.
  console.log(`cold load transfer size: ${total} bytes (${(total / 1024).toFixed(1)} KB)`);
  expect(total).toBeLessThan(250 * 1024);
});
