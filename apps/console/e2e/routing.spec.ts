// SPDX-License-Identifier: MPL-2.0
// Deep links and the back button move between rooms with no document request (issue 99
// acceptance criteria): React Router's History API navigation, not a full page load.
import { test, expect } from '@playwright/test';

test('quest 07 deep-links to its card, expanded', async ({ page }) => {
  await page.goto('/quests/07');
  await expect(page.locator('#quest-detail-07')).toBeVisible();
});

test('moving between rooms fires zero document requests', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Verstaan' })).toBeVisible();

  // Counted from here: a hard navigation asks the network for a new HTML document
  // (request.resourceType() === 'document'); React Router's own routing never does.
  let documentRequests = 0;
  page.on('request', (req) => {
    if (req.resourceType() === 'document') documentRequests += 1;
  });

  const nav = page.getByRole('navigation', { name: 'Rooms' });
  await nav.getByRole('link', { name: 'Quests' }).click();
  await expect(page.getByRole('heading', { name: 'The backlog' })).toBeVisible();

  await nav.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { name: 'Every project document' })).toBeVisible();

  await nav.getByRole('link', { name: 'Glossary' }).click();
  await expect(page.getByRole('heading', { name: 'Glossary' }).first()).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Every project document' })).toBeVisible();

  expect(documentRequests).toBe(0);
});
