import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bindingsFor } from '../../src/config/keybindings';
import type { Chord, Command } from '../../src/config/keybindings';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/transcript-segment.md sections 2, 4, 5, 6.
 *
 * The two acceptance criteria in section 10 that this task names both depend on
 * layout, so they are checked in a real browser rather than in jsdom:
 *
 * - "Scroll does not move the active segment"
 * - "Position agreement"
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

/**
 * Which chord layer to press.
 *
 * The application picks its layer from the browser's user agent, and a
 * Playwright device profile does not necessarily present the user agent of the
 * machine running the test. Reading it from the page rather than from
 * `process.platform` means the test presses whatever the application is
 * actually listening for, and it also means only one of the two layers is
 * exercised per run. Verifying both against JAWS, NVDA, and VoiceOver on real
 * hardware stays a manual session gate, per D-024 and T-5.
 */
let bindings = bindingsFor('other');

async function resolveBindings(page: Page) {
  const isMac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent));
  bindings = bindingsFor(isMac ? 'mac' : 'other');
}

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

/** What the polite live region is currently saying. */
async function spoken(page: Page): Promise<string> {
  return page.getByTestId('live-region-polite').innerText();
}

function activeSegment(page: Page) {
  return page.locator('[data-active="true"]');
}

test.beforeEach(async ({ page }) => {
  // A known state per test, since position persists across sessions by design.
  // Cleared once, here, rather than on every navigation: an init script would
  // also run on the way back to the source and wipe the position under test.
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());

  await page.goto(sourceUrl);
  await resolveBindings(page);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('a chord moves the active segment and announces the sentence', async ({ page }) => {
  await expect(page.locator('.position-ribbon')).toContainText('Not set');

  await press(page, 'segment.next');
  await expect(activeSegment(page)).toHaveCount(1);
  await expect(page.locator('.position-ribbon')).toContainText('1 of');

  await expect
    .poll(async () => await spoken(page))
    .toContain(fixture.segments[0].text.slice(0, 30));

  await press(page, 'segment.next');
  await expect(page.locator('.position-ribbon')).toContainText('2 of');
});

test('a visible control does the same thing as its chord', async ({ page }) => {
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await expect(page.locator('.position-ribbon')).toContainText('2 of');

  await page.getByRole('button', { name: 'Previous sentence' }).click();
  await expect(page.locator('.position-ribbon')).toContainText('1 of');
});

test('acceptance: scroll does not move the active segment', async ({ page }) => {
  await press(page, 'segment.next');
  await press(page, 'segment.next');
  await press(page, 'segment.next');

  const activeBefore = await activeSegment(page).getAttribute('data-segment-id');
  const ribbonBefore = await page.locator('.position-ribbon__reading').innerText();

  // All the way to the end of a 330 sentence transcript, and back up a little.
  await page.mouse.wheel(0, 40_000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);

  expect(await activeSegment(page).getAttribute('data-segment-id')).toBe(activeBefore);
  expect(await page.locator('.position-ribbon__reading').innerText()).toBe(ribbonBefore);

  // And a way back is offered, per section 5.
  const returnControl = page.getByRole('button', { name: 'Return to active segment' });
  await expect(returnControl).toBeVisible();

  await returnControl.click();
  await expect(activeSegment(page)).toBeInViewport();
  expect(await activeSegment(page).getAttribute('data-segment-id')).toBe(activeBefore);

  // Focus lands on the turn container, per section 4.1.
  const focusedTurn = await page.evaluate(
    () => document.activeElement?.getAttribute('data-turn-id') ?? null,
  );
  expect(focusedTurn).not.toBeNull();
});

test('acceptance: the spoken position matches the visible ribbon', async ({ page }) => {
  await press(page, 'turn.next');
  await press(page, 'turn.next');
  await press(page, 'segment.next');

  const values = await page.locator('.position-ribbon__field').allInnerTexts();
  expect(values.length).toBeGreaterThan(0);

  await press(page, 'position.report');

  const report = await (async () => {
    let text = '';
    await expect
      .poll(async () => {
        text = await spoken(page);
        return text;
      })
      .toContain('Sentence');
    return text;
  })();

  // Every value shown is a value announced.
  for (const field of values) {
    const normalised = field.replace(/\s+/g, ' ').trim();
    expect(report.replace(/\s+/g, ' ')).toContain(normalised);
  }
});

test('the position ribbon reports reading position, never progress', async ({ page }) => {
  await press(page, 'segment.next');

  const ribbon = await page.locator('.position-ribbon').innerText();
  expect(ribbon).toMatch(/Reading position/i);
  expect(ribbon).not.toMatch(/progress/i);
});

test('position survives leaving the source and coming back', async ({ page }) => {
  await press(page, 'turn.next');
  await press(page, 'segment.next');
  const before = await activeSegment(page).getAttribute('data-segment-id');
  const ribbonBefore = await page.locator('.position-ribbon__reading').innerText();

  // A reload, not a back navigation: going back can be served from the
  // back-forward cache, which restores the live DOM without running the
  // application again, and would pass this test without reading storage at all.
  // Section 8 scopes the position to "across sessions", so a reload is the claim.
  await page.reload();

  await expect(activeSegment(page)).toHaveCount(1);
  expect(await activeSegment(page).getAttribute('data-segment-id')).toBe(before);
  expect(await page.locator('.position-ribbon__reading').innerText()).toBe(ribbonBefore);
  await expect.poll(async () => await spoken(page)).toMatch(/position restored/i);
});
