import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The command strip and the selection menu, styled.
 *
 * Specification: build-sequence Task 24, and the button mappings in
 * src/styles/tokens.css.
 *
 * These run in a browser because the properties in question are computed from
 * a real cascade: jsdom drops any declaration carrying a `var()`, so most of
 * the token treatment is invisible to it.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

const strip = '.transcript-toolbar__button, .excerpt-toolbar__button';

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('the strip is five controls, each showing its chord', async ({ page }) => {
  const buttons = page.locator(strip);
  await expect(buttons).toHaveCount(5);

  for (const button of await buttons.all()) {
    await expect(button.locator('kbd')).not.toBeEmpty();
  }
});

test('Code selection is filled and the rest are not', async ({ page }) => {
  const fill = (selector: string) =>
    page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor);

  const primary = await fill('[data-command="excerpt.code"]');
  const secondary = await fill('[data-command="excerpt.note"]');

  expect(primary).not.toBe(secondary);
  // blue-100, the primary fill.
  expect(primary).toBe('rgb(31, 71, 131)');
});

test('the two containers abut, so the strip reads as one', async ({ page }) => {
  const orientation = (await page.locator('.transcript-toolbar').boundingBox())!;
  const excerpt = (await page.locator('.excerpt-toolbar').boundingBox())!;

  expect(Math.abs(orientation.y + orientation.height - excerpt.y)).toBeLessThan(1);
  expect(Math.abs(orientation.x - excerpt.x)).toBeLessThan(1);
});

test('hover raises a shadow, and reduced motion keeps it without animating', async ({ page }) => {
  const button = page.locator('[data-command="excerpt.code"]');

  const transition = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(transition)).toBeGreaterThan(0);

  await button.hover();
  const shadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe('none');

  // Contract 2.5: no animation is required to understand a state change. The
  // shadow survives; the animating between states does not.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await button.evaluate((el) => ({
    transition: getComputedStyle(el).transitionDuration,
    shadow: getComputedStyle(el).boxShadow,
  }));

  expect(parseFloat(reduced.transition)).toBe(0);
  expect(reduced.shadow).not.toBe('none');
});

test('a disabled control keeps a channel other than colour', async ({ page }) => {
  // Nothing is focused, so the orientation commands are unavailable.
  const style = await page.evaluate((selector) => {
    const button = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (candidate) => candidate.getAttribute('aria-disabled') === 'true',
    );
    if (!button) return null;
    const computed = getComputedStyle(button);
    return { borderStyle: computed.borderTopStyle, colour: computed.color };
  }, strip);

  // Null would mean no control was disabled, and the test would be asserting
  // nothing; this fails in that case rather than passing quietly.
  expect(style).not.toBeNull();
  expect(style!.borderStyle).toBe('dashed');
});

test('the strip and the open menu have no accessibility violations', async ({ page }) => {
  const stripResults = await new AxeBuilder({ page }).include('.excerpt-toolbar').analyze();
  expect(stripResults.violations).toEqual([]);

  // And the menu, opened over a selection.
  await page.evaluate(() => {
    const segment = document.querySelector('[data-segment-id]')!;
    const range = document.createRange();
    range.selectNodeContents(segment);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('[data-segment-id]').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();

  const menuResults = await new AxeBuilder({ page }).include('[role="menu"]').analyze();
  expect(menuResults.violations).toEqual([]);
});
