// SPDX-License-Identifier: MPL-2.0
// ADR 0014 + ADR 0015: GitHub down leaves every lit and contact tile painted from the issue files
// alone, and the atlas's cleared-for-jump tier goes unpainted -- the bridge's comms-lost chip is
// the one visible sign anything changed. This runs against a dedicated server started with
// VERSTAAN_CONSOLE_FORCE_GITHUB_UNREACHABLE=1 (playwright.config.ts's "atlas-offline" project),
// so the assertion is deterministic regardless of this machine's own `gh` login or network.
import { test, expect } from '@playwright/test';

test.describe('GitHub unreachable: the atlas still paints, cleared-for-jump is empty, the bridge shows comms-lost', () => {
  test('the atlas renders every tile, with no tile in the cleared-for-jump state', async ({ page }) => {
    await page.goto('/atlas');
    const chip = page.locator('[data-testid="atlas-github-chip"]');
    await expect(chip).toHaveText(/comms-lost/);
    const tiles = page.locator('[data-testid="atlas-tile"]');
    await expect(tiles).toHaveCount(10, { timeout: 10_000 });
    const states = await tiles.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-state')));
    expect(states.every((s) => s === 'lit' || s === 'contact')).toBe(true);
    expect(states).not.toContain('cleared-for-jump');
  });

  test('the bridge shows the comms-lost chip', async ({ page }) => {
    await page.goto('/');
    const github = page.getByText('GitHub', { exact: true }).locator('..');
    await expect(github.locator('.status-chip')).toHaveText('comms-lost');
  });
});
