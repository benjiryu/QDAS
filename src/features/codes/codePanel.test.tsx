import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Chord, Command } from '../../config/keybindings';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';
import { buildCodeTree, flattenCodeTree } from './codeTree';

/**
 * Specification: docs/patterns/code-selection.md sections 2 to 5, and the
 * panel-open focus destination in section 9.
 *
 * The four acceptance criteria this task names are here under their own names.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});
/**
 * Derived straight from the stored `canonicalOrderIndex`, not from the function
 * under test. The fixture stores the index hierarchy-first, so sorting by it is
 * the same sequence a depth-first walk of the tree should produce, and checking
 * the tree against itself would pass no matter how it sorted.
 */
const canonicalOrder = [...fixture.codes]
  .sort((a, b) => a.canonicalOrderIndex - b.canonicalOrderIndex)
  .map((code) => code.name);
const bindings = bindingsFor(detectPlatform());
let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearSourcePositions();
  vi.restoreAllMocks();
});

function renderWorkspace(flags = defaultFlags) {
  return render(
    <AnnouncerProvider announcer={announcer}>
      <TranscriptWorkspace
        resolved={resolved}
        seedExcerpts={fixture.excerpts}
        seedAssignments={fixture.codeAssignments}
        codingRoundId={fixture.codingRound.codingRoundId}
        codebookVersionId={fixture.codebookVersion.codebookVersionId}
        codes={fixture.codes}
        projectId={fixture.project.projectId}
        userId="us-test"
        flags={flags}
      />
    </AnnouncerProvider>,
  );
}

function press(chord: Chord) {
  act(() => {
    fireEvent.keyDown(document, {
      key: chord.key,
      ctrlKey: Boolean(chord.ctrl),
      altKey: Boolean(chord.alt),
      shiftKey: Boolean(chord.shift),
      metaKey: Boolean(chord.meta),
    });
  });
}

const chord = (command: Command) => press(bindings[command]);

/** Focuses a turn and captures it, which opens the panel. */
function focusTurn(index = 1) {
  act(() => {
    document.querySelectorAll<HTMLElement>('[data-turn-id]')[index].focus();
  });
}

function openPanel() {
  focusTurn();
  chord('excerpt.code');
}

function panel(): HTMLElement {
  return screen.getByRole('dialog', { name: /code assignment/i });
}

function region(name: string): HTMLElement {
  return panel().querySelector<HTMLElement>(`[data-region="${name}"]`)!;
}

function codebookOrder(): string[] {
  return Array.from(region('codebook').querySelectorAll('.code-panel__code-name')).map(
    (element) => element.textContent ?? '',
  );
}

function search(query: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: /find codes/i }), {
    target: { value: query },
  });
}

function checkboxFor(scope: HTMLElement, codeName: string): HTMLInputElement {
  return within(scope).getByRole('checkbox', { name: new RegExp(codeName) }) as HTMLInputElement;
}

/**
 * By identifier, for the pairs of similarly named codes the fixture carries on
 * purpose: "Water access" and "Water access rules" cannot be told apart by an
 * accessible-name query, which is the disambiguation problem the definitions
 * exist to solve.
 */
function checkboxById(scope: HTMLElement, codeId: string): HTMLInputElement {
  return scope.querySelector<HTMLInputElement>(`[data-code-id="${codeId}"]`)!;
}

function lastAnnouncement(): string {
  return announcer.getLast()?.message ?? '';
}

/**
 * The pending assignment, which since D-039 is the set of checked boxes.
 *
 * Deduplicated: one code can have a row in the codebook, in the search results,
 * and in the codebook at the same time.
 */
function checkedCodeIds(): string[] {
  const ids = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
    .filter((box) => box.checked)
    .map((box) => box.dataset.codeId!);
  return [...new Set(ids)];
}

describe('acceptance: search does not reorder the codebook', () => {
  it('leaves the canonical codebook present and unchanged below the results', () => {
    renderWorkspace();
    openPanel();

    const before = codebookOrder();
    expect(before).toEqual(canonicalOrder);

    search('water');

    const results = region('search-results');
    expect(within(results).getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(codebookOrder()).toEqual(before);
  });

  it('puts the results above the codebook, in their own region', () => {
    renderWorkspace();
    openPanel();
    search('water');

    const regions = Array.from(panel().querySelectorAll('[data-region]')).map((element) =>
      element.getAttribute('data-region'),
    );
    expect(regions.indexOf('search-results')).toBeLessThan(regions.indexOf('codebook'));
  });
});

describe('acceptance: stable code order', () => {
  it('is unchanged after the panel closes and reopens', async () => {
    renderWorkspace();
    openPanel();
    const before = codebookOrder();

    // Closing with nothing checked discards the capture, so reopening means
    // capturing again. D-036 removed the adjustment route this test used to take.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
    // Focus returns to the turn after the dialog unwinds its own restore, and
    // the next capture needs it there.
    await act(async () => {});

    chord('excerpt.code');

    expect(codebookOrder()).toEqual(before);
  });

  it('does not reorder after codes are used', () => {
    renderWorkspace();
    openPanel();
    const before = codebookOrder();

    const byName = (name: string) =>
      fixture.codes.find((candidate) => candidate.name === name)!.codeId;
    fireEvent.click(checkboxById(region('codebook'), byName('Water access rules')));
    fireEvent.click(checkboxById(region('codebook'), byName('Waiting list')));

    expect(codebookOrder()).toEqual(before);
  });

  it('reads its order from canonicalOrderIndex, not from the array', () => {
    const shuffled = [...fixture.codes].reverse();
    const order = flattenCodeTree(buildCodeTree(shuffled)).map((node) => node.code.name);
    expect(order).toEqual(canonicalOrder);
  });
});

describe('acceptance: parent does not cascade', () => {
  it('adds only the parent when a parent is checked', () => {
    renderWorkspace();
    openPanel();

    const codebook = region('codebook');
    const parent = fixture.codes.find((code) => code.name === 'Barriers to participation')!;
    fireEvent.click(checkboxById(codebook, parent.codeId));

    expect(checkedCodeIds()).toEqual([parent.codeId]);

    // Every descendant is still unchecked, including grandchildren.
    const descendants = fixture.codes.filter(
      (code) =>
        code.parentCodeId === parent.codeId ||
        fixture.codes.some(
          (middle) => middle.parentCodeId === parent.codeId && code.parentCodeId === middle.codeId,
        ),
    );
    expect(descendants.length).toBeGreaterThan(3);
    for (const child of descendants) {
      expect(checkboxById(codebook, child.codeId).checked).toBe(false);
    }
  });
});

describe('acceptance: query survives selection', () => {
  it('keeps the query and both selections when a second result is checked', () => {
    renderWorkspace();
    openPanel();
    search('water');

    const results = () => region('search-results');
    const boxes = within(results()).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(boxes[0]);
    fireEvent.click(within(results()).getAllByRole('checkbox')[1]);

    expect(screen.getByRole('searchbox', { name: /find codes/i })).toHaveValue('water');
    expect(checkedCodeIds()).toHaveLength(2);

    const stillChecked = within(results()).getAllByRole('checkbox') as HTMLInputElement[];
    expect(stillChecked[0].checked).toBe(true);
    expect(stillChecked[1].checked).toBe(true);
  });

  it('checks the same code from either region', () => {
    renderWorkspace();
    openPanel();
    search('waiting list');

    fireEvent.click(checkboxFor(region('search-results'), 'Waiting list'));
    expect(checkboxFor(region('codebook'), 'Waiting list').checked).toBe(true);
  });
});

describe('the container, a centered modal dialog', () => {
  it('is a dialog, named by its heading', () => {
    // D-026's container, reinstated over D-027. Two of D-027's four reasons
    // for the reversal were dissolved by D-036 and D-040; see the task report.
    renderWorkspace();
    openPanel();

    const dialog = screen.getByRole('dialog', { name: /code assignment/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('Code Assignment');
  });

  it('puts a backdrop over the page and hides it from assistive technology', () => {
    const { container } = renderWorkspace();
    openPanel();

    expect(document.querySelector('.code-panel__overlay')).not.toBeNull();
    // The transcript is behind the dim and out of the accessibility tree, so
    // what is dimmed and what is unavailable agree. That agreement is what
    // D-027 said a non-modal panel could not have.
    const transcript = container.querySelector('[data-transcript]');
    expect(transcript?.closest('[aria-hidden="true"], [inert]')).not.toBeNull();
  });

  it('keeps the live regions announceable behind the dialog', () => {
    // The dialog hides everything outside itself, and the panel is the noisiest
    // surface in the application. Losing its announcements would be silent.
    renderWorkspace();
    openPanel();

    for (const testId of ['live-region-polite', 'live-region-assertive']) {
      const region = screen.getByTestId(testId);
      expect(region.closest('[aria-hidden="true"], [inert]')).toBeNull();
    }
  });

  it('traps focus, so the transcript is not tabbable behind it', () => {
    const { container } = renderWorkspace();
    openPanel();

    for (const turn of Array.from(container.querySelectorAll('[data-turn-id]'))) {
      expect(turn.closest('[aria-hidden="true"], [inert]')).not.toBeNull();
    }
  });

  it('is present in the DOM only while open', () => {
    renderWorkspace();
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();

    openPanel();
    expect(panel()).toBeInTheDocument();
  });

  it('is present in the document only while open', () => {
    renderWorkspace();
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();

    openPanel();
    expect(panel()).toBeInTheDocument();
  });

  it('is headed with the card name, and nothing else, per D-039', () => {
    renderWorkspace();
    openPanel();

    const heading = within(panel()).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Code Assignment');
    // The verbose heading is gone; so is the excerpt summary region it named.
    expect(heading.textContent).not.toMatch(/sentence/i);
  });

  it('carries the captured excerpt as hidden text, per D-040', () => {
    // Not aria-describedby, which would recite it on every focus entry, and
    // not a live region, since nothing changes. Read on demand, in full.
    const { container } = renderWorkspace();
    openPanel();

    const hidden = panel().querySelector('[data-selected-excerpt]')!;
    expect(hidden.textContent).toMatch(/^Selected excerpt: /);
    expect(hidden).not.toHaveAttribute('aria-hidden');
    expect(panel()).not.toHaveAttribute('aria-describedby');
    expect(hidden.closest('[aria-live]')).toBeNull();

    // The full captured text, untruncated: whatever the transcript shows as
    // captured is what is offered for re-reading.
    const captured = Array.from(container.querySelectorAll('[data-captured]'))
      .map((element) => element.textContent ?? '')
      .join('');
    expect(hidden.textContent).toContain(captured.slice(0, 60));
    expect(hidden.textContent).not.toMatch(/…|\.\.\./);
  });

  it('offers no excerpt summary and no read-back control, per D-039', () => {
    renderWorkspace();
    openPanel();

    expect(within(panel()).queryByRole('button', { name: /read the full excerpt/i })).toBeNull();
    expect(panel().querySelector('[data-region="excerpt"]')).toBeNull();
  });

  it('shows no visible level label, keeping hierarchy in the nesting, per D-039', () => {
    renderWorkspace();
    openPanel();

    expect(panel().querySelector('.code-panel__level')).toBeNull();
    expect(within(region('codebook')).queryByText(/^level \d/i)).toBeNull();
    // Programmatic hierarchy is untouched: nested lists still carry it.
    expect(region('codebook').querySelectorAll('ul[aria-label]').length).toBeGreaterThan(0);
  });

  it('offers no pending assignment region, since the boxes are the state', () => {
    renderWorkspace();
    openPanel();
    const waitingList = fixture.codes.find((code) => code.name === 'Waiting list')!;
    fireEvent.click(checkboxById(region('codebook'), waitingList.codeId));

    expect(panel().querySelector('[data-region="pending"]')).toBeNull();
    expect(checkedCodeIds()).toHaveLength(1);
    // The count is still announced, which is what the region used to show.
    expect(lastAnnouncement()).toContain('1 pending');
  });

  it('opens with focus in the search field and announces itself', () => {
    renderWorkspace();
    openPanel();

    expect(screen.getByRole('searchbox', { name: /find codes/i })).toHaveFocus();
    expect(
      announcer.getHistory().some((entry) => /code assignment/i.test(entry.message)),
    ).toBe(true);
  });
});

describe('commands, per section 2.1', () => {
  it('closes from anywhere inside the dialog', () => {
    // Focus can no longer sit in the transcript while this is open, so the
    // "anywhere" D-027 worried about is now anywhere within the trap.
    renderWorkspace();
    openPanel();

    act(() => {
      within(panel()).getByRole('button', { name: 'Close' }).focus();
    });
    press({ key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
    // Nothing was checked, so nothing was committed and the announcement says
    // so rather than reporting a save that did not happen.
    expect(
      announcer.getHistory().some((entry) => /closed\. Nothing was coded/i.test(entry.message)),
    ).toBe(true);
  });

  it('discards the capture on cancel, and returns focus to its turn', async () => {
    // Section 3: the capture goes with the panel, and section 6 requires a
    // defined return, which is the turn the capture was taken from — not
    // wherever the dialog would otherwise restore focus to.
    const { container } = renderWorkspace();
    openPanel();
    const turnId = container
      .querySelector('[data-excerpt]')!
      .closest('[data-turn-id]')!
      .getAttribute('data-turn-id');

    press({ key: 'Escape' });
    await act(async () => {});

    expect(document.querySelector('.excerpt-toolbar__state')).toHaveAttribute(
      'data-state',
      'idle',
    );
    expect(document.querySelector('[data-excerpt]')).toBeNull();
    expect(document.activeElement).toHaveAttribute('data-turn-id', turnId!);
  });

  it('returns focus to the search field from elsewhere in the dialog', () => {
    // Still worth its chord under a focus trap: it jumps back to search from
    // the note field or the far end of a fifty-code list.
    renderWorkspace();
    openPanel();

    act(() => {
      within(panel()).getByRole('button', { name: 'Save & Close' }).focus();
    });
    chord('codes.focusSearch');

    expect(screen.getByRole('searchbox', { name: /find codes/i })).toHaveFocus();
  });

  it('offers no clear-search control, and names the field only once', () => {
    // The browser draws its own clear on a `type="search"` field, and a region
    // heading one line above the field's own label said the same thing twice.
    renderWorkspace();
    openPanel();
    search('water');

    expect(within(panel()).queryByRole('button', { name: /clear search/i })).toBeNull();
    expect(within(panel()).queryByRole('heading', { name: /search codes/i })).toBeNull();

    const field = screen.getByRole('searchbox', { name: /find codes/i });
    expect(field).toHaveAttribute('type', 'search');
    // Emptying it by hand still removes the results region.
    fireEvent.change(field, { target: { value: '' } });
    expect(panel().querySelector('[data-region="search-results"]')).toBeNull();
  });

});

describe('regions, per section 3', () => {
  it('renders them in the fixed order', () => {
    renderWorkspace();
    openPanel();
    search('water');

    const order = Array.from(panel().querySelectorAll('[data-region]')).map((element) =>
      element.getAttribute('data-region'),
    );
    // The order D-039 fixes: heading and close, search, results, recent,
    // codebook, Create code, note, Save & Close.
    expect(order).toEqual(['search-results', 'codebook', 'create', 'note', 'actions']);
  });

  it('keeps conditional regions absent rather than empty', () => {
    renderWorkspace();
    openPanel();

    // 4: no query, no results region.
    expect(panel().querySelector('[data-region="search-results"]')).toBeNull();
    // 7: no provisional codes exist yet, so no proposed region.
    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();
  });

  it('offers no recently used region, whatever the flag says', () => {
    // It duplicated rows already in the codebook. The flag is deprecated
    // rather than deleted, and now governs nothing.
    renderWorkspace({ ...defaultFlags, showRecentCodes: true });
    openPanel();

    expect(panel().querySelector('[data-region="recent"]')).toBeNull();
    expect(within(panel()).queryByText(/recently used/i)).toBeNull();
  });

  it('omits the recent region when the flag is off', () => {
    renderWorkspace({ ...defaultFlags, showRecentCodes: false });
    openPanel();

    expect(panel().querySelector('[data-region="recent"]')).toBeNull();
  });

});

describe('the code list, per section 4', () => {
  it('uses native checkboxes in nested lists, not a tree widget', () => {
    renderWorkspace();
    openPanel();

    const codebook = region('codebook');
    expect(codebook.querySelectorAll('[role="tree"], [role="treeitem"]')).toHaveLength(0);
    expect(within(codebook).getAllByRole('checkbox').length).toBe(fixture.codes.length);
    expect(codebook.querySelectorAll('ul ul').length).toBeGreaterThan(0);
  });

  it('labels each nested list by its parent code', () => {
    renderWorkspace();
    openPanel();

    const nested = region('codebook').querySelector('ul ul');
    expect(nested).toHaveAttribute('aria-label');
  });

  it('carries no definition text on a row, only the name and its pill', () => {
    // A list scanned by name does not need a second line of prose against
    // every row. Definitions are read at the Codebook destination, per D-035.
    renderWorkspace();
    openPanel();

    const first = fixture.codes.find((code) => code.canonicalOrderIndex === 0)!;
    expect(within(region('codebook')).queryByText(first.shortDefinition)).toBeNull();
    expect(region('codebook').querySelector('.code-panel__short')).toBeNull();

    // The name is still there, and so is the colour pill beside it.
    expect(within(region('codebook')).getByText(first.name)).toBeInTheDocument();
    expect(region('codebook').querySelector('.code-panel__swatch')).not.toBeNull();
  });

  it('announces the code name and the new pending count on check', () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(checkboxFor(region('codebook'), 'Waiting list'));
    expect(lastAnnouncement()).toContain('Waiting list');
    expect(lastAnnouncement()).toContain('1 pending');

    fireEvent.click(checkboxFor(region('codebook'), 'Waiting list'));
    expect(lastAnnouncement()).toContain('0 pending');
  });

  it('does not close the panel when a code is checked', () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(checkboxFor(region('codebook'), 'Waiting list'));
    expect(panel()).toBeInTheDocument();
  });

  it('does not convey checked state by colour alone', () => {
    renderWorkspace();
    openPanel();

    // The native checkbox carries the shape channel, and colour appears only as
    // a swatch hidden from assistive technology.
    const box = checkboxFor(region('codebook'), 'Waiting list');
    expect(box.type).toBe('checkbox');
    expect(region('codebook').querySelector('.code-panel__swatch')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('search, per section 5', () => {
  it('matches names and parent paths, and nothing the panel does not show', () => {
    // "spigots" is a synonym on Water access and appears in two codes'
    // criteria. None of that is on screen, so a result carrying it would be a
    // code the coder cannot see a reason for.
    renderWorkspace();
    openPanel();

    search('spigot');

    expect(region('search-results').textContent).toMatch(/no codes match/i);
    expect(within(region('search-results')).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('still finds a code by name', () => {
    renderWorkspace();
    openPanel();

    search('water access');

    expect(within(region('search-results')).getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(region('search-results').textContent).toContain('Water access');
  });

  it('shows the parent path so a matched child is identifiable', () => {
    renderWorkspace();
    openPanel();
    search('waiting list');

    expect(region('search-results').textContent).toMatch(/in .*Barriers to participation/);
  });

  it('states the result count in the region heading', () => {
    renderWorkspace();
    openPanel();
    search('water');

    const heading = within(region('search-results')).getByRole('heading', { level: 3 });
    const count = within(region('search-results')).getAllByRole('checkbox').length;
    expect(heading.textContent).toContain(String(count));
  });

  it('says so when nothing matches, leaving the codebook intact', () => {
    renderWorkspace();
    openPanel();
    const before = codebookOrder();

    search('zzzznotacode');

    expect(region('search-results').textContent).toMatch(/no codes match/i);
    expect(codebookOrder()).toEqual(before);
  });
});

describe('the panel adds no live region of its own', () => {
  it('announces through the shared service only', () => {
    const { container } = renderWorkspace();
    openPanel();

    for (const live of container.querySelectorAll('[aria-live]')) {
      expect(live.closest('.code-panel')).toBeNull();
    }
  });
});

describe('the note disclosure', () => {
  const noteRow = () =>
    within(region('note')).getByRole('button', { name: /add note|edit note/i });
  const noteFieldOrNull = () =>
    within(region('note')).queryByLabelText(/note about this excerpt/i);

  it('starts collapsed, as one row', () => {
    // The same shape as Create code: writing a note is the occasional act, and
    // a permanently expanded textarea gave it ten times the space.
    renderWorkspace();
    openPanel();

    expect(noteRow()).toHaveAttribute('aria-expanded', 'false');
    expect(noteFieldOrNull()).toBeNull();
  });

  it('focuses the note field on expanding', async () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(noteRow());
    await act(async () => {});

    expect(noteFieldOrNull()).toHaveFocus();
    expect(noteRow()).toHaveAttribute('aria-expanded', 'true');
  });

  it('returns focus to the row on collapsing', async () => {
    renderWorkspace();
    openPanel();
    fireEvent.click(noteRow());
    await act(async () => {});

    fireEvent.click(noteRow());
    await act(async () => {});

    expect(noteRow()).toHaveFocus();
    expect(noteFieldOrNull()).toBeNull();
  });

  it('collapses on Escape without cancelling the panel', async () => {
    renderWorkspace();
    openPanel();
    fireEvent.click(noteRow());
    await act(async () => {});

    fireEvent.keyDown(noteFieldOrNull()!, { key: 'Escape' });
    await act(async () => {});

    expect(noteRow()).toHaveAttribute('aria-expanded', 'false');
    expect(noteRow()).toHaveFocus();
    expect(panel()).toBeInTheDocument();
  });

  it('says a note exists once one is drafted', () => {
    // A draft behind a collapsed row is invisible and still saved, so the row
    // has to say so.
    renderWorkspace();
    openPanel();
    fireEvent.click(noteRow());
    fireEvent.change(noteFieldOrNull()!, { target: { value: 'Worth returning to.' } });

    expect(noteRow()).toHaveTextContent(/edit note/i);
    expect(noteRow()).toHaveAttribute('data-has-note');
  });

  it('keeps the draft across a collapse and a reopen', () => {
    renderWorkspace();
    openPanel();
    fireEvent.click(noteRow());
    fireEvent.change(noteFieldOrNull()!, { target: { value: 'Kept through the collapse.' } });

    fireEvent.click(noteRow());
    expect(noteFieldOrNull()).toBeNull();
    fireEvent.click(noteRow());

    expect(noteFieldOrNull()).toHaveValue('Kept through the collapse.');
  });

  it('opens expanded and focused when excerpt.note opened the panel', async () => {
    // That command exists to put the coder straight into this field, which is
    // the whole difference between it and excerpt.code.
    renderWorkspace();
    focusTurn();
    chord('excerpt.note');
    await act(async () => {});

    expect(noteRow()).toHaveAttribute('aria-expanded', 'true');
    expect(noteFieldOrNull()).toHaveFocus();
  });
});

describe('the fixed header and footer', () => {
  const scrollRegion = () => panel().querySelector<HTMLElement>('[data-scroll-region]')!;

  it('scrolls the middle, not the card', () => {
    renderWorkspace();
    openPanel();

    // Asserted through the computed style rather than the marker attribute, so
    // dropping the class that does the scrolling fails here rather than passing
    // on an attribute that only tests read.
    expect(scrollRegion()).toHaveStyle({ overflowY: 'auto' });
    // A flex item will not shrink below its content without this, and then
    // nothing scrolls at all.
    expect(scrollRegion()).toHaveStyle({ minHeight: '0px' });
    // The card itself must not scroll, or the ends would travel with it.
    // `panel()` is the dialog, which since D-048 is the surface holding the
    // card and the companion; the card is the thing that must not scroll.
    expect(panel().querySelector('.code-panel')).toHaveStyle({ overflow: 'hidden' });
  });

  it('keeps the heading and Save & Close outside the scrolling middle', () => {
    renderWorkspace();
    openPanel();

    const scroll = scrollRegion();
    expect(scroll.contains(within(panel()).getByRole('heading', { level: 2 }))).toBe(false);
    expect(
      scroll.contains(within(panel()).getByRole('button', { name: 'Save & Close' })),
    ).toBe(false);
    expect(scroll.contains(within(panel()).getByRole('button', { name: 'Close' }))).toBe(false);
  });

  it('puts the codebook and the disclosures inside it', () => {
    renderWorkspace();
    openPanel();

    const scroll = scrollRegion();
    for (const name of ['codebook', 'create', 'note']) {
      expect(scroll.contains(region(name))).toBe(true);
    }
  });

  it('keeps the header, which carries the divider, outside the scrolling middle', () => {
    // The line under the heading used to be the first scrolling region's top
    // border, and it travelled up and out with the codebook. Whether the border
    // is actually painted is asserted in the browser: jsdom drops any
    // declaration using a `var()`, so a computed-style check here would pass
    // whether the rule existed or not.
    renderWorkspace();
    openPanel();

    const header = panel().querySelector<HTMLElement>('.code-panel__header')!;
    expect(scrollRegion().contains(header)).toBe(false);
    expect(header).toHaveStyle({ paddingBottom: '0.5rem' });
  });

  it('keeps the hidden excerpt with the header, so it never scrolls away', () => {
    renderWorkspace();
    openPanel();

    const hidden = panel().querySelector('[data-selected-excerpt]')!;
    expect(scrollRegion().contains(hidden)).toBe(false);
    expect(hidden.textContent).toMatch(/^Selected excerpt: /);
  });
});

describe('the footer order', () => {
  it('puts the flag after Save & Close, in the markup as well as on screen', () => {
    // Asserted on document order rather than on coordinates: that is what the
    // tab order and a screen reader follow, and contract 2.1 requires the two
    // to agree. A flex `order` would move it visually and leave it early here.
    renderWorkspace();
    openPanel();

    const footer = region('actions');
    const save = within(footer).getByRole('button', { name: 'Save & Close' });
    const flag = within(footer).getByRole('checkbox', { name: /^Flag$/ });

    expect(save.compareDocumentPosition(flag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
