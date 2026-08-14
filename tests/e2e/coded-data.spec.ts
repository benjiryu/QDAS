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

/* ---------- The filter list, per D-062 ---------- */

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

test('every filter pill reads, at every level', async ({ page }) => {
  /*
    The check the task names, measured off the rendered page rather than trusted
    from the token audit — which covers shade-2 fills only, and D-062 puts
    descendants on lighter shades the audit never spoke for.

    That audit is also why the third level is unfilled: shade-1 measures 3.43:1
    against black at worst, so it cannot hold a label at all. What is asserted
    here is the outcome, so the reasoning cannot drift from the pixels.
  */
  await asLead(page);

  const measured = await page.evaluate(
    ([contrastSource]) => {
      const contrast = eval(contrastSource) as (a: string, b: string) => number;

      /* The nearest painted background, since a transparent pill shows the page
         through it — which is exactly the third level's treatment. */
      const backgroundBehind = (node: HTMLElement): string => {
        let element: HTMLElement | null = node;
        while (element) {
          const background = getComputedStyle(element).backgroundColor;
          if (background && !/rgba\(0, 0, 0, 0\)|transparent/.test(background)) return background;
          element = element.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };

      return Array.from(document.querySelectorAll<HTMLElement>('.coded-data__filter')).map(
        (row) => {
          const pill = row.querySelector<HTMLElement>('.coded-data__filter-name')!;
          return {
            name: pill.textContent ?? '',
            level: row.dataset.level ?? '',
            ratio: contrast(getComputedStyle(pill).color, backgroundBehind(pill)),
          };
        },
      );
    },
    [CONTRAST],
  );

  expect(measured.length).toBeGreaterThan(3);
  // All three levels are on screen, so the assertion covers each treatment.
  expect(new Set(measured.map((row) => row.level)).size).toBeGreaterThanOrEqual(3);

  for (const row of measured) {
    expect(row.ratio, `${row.name} at level ${row.level}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('level survives greyscale: indentation, not hue alone', async ({ page }) => {
  // D-062 makes indentation the non-colour channel. A reader with a colour
  // vision difference, or one at forced colours, still sees the hierarchy.
  await asLead(page);

  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.coded-data__filter')).map((row) => ({
      level: row.dataset.level ?? '0',
      left: row.getBoundingClientRect().left,
    })),
  );

  const leftAt = (level: string) =>
    Math.min(...levels.filter((row) => row.level === level).map((row) => row.left));

  expect(leftAt('1')).toBeGreaterThan(leftAt('0'));
  expect(leftAt('2')).toBeGreaterThan(leftAt('1'));
});
