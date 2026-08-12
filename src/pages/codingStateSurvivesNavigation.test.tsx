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
import { CURRENT_CODER_ID } from '../data/seed/project';
import { clearSourcePositions } from '../data/sourcePositionStore';

/**
 * D-044: coding state survives in-app navigation.
 *
 * Specification: decision D-044, docs/pages/destinations.md shared rules.
 *
 * The regression test the decision exists for. D-035 moved definition lookup to
 * the Codebook destination, which made leaving the coding surface mid-task a
 * designed behaviour rather than an accident. A coder who leaves to check
 * whether a passage is `Water access` or `Water access rules` and comes back to
 * an empty panel has been punished for diligence, and the coders least able to
 * reconstruct their place pay the most.
 *
 * Driven through the real sidebar links rather than by re-rendering at a new
 * path. Routing the way a coder routes is the whole point: a test that mounted
 * each destination directly would never unmount the source page, which is the
 * only place this can break.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;

/** Two codes, named so a partial restore says which one went missing. */
const FIRST_CODE = fixture.codes.find((code) => code.name === 'Waiting list')!;
const SECOND_CODE = fixture.codes.find((code) => code.name === 'Mutual aid')!;
const NOTE = 'Worth returning to when the water rules come up again.';

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
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

const sidebar = () => within(screen.getByRole('navigation', { name: 'Project' }));

/**
 * The Coded data count line.
 *
 * Read as text rather than matched exactly: since D-049 the line names its view
 * as well, "Your coded work · 1 coded excerpt", so the count is one element
 * among several.
 */
const summaryText = () => document.querySelector('.coded-data__summary')?.textContent ?? '';

/**
 * Follows a sidebar link by finding it in the DOM rather than by role.
 *
 * Necessary, and the necessity is the finding. While the code panel is open the
 * modal marks the rest of the application `aria-hidden`, so a role query cannot
 * see the sidebar at all — and a coder cannot reach it either. See the
 * "currently unreachable" test below. This drives the real `<Link>` and the
 * real router, so what is being skipped is the modal's cover, not the routing.
 */
function followSidebarLink(label: string) {
  const link = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.project-nav__link'),
  ).find((candidate) => candidate.textContent === label);
  if (!link) throw new Error(`No sidebar link labelled ${label}`);
  fireEvent.click(link, { button: 0 });
}
const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const panelIsOpen = () => screen.queryAllByRole('dialog', { name: /code assignment/i }).length > 0;

/** Every highlighted character, in document order: what the coder can see. */
const highlighted = () =>
  Array.from(document.querySelectorAll('[data-captured]'))
    .map((element) => element.textContent ?? '')
    .join('');

const checkedCodeIds = () =>
  Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
    .filter((box) => box.checked)
    .map((box) => box.dataset.codeId!);

function checkCode(codeId: string) {
  fireEvent.click(panel().querySelector(`[data-code-id="${codeId}"]`)!);
}

/** Expands the note disclosure if collapsed, and returns the field. */
function noteField(): HTMLTextAreaElement {
  const region = panel().querySelector<HTMLElement>('[data-region="note"]')!;
  const row = within(region).getByRole('button', { name: /add note|edit note/i });
  if (row.getAttribute('aria-expanded') !== 'true') fireEvent.click(row);
  return within(region).getByLabelText(/note about this excerpt/i) as HTMLTextAreaElement;
}

/**
 * A capture, two codes, and a draft note: everything D-044 names.
 *
 * The capture comes from the focused-turn fallback rather than a drag, which is
 * the route that works identically in jsdom and in a browser.
 */
function startCoding() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');

  checkCode(FIRST_CODE.codeId);
  checkCode(SECOND_CODE.codeId);
  fireEvent.change(noteField(), { target: { value: NOTE } });
}

describe('acceptance: coding state survives a trip to every destination', () => {
  it('restores the capture, both checked codes, and the draft note', async () => {
    renderAt(sourceUrl);

    startCoding();
    const capturedBefore = highlighted();
    expect(capturedBefore).not.toBe('');
    expect(checkedCodeIds()).toEqual([FIRST_CODE.codeId, SECOND_CODE.codeId]);

    // Every destination in turn, through the real sidebar links.
    for (const label of ['Code book', 'Coded data', 'Notes']) {
      followSidebarLink(label);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(label);
      // And the panel really is gone while away, not merely invisible.
      expect(panelIsOpen()).toBe(false);
    }

    followSidebarLink(source.title);
    await waitFor(() => expect(panelIsOpen()).toBe(true));

    /*
      Asserted one piece at a time. A single combined expectation would report
      "the state did not survive" and leave whoever reads the failure to work
      out which of the three was dropped.
    */
    expect(highlighted(), 'the capture').toBe(capturedBefore);
    expect(checkedCodeIds(), 'the checked codes').toEqual([
      FIRST_CODE.codeId,
      SECOND_CODE.codeId,
    ]);
    expect(noteField(), 'the draft note').toHaveValue(NOTE);
  });

  it('holds the panel open, rather than reopening it empty', async () => {
    // "Restores the panel exactly as it was", per the shared rules. A panel
    // that came back closed would still pass a state-only check while losing
    // the coder their place.
    renderAt(sourceUrl);
    startCoding();

    followSidebarLink('Code book');
    followSidebarLink(source.title);

    await waitFor(() => expect(panelIsOpen()).toBe(true));
  });

  it('leaves focus inside the restored dialog, not on the route heading', async () => {
    // The shell moves focus to the h1 on every navigation. A focus-trapping
    // dialog restored open with focus behind it would be unreachable by
    // keyboard, so the panel's focus has to win this one.
    renderAt(sourceUrl);
    startCoding();

    followSidebarLink('Notes');
    followSidebarLink(source.title);

    await waitFor(() => expect(panel().contains(document.activeElement)).toBe(true));
  });

  it('is currently unreachable by a coder, because the panel is modal', () => {
    /*
      Surfaced rather than resolved, per CLAUDE.md rule 8.

      D-044 and destinations.md describe leaving the source page *mid-capture*:
      "a coder who leaves to check whether a passage is Water access or Water
      access rules". But since D-039 restored D-026's modal container, an open
      panel marks the rest of the application `aria-hidden` and covers it with
      an overlay, so the sidebar is neither readable nor clickable. And since
      D-042 the only ways out of the panel commit the work or discard it.

      So the journey the decision was written for has no route through the
      interface today. The persistence below it is real and tested; what is
      missing is the door. This test records the conflict so that whoever
      changes the panel's modality has to come here and change it deliberately.
    */
    renderAt(sourceUrl);
    startCoding();

    expect(panelIsOpen()).toBe(true);
    expect(screen.queryByRole('navigation', { name: 'Project' })).toBeNull();
  });
});

describe('saved work survives the same round trip', () => {
  it('is still coded, and Coded data counts it', async () => {
    // Every seeded excerpt belongs to the second coder and R-4 keeps that off
    // this page, so work saved in the session is the only thing Coded data may
    // show. If it did not survive, the page could only ever say zero.
    const user = userEvent.setup();
    renderAt(sourceUrl);

    startCoding();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    await user.click(sidebar().getByRole('link', { name: 'Coded data' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Coded data');
    expect(summaryText()).toContain('1 coded excerpt');

    await user.click(sidebar().getByRole('link', { name: 'Notes' }));
    expect(screen.getByText('1 note')).toBeInTheDocument();

    // And back on the transcript, the sentences are still marked coded.
    await user.click(sidebar().getByRole('link', { name: source.title }));
    await waitFor(() =>
      expect(document.querySelector('[data-coded-run]')).not.toBeNull(),
    );
  });

  it('starts empty again after the between-participants reset', () => {
    // D-044 holds state for a session, not beyond one. `clearCodingSession` is
    // what the reset in seed-data.md section 5 calls, and it is also what
    // stands in for a reload here.
    const view = renderAt(sourceUrl);
    startCoding();

    view.unmount();
    clearCodingSession();

    renderAt(`/projects/${project.projectId}/coded-data`);
    expect(summaryText()).toContain('0 coded excerpts');
  });
});

describe('the sidebar, per D-043', () => {
  it('lists the sources then the three destinations, in that order', () => {
    renderAt(`/projects/${project.projectId}`);

    const labels = sidebar()
      .getAllByRole('link')
      .map((link) => link.textContent);

    const assignedTitles = fixture.workAssignments
      .filter(
        (assignment) =>
          assignment.userId === CURRENT_CODER_ID &&
          assignment.codingRoundId === project.activeCodingRoundId,
      )
      .map(
        (assignment) =>
          fixture.sources.find((candidate) => candidate.sourceId === assignment.sourceId)!.title,
      );

    expect(labels).toEqual([...assignedTitles, 'Code book', 'Coded data', 'Notes']);
  });

  it('offers no Themes destination, per D-017', () => {
    renderAt(`/projects/${project.projectId}`);
    expect(sidebar().queryByRole('link', { name: /themes/i })).toBeNull();
  });

  it('marks the open destination as the current page, and only it', async () => {
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    await user.click(sidebar().getByRole('link', { name: 'Coded data' }));

    const current = sidebar()
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Coded data');
  });

  it('keeps the landmark on a route with no project in context', () => {
    // Contract 2.1 counts a second labelled navigation as part of the structure
    // every route shares, so it says what it has rather than disappearing.
    renderAt('/projects');

    expect(screen.getByRole('navigation', { name: 'Project' })).toBeInTheDocument();
    expect(sidebar().queryAllByRole('link')).toHaveLength(0);
  });
});

describe('destination entry, per the shared rules', () => {
  it('gives each destination one h1 and a count, and lands focus on it', async () => {
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    for (const [label, count] of [
      // The Codebook states its version beside the count, so this is a
              // substring of the summary line rather than the whole of it.
      ['Code book', `${fixture.codes.length} codes`],
      ['Coded data', '0 coded excerpts'],
      ['Notes', '0 notes'],
    ]) {
      await user.click(sidebar().getByRole('link', { name: label }));

      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent(label);
      expect(headings[0]).toHaveFocus();
      expect(screen.getByText(new RegExp(count))).toBeInTheDocument();
    }
  });

  it('names the route out rather than showing a blank region when empty', async () => {
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    await user.click(sidebar().getByRole('link', { name: 'Coded data' }));
    expect(screen.getByText(/have not coded anything/i)).toBeInTheDocument();
    expect(screen.getByText(/choose Code selection/i)).toBeInTheDocument();
  });
});
