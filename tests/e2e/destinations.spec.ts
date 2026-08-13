import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * The three destinations and the sidebar, per D-043.
 *
 * In a browser for the things jsdom cannot answer: whether the current-page
 * marker actually draws, whether the sidebar reflows, and whether a real
 * navigation keeps saved work.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const projectUrl = `/projects/${project.projectId}`;

const DESTINATIONS = [
  { segment: 'codebook', label: 'Code book' },
  { segment: 'coded-data', label: 'Coded data' },
  { segment: 'notes', label: 'Notes' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => window.localStorage.clear());
});

for (const destination of DESTINATIONS) {
  test(`${destination.label} has no accessibility violations`, async ({ page }) => {
    await page.goto(`${projectUrl}/${destination.segment}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(destination.label);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

/**
 * The sidebar's visual language, per the amended Sidebar rule.
 *
 * In a browser because every value here comes through `var()`, and because the
 * question that matters — whether a white ring survives a white pill — is only
 * answerable once both have actually been painted.
 */
const WHITE = 'rgb(255, 255, 255)';
const BLUE_100 = 'rgb(31, 71, 131)';

test('the sidebar is solid blue with white text', async ({ page }) => {
  await page.goto(`${projectUrl}/codebook`);

  const painted = await page.evaluate(() => {
    const nav = document.querySelector('.project-nav')!;
    const destination = document.querySelector('.project-nav__destination:not([aria-current])')!;
    return {
      background: getComputedStyle(nav).backgroundColor,
      text: getComputedStyle(destination).color,
    };
  });

  expect(painted.background).toBe('rgb(31, 71, 131)');
  expect(painted.text).toBe('rgb(255, 255, 255)');
});

test('the current destination draws a white pill and the current source a white bar', async ({
  page,
}) => {
  const source = fixture.sources[0];

  await page.goto(`${projectUrl}/codebook`);
  const pill = await page
    .locator('.project-nav__destination[aria-current="page"]')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, text: style.color, radius: style.borderTopLeftRadius };
    });

  expect(pill.background).toBe(WHITE);
  // Dark blue since D-059, where this was black: the pill took the Figma's
  // hover treatment and the two are deliberately the same.
  expect(pill.text).toBe('rgb(31, 71, 131)');
  expect(parseFloat(pill.radius)).toBeGreaterThan(4);

  await page.goto(`${projectUrl}/sources/${source.sourceId}`);
  const bar = await page
    .locator('.project-nav__source[aria-current="page"]')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return { colour: style.borderLeftColor, width: parseFloat(style.borderLeftWidth) };
    });

  expect(bar.colour).toBe(WHITE);
  expect(bar.width).toBeGreaterThan(1);
});

test('the focus ring survives the blue and the white pill alike', async ({ page }) => {
  // The one the rule warns about: "the default ring color is not assumed
  // sufficient". A white ring drawn on the white pill would vanish, which the
  // offset is there to prevent.
  await page.goto(`${projectUrl}/codebook`);

  const onBlue = await page
    .locator('.project-nav__destination:not([aria-current])')
    .first()
    .evaluate((node) => {
      (node as HTMLElement).focus();
      const style = getComputedStyle(node);
      return { colour: style.outlineColor, offset: parseFloat(style.outlineOffset) };
    });

  expect(onBlue.colour).toBe(WHITE);
  expect(onBlue.colour).not.toBe(BLUE_100);

  const onPill = await page
    .locator('.project-nav__destination[aria-current="page"]')
    .evaluate((node) => {
      (node as HTMLElement).focus();
      const style = getComputedStyle(node);
      return {
        colour: style.outlineColor,
        offset: parseFloat(style.outlineOffset),
        background: style.backgroundColor,
      };
    });

  // White on white would be invisible; the offset puts the ring on the blue
  // outside the pill instead.
  expect(onPill.background).toBe(WHITE);
  expect(onPill.colour).toBe(WHITE);
  expect(onPill.offset).toBeGreaterThan(0);
});

test('the sidebar is never fixed, at any width', async ({ page }) => {
  // The rule allows it to hold its place at wide layout but forbids it at
  // narrow width and high zoom, per D-033: a pinned column at 400 percent eats
  // the viewport it is meant to share.
  for (const width of [1400, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${projectUrl}/codebook`);

    const position = await page
      .locator('.project-nav')
      .evaluate((node) => getComputedStyle(node).position);

    expect(position, `at ${width}px`).not.toBe('fixed');
    if (width === 320) expect(position).toBe('static');
  }
});

test('the current destination is marked by more than hue', async ({ page }) => {
  // Restated for the pill the amended rule adopts: the indicator used to be a
  // left bar and is now a filled shape. What has to hold is unchanged — a
  // reader who cannot separate the two hues still has to see which one is
  // current, per contract 2.5.
  await page.goto(`${projectUrl}/coded-data`);

  const marker = await page.evaluate(() => {
    const current = document.querySelector('.project-nav__destination[aria-current="page"]')!;
    const other = document.querySelector('.project-nav__destination:not([aria-current])')!;
    const luminance = (colour: string) => {
      const [r, g, b] = colour.match(/\d+/g)!.slice(0, 3).map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(current);
    return {
      current: current.getAttribute('aria-current'),
      radius: parseFloat(style.borderTopLeftRadius),
      lift:
        luminance(style.backgroundColor) -
        luminance(getComputedStyle(other).backgroundColor),
    };
  });

  expect(marker.current).toBe('page');
  // A shape that is not there otherwise…
  expect(marker.radius).toBeGreaterThan(4);
  // …and a luminance step, so it survives greyscale rather than resting on hue.
  expect(marker.lift).toBeGreaterThan(0.5);
});

test('only the open destination is marked', async ({ page }) => {
  await page.goto(`${projectUrl}/notes`);

  const marked = await page
    .locator('.project-nav__link[aria-current="page"]')
    .allTextContents();

  expect(marked).toEqual(['Notes']);
});

test('saved work survives a real navigation and back', async ({ page }) => {
  await page.goto(`${projectUrl}/sources/${source.sourceId}`);

  // Capture from the focused turn, check one code, save.
  await page.locator('[data-turn-id]').nth(1).click();
  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeVisible();
  await page.locator('[data-region="codebook"] input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Save & Close' }).click();
  await expect(page.getByRole('dialog', { name: /code assignment/i })).toBeHidden();

  await page.getByRole('link', { name: 'Coded data' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coded data');
  await expect(page.getByText('1 coded excerpt')).toBeVisible();

  // And it is still coded on the transcript afterwards.
  await page.getByRole('link', { name: source.title }).click();
  await expect(page.locator('[data-coded-run]').first()).toBeVisible();
});

test('a reload clears the session, per D-044', async ({ page }) => {
  await page.goto(`${projectUrl}/sources/${source.sourceId}`);
  await page.locator('[data-turn-id]').nth(1).click();
  await page.keyboard.press('Control+Alt+Enter');
  await page.locator('[data-region="codebook"] input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Save & Close' }).click();

  // By link, not `goto`: a document load is already a reload, and would clear
  // the session before this had a chance to show it surviving.
  await page.getByRole('link', { name: 'Coded data' }).click();
  await expect(page.getByText('1 coded excerpt')).toBeVisible();

  // "A page reload still clears in-progress state, unchanged from D-036's
  // scope." Held in memory, never in storage, which is what makes this true.
  await page.reload();
  await expect(page.getByText('0 coded excerpts')).toBeVisible();
});

/**
 * Section 1's third acceptance criterion: "Given the page at 400 percent zoom,
 * when the coder reads a code record, then no horizontal panning is required."
 *
 * 400 percent zoom of a 1280px viewport is 320 effective pixels, which is how
 * WCAG 1.4.10 defines the target and how it can be driven here. Checked with a
 * query active as well, because the results region is the widest thing the page
 * renders.
 */
test('the codebook needs no horizontal panning at 400 percent', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${projectUrl}/codebook`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Code book');

  const overflows = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );

  expect(await overflows(), 'reading the records').toBe(false);

  await page.getByRole('searchbox', { name: 'Search codebook' }).fill('water access');
  await expect(page.getByRole('heading', { name: /results for/i })).toBeVisible();
  expect(await overflows(), 'with results on screen').toBe(false);
});

/**
 * The drift guard between `familyHues.ts` and the hue mapping in `index.css`.
 *
 * One file decides which hue a token draws, the other what that hue is called.
 * Nothing in the type system holds them together, so this reads the border a
 * card actually renders and checks it against the token for the name the card
 * claims. Hexes are fine here: `tokens.test.ts` scans `src/`, and this is not
 * in it.
 */
const HUE_HEXES: Record<string, string> = {
  Red: 'rgb(227, 62, 62)',
  Coral: 'rgb(227, 104, 67)',
  'Dark green': 'rgb(29, 126, 77)',
  Cerulean: 'rgb(56, 154, 202)',
  Blue: 'rgb(51, 101, 211)',
  Purple: 'rgb(102, 89, 217)',
};

test('every card draws the hue its colour value names', async ({ page }) => {
  await page.goto(`${projectUrl}/codebook`);

  const cards = await page.locator('[data-family-id]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      border: getComputedStyle(node).borderTopColor,
      value: node.querySelector('.codebook__color')?.textContent ?? '',
    })),
  );

  expect(cards).toHaveLength(6);

  for (const card of cards) {
    const named = Object.keys(HUE_HEXES).find((hue) => card.value.includes(hue));
    expect(named, `no known hue name in "${card.value}"`).toBeDefined();
    expect(card.border, `card says ${named} and draws something else`).toBe(HUE_HEXES[named!]);
  }

  // And the six families take six different hues, so the check above cannot
  // pass by every card claiming the same one.
  expect(new Set(cards.map((card) => card.border)).size).toBe(6);
});

test('the colour value needs no pan to the card edge at 400 percent', async ({ page }) => {
  // Section 1's amended third criterion. At 320 effective pixels the value
  // wraps beneath the name and stays in the flow rather than sitting out at
  // the card's far edge where it has to be panned to.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${projectUrl}/codebook`);

  const first = page.locator('[data-family-id]').first();
  await expect(first).toBeVisible();

  const geometry = await first.evaluate((card) => {
    const value = card.querySelector('.codebook__color')!.getBoundingClientRect();
    const heading = card.querySelector('h2')!.getBoundingClientRect();
    return {
      right: value.right,
      viewport: document.documentElement.clientWidth,
      belowTheName: value.top >= heading.bottom - 1,
    };
  });

  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.belowTheName, 'the value should wrap under the name at this width').toBe(true);
});

test('the codebook has no violations with a query active', async ({ page }) => {
  // The static scan above covers the page at rest. The results region only
  // exists while a query does, so it needs a scan of its own.
  await page.goto(`${projectUrl}/codebook`);
  await page.getByRole('searchbox', { name: 'Search codebook' }).fill('water');
  await expect(page.getByRole('heading', { name: /results for/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the sidebar reflows at 320px without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });

  for (const destination of DESTINATIONS) {
    await page.goto(`${projectUrl}/${destination.segment}`);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `overflow on ${destination.label}`).toBe(false);
  }
});

/* ---------- The Notes page, per D-058 ---------- */

test('the notes columns stack in reading order at 320px', async ({ page }) => {
  /*
    D-033: the narrow stack is the layout that is designed and the wide one
    derives from it, so the filter precedes the list at every width. Measured
    rather than inferred from the DOM, which the unit test already pins — this
    is the half jsdom cannot answer, since it has no layout at all.
  */
  await page.goto(`${projectUrl}/notes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 900 });

  const filters = (await page.locator('[data-region="filters"]').boundingBox())!;
  const notes = (await page.locator('[data-region="notes"]').boundingBox())!;

  // One column, filter above list.
  expect(notes.y).toBeGreaterThanOrEqual(filters.y + filters.height - 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);

  // Two columns once there is room, and the filter still comes first.
  await page.setViewportSize({ width: 1280, height: 900 });
  const wideFilters = (await page.locator('[data-region="filters"]').boundingBox())!;
  const wideNotes = (await page.locator('[data-region="notes"]').boundingBox())!;
  expect(wideNotes.x).toBeGreaterThan(wideFilters.x);
});

test('the notes page has no accessibility violations, panel open and closed', async ({ page }) => {
  await page.goto(`${projectUrl}/notes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // And with the note panel over it, which is where the scope field lives.
  await page.getByRole('button', { name: 'New note' }).click();
  await expect(page.locator('[data-region="note-panel"]')).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

/* ---------- The sidebar's visual refinement, per D-059 ---------- */

test('the sidebar is flush to the viewport top and left, unrounded', async ({ page }) => {
  /*
    D-059 replaced D-043's inset, rounded sidebar. Measured rather than read off
    the stylesheet: the white gap it removes came from the shell's padding
    rather than from any rule on the sidebar itself, so a test that checked the
    sidebar's own declarations would have passed while the gap was still there.
  */
  await page.goto(`${projectUrl}/codebook`);
  await expect(page.getByRole('navigation', { name: 'Project' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Project' });
  const box = (await nav.boundingBox())!;

  expect(box.x, 'flush left').toBe(0);
  expect(box.y, 'flush top').toBe(0);

  const radius = await nav.evaluate((node) => getComputedStyle(node).borderRadius);
  expect(radius).toBe('0px');

  // And it reaches the bottom, so the blue runs the viewport rather than
  // stopping under the last link.
  const viewport = page.viewportSize()!;
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
});

test('sidebar links wear the pill rather than an underline', async ({ page }) => {
  /*
    D-059 replaces underlines with the hover treatment the Figma draws, and
    accepts that hover and current look the same — hover is transient and
    pointer-tied, so only a pointer user ever sees it, and `aria-current` and
    the focus ring carry current state for everyone.

    What is checked is that both wear the same pill and that its text clears
    4.5:1 on white, since the text moved from black to the dark blue token.
  */
  await page.goto(`${projectUrl}/codebook`);
  const current = page.locator('.project-nav__destination[aria-current="page"]');
  await expect(current).toBeVisible();

  const noUnderline = await page
    .locator('.project-nav a')
    .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).textDecorationLine === 'none'));
  expect(noUnderline, 'no underlines anywhere in the sidebar').toBe(true);

  const currentStyle = await current.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    color: getComputedStyle(node).color,
  }));
  expect(currentStyle.background).toBe('rgb(255, 255, 255)');
  expect(currentStyle.color, 'the dark blue token, not black').toBe('rgb(31, 71, 131)');

  // The same pill on hover, on an item that is not current.
  const other = page.getByRole('link', { name: 'Notes' });
  await other.hover();
  const hovered = await other.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    color: getComputedStyle(node).color,
  }));
  expect(hovered).toEqual(currentStyle);

  // 8.59:1, measured off the rendered page rather than asserted from a table.
  const contrast = await page.evaluate(
    ([a, b]) => {
      const lum = (c: string) => {
        const [r, g, bl] = c.match(/\d+/g)!.slice(0, 3).map((v) => {
          const s = Number(v) / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      };
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    },
    [currentStyle.color, currentStyle.background],
  );
  expect(contrast).toBeGreaterThanOrEqual(4.5);
});
