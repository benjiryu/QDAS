import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The transcript context menu in a real browser.
 *
 * Specification: docs/patterns/excerpt-selection.md section 2, decision D-037.
 *
 * Only a real browser can show that the native menu survives where it should:
 * jsdom has no browser menu to suppress, so there the criterion can only be
 * checked as "the default was not prevented".
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

/** Everything the application highlights, in document order. */
async function highlighted(page: Page): Promise<string> {
  return page
    .locator('[data-captured]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').join(''));
}

const squashed = (text: string) => text.replace(/\s+/g, '');

async function sweepAcrossTwoSentences(page: Page): Promise<string> {
  const turn = page.locator('[data-turn-id]').first();
  const segmentIds = await turn
    .locator('[data-segment-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-segment-id')!));

  const pointInside = (segmentId: string, at: number) =>
    page.evaluate(
      ([id, fraction]) => {
        const element = document.querySelector(`[data-segment-id="${id}"]`)!;
        const rect = Array.from(element.getClientRects())[0];
        return { x: rect.x + rect.width * (fraction as number), y: rect.y + rect.height / 2 };
      },
      [segmentId, at] as const,
    );

  const from = await pointInside(segmentIds[0], 0.4);
  const to = await pointInside(segmentIds[1], 0.5);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const dragged = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(dragged.trim().length).toBeGreaterThan(0);
  return dragged;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('right-clicking a selection offers Assign code and Add note', async ({ page }) => {
  await sweepAcrossTwoSentences(page);

  await page.locator('[data-segment-id]').first().click({ button: 'right' });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  await expect(menu.getByRole('menuitem', { name: /Assign code/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Add note/ })).toBeVisible();
});

test('right-clicking plain transcript text leaves the browser menu alone', async ({ page }) => {
  // Nothing selected. The application must not intercept, which is what the
  // absent menu shows: the browser's own menu is not in the page's DOM.
  const prevented = await page.evaluate(() => {
    const segment = document.querySelector('[data-segment-id]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    segment.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(prevented).toBe(false);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('right-clicking outside the transcript leaves the browser menu alone', async ({ page }) => {
  await sweepAcrossTwoSentences(page);

  const prevented = await page.evaluate(() => {
    const strip = document.querySelector('.excerpt-toolbar')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    strip.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(prevented).toBe(false);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Shift+F10 does what right-click does', async ({ page }) => {
  await sweepAcrossTwoSentences(page);

  await page.keyboard.press('Shift+F10');

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  // Focus enters on the first item, per contract 2.4.
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
});

test('arrow keys move through the menu and Enter captures', async ({ page }) => {
  const dragged = await sweepAcrossTwoSentences(page);
  await page.keyboard.press('Shift+F10');

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem').first()).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(squashed(await highlighted(page))).toBe(squashed(dragged));
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();
});

test('Escape closes the menu and returns focus, capturing nothing', async ({ page }) => {
  await page.locator('[data-turn-id]').first().click();
  await sweepAcrossTwoSentences(page);

  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await highlighted(page)).toBe('');
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'idle');
  // Focus is back on something in the transcript, not lost to the body.
  expect(
    await page.evaluate(() => document.activeElement?.closest('[data-transcript]') !== null),
  ).toBe(true);
});

test('Add note captures the selection and lands in the note field', async ({ page }) => {
  const dragged = await sweepAcrossTwoSentences(page);

  await page.locator('[data-segment-id]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Add note/ }).click();

  expect(squashed(await highlighted(page))).toBe(squashed(dragged));
  // The item follows the command's destination, per D-055. The menu adds no
  // capability, so it lands wherever the strip control lands.
  await expect(page.locator('[data-region="note-panel"]')).toBeVisible();
  await expect(page.getByLabel('Note', { exact: true })).toBeFocused();
});

test('the open menu has no accessibility violations', async ({ page }) => {
  await sweepAcrossTwoSentences(page);
  await page.locator('[data-segment-id]').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();

  const results = await new AxeBuilder({ page })
    // Scoped to the menu: this is the one hand-assembled ARIA widget in the
    // application, and the rest of the page is another task's business.
    .include('[role="menu"]')
    .analyze();

  expect(results.violations).toEqual([]);
});

test('the selection stays visible while the menu is open', async ({ page }) => {
  /*
    The reported regression, and the layer it was reported from. Only a real
    browser has real focus and real selection painting: the menu opens with
    `autoFocus`, focus leaves the transcript, and what the browser then does
    with an unfocused selection is its business — which is why the highlight
    disappeared in some scenarios and not others.

    The application paints the snapshot the menu is already holding, so the
    passage is marked by something we control rather than by something we
    cannot see.
  */
  const dragged = await sweepAcrossTwoSentences(page);

  await page.locator('[data-segment-id]').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();

  expect(squashed(await highlighted(page))).toBe(squashed(dragged));
});

test('dismissing the menu takes the highlight away and leaves the drag', async ({ page }) => {
  // Dismissing captured nothing, so nothing stays painted. The drag survives:
  // painting the preview collapses the native selection, and the dismissal puts
  // it back rather than making the coder select the passage again.
  const dragged = await sweepAcrossTwoSentences(page);

  await page.locator('[data-segment-id]').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  expect(await highlighted(page)).toBe('');
  const stillSelected = await page.evaluate(() => document.getSelection()?.toString() ?? '');
  expect(squashed(stillSelected)).toBe(squashed(dragged));
});
