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
  // The D-066 line only exists in this view, so this is the run that sees it.
  // Asserted rather than assumed: axe passing over a page that never rendered
  // the thing under test would be a green light for nothing.
  await expect(page.locator('.coded-data__also-coded').first()).toBeVisible();
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

/* ---------- The filter list: underlines and search ---------- */


test('a code name wears its family colour as an underline, and reads as text', async ({ page }) => {
  /*
    The pills are gone. The name is ordinary text on the page background, so its
    own contrast is what matters for reading it; the underline is the family
    channel and is reinforcement rather than information — the name carries the
    identity, and D-062's ordering keeps a family contiguous, so grouping is
    carried by position too.
  */
  await asLead(page);

  const measured = await page.evaluate(
    ([contrastSource]) => {
      const contrast = eval(contrastSource) as (a: string, b: string) => number;

      const rows = Array.from(
        document.querySelectorAll<HTMLElement>('.coded-data__filter-name[data-color-token]'),
      );
      return rows.slice(0, 12).map((name) => {
        const style = getComputedStyle(name);
        return {
          token: name.dataset.colorToken ?? '',
          decoration: style.textDecorationLine,
          textRatio: contrast(style.color, 'rgb(255, 255, 255)'),
        };
      });
    },
    [CONTRAST],
  );

  expect(measured.length).toBeGreaterThan(3);
  for (const row of measured) {
    expect(row.decoration, row.token).toContain('underline');
    // The name itself is the channel that has to read.
    expect(row.textRatio, row.token).toBeGreaterThanOrEqual(4.5);
  }
});

test('the underline colour, measured per family', async ({ page }) => {
  /*
    A record rather than a threshold. `--code-strong` is the most visible of a
    family's three shades on white and four of them are still faint, so this
    pins which — a token change is then reported instead of absorbed.

    The transcript went the other way for the same reason: D-041's rail uses one
    grey underline for every family. The divergence here is deliberate.
  */
  await asLead(page);

  const outlines = await page.evaluate(
    ([contrastSource]) => {
      const contrast = eval(contrastSource) as (a: string, b: string) => number;
      const probe = document.createElement('span');
      document.body.append(probe);

      const measured = Object.fromEntries(
        ['yellow', 'orange', 'l-green', 's-green', 'red', 'blue'].map((family) => {
          probe.style.color = `var(--${family}-1)`;
          return [family, contrast(getComputedStyle(probe).color, 'rgb(255, 255, 255)')];
        }),
      );
      probe.remove();
      return measured;
    },
    [CONTRAST],
  );

  // Faint, and named so the session knows which.
  expect(outlines.yellow).toBeLessThan(3);
  expect(outlines.orange).toBeLessThan(3);
  expect(outlines['l-green']).toBeLessThan(3);
  expect(outlines['s-green']).toBeLessThan(3);

  // And the ones that read, so this is a per-family record and not a blanket claim.
  expect(outlines.red).toBeGreaterThan(3);
  expect(outlines.blue).toBeGreaterThan(3);
});

test('"All codes" carries no family colour', async ({ page }) => {
  // It names no family, so it wears none.
  await asLead(page);

  const first = await page.evaluate(() => {
    const name = document
      .querySelector<HTMLElement>('.coded-data__filter')!
      .querySelector<HTMLElement>('.coded-data__filter-name')!;
    return {
      text: name.textContent,
      token: name.dataset.colorToken ?? null,
      decoration: getComputedStyle(name).textDecorationLine,
    };
  });

  expect(first.text).toBe('All codes');
  expect(first.token).toBeNull();
  expect(first.decoration).toBe('none');
});

test('the search narrows the filter list, and only the filter list', async ({ page }) => {
  await asLead(page);

  const search = page.getByLabel('Search codes');
  await expect(search).toBeVisible();

  const rowNames = () =>
    page
      .locator('.coded-data__filter-name')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));

  const before = await rowNames();
  const resultsBefore = await page.locator('.coded-data__result').count();

  await search.fill('water');
  const narrowed = await rowNames();

  expect(narrowed.length).toBeLessThan(before.length);

  /*
    Every row matched on its own name or on an ancestor's, which is the panel's
    rule — so a code called "Rules" is still reachable by typing the family it
    belongs to. The lineage is in the row's description, which is where the
    match on an ancestor has to be visible from.
  */
  const rows = await page.locator('.coded-data__filter').evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: node.querySelector('.coded-data__filter-name')?.textContent ?? '',
      lineage:
        document.getElementById(
          node.querySelector('input')?.getAttribute('aria-describedby') ?? '',
        )?.textContent ?? '',
    })),
  );
  for (const row of rows.slice(1)) {
    expect(`${row.name} ${row.lineage}`.toLowerCase(), row.name).toContain('water');
  }

  // The results below are the selected filter's business, not the query's.
  expect(await page.locator('.coded-data__result').count()).toBe(resultsBefore);

  await search.fill('');
  expect(await rowNames()).toEqual(before);
});

test('the narrowed list keeps the page order rather than resorting', async ({ page }) => {
  // The panel's matcher is shared; its canonical ordering is not. D-062's
  // lookup order is this page's, and a query must not quietly restore the other.
  await asLead(page);

  const all = await page
    .locator('.coded-data__filter-name')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));

  // A query that genuinely narrows and spans more than one family: a single
  // common letter matches everything, since an ancestor's name counts too.
  await page.getByLabel('Search codes').fill('in');
  const narrowed = await page
    .locator('.coded-data__filter-name')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));

  expect(narrowed.length).toBeLessThan(all.length);
  expect(narrowed).toEqual(all.filter((name) => narrowed.includes(name)));
});
