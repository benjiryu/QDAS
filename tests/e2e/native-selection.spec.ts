import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/excerpt-selection.md section 4.0, decision D-034.
 *
 * A real drag with a real mouse, producing a real `selectionchange`. jsdom
 * cannot do either, so this is where the pointer route is actually verified.
 *
 * Done when: drag across two and a half sentences, click Code this excerpt, and
 * land in the panel with a three-sentence excerpt announced.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;
const segments = fixture.segments.filter((segment) => segment.sourceId === source.sourceId);

/** How long a user takes between releasing the mouse and pressing a control. */
const PAUSE_MS = 300;

/**
 * Presses a control the way a hand does: down, a beat, up.
 *
 * `locator.click()` sends mousedown and mouseup in one burst, which never lets
 * the browser deliver the `selectionchange` its own mousedown queued. A real
 * press does, and that ordering is what the application has to survive.
 */
async function pressControl(page: Page, name: string) {
  const control = page.getByRole('button', { name });
  // Dragging auto-scrolls the page, and the command strip is not sticky, so the
  // control is usually off screen by the time the drag ends. Scrolling does not
  // disturb the selection.
  await control.scrollIntoViewIfNeeded();

  const box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
}

/** Sentences of the second turn, which is long enough to drag inside. */
const longTurn = fixture.turns.filter((turn) => turn.sourceId === source.sourceId)[1];
const longTurnIndices = longTurn.segmentIds.map((id) =>
  segments.findIndex((segment) => segment.segmentId === id),
);

async function spoken(page: Page): Promise<string> {
  return page.getByTestId('live-region-polite').innerText();
}

/**
 * Drags from a fraction across one sentence to a fraction across another,
 * using real mouse events.
 */
async function dragAcross(
  page: Page,
  from: { index: number; fraction: number },
  to: { index: number; fraction: number },
) {
  const point = async ({ index, fraction }: { index: number; fraction: number }) => {
    const box = (await page
      .locator(`[data-segment-id="${segments[index].segmentId}"]`)
      .boundingBox())!;
    // Sentences wrap, so use the first line and step in from its left edge.
    return { x: box.x + Math.max(4, box.width * fraction), y: box.y + 6 };
  };

  const start = await point(from);
  const end = await point(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  // A human pauses before reaching for a control, and the browser clears the
  // selection on the button's mousedown, queueing a `selectionchange` task.
  // Clicking immediately observes an ordering no user ever gets.
  await page.waitForTimeout(PAUSE_MS);
}

function rangeIds(page: Page) {
  return page.locator('[data-excerpt]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-segment-id')),
  );
}

/**
 * The sentences the live DOM selection touches, read with `intersectsNode`.
 *
 * A different API from the one the application uses, deliberately: this is the
 * independent answer to "what did the user actually drag across", so the
 * never-shrinks assertion is not the implementation checking itself. Speaker
 * labels and timestamps are inside the selection too and are not sentences,
 * which is why comparing raw selection text would fail.
 */
async function touchedSentenceIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    return Array.from(document.querySelectorAll('[data-segment-id]'))
      .filter((element) => range.intersectsNode(element))
      .map((element) => element.getAttribute('data-segment-id') ?? '');
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('a drag is adopted as whole sentences and never shrinks', async ({ page }) => {
  // Two and a half sentences: from partway through one to partway through the third.
  await dragAcross(page, { index: 1, fraction: 0.5 }, { index: 3, fraction: 0.4 });

  const touched = await touchedSentenceIds(page);
  expect(touched.length).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: 'Start excerpt' }).click();

  // Snapping never shrinks: every sentence the drag touched is in the range.
  const adopted = await rangeIds(page);
  for (const id of touched) expect(adopted).toContain(id);
  expect(adopted.length).toBeGreaterThanOrEqual(3);

  // And the range is contiguous whole sentences, in canonical order.
  const positions = adopted.map((id) => segments.findIndex((segment) => segment.segmentId === id));
  expect(positions).toEqual(
    Array.from({ length: positions.length }, (_, step) => positions[0] + step),
  );
});

test('a drag inside one sentence adopts that whole sentence', async ({ page }) => {
  // The sharpest never-shrinks case: nothing here is fully covered, so a snap
  // that took only fully covered sentences would adopt nothing at all.
  const target = segments[4];
  const box = (await page.locator(`[data-segment-id="${target.segmentId}"]`).boundingBox())!;

  await page.mouse.move(box.x + box.width * 0.3, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + 6, { steps: 8 });
  await page.mouse.up();

  const touched = await touchedSentenceIds(page);
  expect(touched.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Start excerpt' }).click();

  const adopted = await rangeIds(page);
  expect(adopted.length).toBeGreaterThan(0);
  for (const id of touched) expect(adopted).toContain(id);

  // And the sentence came in whole, not as the fragment under the cursor.
  const adoptedText = await page
    .locator('[data-excerpt]')
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? '').join(' '));
  const touchedText = segments
    .filter((segment) => touched.includes(segment.segmentId))
    .map((segment) => segment.text)
    .join(' ');
  expect(adoptedText.replace(/\s+/g, ' ')).toContain(touchedText.replace(/\s+/g, ' '));
});

test('a multi-sentence drag inside one turn is adopted whole', async ({ page }) => {
  // The reported defect: the drag collapsed to the first sentence of the turn.
  const [first, , third] = longTurnIndices;
  await dragAcross(page, { index: first, fraction: 0.5 }, { index: third, fraction: 0.5 });

  const touched = await touchedSentenceIds(page);
  expect(touched.length).toBeGreaterThanOrEqual(3);

  await pressControl(page, 'Start excerpt');

  const adopted = await rangeIds(page);
  for (const id of touched) expect(adopted).toContain(id);
  expect(adopted.length).toBeGreaterThanOrEqual(3);

  // And specifically not collapsed onto the turn's first sentence, nor lost.
  expect(adopted).not.toEqual([segments[longTurnIndices[0]].segmentId]);
});

test('a multi-sentence drag goes into the panel whole', async ({ page }) => {
  const [first, , third] = longTurnIndices;
  await dragAcross(page, { index: first, fraction: 0.5 }, { index: third, fraction: 0.5 });
  const touched = await touchedSentenceIds(page);

  await pressControl(page, 'Code this excerpt');

  await expect(page.getByRole('region', { name: /code selection/i })).toBeVisible();
  const adopted = await rangeIds(page);
  for (const id of touched) expect(adopted).toContain(id);
});

test('a drag released past the end of the text is still adopted', async ({ page }) => {
  // Releasing in the blank space after a turn's last line puts the browser's
  // synthetic click on the turn, not on a sentence.
  const [first] = longTurnIndices;
  const turnBox = (await page.locator(`[data-turn-id="${longTurn.turnId}"]`).boundingBox())!;
  const startBox = (await page
    .locator(`[data-segment-id="${segments[first].segmentId}"]`)
    .boundingBox())!;

  await page.mouse.move(startBox.x + startBox.width * 0.4, startBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(turnBox.x + turnBox.width - 4, turnBox.y + turnBox.height - 4, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(PAUSE_MS);

  const touched = await touchedSentenceIds(page);
  expect(touched.length).toBeGreaterThanOrEqual(2);

  await pressControl(page, 'Start excerpt');

  const adopted = await rangeIds(page);
  for (const id of touched) expect(adopted).toContain(id);
});

test('a drag does not move the reading position to the top of the turn', async ({ page }) => {
  const [first, , third] = longTurnIndices;
  await dragAcross(page, { index: first, fraction: 0.5 }, { index: third, fraction: 0.5 });

  // The browser fires a click at the end of a drag. It is part of selecting,
  // not a request to move the reading position.
  const active = await page
    .locator('[data-active="true"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-segment-id')));
  expect(active).not.toContain(segments[longTurnIndices[0]].segmentId);
});

test('adoption clears the native selection', async ({ page }) => {
  await dragAcross(page, { index: 1, fraction: 0.4 }, { index: 2, fraction: 0.5 });
  await page.getByRole('button', { name: 'Start excerpt' }).click();

  const remaining = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(remaining).toBe('');
  expect((await rangeIds(page)).length).toBeGreaterThan(0);
});

test('code this excerpt from a drag lands in the panel, focus in the search field', async ({
  page,
}) => {
  await dragAcross(page, { index: 1, fraction: 0.5 }, { index: 3, fraction: 0.4 });
  const touched = await touchedSentenceIds(page);

  await page.getByRole('button', { name: 'Code this excerpt' }).click();

  await expect(page.getByRole('region', { name: /code selection/i })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: /search the codebook/i })).toBeFocused();
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'confirmed');

  const adopted = await rangeIds(page);
  expect(adopted.length).toBeGreaterThanOrEqual(3);
  for (const id of touched) expect(adopted).toContain(id);
  await expect
    .poll(async () => await spoken(page), { timeout: 20_000 })
    .toMatch(/confirmed from your selection/i);
});

test('code this excerpt is disabled until there is something to adopt', async ({ page }) => {
  const control = page.getByRole('button', { name: 'Code this excerpt' });
  await expect(control).toHaveAttribute('aria-disabled', 'true');

  await dragAcross(page, { index: 1, fraction: 0.4 }, { index: 2, fraction: 0.5 });
  await expect(control).not.toHaveAttribute('aria-disabled');
});

test('a click is not a selection', async ({ page }) => {
  // Collapsed selections are ignored; clicking already sets the active segment.
  await page.locator(`[data-segment-id="${segments[2].segmentId}"]`).click();

  await expect(page.locator('[data-active="true"]')).toHaveCount(1);
  await expect(page.locator('[data-active="true"]')).toHaveAttribute(
    'data-segment-id',
    segments[2].segmentId,
  );
  await expect(page.getByRole('button', { name: 'Code this excerpt' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('the command route is unchanged when nothing is selected', async ({ page }) => {
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await page.getByRole('button', { name: 'Start excerpt' }).click();

  expect(await rangeIds(page)).toEqual([segments[1].segmentId]);
  await expect
    .poll(async () => await spoken(page), { timeout: 20_000 })
    .toMatch(/excerpt started at/i);
});

test('selection in the code panel is not a transcript selection', async ({ page }) => {
  // Two sentences in, so the start boundary has somewhere to expand to.
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await page.getByRole('button', { name: 'Start excerpt' }).click();
  await page.getByRole('button', { name: 'Code this excerpt' }).click();
  await expect(page.getByRole('region', { name: /code selection/i })).toBeVisible();

  const before = await rangeIds(page);

  // Select text inside the panel, then adjust a boundary: the range must come
  // from the excerpt commands, not from what is selected in the panel.
  const heading = page.locator('.code-panel__heading');
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + 5, { steps: 8 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Expand start', exact: true }).click();
  const after = await rangeIds(page);

  expect(after.length).toBe(before.length + 1);
});
