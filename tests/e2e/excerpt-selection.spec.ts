import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bindingsFor } from '../../src/config/keybindings';
import type { Chord, Command } from '../../src/config/keybindings';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/excerpt-selection.md.
 *
 * The criteria checked here are the ones that need layout: single-panel
 * completion with no horizontal panning, and a toolbar that stays where it is
 * while the selection moves.
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

async function press(page: Page, command: Command) {
  await page.keyboard.press(chordFor(command));
}

async function spoken(page: Page): Promise<string> {
  return page.getByTestId('live-region-polite').innerText();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);

  const isMac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent));
  bindings = bindingsFor(isMac ? 'mac' : 'other');

  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('acceptance: a full adjustment needs no horizontal panning', async ({ page }) => {
  // 320 CSS pixels, the reflow target in accessibility contract 2.5.
  await page.setViewportSize({ width: 320, height: 800 });

  await press(page, 'segment.next');
  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');
  await press(page, 'excerpt.start.expand');
  await press(page, 'excerpt.end.expand');
  await press(page, 'excerpt.end.expandTurn');
  await press(page, 'excerpt.confirm');

  await expect(page.locator('[data-excerpt-state="confirmed"]').first()).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test('the toolbar holds its position while the selection moves', async ({ page }) => {
  // Measured against the document, not the viewport: boundary changes scroll
  // the moved boundary into view, so viewport coordinates shift for everything
  // on the page. The claim is that the toolbar keeps its place in the layout.
  const toolbarPosition = () =>
    page.evaluate(() => {
      const element = document.querySelector('.excerpt-toolbar')!;
      const box = element.getBoundingClientRect();
      return { x: box.x + window.scrollX, y: box.y + window.scrollY };
    });

  const rangeEndPosition = () =>
    page.evaluate(() => {
      const element = document.querySelector('[data-excerpt="end"], [data-excerpt="only"]')!;
      return element.getBoundingClientRect().y + window.scrollY;
    });

  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');
  const toolbarBefore = await toolbarPosition();
  const endBefore = await rangeEndPosition();

  // Expand the end across several turns, moving the range far down the page.
  for (let step = 0; step < 6; step += 1) await press(page, 'excerpt.end.expandTurn');

  const toolbarAfter = await toolbarPosition();
  const endAfter = await rangeEndPosition();

  // The end boundary travels a long way down the document.
  expect(endAfter - endBefore).toBeGreaterThan(500);

  // The toolbar does not follow it. It shifts by at most a line, and only
  // because the position ribbon above it gains the "Return to active segment"
  // control once the active segment scrolls out of view, which section 5 of
  // transcript-segment.md requires.
  expect(toolbarAfter.x).toBe(toolbarBefore.x);
  expect(Math.abs(toolbarAfter.y - toolbarBefore.y)).toBeLessThan(40);

  // And it stays outside the transcript, above it, rather than beside the range.
  const insideTranscript = await page.evaluate(
    () => document.querySelector('.transcript')!.contains(document.querySelector('.excerpt-toolbar')),
  );
  expect(insideTranscript).toBe(false);
});

test('each boundary identifies itself, so either end can be read alone', async ({ page }) => {
  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');
  await press(page, 'excerpt.end.expand');
  await press(page, 'excerpt.end.expand');

  await expect(page.locator('[data-excerpt="start"]')).toHaveCount(1);
  await expect(page.locator('[data-excerpt="end"]')).toHaveCount(1);

  // The markers differ in shape, not only in colour: a bar on the leading edge
  // of the first sentence and the trailing edge of the last.
  const start = await page
    .locator('[data-excerpt="start"]')
    .evaluate((element) => getComputedStyle(element).borderLeftWidth);
  const end = await page
    .locator('[data-excerpt="end"]')
    .evaluate((element) => getComputedStyle(element).borderRightWidth);

  expect(Number.parseFloat(start)).toBeGreaterThan(2);
  expect(Number.parseFloat(end)).toBeGreaterThan(2);
});

test('a boundary change scrolls the boundary that moved into view', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 });

  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');

  // Grow the end well past the fold; the end boundary should follow.
  for (let step = 0; step < 4; step += 1) await press(page, 'excerpt.end.expandTurn');

  await expect(page.locator('[data-excerpt="end"]')).toBeInViewport();
});

test('escape discards a pending excerpt and returns focus to the origin turn', async ({ page }) => {
  await press(page, 'segment.next');
  await press(page, 'segment.next');
  await press(page, 'excerpt.begin');
  await press(page, 'excerpt.start.expand');

  await page.keyboard.press('Escape');

  await expect(page.locator('[data-excerpt]')).toHaveCount(0);
  const focusedTurn = await page.evaluate(
    () => document.activeElement?.getAttribute('data-turn-id') ?? null,
  );
  expect(focusedTurn).not.toBeNull();
  // Announcements queue at a deliberate dwell rather than replacing each other,
  // so this one arrives behind everything said since entering the source.
  await expect
    .poll(async () => await spoken(page), { timeout: 20_000 })
    .toMatch(/discarded/i);
});

test('the whole selection workflow runs from the visible controls alone', async ({ page }) => {
  // Every command has a control, so a participant whose chords fail on their
  // setup is not blocked. Contract 2.2.
  // Started a few turns in, so both boundaries have somewhere to go.
  await page.getByRole('button', { name: 'Next turn' }).click();
  await page.getByRole('button', { name: 'Next turn' }).click();
  await page.getByRole('button', { name: 'Start excerpt' }).click();
  await page.getByRole('button', { name: 'Expand end', exact: true }).click();
  await page.getByRole('button', { name: 'Expand start by turn' }).click();
  await page.getByRole('button', { name: 'Read excerpt' }).click();

  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'adjusting');
  await page.getByRole('button', { name: 'Revert to start' }).click();
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'anchored');

  await page.getByRole('button', { name: 'Code this excerpt' }).click();
  await expect(page.locator('.excerpt-toolbar__state')).toHaveAttribute('data-state', 'confirmed');
});
