import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AnnouncerProvider, createAnnouncer } from '../a11y';
import type { Announcer } from '../a11y';
import { bindingsFor, detectPlatform } from '../config/keybindings';
import type { Command } from '../config/keybindings';
import { clearCodingSession } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID, SECOND_CODER_ID } from '../data/seed/project';
import { clearSimulatedSession, writeSimulatedSession } from '../data/simulatedSession';
import { clearSourcePositions } from '../data/sourcePositionStore';

/**
 * The Coded data page.
 *
 * Specification: docs/pages/destinations.md section 2, decisions D-045, D-049,
 * D-030, R-4. Section 2's six acceptance criteria are named as such below.
 *
 * The one that matters most is the first: a coder mid independent coding must
 * find no trace of the second coder anywhere on this page. It is asserted
 * against every seeded name and every seeded excerpt rather than a sample,
 * because a leak that showed one row would be as contaminating as one that
 * showed them all.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const codedDataUrl = `/projects/${project.projectId}/coded-data`;

/** The second source, for the criterion that names it. */
const SECOND_SOURCE = fixture.sources[1];

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
});

function renderAt(path: string) {
  return render(
    <AnnouncerProvider announcer={announcer}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

const bindings = bindingsFor(detectPlatform());

function chord(command: Command) {
  const binding = bindings[command];
  act(() => {
    fireEvent.keyDown(document, {
      key: binding.key,
      ctrlKey: Boolean(binding.ctrl),
      altKey: Boolean(binding.alt),
      shiftKey: Boolean(binding.shift),
      metaKey: Boolean(binding.meta),
    });
  });
}

const viewLabel = () => document.querySelector('[data-view-label]')?.textContent ?? '';
const summaryText = () => document.querySelector('.coded-data__summary')?.textContent ?? '';
const region = (name: string) => document.querySelector<HTMLElement>(`[data-region="${name}"]`);
const resultRows = () => Array.from(document.querySelectorAll('[data-excerpt-id]'));

function followSidebarLink(label: string) {
  const link = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.project-nav__link'),
  ).find((candidate) => candidate.textContent === label);
  if (!link) throw new Error(`No sidebar link labelled ${label}`);
  fireEvent.click(link, { button: 0 });
}

/** Codes one excerpt on the given source as the current coder. */
async function codeAnExcerpt(sourceId: string, codeIds: string[]) {
  renderAt(`/projects/${project.projectId}/sources/${sourceId}`);

  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');

  const panel = screen.getByRole('dialog', { name: /code assignment/i });
  for (const codeId of codeIds) {
    fireEvent.click(panel.querySelector(`[data-code-id="${codeId}"]`)!);
  }
  fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() =>
    expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
  );
}

describe('acceptance 1: a coder during independent coding sees own work only', () => {
  it('names the view and shows nothing attributable to another coder', async () => {
    // The seeded scenario is exactly this case, so nothing is switched here.
    await codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId]);
    followSidebarLink('Coded data');

    expect(viewLabel()).toBe('Your coded work');

    const page = document.querySelector('main')!.textContent ?? '';

    // No other coder is named.
    for (const user of fixture.users.filter((candidate) => candidate.userId !== CURRENT_CODER_ID)) {
      expect(page, `${user.displayName} appears`).not.toContain(user.displayName);
    }

    // And none of their excerpts is listed. Every seeded excerpt belongs to the
    // second coder, so this is all twenty of them.
    const seeded = fixture.excerpts.filter((excerpt) => excerpt.coderId === SECOND_CODER_ID);
    expect(seeded.length).toBeGreaterThan(0);
    const shown = resultRows().map((row) => row.getAttribute('data-excerpt-id'));
    for (const excerpt of seeded) expect(shown).not.toContain(excerpt.excerptId);

    // The coder's own one is there.
    expect(shown).toHaveLength(1);
  });
});

describe('acceptance 2: the qualitative lead sees project-wide', () => {
  it('names the view, counts team-wide, and attributes every row', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Project-wide view');

    // The seeded excerpts belong to the second coder and are all here.
    const seeded = fixture.excerpts.filter((excerpt) => excerpt.coderId === SECOND_CODER_ID);
    const shown = resultRows().map((row) => row.getAttribute('data-excerpt-id'));
    for (const excerpt of seeded) expect(shown).toContain(excerpt.excerptId);

    // Attribution per row, which is only correct once R-4 has lifted.
    const second = fixture.users.find((user) => user.userId === SECOND_CODER_ID)!;
    expect(document.querySelectorAll('.coded-data__coder').length).toBe(shown.length);
    expect(document.querySelector('main')!.textContent).toContain(second.displayName);
  });

  it('counts every standing assignment on a code, not just one coder’s', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    // Worked out from the fixture rather than from the page's own arithmetic.
    const counts = new Map<string, number>();
    for (const assignment of fixture.codeAssignments) {
      counts.set(assignment.codeId, (counts.get(assignment.codeId) ?? 0) + 1);
    }
    const [codeId, expected] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const code = fixture.codes.find((candidate) => candidate.codeId === codeId)!;

    expect(
      within(region('filters')!).getByRole('radio', {
        name: new RegExp(`${code.name}, ${expected}$`),
      }),
    ).toBeInTheDocument();
  });
});

describe('acceptance 3: past independent coding, everyone sees project-wide', () => {
  it('flips a coder to the project-wide view', () => {
    writeSimulatedSession({ phase: 'review' });
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Project-wide view');
    expect(resultRows().length).toBeGreaterThan(0);
  });

  it('leaves the coder on own work at independent coding and earlier', () => {
    writeSimulatedSession({ phase: 'pilot' });
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Your coded work');
  });
});

describe('acceptance 4: a result lands focus on the turn holding its excerpt', () => {
  it('opens the second source with focus on the excerpt’s own turn', async () => {
    // Section 2 calls this the page's most important behaviour: landing at the
    // top of the transcript instead makes the page useless.
    const user = userEvent.setup();
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    const inSecond = fixture.excerpts.find(
      (excerpt) => excerpt.sourceId === SECOND_SOURCE.sourceId,
    )!;
    const row = document.querySelector(`[data-excerpt-id="${inSecond.excerptId}"]`)!;
    const link = within(row as HTMLElement).getByRole('link');
    const href = link.getAttribute('href')!;

    // The turn named in the link is the one holding the excerpt's start.
    const expectedTurn = fixture.turns.find((turn) =>
      turn.segmentIds.includes(inSecond.startSegmentId),
    )!;
    expect(href).toContain(`turn=${expectedTurn.turnId}`);

    await user.click(link);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SECOND_SOURCE.title);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-turn-id')).toBe(expectedTurn.turnId),
    );
  });
});

describe('acceptance 5: a superseded assignment is not counted', () => {
  it('drops a removed code from the filter list, keeping the one still on it', async () => {
    /*
      Two codes, then one removed. Not both: unchecking every code leaves an
      empty assignment, which D-042 closes by discarding the round rather than
      superseding anything — the guard that keeps unchecking from becoming the
      deletion route D-030 forbids. Supersession needs a save that still has
      something on it.
    */
    const removed = fixture.codes[0];
    const kept = fixture.codes[1];

    await codeAnExcerpt(fixture.sources[0].sourceId, [removed.codeId, kept.codeId]);

    followSidebarLink('Coded data');
    expect(
      within(region('filters')!).getByRole('radio', { name: new RegExp(`${removed.name}, 1$`) }),
    ).toBeInTheDocument();

    followSidebarLink(fixture.sources[0].title);
    fireEvent.click(document.querySelector('[data-coded-run]')!);
    const panel = await screen.findByRole('dialog', { name: /code assignment/i });
    fireEvent.click(panel.querySelector(`[data-code-id="${removed.codeId}"]`)!);
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );

    followSidebarLink('Coded data');

    // The superseded one is gone from the counts; the standing one is not.
    expect(
      within(region('filters')!).queryByRole('radio', { name: new RegExp(`${removed.name},`) }),
    ).toBeNull();
    expect(
      within(region('filters')!).getByRole('radio', { name: new RegExp(`${kept.name}, 1$`) }),
    ).toBeInTheDocument();
  });
});

describe('the filter list, per section 2', () => {
  it('heads the list with All codes and fuses each count into the name', async () => {
    await codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId]);
    followSidebarLink('Coded data');

    const radios = within(region('filters')!).getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName('All codes, 1');
    // The count is part of the name, not a badge beside it. The F-4 lesson.
    expect(radios[1]).toHaveAccessibleName(`${fixture.codes[0].name}, 1`);
  });

  it('marks the selection by more than colour', async () => {
    await codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId]);
    followSidebarLink('Coded data');

    const selected = document.querySelector('.coded-data__filter[data-selected]')!;
    expect(within(selected as HTMLElement).getByRole('radio')).toBeChecked();
  });

  it('narrows the results to the chosen code', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    const all = resultRows().length;
    const filters = within(region('filters')!).getAllByRole('radio');
    fireEvent.click(filters[1]);

    expect(resultRows().length).toBeLessThan(all);
    expect(resultRows().length).toBeGreaterThan(0);
  });
});

describe('the simulated session, per prototype-scope.md', () => {
  it('flips the view and its label when the role is switched', async () => {
    // The task's done-when. Client-side, so switching does not reload and take
    // the coder's session work with it.
    const user = userEvent.setup();
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Your coded work');

    await user.selectOptions(screen.getByLabelText('Role'), 'qualitativeLead');
    expect(viewLabel()).toBe('Project-wide view');

    await user.selectOptions(screen.getByLabelText('Role'), 'coder');
    expect(viewLabel()).toBe('Your coded work');
  });

  it('flips the view when the phase is switched', async () => {
    const user = userEvent.setup();
    renderAt(codedDataUrl);

    await user.selectOptions(screen.getByLabelText('Project phase'), 'review');
    expect(viewLabel()).toBe('Project-wide view');
  });

  it('sits after the regions section 2 fixes in order', () => {
    renderAt(codedDataUrl);

    const scenario = region('scenario')!;
    const summary = document.querySelector('.coded-data__summary')!;
    expect(summary.compareDocumentPosition(scenario) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says it is simulated rather than presenting itself as sign-in', () => {
    renderAt(codedDataUrl);
    expect(region('scenario')!.textContent).toMatch(/simulated/i);
  });
});

describe('the count line', () => {
  it('names the view beside the count, per D-049', () => {
    renderAt(codedDataUrl);
    expect(summaryText()).toContain('Your coded work');
    expect(summaryText()).toMatch(/\d+ coded excerpts?/);
  });
});
