import { expect, test } from '@playwright/test';
import { createSeedFixture } from '../../src/data/seed';
import { CURRENT_CODER_ID } from '../../src/data/seed/project';

/**
 * Task 5a. Done when you can reach a transcript from the application root
 * without touching the address bar.
 *
 * Keyboard only, in a real browser, because that is the claim.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const assignedSource = fixture.sources.find(
  (source) =>
    source.sourceId ===
    fixture.workAssignments.find(
      (assignment) =>
        assignment.userId === CURRENT_CODER_ID &&
        assignment.codingRoundId === project.activeCodingRoundId,
    )?.sourceId,
)!;

/** Tab until the focused element has the given accessible text, or give up. */
async function tabTo(page: import('@playwright/test').Page, text: string) {
  for (let presses = 0; presses < 15; presses += 1) {
    await page.keyboard.press('Tab');
    const focusedText = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? '',
    );
    if (focusedText === text) return presses + 1;
  }
  throw new Error(`Never reached "${text}" by tabbing.`);
}

test('a transcript is reachable from the application root by keyboard alone', async ({
  page,
}) => {
  // The root, not a source URL.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

  await tabTo(page, project.name);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: project.name })).toBeVisible();

  await tabTo(page, assignedSource.title);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: assignedSource.title })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Transcript' })).toBeVisible();
});

test('focus lands on the heading of each route entered', async ({ page }) => {
  await page.goto('/projects');

  // Not on load.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

  await page.getByRole('link', { name: project.name }).click();

  // Polled, not read once: focus moves when the new route commits, which is a
  // frame or two after the click resolves and longer on a loaded machine.
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? null,
        text: document.activeElement?.textContent?.trim() ?? null,
      })),
    )
    .toEqual({ tag: 'H1', text: project.name });
});

test('the project route lists assigned sources, and summarises the project', async ({ page }) => {
  /*
    Rewritten for D-059 and destinations.md section 0, which fix this page's
    regions as heading and summary, then the source list. The kind, the sentence
    count and the coding round line this asserted are not among them: an entry
    is its source title, and the summary carries phase, count and codebook
    version in one line.
  */
  await page.goto(`/projects/${project.projectId}`);

  // Scoped to the page body: since D-043 the sidebar lists the same sources,
  // so an unscoped query finds each title twice. The sidebar has its own tests.
  const item = page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: assignedSource.title }) });

  await expect(item).toHaveText(assignedSource.title);
  await expect(page.getByText(/Independent coding\./)).toBeVisible();
  await expect(page.getByText(fixture.codebookVersion.versionLabel)).toBeVisible();
});
