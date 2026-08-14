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

test('the list is flat: every pill shares a left edge', async ({ page }) => {
  // The D-062 amendment removes indentation. Level moves entirely to the fill
  // treatment, which the next test measures.
  await asLead(page);

  const lefts = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.coded-data__filter')).map((row) => ({
      level: row.dataset.level ?? '0',
      left: Math.round(row.getBoundingClientRect().left),
    })),
  );

  expect(new Set(lefts.map((row) => row.level)).size).toBeGreaterThanOrEqual(3);
  expect(new Set(lefts.map((row) => row.left)).size, 'one left edge for every level').toBe(1);
});

test('level survives greyscale: fill density, not hue alone', async ({ page }) => {
  /*
    The channel that replaced indentation, and the claim the amendment makes for
    it. Asserted in luminance rather than colour: three steps a reader sees as
    dark, pale and white are three steps in greyscale too, which is what makes
    this legitimate as the level channel at all.
  */
  await asLead(page);

  const byLevel = await page.evaluate(
    ([luminanceSource]) => {
      const luminance = eval(luminanceSource) as (colour: string) => number;
      /*
        Within one family, so the comparison is levels rather than hues: a red
        parent against a yellow child would measure the palette, not the
        channel. The family is chosen for having all three levels on screen
        rather than named, since which codes are used is the fixture's business.
      */
      const byToken = new Map<string, Map<string, number>>();

      for (const row of Array.from(
        document.querySelectorAll<HTMLElement>('.coded-data__filter[data-level]'),
      )) {
        const pill = row.querySelector<HTMLElement>('.coded-data__filter-name')!;
        const token = pill.dataset.colorToken;
        if (!token) continue;
        const levels = byToken.get(token) ?? new Map<string, number>();
        const level = row.dataset.level ?? '0';
        if (!levels.has(level)) {
          levels.set(level, luminance(getComputedStyle(pill).backgroundColor));
        }
        byToken.set(token, levels);
      }

      const complete = [...byToken.values()].find((levels) => levels.size >= 3);
      return complete ? Object.fromEntries(complete) : {};
    },
    [
      `(colour) => {
        const [r, g, b] = colour.match(/\\d+/g).slice(0, 3).map((v) => {
          const s = Number(v) / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }`,
    ],
  );

  // Solid, tinted, white: each step lighter than the last.
  expect(byLevel['0']).toBeLessThan(byLevel['1']);
  expect(byLevel['1']).toBeLessThan(byLevel['2']);
});

test('the grandchild outline, measured per family', async ({ page }) => {
  /*
    The check Task 42 asks for, and it records a shortfall rather than asserting
    one away.

    The amendment says "the gray row background provides the shape contrast" at
    this level. It does not: a white pill is 1.21:1 against the selected row's
    grey and has no boundary at all against the white page behind an unselected
    one, so the pill's shape rests on its outline alone. Four families' shade-1
    outlines are under the 3:1 a non-text indicator needs.

    Shipped as designed under the amendment's own session-evidence flag. This
    test pins what is true today — including which families fall short — so a
    token change is reported rather than absorbed, and so the session has the
    numbers instead of rediscovering them.
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
          const border = getComputedStyle(probe).color;
          return [family, contrast(border, 'rgb(255, 255, 255)')];
        }),
      );
      probe.remove();
      return measured;
    },
    [
      `(a, b) => {
        const lum = (c) => {
          const [r, g, b] = c.match(/\\d+/g).slice(0, 3).map((v) => {
            const s = Number(v) / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      }`,
    ],
  );

  // The four the amendment's note is about, named as the task names them.
  expect(outlines.yellow).toBeLessThan(3);
  expect(outlines.orange).toBeLessThan(3);
  expect(outlines['l-green']).toBeLessThan(3);
  expect(outlines['s-green']).toBeLessThan(3);

  // And the ones that do clear it, so this is a per-family record rather than a
  // blanket claim that the outline never works.
  expect(outlines.red).toBeGreaterThan(3);
  expect(outlines.blue).toBeGreaterThan(3);
});

test('"All codes" is plain grey, carrying no family hue', async ({ page }) => {
  // It belongs to no family, so it wears none. Per the amendment.
  await asLead(page);

  const first = await page.evaluate(() => {
    const pill = document
      .querySelector<HTMLElement>('.coded-data__filter')!
      .querySelector<HTMLElement>('.coded-data__filter-name')!;
    return {
      text: pill.textContent,
      token: pill.dataset.colorToken ?? null,
      background: getComputedStyle(pill).backgroundColor,
    };
  });

  expect(first.text).toBe('All codes');
  expect(first.token).toBeNull();
  expect(first.background).toBe('rgb(233, 233, 233)');
});
