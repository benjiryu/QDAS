import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';

/**
 * Specification: docs/patterns/transcript-segment.md sections 1 and 7.
 *
 * The claim under test is that a screen reader reads one speaker turn as
 * continuous prose rather than as a series of per-sentence objects.
 *
 * What a browser can actually verify is the structure that decides this: the
 * sentences inside a turn carry no role, no name, and no tab stop, and the text
 * runs together unbroken. Whether JAWS, NVDA, and VoiceOver each then read it
 * straight through is a manual check per D-024, which this does not replace.
 *
 * Since D-052 a turn is one object only where it carries no highlights. A coded
 * range is a `mark`, which is a node in the tree by design — that is what makes
 * a screen reader report the passage as highlighted while reading, which the
 * wash and the underline could not do. The two tests below hold the line
 * between the two: highlights appear, nothing else does, and they track ranges
 * rather than sentences.
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

/** The lines of a turn's accessibility tree, one per node. */
async function treeNodes(turn: Locator) {
  const snapshot = await turn.ariaSnapshot();
  return snapshot
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'));
}

test('an uncoded turn is one object in the accessibility tree', async ({ page }) => {
  // The original form of this test, kept where it still applies: prose carrying
  // nothing has nothing nested inside it that a screen reader would treat as an
  // object of its own.
  const uncodedTurnId = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]'))
      .find((turn) => turn.querySelector('mark') === null)!
      .getAttribute('data-turn-id'),
  );

  const nodes = await treeNodes(page.locator(`[data-turn-id="${uncodedTurnId}"]`));
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatch(/^- listitem/);
});

test('a coded turn adds its highlights to the tree and nothing else', async ({ page }) => {
  /*
    What D-052 changed, stated plainly: a coded turn is no longer a single node.
    Each highlighted range is a `mark`, which is the point — it is how NVDA and
    JAWS know to report the passage as highlighted while reading, at whatever
    verbosity their user set, and it is the only channel the wash and the
    underline could not reach.

    What D-002 protects is unchanged and is what the rest of this asserts: the
    marks track coded ranges rather than sentences, they carry no names, and
    nothing else appears. The turn is still one listitem and still one tab stop,
    which the tests below cover.
  */
  const turn = page.locator(`[data-turn-id="${longTurn.turnId}"]`);
  const nodes = await treeNodes(turn);

  expect(nodes[0]).toMatch(/^- listitem/);
  for (const node of nodes.slice(1)) {
    expect(node, 'only text and highlights appear inside a turn').toMatch(/^- (mark|text):/);
  }

  // One node per highlight, no more: the tree is not reporting a range twice.
  const marks = nodes.filter((node) => node.startsWith('- mark'));
  expect(marks).toHaveLength(await turn.locator('mark').count());

  // And per range rather than per sentence, which is the fragmentation D-002
  // rules out. This turn is coded across fewer ranges than it has sentences.
  expect(marks.length).toBeGreaterThan(0);
  expect(marks.length).toBeLessThan(longTurn.segmentIds.length);
});

test('a mark brings none of the user agent’s own styling with it', async ({ page }) => {
  /*
    D-052 changes the element and nothing else. A `mark` arrives with
    `background-color: Mark` and `color: MarkText` attached, so "nothing else"
    has to be measured rather than assumed — and measured against a bare mark
    rendered in this same page, so the comparison is with whatever this browser
    actually does rather than with a colour written down here.
  */
  const measured = await page.evaluate(() => {
    const bare = document.createElement('mark');
    bare.textContent = 'x';
    document.body.append(bare);
    const bareStyle = getComputedStyle(bare);
    const uaDefault = { background: bareStyle.backgroundColor, color: bareStyle.color };
    bare.remove();

    const prose = getComputedStyle(
      document.querySelector<HTMLElement>('[data-display-state="inactive"]')!,
    ).color;

    return {
      uaDefault,
      prose,
      marks: Array.from(document.querySelectorAll<HTMLElement>('.transcript__turns mark')).map(
        (mark) => {
          const style = getComputedStyle(mark);
          return { background: style.backgroundColor, color: style.color };
        },
      ),
    };
  });

  expect(measured.marks.length).toBeGreaterThan(0);
  for (const mark of measured.marks) {
    // The wash is the code family's, not the browser's highlight colour.
    expect(mark.background).not.toBe(measured.uaDefault.background);
    // And the text is the same ink as the prose around it.
    expect(mark.color).toBe(measured.prose);
  }
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

  /*
    And carrying nothing that would surface them separately.

    Scoped to the prose, which is what "sentences are not objects of their own"
    is about. The rail beside it is a different claim — it is `aria-hidden`, and
    since D-055 it holds a note button carrying `tabindex="-1"` to stay out of
    the tab order. Left unscoped this passed only because the turn it happens to
    read has no note, which is a trap for whoever next edits the fixture.
  */
  await expect(
    turn.locator('.transcript-turn__prose')
      .locator('[tabindex], [role], [aria-label], [aria-labelledby]'),
  ).toHaveCount(0);
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

  /*
    Nothing inside a turn is tabbable.

    Asserted as tabbability rather than as "carries a tabindex", which is what
    this checked before D-055 put a note button in the rail. That button is
    natively focusable and carries `tabindex="-1"` precisely to stay out of the
    tab order — the old selector counted it as a defect while the property it
    stood for still held.

    So this asks the real question: anything with a non-negative tabindex, or
    natively focusable and not opted out. The turn itself is excluded, being
    the one tab stop this is about.
  */
  const tabbableInside = await page.evaluate(() => {
    const NATIVE = 'a[href], button, input, select, textarea, summary, [contenteditable="true"]';
    return Array.from(document.querySelectorAll('.transcript__turns [data-turn-id]'))
      .flatMap((turn) => Array.from(turn.querySelectorAll<HTMLElement>('*')))
      .filter((element) => {
        const explicit = element.getAttribute('tabindex');
        if (explicit !== null) return Number(explicit) >= 0;
        return element.matches(NATIVE);
      })
      .map((element) => element.tagName.toLowerCase() + '.' + element.className);
  });
  expect(tabbableInside).toEqual([]);
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

/**
 * Width. The measure belongs to the prose column, not to the row.
 *
 * These are here rather than in a unit test because jsdom drops any declaration
 * containing `var()`, so every track width in this layout is invisible to it.
 */

/** 70ch, resolved inside the list so it is Luciole's metric and not a guess. */
async function measureIn(page: import('@playwright/test').Page): Promise<number> {
  await page.waitForFunction(() => document.fonts.check('1rem Luciole'));
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:70ch';
    const list = document.querySelector('.transcript__turns')!;
    list.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
}

test('the prose holds its measure, and the row fills the width around it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const measure = await measureIn(page);

  const widths = await page.evaluate(() => ({
    list: document.querySelector('.transcript__turns')!.getBoundingClientRect().width,
    main: document.querySelector('main')!.getBoundingClientRect().width,
    prose: Math.max(
      ...Array.from(document.querySelectorAll('.transcript-turn__prose')).map(
        (prose) => prose.getBoundingClientRect().width,
      ),
    ),
  }));

  // The measure, exactly: neither starved by the columns beside it, which is
  // what capping the row did, nor allowed past the line length the measure is
  // there to hold.
  expect(widths.prose).toBeCloseTo(measure, 0);

  // And the row itself is not capped by that measure. It fills `main`, which is
  // what leaves the rail room to take the remainder.
  expect(widths.list).toBeCloseTo(widths.main, 0);
  expect(widths.list).toBeGreaterThan(measure);
});

test('past the crossover the rail sits beside the prose and takes the width left over', async ({
  page,
}) => {
  // This is what the container query buys, and the assertion that notices if it
  // is removed: without it the layout falls back to two columns, the prose
  // still measures 70ch and the row still fills `main`, so every other check
  // here would stay green while the rail dropped back underneath.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => document.querySelectorAll('.transcript-turn__rail').length > 1);

  const beside = await page.evaluate(() => {
    const turn = Array.from(document.querySelectorAll('.transcript-turn')).find((candidate) =>
      candidate.querySelector('.transcript-turn__rail'),
    )!;
    const prose = turn.querySelector('.transcript-turn__prose')!.getBoundingClientRect();
    const rail = turn.querySelector('.transcript-turn__rail')!.getBoundingClientRect();
    const remValue = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      startsAfterProse: rail.left >= prose.right,
      sharesTheLine: Math.abs(rail.top - prose.top) < 4,
      railRem: rail.width / remValue,
    };
  });

  expect(beside.startsAfterProse).toBe(true);
  expect(beside.sharesTheLine).toBe(true);
  // Wider than the 14rem minimum, which is the rail actually absorbing the
  // remainder rather than merely fitting.
  expect(beside.railRem).toBeGreaterThan(14);
});

test('the prose column is the same width on every turn', async ({ page }) => {
  // Half the turns here are shorter than the measure, and the rail beside them
  // starts where the prose column ends. Uniform prose widths are what keeps
  // that edge straight down the page.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => document.querySelectorAll('.transcript-turn__rail').length > 1);

  const geometry = await page.evaluate(() => {
    const distinct = (values: number[]) => [...new Set(values.map(Math.round))];
    const prose = Array.from(document.querySelectorAll('.transcript-turn__prose'));
    return {
      turns: prose.length,
      proseWidths: distinct(prose.map((node) => node.getBoundingClientRect().width)),
      railLefts: distinct(
        Array.from(document.querySelectorAll('.transcript-turn__rail')).map(
          (rail) => rail.getBoundingClientRect().left,
        ),
      ),
    };
  });

  expect(geometry.turns).toBeGreaterThan(20);
  expect(geometry.proseWidths).toHaveLength(1);
  expect(geometry.railLefts).toHaveLength(1);
});

test('the rail keeps one left edge below the crossover too', async ({ page }) => {
  // Under the prose rather than beside it at these widths, but still lined up:
  // it starts at the prose column, which is a fixed track.
  for (const width of [1280, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(
      () => document.querySelectorAll('.transcript-turn__rail').length > 1,
    );

    const lefts = await page.evaluate(() => [
      ...new Set(
        Array.from(document.querySelectorAll('.transcript-turn__rail')).map((rail) =>
          Math.round(rail.getBoundingClientRect().left),
        ),
      ),
    ]);

    expect(lefts, `rails at ${width}px`).toHaveLength(1);
  }
});

test('no width between 320px and 1920px scrolls sideways', async ({ page }) => {
  // The grid gains and loses columns across this range, and an overflowing row
  // would breach accessibility contract 2.5 at exactly the widths a
  // magnification user sits at.
  for (const width of [1920, 1600, 1280, 1024, 900, 800, 768, 600, 480, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `overflow at ${width}px`).toBe(false);
  }
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
