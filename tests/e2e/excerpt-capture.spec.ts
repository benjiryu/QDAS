import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bindingsFor } from '../../src/config/keybindings';
import type { Chord, Command } from '../../src/config/keybindings';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Capture in a real browser.
 *
 * Specification: docs/patterns/excerpt-selection.md section 7 (v0.2), decision
 * D-036.
 *
 * A real drag is the whole point of this rework, and jsdom cannot produce one:
 * it has no layout, so nothing there can tell whether a pointer gesture across
 * two sentences ends up as the characters the user actually swept.
 *
 * The menu criteria in section 7 belong to section 2, which is Task 19.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

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

/** Everything the application highlights, in document order. */
async function highlighted(page: Page): Promise<string> {
  return page
    .locator('[data-captured]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').join(''));
}

/** Coded characters within named sentences, once an excerpt has been saved. */
async function codedTextIn(page: Page, segmentIds: string[]): Promise<string> {
  const selector = segmentIds
    .map((id) => `[data-segment-id="${id}"] [data-coded-run]`)
    .join(', ');
  return page
    .locator(selector)
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').join(''));
}

async function polite(page: Page): Promise<string> {
  return page.getByTestId('live-region-polite').innerText();
}

/**
 * Sweeps the pointer from one point to another, as a user selecting text does.
 *
 * The pause after mouseup matters: a human pauses before reaching for a
 * control, and an earlier defect in this feature only appeared in that gap.
 */
async function sweep(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/**
 * A point a given fraction into a sentence, measured from its own client rect
 * rather than its bounding box: a sentence that wraps has a box as wide as the
 * column, most of which is not the sentence.
 */
async function pointInside(page: Page, segmentId: string, fraction: number) {
  return page.evaluate(
    ([id, at]) => {
      const element = document.querySelector(`[data-segment-id="${id}"]`)!;
      const rect = Array.from(element.getClientRects())[0];
      return { x: rect.x + rect.width * (at as number), y: rect.y + rect.height / 2 };
    },
    [segmentId, fraction] as const,
  );
}

/**
 * Sweeps from mid-sentence to mid-sentence across a turn's first two
 * sentences, and returns what the browser reports as selected.
 */
async function sweepAcrossTwoSentences(page: Page): Promise<string> {
  const turn = page.locator('[data-turn-id]').first();
  const segmentIds = await turn
    .locator('[data-segment-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-segment-id')!));

  await sweep(
    page,
    await pointInside(page, segmentIds[0], 0.4),
    await pointInside(page, segmentIds[1], 0.5),
  );

  const dragged = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  // Guards every test below: with no selection the capture rule would fall
  // through to the turn, and the assertions would pass on the wrong behaviour.
  expect(dragged.trim().length).toBeGreaterThan(0);
  return dragged;
}

/** The highlight, with whitespace normalised away: the space between two
    sentences belongs to neither, so it is never inside the highlight. */
const squashed = (text: string) => text.replace(/\s+/g, '');

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);

  const isMac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent));
  bindings = bindingsFor(isMac ? 'mac' : 'other');

  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('a mid-sentence drag is captured exactly', async ({ page }) => {
  const dragged = await sweepAcrossTwoSentences(page);

  await press(page, 'excerpt.code');

  // Character for character, with no snapping outward to whole sentences.
  expect(squashed(await highlighted(page))).toBe(squashed(dragged));
  // And it really did begin mid-sentence.
  const firstSentence = await page.locator('[data-segment-id]').first().textContent();
  expect(squashed(firstSentence ?? '')).not.toBe(squashed(dragged.split(/(?<=\.)\s/)[0] ?? ''));
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'confirmed');
  await expect.poll(async () => await polite(page)).toMatch(/coding your selection/i);
});

test('the strip control captures the selection a drag just made', async ({ page }) => {
  const dragged = await sweepAcrossTwoSentences(page);

  // The sighted route in section 1: drag, then reach for the control. Chromium
  // leaves the selection readable inside the click handler either way, so what
  // this asserts is the route, not the mousedown guard the strip carries for
  // engines that do not. The guard is covered in excerptCapture.test.tsx.
  const control = page.getByRole('button', { name: /Code selection/ });
  await control.scrollIntoViewIfNeeded();
  await control.click();

  expect(squashed(await highlighted(page))).toBe(squashed(dragged));
  await expect.poll(async () => await polite(page)).toMatch(/coding your selection/i);
});

test('the native selection is cleared once the range is captured', async ({ page }) => {
  await sweepAcrossTwoSentences(page);
  await press(page, 'excerpt.code');

  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  expect((await highlighted(page)).length).toBeGreaterThan(0);
});

test('the fallback announces itself as a fallback', async ({ page }) => {
  await page.locator('[data-turn-id]').nth(1).click();

  await press(page, 'excerpt.code');

  await expect.poll(async () => await polite(page)).toMatch(/no selection detected/i);
  expect(await polite(page)).toMatch(/coding the current turn/i);
  // The whole turn, not part of it.
  const turnText = await page
    .locator('[data-turn-id]')
    .nth(1)
    .locator('.transcript-turn__prose')
    .innerText();
  expect(squashed(await highlighted(page))).toBe(squashed(turnText));
});

test('add note opens the panel in the note field', async ({ page }) => {
  await page.locator('[data-turn-id]').nth(1).click();

  await press(page, 'excerpt.note');

  await expect(page.getByRole('region', { name: /code selection/i })).toBeVisible();
  await expect(page.getByLabel(/note about this excerpt/i)).toBeFocused();
});

test('a saved mid-sentence excerpt is coded exactly, not rounded to the sentence', async ({
  page,
}) => {
  const turn = page.locator('[data-turn-id]').first();
  const segmentIds = await turn
    .locator('[data-segment-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-segment-id')!));

  const dragged = await sweepAcrossTwoSentences(page);
  await press(page, 'excerpt.code');
  expect(squashed(await highlighted(page))).toBe(squashed(dragged));

  // Code it and save, which is where the range used to round up.
  await page
    .locator('[data-region="codebook"] input[type="checkbox"]')
    .first()
    .check();
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByRole('region', { name: /code selection/i })).toHaveCount(0);

  // What is painted after the save is what was dragged.
  expect(squashed(await codedTextIn(page, segmentIds.slice(0, 2)))).toBe(squashed(dragged));

  // And the sentences are still whole on screen, only partly coded.
  const firstSentence = await page
    .locator(`[data-segment-id="${segmentIds[0]}"]`)
    .textContent();
  expect(squashed(await codedTextIn(page, [segmentIds[0]])).length).toBeLessThan(
    squashed(firstSentence ?? '').length,
  );

  // The sentence still reports itself coded, which is what comparison asks.
  await expect(page.locator(`[data-segment-id="${segmentIds[0]}"]`)).toHaveAttribute(
    'data-display-state',
    'coded',
  );
});
