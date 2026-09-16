// SPDX-License-Identifier: MPL-2.0
// Ship systems (issue 175): a read-only room over the factory's own machinery. This is the first
// spec in this suite to assert the zero-mutation contract directly (no POST/PUT/DELETE/PATCH ever
// fires on load) -- every other room either legitimately writes (Jobs, the bridge's action
// buttons) or has never had this proof written for it.
import { test, expect } from '@playwright/test';
import { WIDTHS, assertNoOverflow, assertNavIsOneRow } from './width-helpers';
import { addFixtureAgent } from './fixture-repo';

test.describe('Ship systems lists the party, skills, commands and hooks', () => {
  test('lists every agent with name, description, model, effort and tools', async ({ page }) => {
    await page.goto('/ship-systems');
    const card = page.getByText('fixture-agent', { exact: true }).locator('..');
    await expect(card).toContainText('sonnet / low');
    await expect(card).toContainText('A fixture agent for the console e2e suite.');
    await expect(card).toContainText('Read');
    await expect(card).toContainText('Grep');
  });

  test('lists every skill and every command', async ({ page }) => {
    await page.goto('/ship-systems');
    await expect(page.getByText('/fixture-skill', { exact: false })).toBeVisible();
    await expect(page.getByText('A fixture skill for the console e2e suite.')).toBeVisible();
    await expect(page.getByText('/fixture-command', { exact: false })).toBeVisible();
    await expect(page.getByText('A fixture command for the console e2e suite.')).toBeVisible();
  });

  test('cross-references hooks against settings.json events, with a gap visible in both directions', async ({ page }) => {
    await page.goto('/ship-systems');
    // fixture-orphan.sh: a file on disk that no event in settings.json references. Listed once,
    // in the files panel only.
    const orphanRow = page.getByText('fixture-orphan.sh', { exact: false });
    await expect(orphanRow).toBeVisible();
    await expect(orphanRow).toContainText('not referenced by any event');
    // fixture-missing.sh: an event's own command names a file that is not in .claude/hooks/.
    // Listed once, in the events panel only -- it has no row of its own in the files panel,
    // because it is not a real file.
    const missingRow = page.getByText('fixture-missing.sh', { exact: false });
    await expect(missingRow).toBeVisible();
    await expect(missingRow).toContainText('no matching file');
    // fixture-referenced.sh: the one hook wired up correctly -- named once in the events panel
    // (under PostToolUse) and once in the files panel (naming PostToolUse back), so this locator
    // must be `.first()` under strict mode.
    await expect(page.getByText('fixture-referenced.sh', { exact: false }).first()).toBeVisible();
  });

  test("renders the playbook's own headings as one ordered lane", async ({ page }) => {
    await page.goto('/ship-systems');
    const lane = page.locator('.ship-lane');
    await expect(lane).toBeVisible();
    const stations = lane.locator('.ship-lane__station');
    await expect(stations).toHaveCount(3);
    await expect(stations.nth(0)).toContainText('The map');
    await expect(stations.nth(1)).toContainText('An encounter, start to finish');
    await expect(stations.nth(2)).toContainText('The gate ladder');
  });

  // Issue 175 acceptance criteria: adding an agent file appears on the next load, no console code
  // change. The fixture file lands on disk mid-test, the same shape a real `/factory-run` session
  // adding a sixth agent would take; this spec never edits a single line under client/ or server/.
  test('a newly added agent file appears on the next load, with no console code change', async ({ page }) => {
    addFixtureAgent('fixture-agent-added-live');
    await page.goto('/ship-systems');
    await expect(page.getByText('fixture-agent-added-live', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});

test('the room makes no write request (POST/PUT/DELETE/PATCH) on load', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (req) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
  });
  await page.goto('/ship-systems');
  await expect(page.getByRole('heading', { name: "The factory's own machinery" })).toBeVisible();
  // Give any change-stream-triggered refetch or stray timer a moment to fire, the same margin
  // now-row.spec.ts and boarding-pass.spec.ts give their own async proofs.
  await page.waitForTimeout(1000);
  expect(writes, 'no write request should fire loading a read-only room').toEqual([]);
});

for (const width of WIDTHS) {
  test(`ship systems at ${width}x900: no overflow, one-row nav`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ship-systems');
    await expect(page.locator('.cic-bar')).toBeVisible();
    await assertNoOverflow(page);
    await assertNavIsOneRow(page);
  });
}
