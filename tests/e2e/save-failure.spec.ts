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

function pendingNames(page: Page) {
  return page
    .locator('[data-region="pending"] li')
    .evaluateAll((items) => items.map((item) => item.textContent ?? ''));
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
  // Confirm an excerpt.
  await press(page, 'segment.next');
  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');
  await press(page, 'excerpt.end.expand');
  await press(page, 'excerpt.confirm');
  await expect(page.getByRole('region', { name: /code selection/i })).toBeVisible();

  // Two codes and a note.
  const codebook = page.locator('[data-region="codebook"]');
  await codebook.getByRole('checkbox', { name: /Waiting list/ }).check();
  await codebook.getByRole('checkbox', { name: /Mutual aid/ }).check();
  await page.getByLabel(/note about this excerpt/i).fill(NOTE);

  expect(await pendingNames(page)).toHaveLength(2);

  // Force the failure: the preset armed the next save.
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // All three survive.
  await expect(page.locator('[data-save-error]')).toBeVisible();
  expect(await pendingNames(page)).toHaveLength(2);
  expect((await pendingNames(page)).join(' ')).toContain('Waiting list');
  expect((await pendingNames(page)).join(' ')).toContain('Mutual aid');
  await expect(page.getByLabel(/note about this excerpt/i)).toHaveValue(NOTE);
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'confirmed');
  await expect(page.getByRole('region', { name: /code selection/i })).toBeVisible();

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

  await expect(page.getByRole('region', { name: /code selection/i })).toHaveCount(0);
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

  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');
  await press(page, 'excerpt.confirm');
  await page
    .locator('[data-region="codebook"]')
    .getByRole('checkbox', { name: /Waiting list/ })
    .check();

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.locator('[data-save-error]')).toHaveCount(0);
  await expect(page.locator('[data-saved-excerpts]')).toHaveAttribute('data-saved-excerpts', '1');
});
