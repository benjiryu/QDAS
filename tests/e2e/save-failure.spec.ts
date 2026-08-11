import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bindingsFor } from '../../src/config/keybindings';
import type { Chord, Command } from '../../src/config/keybindings';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/excerpt-selection.md section 9, and
 * docs/patterns/code-selection.md section 12.
 *
 * The highest-value regression test in the prototype. A save failure that
 * silently drops work will end a participant session, and the symptom is a
 * coder discovering their codes are gone after the fact.
 *
 * Run under the `saveFailure` preset, which arms exactly one failure.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}?preset=saveFailure`;

let bindings = bindingsFor('other');

function chordFor(command: Command): string {
  const chord: Chord = bindings[command];
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Control');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  if (chord.meta) parts.push('Meta');
  parts.push(chord.key);
  return parts.join('+');
}

const press = (page: Page, command: Command) => page.keyboard.press(chordFor(command));

const NOTE = 'This passage is the clearest statement of the water problem.';

async function assertive(page: Page): Promise<string> {
  return page.getByTestId('live-region-assertive').innerText();
}

/**
 * The pending assignment, which since D-039 is the set of checked boxes.
 *
 * Deduplicated: one code can have a row in the codebook, in the search results,
 * and in recently used at the same time.
 */
/** Expands the note disclosure if it is collapsed, and returns the field. */
async function noteField(page: Page) {
  const row = page.locator('[data-region="note"] button[aria-expanded]');
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  return page.getByLabel(/note about this excerpt/i);
}

async function pendingCodeIds(page: Page): Promise<string[]> {
  const ids = await page
    .locator('.code-panel [data-code-id]')
    .evaluateAll((boxes) =>
      boxes
        .filter((box) => (box as HTMLInputElement).checked)
        .map((box) => box.getAttribute('data-code-id') ?? ''),
    );
  return [...new Set(ids)];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);

  const isMac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent));
  bindings = bindingsFor(isMac ? 'mac' : 'other');

  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('a failed save loses nothing, and the retry succeeds', async ({ page }) => {
  // Capture an excerpt. Clicking a turn focuses it, so the turn fallback in
  // capture rule 1.1 step 2 resolves and the whole turn is captured.
  await page.locator('[data-turn-id]').nth(1).click();
  await press(page, 'excerpt.code');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  // Two codes and a note.
  const codebook = page.locator('[data-region="codebook"]');
  await codebook.getByRole('checkbox', { name: /Waiting list/ }).check();
  await codebook.getByRole('checkbox', { name: /Mutual aid/ }).check();
  await (await noteField(page)).fill(NOTE);

  expect(await pendingCodeIds(page)).toHaveLength(2);

  // Force the failure: the preset armed the next save.
  await page.getByRole('button', { name: 'Save & Close' }).click();

  // All three survive.
  await expect(page.locator('[data-save-error]')).toBeVisible();
  expect(await pendingCodeIds(page)).toHaveLength(2);
  for (const name of ['Waiting list', 'Mutual aid']) {
    await expect(
      page.locator('[data-region="codebook"]').getByRole('checkbox', { name: new RegExp(name) }),
    ).toBeChecked();
  }
  await expect(await noteField(page)).toHaveValue(NOTE);
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'confirmed');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  // Nothing was written.
  await expect(page.locator('[data-saved-excerpts]')).toHaveAttribute('data-saved-excerpts', '0');
  await expect(page.locator('[data-saved-assignments]')).toHaveAttribute(
    'data-saved-assignments',
    '0',
  );
  await expect(page.locator('[data-saved-notes]')).toHaveAttribute('data-saved-notes', '0');

  // It was announced assertively, saying what failed and that nothing was lost.
  await expect.poll(async () => await assertive(page), { timeout: 20_000 }).toMatch(
    /could not be written/i,
  );
  expect(await assertive(page)).toMatch(/nothing was lost/i);

  // Focus is on the error, with retry adjacent.
  const focused = await page.evaluate(() => ({
    hasError: document.activeElement?.hasAttribute('data-save-error') ?? false,
  }));
  expect(focused.hasError).toBe(true);

  // Retry succeeds.
  await page.getByRole('button', { name: 'Retry save' }).click();

  await expect(page.getByRole('dialog', { name: /code assignment/i })).toHaveCount(0);
  await expect(page.locator('[data-saved-excerpts]')).toHaveAttribute('data-saved-excerpts', '1');
  await expect(page.locator('[data-saved-assignments]')).toHaveAttribute(
    'data-saved-assignments',
    '2',
  );
  await expect(page.locator('[data-saved-notes]')).toHaveAttribute('data-saved-notes', '1');
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'saved');

  // And the sentences now read as coded.
  await expect(page.locator('[data-display-state^="coded"]').first()).toBeVisible();
});

test('without the preset, the first save simply succeeds', async ({ page }) => {
  await page.goto(`/projects/${source.projectId}/sources/${source.sourceId}`);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();

  await page.locator('[data-turn-id]').nth(1).click();
  await press(page, 'excerpt.code');
  await page
    .locator('[data-region="codebook"]')
    .getByRole('checkbox', { name: /Waiting list/ })
    .check();

  await page.getByRole('button', { name: 'Save & Close' }).click();

  await expect(page.locator('[data-save-error]')).toHaveCount(0);
  await expect(page.locator('[data-saved-excerpts]')).toHaveAttribute('data-saved-excerpts', '1');
});

test('the dialog is modal, dismissable by clicking outside, and announceable', async ({
  page,
}) => {
  await page.goto(`/projects/${source.projectId}/sources/${source.sourceId}`);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();

  await page.locator('[data-turn-id]').nth(1).click();
  await press(page, 'excerpt.code');

  const dialog = page.getByRole('dialog', { name: /code assignment/i });
  await expect(dialog).toBeVisible();

  // Centred on the viewport, not the document: a magnified user panned into a
  // corner still finds it. D-026.
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  const centreOffset = Math.abs(box.x + box.width / 2 - viewport.width / 2);
  expect(centreOffset).toBeLessThan(2);

  // The page behind is dimmed and taken out of the accessibility tree. Chromium
  // gets `inert` here rather than `aria-hidden`; either satisfies the claim,
  // which is that what is dimmed is genuinely unavailable.
  await expect(page.locator('.code-panel__overlay')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.querySelector('[data-transcript]')?.closest('[aria-hidden="true"], [inert]') !==
        null,
    ),
  ).toBe(true);

  // The live regions are not, or the panel would announce into a void: every
  // check, every count, and the assertive save failure come from in here.
  expect(
    await page.evaluate(() =>
      ['live-region-polite', 'live-region-assertive'].every(
        (id) =>
          document
            .querySelector(`[data-testid="${id}"]`)
            ?.closest('[aria-hidden="true"], [inert]') === null,
      ),
    ),
  ).toBe(true);

  // Focus is trapped: tabbing many times never leaves the dialog.
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
    ).toBe(true);
  }

  // The divider under the heading belongs to the header, which does not
  // scroll, so it stays put as the codebook moves under it. Checked here
  // because jsdom drops any declaration using a `var()`.
  const borders = await page.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector(selector)!;
      const computed = getComputedStyle(element);
      return { top: computed.borderTopStyle, bottom: computed.borderBottomStyle };
    };
    return {
      header: style('.code-panel__header'),
      firstRegion: style('.code-panel__scroll > .code-panel__region'),
    };
  });
  expect(borders.header.bottom).toBe('solid');
  // And no second line immediately beneath it.
  expect(borders.firstRegion.top).toBe('none');

  // And a real click on the backdrop dismisses it, with nothing pending.
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
});
