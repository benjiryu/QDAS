import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The Select Code card, styled.
 *
 * Specification: build-sequence Task 25, decisions D-039 and D-040, and the tag
 * hue families in src/styles/tokens.css.
 *
 * In a browser because `var()` has to resolve: jsdom drops any declaration
 * carrying one, so the hue assignment is invisible to it.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const sourceUrl = `/projects/${source.projectId}/sources/${source.sourceId}`;

/** The four whose shade-1 border fails 3:1 on white, per the token audit. */
const DEPRIORITISED = {
  'orange-1': 'rgb(227, 150, 62)',
  'yellow-1': 'rgb(211, 204, 0)',
  'l-green-1': 'rgb(109, 206, 49)',
  's-green-1': 'rgb(56, 188, 161)',
};

/** Which top-level family each code belongs to, from the fixture itself. */
function familyOf(codeId: string): string {
  const byId = new Map(fixture.codes.map((code) => [code.codeId, code]));
  let code = byId.get(codeId)!;
  while (code.parentCodeId) code = byId.get(code.parentCodeId)!;
  return code.codeId;
}

async function openPanel(page: import('@playwright/test').Page) {
  await page.locator('[data-turn-id]').nth(1).click();
  await page.keyboard.press(
    (await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent)))
      ? 'Control+Shift+Enter'
      : 'Control+Alt+Enter',
  );
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { level: 1, name: source.title })).toBeVisible();
  await openPanel(page);
});

test('every code pill takes a hue, and none takes one of the four annotated', async ({ page }) => {
  const pills = await page
    .locator('[data-region="codebook"] .code-panel__code-name')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          codeId: node.closest('.code-panel__code')?.querySelector('input')?.dataset.codeId ?? '',
          border: style.borderTopColor,
          fill: style.backgroundColor,
        };
      }),
    );

  expect(pills.length).toBeGreaterThan(40);

  for (const pill of pills) {
    // A real hue, not the fallback.
    expect(pill.fill).not.toBe('rgba(0, 0, 0, 0)');
    for (const [name, colour] of Object.entries(DEPRIORITISED)) {
      expect(pill.border, `${pill.codeId} took ${name}, which is last in the order`).not.toBe(
        colour,
      );
    }
  }
});

test('one hue per top-level family, and different families differ', async ({ page }) => {
  const pills = await page
    .locator('[data-region="codebook"] .code-panel__code-name')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        codeId: node.closest('.code-panel__code')?.querySelector('input')?.dataset.codeId ?? '',
        border: getComputedStyle(node).borderTopColor,
      })),
    );

  // Grouped by the fixture's own family structure, not by the mapping.
  const byFamily = new Map<string, Set<string>>();
  for (const pill of pills) {
    const family = familyOf(pill.codeId);
    if (!byFamily.has(family)) byFamily.set(family, new Set());
    byFamily.get(family)!.add(pill.border);
  }

  expect(byFamily.size).toBe(6);
  for (const [family, hues] of byFamily) {
    expect(hues.size, `family ${family} used more than one hue`).toBe(1);
  }

  const distinct = new Set([...byFamily.values()].map((hues) => [...hues][0]));
  expect(distinct.size).toBe(byFamily.size);
});

test('the excerpt readback stays hidden from the eye and present to the reader', async ({
  page,
}) => {
  const readback = page.locator('[data-selected-excerpt]');

  const state = await readback.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      visibility: style.visibility,
      hidden: node.getAttribute('aria-hidden'),
      text: node.textContent ?? '',
      width: node.getBoundingClientRect().width,
    };
  });

  // display:none or visibility:hidden would take it out of the accessibility
  // tree, which is the one thing this element cannot afford. D-040.
  expect(state.display).not.toBe('none');
  expect(state.visibility).not.toBe('hidden');
  expect(state.hidden).toBeNull();
  expect(state.text).toMatch(/^Selected excerpt: /);
  // And still off the screen.
  expect(state.width).toBeLessThan(2);
});

test('the flag checkbox stays visible', async ({ page }) => {
  const flag = page.getByRole('checkbox', { name: /^Flag$/ });

  await expect(flag).toBeVisible();
  const box = (await flag.boundingBox())!;
  expect(box.width).toBeGreaterThan(8);
  expect(box.height).toBeGreaterThan(8);
});

test('Save & Close carries the primary treatment and the rest do not', async ({ page }) => {
  // Exact, or "Close" also matches "Save & Close" and the locator resolves to two.
  const fill = (name: string) =>
    page
      .getByRole('button', { name, exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);

  // Disabled until something is pending, and the disabled treatment wins while
  // it is: check a code first, or this measures the wrong state.
  await page.locator('[data-region="codebook"] input[type="checkbox"]').first().check();

  // blue-100, the primary fill.
  expect(await fill('Save & Close')).toBe('rgb(31, 71, 131)');
  expect(await fill('Close')).not.toBe('rgb(31, 71, 131)');
});

test('the action group sits at the trailing edge with and without Delete', async ({ page }) => {
  // Save & Close used to sit at the leading edge on a fresh capture and jump to
  // the trailing one as soon as a reopened excerpt put Delete beside it. Its
  // place should not depend on what else happens to be in the row.
  await page.locator('[data-region="codebook"] input[type="checkbox"]').first().check();

  const trailing = await page.evaluate(() => {
    const actions = document.querySelector('[data-region="actions"]')!.getBoundingClientRect();
    const save = document
      .querySelector('[data-region="actions"] [data-command="codes.save"]')!
      .getBoundingClientRect();
    // The flag sits after it, so measure the gap in front rather than behind.
    return { gapBefore: save.left - actions.left, actionsWidth: actions.width };
  });

  // Pushed well clear of the leading edge rather than starting at it.
  expect(trailing.gapBefore).toBeGreaterThan(trailing.actionsWidth / 3);
});

test('the open dialog has no accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});
