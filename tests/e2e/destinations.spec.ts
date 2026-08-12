import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The three destinations and the sidebar, per D-043.
 *
 * In a browser for the things jsdom cannot answer: whether the current-page
 * marker actually draws, whether the sidebar reflows, and whether a real
 * navigation keeps saved work.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const projectUrl = `/projects/${project.projectId}`;

const DESTINATIONS = [
  { segment: 'codebook', label: 'Code book' },
  { segment: 'coded-data', label: 'Coded data' },
  { segment: 'notes', label: 'Notes' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
});

for (const destination of DESTINATIONS) {
  test(`${destination.label} has no accessibility violations`, async ({ page }) => {
    await page.goto(`${projectUrl}/${destination.segment}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(destination.label);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('the current destination is marked by more than colour', async ({ page }) => {
  await page.goto(`${projectUrl}/coded-data`);

  const marker = await page
    .getByRole('link', { name: 'Coded data' })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        current: element.getAttribute('aria-current'),
        borderWidth: parseFloat(style.borderLeftWidth),
        weight: style.fontWeight,
      };
    });

  // Programmatic and visible, and the visible half is a bar and a weight rather
  // than a hue, per contract 2.5.
  expect(marker.current).toBe('page');
  expect(marker.borderWidth).toBeGreaterThan(1);
  expect(Number(marker.weight)).toBeGreaterThan(400);
});

test('only the open destination is marked', async ({ page }) => {
  await page.goto(`${projectUrl}/notes`);

  const marked = await page
    .locator('.project-nav__link[aria-current="page"]')
    .allTextContents();

  expect(marked).toEqual(['Notes']);
});

test('saved work survives a real navigation and back', async ({ page }) => {
  await page.goto(`${projectUrl}/sources/${source.sourceId}`);

  // Capture from the focused turn, check one code, save.
  await page.locator('[data-turn-id]').nth(1).click();
  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();
  await page.locator('[data-region="codebook"] input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeHidden();

  await page.getByRole('link', { name: 'Coded data' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coded data');
  await expect(page.getByText('1 coded excerpt')).toBeVisible();

  // And it is still coded on the transcript afterwards.
  await page.getByRole('link', { name: source.title }).click();
  await expect(page.locator('[data-coded-run]').first()).toBeVisible();
});

test('a reload clears the session, per D-044', async ({ page }) => {
  await page.goto(`${projectUrl}/sources/${source.sourceId}`);
  await page.locator('[data-turn-id]').nth(1).click();
  await page.keyboard.press('Control+Alt+Enter');
  await page.locator('[data-region="codebook"] input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Save & Close' }).click();

  // By link, not `goto`: a document load is already a reload, and would clear
  // the session before this had a chance to show it surviving.
  await page.getByRole('link', { name: 'Coded data' }).click();
  await expect(page.getByText('1 coded excerpt')).toBeVisible();

  // "A page reload still clears in-progress state, unchanged from D-036's
  // scope." Held in memory, never in storage, which is what makes this true.
  await page.reload();
  await expect(page.getByText('0 coded excerpts')).toBeVisible();
});

/**
 * Section 1's third acceptance criterion: "Given the page at 400 percent zoom,
 * when the coder reads a code record, then no horizontal panning is required."
 *
 * 400 percent zoom of a 1280px viewport is 320 effective pixels, which is how
 * WCAG 1.4.10 defines the target and how it can be driven here. Checked with a
 * query active as well, because the results region is the widest thing the page
 * renders.
 */
test('the codebook needs no horizontal panning at 400 percent', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${projectUrl}/codebook`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Code book');

  const overflows = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );

  expect(await overflows(), 'reading the records').toBe(false);

  await page.getByRole('searchbox', { name: /search the codebook/i }).fill('water access');
  await expect(page.getByRole('heading', { name: /results for/i })).toBeVisible();
  expect(await overflows(), 'with results on screen').toBe(false);
});

test('the codebook has no violations with a query active', async ({ page }) => {
  // The static scan above covers the page at rest. The results region only
  // exists while a query does, so it needs a scan of its own.
  await page.goto(`${projectUrl}/codebook`);
  await page.getByRole('searchbox', { name: /search the codebook/i }).fill('water');
  await expect(page.getByRole('heading', { name: /results for/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the sidebar reflows at 320px without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });

  for (const destination of DESTINATIONS) {
    await page.goto(`${projectUrl}/${destination.segment}`);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `overflow on ${destination.label}`).toBe(false);
  }
});
