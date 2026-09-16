// SPDX-License-Identifier: MPL-2.0
// The atlas (ADR 0015, issue 177): docs/factory/map.yaml, painted under d3-zoom. Runs against the
// ordinary fixture server (fixture-repo.ts's map.yaml fixture); the GitHub-unreachable half of
// ADR 0015 has its own deterministic server and spec, atlas-offline.spec.ts.
import { test, expect } from '@playwright/test';
import { WIDTHS, assertNoOverflow, assertNavIsOneRow } from './width-helpers';

test.describe('The atlas paints regions and tiles from map.yaml', () => {
  test('one region and ten tiles render, each tile carrying its state', async ({ page }) => {
    await page.goto('/atlas');
    await expect(page.getByRole('heading', { name: 'Known space, painted from the map' })).toBeVisible();
    const svg = page.locator('[data-testid="atlas-svg"]');
    await expect(svg).toBeVisible();
    await expect(page.locator('[data-testid="atlas-region"]')).toHaveCount(1);
    const tiles = page.locator('[data-testid="atlas-tile"]');
    await expect(tiles).toHaveCount(10, { timeout: 10_000 });
    // Every tile carries a real state, one of the three ADR 0015 names -- never a blank/unknown.
    const states = await tiles.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-state')));
    for (const state of states) expect(['lit', 'cleared-for-jump', 'contact']).toContain(state);
  });

  test('pan and zoom: the view group carries a transform after a wheel-zoom gesture', async ({ page }) => {
    await page.goto('/atlas');
    const svg = page.locator('[data-testid="atlas-svg"]');
    await expect(svg).toBeVisible();
    const view = svg.locator('g').first();
    const before = await view.getAttribute('transform');
    const box = await svg.boundingBox();
    if (!box) throw new Error('atlas svg has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await expect
      .poll(async () => view.getAttribute('transform'))
      .not.toBe(before);
  });

  test('the legend names all three tile states and fog', async ({ page }) => {
    await page.goto('/atlas');
    const legend = page.locator('.atlas-legend');
    await expect(legend).toContainText('Lit');
    await expect(legend).toContainText('Cleared for jump');
    await expect(legend).toContainText('Contact');
    await expect(legend).toContainText('Fogged region');
  });
});

for (const width of WIDTHS) {
  test(`the atlas at ${width}x900: no overflow, one-row nav`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/atlas');
    await expect(page.locator('[data-testid="atlas-svg"]')).toBeVisible();
    await assertNoOverflow(page);
    await assertNavIsOneRow(page);
  });
}
