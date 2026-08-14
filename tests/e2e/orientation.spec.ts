import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bindingsFor } from '../../src/config/keybindings';
import type { Chord, Command } from '../../src/config/keybindings';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/transcript-segment.md section 5 and its v0.2
 * banner, decision D-038.
 *
 * These depend on layout and on real focus behaviour, so they run in a browser
 * rather than in jsdom:
 *
 * - "Position agreement": what is announced is what is shown
 * - Its successor to "Scroll does not move the active segment": scrolling
 *   moves nothing, because the position is focus and scrolling does not move
 *   focus
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

const turns = (page: Page) => page.locator('[data-turn-id]');

/** Tabs from the document start until focus lands inside the transcript. */
async function tabIntoTranscript(page: Page): Promise<void> {
  for (let press = 0; press < 40; press += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => document.activeElement?.closest('[data-turn-id]') !== null,
    );
    if (inside) return;
  }
  throw new Error('Tab never reached a speaker turn');
}

const focusedTurnId = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest('[data-turn-id]')?.getAttribute('data-turn-id') ?? null,
  );

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

test('tab walks the turns, and the position follows focus', async ({ page }) => {
  await expect(page.locator('.position-ribbon')).toContainText('No speaker turn focused');

  await tabIntoTranscript(page);
  await expect(page.locator('.position-ribbon')).toContainText('Speaker turn 1 of');

  await page.keyboard.press('Tab');
  await expect(page.locator('.position-ribbon')).toContainText('Speaker turn 2 of');

  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.position-ribbon')).toContainText('Speaker turn 1 of');
});

test('clicking a turn focuses it and draws nothing else', async ({ page }) => {
  await turns(page).nth(3).click();

  await expect(page.locator('.position-ribbon')).toContainText('Speaker turn 4 of');
  const turnId = await turns(page).nth(3).getAttribute('data-turn-id');
  expect(await focusedTurnId(page)).toBe(turnId);

  // No lingering highlight: the focus ring is the whole visual, and a captured
  // excerpt's highlight is the only thing the application draws on the text.
  await expect(page.locator('[data-active]')).toHaveCount(0);
  await expect(page.locator('[data-captured]')).toHaveCount(0);
});

test('the orientation commands have no controls, only chords', async ({ page }) => {
  /*
    The strip's three controls were removed as the prototype tidied up. This
    used to assert that a control and its chord did the same thing; there is no
    control now, so what is left to hold is that nothing on the page offers
    these commands and the chords still answer.

    D-057 named `help.shortcuts` as the surface that would teach them once the
    strip went. It is unbuilt, and that gap is recorded in the decision log.
  */
  await turns(page).nth(2).click();

  for (const label of [/^Speaker/, /^Timestamp/, /^Where am I/]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0);
  }

  await press(page, 'segment.speaker');
  await expect.poll(async () => await spoken(page)).toMatch(/speaker:/i);
});

test('the three orientation commands answer for the turn you are on', async ({ page }) => {
  await turns(page).nth(4).click();

  await press(page, 'position.report');
  await expect.poll(async () => await spoken(page)).toContain('Speaker turn 5 of');

  await press(page, 'segment.speaker');
  await expect.poll(async () => await spoken(page)).toMatch(/speaker:/i);

  await press(page, 'segment.timestamp');
  await expect.poll(async () => await spoken(page)).toMatch(/timestamp|no timestamp/i);
});

test('scrolling moves nothing, because it does not move focus', async ({ page }) => {
  await turns(page).nth(2).click();

  const focusBefore = await focusedTurnId(page);
  const ribbonBefore = await page.locator('.position-ribbon__reading').innerText();

  // All the way to the end of a 330 sentence transcript.
  await page.mouse.wheel(0, 40_000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);

  expect(await focusedTurnId(page)).toBe(focusBefore);
  expect(await page.locator('.position-ribbon__reading').innerText()).toBe(ribbonBefore);

  // And no way-back control, because the browser returns focus on its own.
  await expect(page.getByRole('button', { name: /return to/i })).toHaveCount(0);
});

test('acceptance: the spoken position matches the visible ribbon', async ({ page }) => {
  await turns(page).nth(5).click();

  const values = await page.locator('.position-ribbon__field').allInnerTexts();
  expect(values.length).toBeGreaterThan(0);

  await press(page, 'position.report');

  let report = '';
  await expect
    .poll(async () => {
      report = await spoken(page);
      return report;
    })
    .toContain('Speaker turn');

  // Every value shown is a value announced.
  for (const field of values) {
    const normalised = field.replace(/\s+/g, ' ').trim();
    expect(report.replace(/\s+/g, ' ')).toContain(normalised);
  }
});

test('no movement command survives, by chord or by control', async ({ page }) => {
  // D-038 removed them. A chord left listening would be a second, undocumented
  // way to move that no visible control matches.
  await turns(page).nth(2).click();
  const ribbonBefore = await page.locator('.position-ribbon__reading').innerText();

  for (const chord of ['Control+Alt+ArrowDown', 'Control+Alt+ArrowRight', 'Control+Alt+Home']) {
    await page.keyboard.press(chord);
  }

  expect(await page.locator('.position-ribbon__reading').innerText()).toBe(ribbonBefore);
  for (const gone of [/next sentence/i, /previous sentence/i, /next turn/i, /repeat sentence/i]) {
    await expect(page.getByRole('button', { name: gone })).toHaveCount(0);
  }
});

test('the position ribbon reports reading position, never progress', async ({ page }) => {
  await turns(page).nth(1).click();

  const ribbon = await page.locator('.position-ribbon').innerText();
  expect(ribbon).toMatch(/Reading position/i);
  expect(ribbon).not.toMatch(/progress/i);
});

test('position survives a reload, and does not steal focus on the way back', async ({ page }) => {
  await turns(page).nth(3).click();
  const ribbonBefore = await page.locator('.position-ribbon__reading').innerText();

  // A reload, not a back navigation: going back can be served from the
  // back-forward cache, which restores the live DOM without running the
  // application again, and would pass this test without reading storage at all.
  // Section 8 scopes the position to "across sessions", so a reload is the claim.
  await page.reload();

  expect(await page.locator('.position-ribbon__reading').innerText()).toBe(ribbonBefore);
  await expect.poll(async () => await spoken(page)).toMatch(/position restored/i);

  // Contract 2.4: nothing moves focus on load.
  expect(await focusedTurnId(page)).toBeNull();
});
