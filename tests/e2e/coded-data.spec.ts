import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The Coded data page, where a browser is needed.
 *
 * Section 2's sixth acceptance criterion is layout, which jsdom cannot answer:
 * "Given 320 pixel width, when the page renders, then the filter list precedes
 * the results in one column."
 */

const fixture = createSeedFixture();
const project = fixture.project;
const codedDataUrl = `/projects/${project.projectId}/coded-data`;

/** The lead's view, so there is work on the page without coding any first. */
async function asLead(page: import('@playwright/test').Page) {
  await page.goto(codedDataUrl);
  await page.getByLabel('Role').selectOption('qualitativeLead');
  await expect(page.locator('[data-excerpt-id]').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
});

test('acceptance 6: at 320px the filters precede the results in one column', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await asLead(page);

  const geometry = await page.evaluate(() => {
    const filters = document.querySelector('[data-region="filters"]')!.getBoundingClientRect();
    const results = document.querySelector('[data-region="results"]')!.getBoundingClientRect();
    return {
      stacked: results.top >= filters.bottom - 1,
      overflows:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  expect(geometry.stacked, 'the results should sit below the filters').toBe(true);
  expect(geometry.overflows).toBe(false);
});

test('the two sit side by side when there is room, filters first', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await asLead(page);

  const geometry = await page.evaluate(() => {
    const filters = document.querySelector('[data-region="filters"]')!.getBoundingClientRect();
    const results = document.querySelector('[data-region="results"]')!.getBoundingClientRect();
    return { sameRow: results.top < filters.bottom, filtersFirst: filters.left < results.left };
  });

  expect(geometry.sameRow).toBe(true);
  expect(geometry.filtersFirst).toBe(true);
});

test('the selected filter is marked by a border, not by colour alone', async ({ page }) => {
  await asLead(page);

  const marked = await page.evaluate(() => {
    const selected = document.querySelector('.coded-data__filter[data-selected]')!;
    const other = document.querySelectorAll('.coded-data__filter')[1];
    const count = selected.querySelector('.coded-data__count')!;
    return {
      border: parseFloat(getComputedStyle(selected).borderTopWidth),
      borderColour: getComputedStyle(selected).borderTopColor,
      otherBorderColour: getComputedStyle(other).borderTopColor,
      weight: Number(getComputedStyle(count).fontWeight),
      otherWeight: Number(
        getComputedStyle(other.querySelector('.coded-data__count')!).fontWeight,
      ),
    };
  });

  // A border that draws, and a count that thickens: two channels, no hue.
  expect(marked.border).toBeGreaterThan(1);
  expect(marked.borderColour).not.toBe(marked.otherBorderColour);
  expect(marked.weight).toBeGreaterThan(marked.otherWeight);
});

test('the page has no accessibility violations in either view', async ({ page }) => {
  await page.goto(codedDataUrl);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByLabel('Role').selectOption('qualitativeLead');
  await expect(page.locator('[data-excerpt-id]').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('a result link lands focus on the turn holding its excerpt', async ({ page }) => {
  await asLead(page);

  const second = fixture.sources[1];
  const excerpt = fixture.excerpts.find((candidate) => candidate.sourceId === second.sourceId)!;
  const turn = fixture.turns.find((candidate) =>
    candidate.segmentIds.includes(excerpt.startSegmentId),
  )!;

  await page.locator(`[data-excerpt-id="${excerpt.excerptId}"] a`).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(second.title);
  await expect(page.locator(`[data-turn-id="${turn.turnId}"]`)).toBeFocused();
});
