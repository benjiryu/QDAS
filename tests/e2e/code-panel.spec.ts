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

test('the search label keeps clear of its field', async ({ page }) => {
  // The two share a line — search is the one labelled field not wrapped in
  // `.code-panel__field` — and at the panel's width they met exactly, with the
  // label's right edge on the input's left border.
  const row = await page.evaluate(() => {
    const input = document.querySelector('.code-panel__search')!;
    const label = input.previousElementSibling!;
    const inputBox = input.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    return {
      sharesTheLine: inputBox.top < labelBox.bottom,
      gap: inputBox.left - labelBox.right,
    };
  });

  expect(row.sharesTheLine).toBe(true);
  expect(row.gap).toBeGreaterThanOrEqual(8);
});

test('the panel reflows at 320px without scrolling sideways', async ({ page }) => {
  // Re-checked here because the search row is the one place in the panel where
  // two things share a line, so it is where spacing would first push past the
  // edge. Accessibility contract 2.5.
  await page.setViewportSize({ width: 320, height: 800 });

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});

/**
 * Panel-open focus, per Task 31's second finding.
 *
 * Asserted in a browser and not only in jsdom, because the report came from
 * manual VoiceOver testing and jsdom is where a focus defect of this kind would
 * hide: it has no real focus management competing with React Aria's.
 *
 * The automated criterion is that the search input itself holds focus and that
 * a keystroke reaches it. The *real* criterion is the manual check — typing
 * under VoiceOver with no interact-into-group step first — and no test here
 * replaces it.
 */
test('focus lands on the search input itself, and typing reaches it', async ({ page }) => {
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      isTheInput: active === document.querySelector('.code-panel__search'),
      tag: active?.tagName.toLowerCase() ?? 'none',
      // The element itself, not an ancestor that happens to contain it.
      role: active?.getAttribute('role'),
    };
  });

  expect(focused.isTheInput).toBe(true);
  expect(focused.tag).toBe('input');
  expect(focused.role).toBeNull();

  // No click, no tab: straight from opening to typing.
  await page.keyboard.type('water');
  await expect(page.locator('.code-panel__search')).toHaveValue('water');
});

test('nothing between the input and the dialog is a group to interact into', async ({ page }) => {
  // The structural half of the same finding. A wrapper carrying a role, or a
  // name that makes it a region, is what turns a focused field into something
  // VoiceOver asks you to enter first.
  const chain = await page.evaluate(() => {
    const wrappers: { tag: string; role: string | null; label: string | null }[] = [];
    let node = document.querySelector('.code-panel__search')?.parentElement ?? null;

    while (node && node.getAttribute('role') !== 'dialog') {
      wrappers.push({
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role'),
        label: node.getAttribute('aria-label') ?? node.getAttribute('aria-labelledby'),
      });
      node = node.parentElement;
    }
    return wrappers;
  });

  expect(chain.length).toBeGreaterThan(0);
  for (const wrapper of chain) {
    expect(wrapper.role, `${wrapper.tag} carries a role`).toBeNull();
    expect(wrapper.label, `${wrapper.tag} is named, making it a region`).toBeNull();
  }
});

test('the empty search offers one action, and it is not a form', async ({ page }) => {
  /*
    D-070 moved creation to the failure point. What replaced the standing form
    is a single button in the empty result, so the panel carries nothing a coder
    has to learn until the vocabulary fails them.

    Axe runs over the dialog with the empty state up, which is the state the
    unit tests can describe but not evaluate.
  */
  // The panel is already open: this file's `beforeEach` opens it.
  const panel = page.getByRole('dialog', { name: /code assignment/i });
  await panel.getByRole('searchbox', { name: 'Search codes' }).fill('zzzznotacode');
  const results = panel.locator('[data-region="search-results"]');
  await expect(results.getByRole('button', { name: /propose/i })).toBeVisible();
  await expect(results.locator('input, textarea')).toHaveCount(0);

  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
  ).toEqual([]);
});

test('the create form asks for a name and nothing else', async ({ page }) => {
  /*
    Restored with the form by D-073. D-046 keeps the whole form to a name —
    proposing happens mid-coding, and two fields of prose at that moment is a
    codebook entry demanded in the middle of reading a transcript.

    Axe over the dialog with the form expanded, which the empty-search state
    cannot cover: it has no form in it at all.
  */
  const panel = page.getByRole('dialog', { name: /code assignment/i });
  const create = panel.locator('[data-region="create"]');

  await create.getByRole('button', { name: /create new code/i }).click();
  await expect(create.getByLabel('Code name')).toBeVisible();
  await expect(create.locator('input, textarea')).toHaveCount(1);

  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
  ).toEqual([]);
});

test('a proposed code is marked in words, and the dialog stays clean', async ({ page }) => {
  const panel = page.getByRole('dialog', { name: /code assignment/i });
  await panel.getByRole('searchbox', { name: 'Search codes' }).fill('Compost queue');
  await panel.getByRole('button', { name: /propose/i }).click();

  /*
    Both channels, and each in its own element: the visible tag beside the row
    and the description the checkbox points at. Located separately so this
    cannot pass on one of them alone, which is the failure D-070 names.
  */
  const proposed = panel.locator('[data-region="proposed"]');
  await expect(proposed.locator('.code-panel__provisional')).toBeVisible();
  const box = proposed.getByRole('checkbox', { name: 'Compost queue' });
  await expect(box).toBeChecked();
  await expect(box).toHaveAccessibleDescription('Provisional');

  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
  ).toEqual([]);
});

/**
 * The companion codebook, per D-048.
 *
 * In a browser for the half jsdom cannot answer: whether the companion actually
 * sits beside the panel when there is room and beneath it when there is not.
 */
const openCompanion = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /open codebook/i }).click();
  await expect(page.locator('[data-companion-codebook]')).toBeVisible();
};

test('the companion sits beside the panel at wide width', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openCompanion(page);

  const geometry = await page.evaluate(() => {
    const card = document.querySelector('.code-panel')!.getBoundingClientRect();
    const companion = document.querySelector('[data-companion-codebook]')!.getBoundingClientRect();
    return { cardRight: card.right, companionLeft: companion.left, sameRow: companion.top < card.bottom };
  });

  expect(geometry.companionLeft).toBeGreaterThanOrEqual(geometry.cardRight);
  expect(geometry.sameRow).toBe(true);
});

test('the companion stacks below the panel at 320px, with no sideways scroll', async ({ page }) => {
  // D-033: the narrow layout is the designed one and the wide derives from it.
  // DOM order is card then companion either way, so only the direction changes.
  await page.setViewportSize({ width: 320, height: 800 });
  await openCompanion(page);

  const geometry = await page.evaluate(() => {
    const card = document.querySelector('.code-panel')!.getBoundingClientRect();
    const companion = document.querySelector('[data-companion-codebook]')!.getBoundingClientRect();
    return {
      below: companion.top >= card.bottom - 1,
      overflows:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  expect(geometry.below).toBe(true);
  expect(geometry.overflows).toBe(false);
});

test('the dialog with the companion open has no accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openCompanion(page);

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});

test('the open dialog has no accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});

/* ---------- The panel's three disclosure rows ---------- */

/** WCAG relative luminance, so the thresholds are measured and not asserted. */
const RATIO = `(a, b) => {
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

test('the three disclosure rows wear one treatment, and the footer does not', async ({ page }) => {
  /*
    Open Codebook, Create new code and Add note all expand something rather than
    doing something, and since they share a treatment the panel says so: grey
    rows expand, the footer's blue buttons act, Save & Close is the one primary.

    In a browser because jsdom drops any declaration carrying `var()`, so every
    colour here is invisible to it.
  */
  const treatmentOf = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          text: style.color,
        };
      });

  const codebook = await treatmentOf('.code-panel__companion-toggle');
  const rows = await page
    .locator('.code-panel__create-row')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          text: style.color,
        };
      }),
    );

  // Both of them again: D-073 restored the Create code row D-070 had removed,
  // and it wears the same treatment as the note row beside it.
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row).toEqual(codebook);

  /*
    And distinct from a button that acts, which is the point of the treatment.

    By name and exact, the way the primary-treatment test above does it, and not
    by taking the footer's first button: Save & Close is disabled until
    something is pending, and the disabled fill is grey-100 too — so measuring
    it would have compared the new treatment against a coincidence.
  */
  const close = await page
    .getByRole('button', { name: 'Close', exact: true })
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(close).not.toBe(codebook.background);
});

test('the disclosure rows clear contrast on both sides of their border', async ({ page }) => {
  /*
    Measured rather than trusted to the token audit, which speaks for other
    pairings. The border has two sides — the row's own fill and the panel behind
    it — and a control outlined against only one of them is outlined against
    neither in practice.
  */
  const measured = await page.evaluate(
    ([ratio]) => {
      const contrast = eval(ratio) as (a: string, b: string) => number;
      const row = document.querySelector('.code-panel__create-row')!;
      const panel = document.querySelector('.code-panel')!;
      const style = getComputedStyle(row);
      const behind = getComputedStyle(panel).backgroundColor;

      return {
        text: contrast(style.color, style.backgroundColor),
        borderInside: contrast(style.borderTopColor, style.backgroundColor),
        borderOutside: contrast(style.borderTopColor, behind),
      };
    },
    [RATIO],
  );

  expect(measured.text).toBeGreaterThanOrEqual(4.5);
  expect(measured.borderInside).toBeGreaterThanOrEqual(3);
  expect(measured.borderOutside).toBeGreaterThanOrEqual(3);
});
