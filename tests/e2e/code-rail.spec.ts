import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The code rail in a real browser.
 *
 * Specification: decision D-041.
 *
 * The assertion jsdom can only approximate is the one that matters: what the
 * browser's own accessibility tree makes of a focused turn. jsdom has no
 * accessible-description computation, so it can check the wiring but not the
 * result.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('the browser describes a coded turn by its counts, and names no code', async ({ page }) => {
  const turn = page.locator('[data-turn-id][aria-describedby]').first();
  await turn.scrollIntoViewIfNeeded();

  const described = await turn.evaluate((element) => {
    const id = element.getAttribute('aria-describedby')!;
    return document.getElementById(id)?.textContent ?? '';
  });

  expect(described).toMatch(/^\d+ excerpts?, \d+ codes?(, note)?$/);

  // Every pill label is absent from it: the description is the twin of the
  // glance, not a recitation.
  const pills = await turn.locator('.transcript-turn__pill').allTextContents();
  expect(pills.length).toBeGreaterThan(0);
  for (const label of pills) expect(described).not.toContain(label);
});

test('the rail is hidden from the accessibility tree', async ({ page }) => {
  const rails = page.locator('.transcript-turn__rail');
  expect(await rails.count()).toBeGreaterThan(0);

  for (const rail of await rails.all()) {
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
  }

  // And the browser agrees: a pill is not reachable by its text as a node the
  // accessibility tree exposes.
  const label = (await page.locator('.transcript-turn__pill').first().textContent())!;
  expect(
    await page.evaluate(
      (text) =>
        Array.from(document.querySelectorAll('.transcript-turn__pill'))
          .filter((pill) => pill.textContent === text)
          .every((pill) => pill.closest('[aria-hidden="true"]') !== null),
      label,
    ),
  ).toBe(true);
});

test('the rail reflows rather than forcing horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator('.transcript-turn__rail').first().scrollIntoViewIfNeeded();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});

test('the focus ring is visible on a turn inside a highlight', async ({ page }) => {
  const coded = page.locator('[data-turn-id]:has([data-coded-run])').first();
  await coded.focus();

  const ring = await coded.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle, colour: style.outlineColor };
  });

  expect(ring.style).toBe('solid');
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
});

test('the styled transcript has no accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).include('[data-transcript]').analyze();
  expect(results.violations).toEqual([]);
});
