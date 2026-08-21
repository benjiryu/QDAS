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
  await expect(page.locator('[data-saved-excerpts]')).toHaveAttribute('data-excerpt-state', 'confirmed');
  await expect.poll(async () => await polite(page)).toMatch(/coding your selection/i);
});

test('the pointer route captures the selection a drag just made', async ({ page }) => {
  const dragged = await sweepAcrossTwoSentences(page);

  /*
    The sighted route in section 1. It used to be the strip's Assign code
    control; with the strip removed the context menu is the whole of it, which
    is why that menu is now more load-bearing than D-037 assumed rather than
    less.
  */
  await page.locator('[data-segment-id]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Assign code/ }).click();

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

test('add note opens the isolated note panel', async ({ page }) => {
  // Amended for D-055: this command used to open code selection focused on its
  // note row. Reaching the field through the whole panel was what session
  // evidence found too costly, so it now opens the field on its own.
  await page.locator('[data-turn-id]').nth(1).click();

  await press(page, 'excerpt.note');

  await expect(page.locator('[data-region="note-panel"]')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toHaveCount(0);
  await expect(page.getByLabel('Note', { exact: true })).toBeFocused();
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
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toHaveCount(0);

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

/*
 * Two controls whose size is the whole point of them.
 *
 * Both are measurements, so they can only be made here: jsdom drops every
 * declaration carrying `var()` and has no layout to measure in the first place.
 */

test('the rail note icon is a large enough pointer target', async ({ page }) => {
  // Since D-055 this icon is the only pointer route to a turn's note, so a miss
  // has nothing cheap to fall back on. Asserted against the 24 by 24 minimum
  // and its reason rather than against the rem value, so a future restyle is
  // free to move the number and not free to go back under the threshold.
  await page.locator('[data-turn-id]').first().click();
  await press(page, 'excerpt.note');
  await page.getByLabel('Note', { exact: true }).fill('A note to hang the icon on.');
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.locator('[data-region="note-panel"]')).toHaveCount(0);

  const icon = page.locator('[data-command="note.open"]').first();
  await expect(icon).toBeVisible();

  const box = (await icon.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
});

test('the code panel note field fills the width of its region', async ({ page }) => {
  /*
    It had no rule at all, so it rendered at the browser's default textarea
    width — about twenty columns — however wide the panel was. The failure was
    not a value slightly off; it was the field ignoring the panel entirely.
  */
  await page.locator('[data-turn-id]').first().click();
  await press(page, 'excerpt.code');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  // Scoped to the dialog: the excerpt strip carries an Add note control too,
  // and it is the one that captures rather than the one that expands the row.
  const panel = page.getByRole('dialog', { name: /code assignment/i });
  await panel.getByRole('button', { name: /add note/i }).click();
  const field = page.getByLabel(/note about this excerpt/i);
  await expect(field).toBeVisible();

  const fieldBox = (await field.boundingBox())!;
  const regionBox = (await page.locator('[data-region="note"]').boundingBox())!;

  // Effectively all of it, allowing for the region's own padding.
  expect(fieldBox.width).toBeGreaterThan(regionBox.width * 0.95);
  // And never past the edge, which `box-sizing` is there to prevent.
  expect(fieldBox.width).toBeLessThanOrEqual(regionBox.width + 1);
});

/* ---------- The confirmed highlight, per D-063 ---------- */

/** The background the transcript paints on captured characters. */
async function capturedBackground(page: Page): Promise<string> {
  return page
    .locator('[data-captured]')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);
}

test('capture produces no colour change from the native selection', async ({ page }) => {
  /*
    The participant complaint, as an assertion. The passage was selection blue
    through the drag and the menu and then turned purple the instant it was
    captured — announcing an event that, to a coder, was not one: the range only
    changed hands from the browser to the application.

    D-063 makes the application highlight adopt the same token D-060 gave
    `::selection`, so the handoff is invisible. Compared as painted values
    rather than as token names, since it is the appearance the complaint was
    about.
  */
  const selectionBlue = await page
    .locator('[data-segment-id]')
    .first()
    .evaluate((node) => getComputedStyle(node, '::selection').backgroundColor);

  await sweepAcrossTwoSentences(page);
  await press(page, 'excerpt.code');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  expect(await capturedBackground(page)).toBe(selectionBlue);
});

test('save produces the coded treatment, which is a change worth seeing', async ({ page }) => {
  // The other half of D-063: what stays visible. Capture is bookkeeping and is
  // silent; saving is something the coder did, and it looks like it.
  const dragged = await sweepAcrossTwoSentences(page);
  await press(page, 'excerpt.code');

  const panel = page.getByRole('dialog', { name: /code assignment/i });
  await expect(panel).toBeVisible();
  const whileOpen = await capturedBackground(page);

  await panel.locator('[data-code-id]').first().click();
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(panel).toHaveCount(0);

  const coded = page.locator('[data-coded-run="coded"]').first();
  await expect(coded).toBeVisible();

  const after = await coded.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(after, 'the family wash is not the selection blue').not.toBe(whileOpen);
  expect(squashed(await highlighted(page)), 'and the capture band is gone').not.toBe(
    squashed(dragged),
  );
});

test('the boundary bars read against the band they sit on', async ({ page }) => {
  // The D-036 markers carry which end is which, so they are a non-text
  // indicator and need 3:1 — measured against the new band rather than the
  // violet one they were chosen for.
  await sweepAcrossTwoSentences(page);
  await press(page, 'excerpt.code');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  const ratio = await page.evaluate(() => {
    const edge = document.querySelector<HTMLElement>('[data-capture-edge]')!;
    const style = getComputedStyle(edge);
    const bar = style.borderLeftColor === 'rgba(0, 0, 0, 0)' ? style.borderRightColor : style.borderLeftColor;

    const lum = (colour: string) => {
      const [r, g, b] = colour.match(/\d+/g)!.slice(0, 3).map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [lum(bar), lum(style.backgroundColor)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });

  expect(ratio).toBeGreaterThanOrEqual(3);
});

test('a reopened excerpt wears the blue, and its saved treatment returns', async ({ page }) => {
  // D-063 extends the treatment to any range a panel is addressing, so
  // reopening looks like capturing rather than like a third state.
  const dragged = await sweepAcrossTwoSentences(page);
  await press(page, 'excerpt.code');
  const panel = page.getByRole('dialog', { name: /code assignment/i });
  await panel.locator('[data-code-id]').first().click();
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(panel).toHaveCount(0);

  const codedBackground = await page
    .locator('[data-coded-run="coded"]')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);

  // Reopen it: the range is addressed again, so it wears the selection blue.
  await page.locator('[data-coded-run="coded"]').first().click();
  await expect(panel).toBeVisible();
  const selectionBlue = await page
    .locator('[data-segment-id]')
    .first()
    .evaluate((node) => getComputedStyle(node, '::selection').backgroundColor);
  expect(await capturedBackground(page)).toBe(selectionBlue);

  // And closing hands it back to its saved treatment.
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(panel).toHaveCount(0);
  expect(
    await page
      .locator('[data-coded-run="coded"]')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe(codedBackground);
  expect(squashed(dragged)).not.toBe('');
});

test('a note-only excerpt wears the blue while a panel addresses it', async ({ page }) => {
  /*
    D-063: while a panel addresses a range, that range wears selection blue, and
    goes back to the note-only grey and its dotted underline when the panel
    commits.

    The mechanism changed underneath this. A note edit used to open the isolated
    panel without moving the excerpt machine, so the range had to say which
    panel was addressing it; `note.open` reopens the excerpt now, which moves
    the machine and paints the captured band. What the reader sees is the same,
    which is what the test is for.
  */
  await page.locator('[data-turn-id]').first().click();
  await press(page, 'excerpt.note');
  await page.getByLabel('Note', { exact: true }).fill('Noted, not coded.');
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.locator('[data-region="note-panel"]')).toHaveCount(0);

  const noted = page.locator('[data-coded-run="noted"]').first();
  await expect(noted).toBeVisible();
  const savedTreatment = await noted.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    decoration: getComputedStyle(node).textDecorationStyle,
  }));

  await page.locator('[data-turn-id]').first().click();
  await press(page, 'note.open');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  const selectionBlue = await page
    .locator('[data-segment-id]')
    .first()
    .evaluate((node) => getComputedStyle(node, '::selection').backgroundColor);
  expect(await capturedBackground(page)).toBe(selectionBlue);

  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toHaveCount(0);

  await expect(page.locator('[data-captured]')).toHaveCount(0);
  expect(
    await page
      .locator('[data-coded-run="noted"]')
      .first()
      .evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        decoration: getComputedStyle(node).textDecorationStyle,
      })),
  ).toEqual(savedTreatment);
});
