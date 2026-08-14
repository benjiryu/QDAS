import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bindingsFor, describeChord } from '../../src/config/keybindings';
import type { Command, Platform } from '../../src/config/keybindings';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The shortcuts help.
 *
 * Specification: decision D-057, which names this the canonical visible surface
 * for the command vocabulary, and D-065, which recorded the gate it closes.
 *
 * In a browser rather than only in jsdom for the two things jsdom cannot
 * answer: whether it reflows at 320 effective pixels with the reading scale at
 * its maximum, and whether the chords it renders are the ones the real platform
 * detection produces. Both are contract 2.5 and 2.6 questions, and both are
 * layout facts that a `var()`-dropping DOM has no opinion about.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

test.beforeEach(async ({ page }) => {
  await page.goto(sourceUrl);
});

const help = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Keyboard shortcuts' });

test('the banner control opens it, which is the way in that needs no chord', async ({ page }) => {
  await expect(help(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();

  await expect(help(page)).toBeVisible();
  // Named groups, and rows inside them. The content, not just the container.
  await expect(help(page).getByRole('heading', { name: 'In the transcript' })).toBeVisible();
  expect(await help(page).locator('kbd').count()).toBeGreaterThan(5);
});

test('it reflows at 320px with the reading scale at maximum', async ({ page }) => {
  /*
    Contract 2.5. 320 effective pixels is what 400 percent zoom of a 1280px
    viewport comes to, and the reading scale composes on top of that — a
    magnification participant runs both. The chords are the part at risk: each
    is a bordered nowrap box beside a label, so the row has to wrap rather than
    push the page sideways.
  */
  const increase = page.getByRole('button', { name: 'Increase text size' });
  for (let press = 0; press < 8; press += 1) {
    if ((await increase.getAttribute('aria-disabled')) === 'true') break;
    await increase.click();
  }
  expect(Number(await page.locator('html').getAttribute('data-reading-scale'))).toBe(250);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(help(page)).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows, 'the help scrolls sideways at 320px').toBe(false);

  // And no row is itself wider than the dialog, which is how a nowrap chord
  // would fail without the page as a whole overflowing.
  const spills = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[data-region="shortcuts-help"]')!;
    const limit = dialog.getBoundingClientRect().right + 1;
    return [...dialog.querySelectorAll<HTMLElement>('.shortcuts-help__row')].filter(
      (row) => row.getBoundingClientRect().right > limit,
    ).length;
  });
  expect(spills).toBe(0);
});

test('the chords it shows are the ones this platform actually uses', async ({ page }) => {
  /*
    The runtime derivation, checked where platform detection is real: the table
    is picked from the browser's own user agent, and every row is compared to
    what `describeChord` makes of that table's entry.

    Exact strings rather than a spot check for a modifier name, because the two
    tables share most of their modifiers — what separates them is which command
    carries which, and only a row-by-row comparison sees that.
  */
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();

  const platform: Platform = (await page.evaluate(() =>
    /Mac|iPhone|iPad/.test(navigator.userAgent),
  ))
    ? 'mac'
    : 'other';
  const bindings = bindingsFor(platform);

  const rows = await help(page)
    .locator('.shortcuts-help__row[data-command]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        command: element.getAttribute('data-command')!,
        chord: element.querySelector('kbd')?.textContent ?? '',
      })),
    );

  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.chord, `the row for ${row.command}`).toBe(
      describeChord(bindings[row.command as Command], platform),
    );
  }
});

test('has no axe violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(help(page)).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
