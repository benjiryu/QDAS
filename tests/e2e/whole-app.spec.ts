import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Every surface, scanned whole.
 *
 * Specification: build-sequence Task 26.
 *
 * The other axe checks in this suite are each scoped to one region — the menu,
 * the transcript, the dialog. A scoped scan cannot see the banner behind it, so
 * it cannot see the failures that only exist between surfaces. These scan the
 * page.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const project = fixture.project;

const ROUTES: [string, string][] = [
  ['the projects list', '/projects'],
  ['a project', `/projects/${project.projectId}`],
  ['a source', `/projects/${source.projectId}/sources/${source.sourceId}`],
];

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
});

for (const [name, url] of ROUTES) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  });
}

test('the focus ring survives the banner it sits on', async ({ page }) => {
  // The example the task names. --focus is blue-100 everywhere else, which on
  // a blue-100 banner would be a ring nobody can see.
  await page.goto('/projects');

  const banner = await page
    .locator('.app-banner')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(banner).toBe('rgb(31, 71, 131)');

  // The rendered ring, not the token it came from: this is what a user sees.
  await page.locator('.app-banner__name').focus();
  const ring = await page
    .locator('.app-banner__name')
    .evaluate((element) => getComputedStyle(element).outlineColor);

  expect(ring).toBe('rgb(255, 255, 255)');
  expect(ring).not.toBe(banner);
});

test('every route reflows at 320px without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });

  for (const [name, url] of ROUTES) {
    await page.goto(url);
    await expect(page.locator('h1')).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `${name} scrolls sideways at 320px`).toBe(false);
  }
});
