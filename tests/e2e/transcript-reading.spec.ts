import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/transcript-segment.md sections 1 and 7.
 *
 * The claim under test is that a screen reader reads one speaker turn as
 * continuous prose rather than as a series of per-sentence objects.
 *
 * What a browser can actually verify is the structure that decides this: the
 * turn is one object in the accessibility tree, the sentences inside it carry
 * no role, no name, and no tab stop, and the text runs together unbroken.
 * Whether JAWS, NVDA, and VoiceOver each then read it straight through is a
 * manual check per D-024, which this does not replace.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const turns = fixture.turns.filter((turn) => turn.sourceId === source.sourceId);
const segmentById = new Map(fixture.segments.map((segment) => [segment.segmentId, segment]));

/** A long turn, where fragmentation would be most obvious to a listener. */
const longTurn = turns.find((turn) => turn.segmentIds.length >= 8)!;
const longTurnSentences = longTurn.segmentIds.map((id) => segmentById.get(id)!.text);
const speakerLabel = fixture.speakers.find(
  (speaker) => speaker.speakerId === longTurn.speakerId,
)!.label;

const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

test.beforeEach(async ({ page }) => {
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
});

test('a speaker turn is one object in the accessibility tree', async ({ page }) => {
  const turn = page.locator(`[data-turn-id="${longTurn.turnId}"]`);

  // One listitem, and nothing nested inside it that a screen reader would treat
  // as an object of its own.
  const snapshot = await turn.ariaSnapshot();
  const nodes = snapshot
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'));

  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatch(/^- listitem/);
});

test('a turn reads as continuous prose, every sentence in order', async ({ page }) => {
  const turn = page.locator(`[data-turn-id="${longTurn.turnId}"]`);

  // The sentences run together exactly, with nothing inserted between them: no
  // bullet, no marker, no per-sentence label.
  const prose = await turn.locator('.transcript-turn__prose').innerText();
  expect(prose.replace(/\s+/g, ' ').trim()).toBe(longTurnSentences.join(' '));

  // And the speaker leads the turn.
  const whole = (await turn.innerText()).replace(/\s+/g, ' ').trim();
  expect(whole.startsWith(speakerLabel)).toBe(true);
});

test('the timestamp is visible but not announced at the default verbosity', async ({ page }) => {
  // Section 6: at `onRequest`, timestamps are not announced automatically. The
  // command that speaks one on request arrives with segment navigation.
  const turn = page.locator(`[data-turn-id="${longTurn.turnId}"]`);
  const timestamp = turn.locator('.transcript-turn__timestamp');

  await expect(timestamp).toBeVisible();
  const timestampText = (await timestamp.innerText()).trim();
  expect(timestampText).not.toBe('');
  expect(await turn.ariaSnapshot()).not.toContain(timestampText);
});

test('sentences are addressable but are not objects of their own', async ({ page }) => {
  const turn = page.locator(`[data-turn-id="${longTurn.turnId}"]`);

  // Individually addressable.
  const sentences = turn.locator('[data-segment-id]');
  await expect(sentences).toHaveCount(longTurn.segmentIds.length);

  // And carrying nothing that would surface them separately.
  await expect(turn.locator('[tabindex], [role], [aria-label], [aria-labelledby]')).toHaveCount(0);
});

test('tab moves between turns, never into a sentence', async ({ page }) => {
  const index = turns.indexOf(longTurn);
  const nextTurnId = turns[index + 1].turnId;

  await page.locator(`[data-turn-id="${longTurn.turnId}"]`).focus();
  await page.keyboard.press('Tab');

  const focused = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      turnId: active?.getAttribute('data-turn-id') ?? null,
      insideSegment: active?.hasAttribute('data-segment-id') ?? false,
    };
  });

  expect(focused.turnId).toBe(nextTurnId);
  expect(focused.insideSegment).toBe(false);
});

test('every turn is one tab stop, and there are as many as there are turns', async ({ page }) => {
  // Scoped to the transcript: the application navigation is a list too.
  const listItems = page.getByRole('region', { name: 'Transcript' }).getByRole('listitem');
  await expect(listItems).toHaveCount(turns.length);

  const focusableInside = await page
    .locator('.transcript__turns [tabindex]:not([tabindex="0"])')
    .count();
  expect(focusableInside).toBe(0);
});

test('speaker and timestamp collapse into the leading text at narrow width', async ({ page }) => {
  // Section 7: the column collapses into the turn's leading text rather than
  // becoming something to pan sideways to.
  const turn = page.locator(`[data-turn-id="${longTurn.turnId}"]`);
  const meta = turn.locator('.transcript-turn__meta');
  const firstSentence = turn.locator('[data-segment-id]').first();

  // 320 CSS pixels, the reflow target in accessibility contract 2.5.
  await page.setViewportSize({ width: 320, height: 800 });
  const narrowMeta = (await meta.boundingBox())!;
  const narrowSentence = (await firstSentence.boundingBox())!;

  // The prose begins on the same line as the speaker, and shares its flow
  // rather than sitting in a column of its own. A wrapped inline span reports
  // the union of its line boxes, so this compares the flow, not the caret.
  expect(Math.abs(narrowMeta.y - narrowSentence.y)).toBeLessThan(narrowMeta.height);
  expect(narrowSentence.x).toBeLessThanOrEqual(narrowMeta.x + narrowMeta.width);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);

  // Wide: the same DOM as a column beside the prose, on its own line.
  await page.setViewportSize({ width: 1280, height: 900 });
  const wideMeta = (await meta.boundingBox())!;
  const wideSentence = (await firstSentence.boundingBox())!;

  expect(wideSentence.x).toBeGreaterThan(wideMeta.x + wideMeta.width);
});

test('coded state carries a shape channel, not colour alone', async ({ page }) => {
  // Read from the run rather than the sentence: since D-036 an excerpt covers
  // exact characters, so the paint is on the stretch that is actually coded.
  const coded = page.locator('[data-coded-run="coded"]').first();
  const codedMultiple = page.locator('[data-coded-run="coded-multiple"]').first();

  await expect(coded).toBeVisible();
  await expect(codedMultiple).toBeVisible();

  const decorationOf = (selector: string) =>
    page.locator(selector).first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        line: style.textDecorationLine,
        style: style.textDecorationStyle,
      };
    });

  const one = await decorationOf('[data-coded-run="coded"]');
  const many = await decorationOf('[data-coded-run="coded-multiple"]');
  const none = await decorationOf('[data-display-state="inactive"]');

  // Underlined at all, so the state survives greyscale.
  expect(one.line).toContain('underline');
  expect(many.line).toContain('underline');
  expect(none.line).not.toContain('underline');

  // And the two coded states differ by shape, not only by colour.
  expect(one.style).not.toBe(many.style);
});
