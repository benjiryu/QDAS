import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The coded highlight's family colour, measured where `var()` resolves.
 *
 * jsdom drops every declaration carrying one, so the unit tests can only assert
 * which token a run claims. What it actually draws, and whether text and the
 * focus ring stay legible on it, is only answerable here.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

/** Shade-3 per family, the wash level. Hexes are fine: this is outside `src/`. */
const FAMILY_WASH: Record<string, string> = {
  'code-color-moss': 'rgb(254, 217, 217)',
  'code-color-clay': 'rgb(255, 226, 217)',
  'code-color-indigo': 'rgb(196, 232, 214)',
  'code-color-amber': 'rgb(214, 240, 253)',
  'code-color-slate': 'rgb(215, 226, 250)',
  'code-color-rust': 'rgb(209, 205, 244)',
};
const MIXED_WASH = 'rgb(233, 233, 233)';

const MOSS = fixture.codes.find((code) => code.name === 'Motivation and meaning')!;
const CLAY = fixture.codes.find((code) => code.name === 'Barriers to participation')!;

/** WCAG relative luminance, so the thresholds are measured and not asserted. */
const CONTRAST = `(a, b) => {
  const lum = (c) => {
    const [r, g, b] = c.match(/\\d+/g).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}`;

/**
 * Codes a turn that carries no coding yet, and returns its id.
 *
 * Deliberately not simply the first turn: the fixture seeds twenty excerpts
 * belonging to the second coder, and several land on the opening turns. An
 * unscoped `[data-coded-run]` picks those up and measures their families
 * instead of the one this test just made — which is exactly how the first
 * version of this test read coral where it had coded red.
 */
async function codeAnUncodedTurn(
  page: import('@playwright/test').Page,
  codeIds: string[],
): Promise<string> {
  const turnId = await page.evaluate(() => {
    const turn = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]')).find(
      (candidate) => candidate.querySelector('[data-coded-run]') === null,
    );
    if (!turn) throw new Error('every turn is already coded in the fixture');
    turn.focus();
    return turn.dataset.turnId!;
  });

  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();

  for (const codeId of codeIds) {
    await page.locator(`[role="dialog"] [data-code-id="${codeId}"]`).check();
  }
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeHidden();
  await expect(page.locator(`[data-turn-id="${turnId}"] [data-coded-run]`).first()).toBeVisible();

  return turnId;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);
});

test('a run coded from one family draws that family’s wash', async ({ page }) => {
  const turnId = await codeAnUncodedTurn(page, [MOSS.codeId]);

  const backgrounds = await page
    .locator(`[data-turn-id="${turnId}"] [data-coded-run]`)
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));

  expect(backgrounds.length).toBeGreaterThan(0);
  for (const background of backgrounds) expect(background).toBe(FAMILY_WASH[MOSS.colorToken]);
});

test('a run coded across families draws grey', async ({ page }) => {
  const turnId = await codeAnUncodedTurn(page, [MOSS.codeId, CLAY.codeId]);

  const backgrounds = await page
    .locator(`[data-turn-id="${turnId}"] [data-coded-run]`)
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));

  expect(backgrounds.length).toBeGreaterThan(0);
  for (const background of backgrounds) expect(background).toBe(MIXED_WASH);
});

test('text and the focus ring stay legible on every wash', async ({ page }) => {
  // Measured from the page rather than restated from the plan. Black text needs
  // 4.5:1; the focus ring is a non-text indicator and needs 3:1, which is the
  // one Task 23 flagged as easiest to lose inside a highlight.
  const washes = [...Object.values(FAMILY_WASH), MIXED_WASH];

  const measured = await page.evaluate(
    ([list, contrastSource]) => {
      const contrast = eval(contrastSource as string) as (a: string, b: string) => number;
      const style = getComputedStyle(document.documentElement);
      const ring = style.getPropertyValue('--focus').trim();
      const probe = document.createElement('span');
      probe.style.color = ring;
      document.body.appendChild(probe);
      const ringColour = getComputedStyle(probe).color;
      probe.remove();

      return (list as string[]).map((wash) => ({
        wash,
        text: contrast('rgb(0, 0, 0)', wash),
        ring: contrast(ringColour, wash),
      }));
    },
    [washes, CONTRAST] as const,
  );

  for (const { wash, text, ring } of measured) {
    expect(text, `black text on ${wash}`).toBeGreaterThanOrEqual(4.5);
    expect(ring, `focus ring on ${wash}`).toBeGreaterThanOrEqual(3);
  }
});

test('an in-progress capture never shares a wash with a coded run', async ({ page }) => {
  // excerpt-selection.md section 7: the pending range is distinct from a coded
  // range. It stopped being true on colour when coded runs took family washes,
  // because one family renders the dark green the capture used.
  await page.evaluate(() => {
    const turn = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]')).find(
      (candidate) => candidate.querySelector('[data-coded-run]') === null,
    )!;
    turn.focus();
  });
  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.locator('[data-captured]').first()).toBeVisible();

  const capture = await page
    .locator('[data-captured]')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);

  expect(Object.values(FAMILY_WASH)).not.toContain(capture);
  expect(capture).not.toBe(MIXED_WASH);
});

test('the Open Codebook button is grey, and not the disabled treatment', async ({ page }) => {
  await page.locator('[data-turn-id]').first().click();
  await page.keyboard.press('Control+Alt+Enter');

  const button = await page
    .getByRole('button', { name: /open codebook/i })
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderTopColor, text: style.color };
    });

  expect(button.background).toBe(MIXED_WASH);
  // Not blue-50, which is what it wore before.
  expect(button.background).not.toBe('rgb(233, 240, 253)');
  // Disabled is grey-500 text on grey-100; black text is what says this is not.
  expect(button.text).toBe('rgb(0, 0, 0)');
  expect(button.border).not.toBe('rgb(130, 130, 130)');
});
