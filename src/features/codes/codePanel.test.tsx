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
  return screen.getByRole('region', { name: /select code/i });
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
  fireEvent.change(screen.getByRole('searchbox', { name: /search the codebook/i }), {
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
 * and in recently used at the same time.
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
  it('is unchanged after the panel closes and reopens', () => {
    renderWorkspace();
    openPanel();
    const before = codebookOrder();

    // Cancel discards the capture, so reopening means capturing again. D-036
    // removed the adjustment route this test used to take.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: /select code/i })).toBeNull();

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

    expect(screen.getByRole('searchbox', { name: /search the codebook/i })).toHaveValue('water');
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

describe('the container, per section 2 and D-027', () => {
  it('is a labelled region, not a dialog', () => {
    renderWorkspace();
    openPanel();

    expect(panel()).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(panel().getAttribute('aria-modal')).toBeNull();
  });

  it('is present in the DOM only while open', () => {
    renderWorkspace();
    expect(screen.queryByRole('region', { name: /select code/i })).toBeNull();

    openPanel();
    expect(panel()).toBeInTheDocument();
  });

  it('leaves the transcript reachable while it is open', () => {
    const { container } = renderWorkspace();
    openPanel();

    // Not inert, not hidden, and no backdrop over it.
    const transcript = screen.getByRole('region', { name: 'Transcript' });
    expect(transcript).toBeVisible();
    expect(transcript.closest('[inert], [aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('.backdrop, [data-backdrop]')).toBeNull();

    // And the transcript is still reachable and readable while it is open:
    // every turn is a tab stop, which is the only movement D-038 leaves.
    expect(container.querySelectorAll('[data-turn-id][tabindex="0"]').length).toBe(
      resolved.turns.length,
    );
  });

  it('is headed with the card name, and nothing else, per D-039', () => {
    renderWorkspace();
    openPanel();

    const heading = within(panel()).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Select Code');
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

    expect(screen.getByRole('searchbox', { name: /search the codebook/i })).toHaveFocus();
    expect(
      announcer.getHistory().some((entry) => /select code/i.test(entry.message)),
    ).toBe(true);
  });
});

describe('commands, per section 2.1', () => {
  it('cancels from anywhere, including with focus in the transcript', () => {
    const { container } = renderWorkspace();
    openPanel();

    act(() => {
      container.querySelector<HTMLElement>('[data-turn-id]')!.focus();
    });
    press({ key: 'Escape' });

    expect(screen.queryByRole('region', { name: /select code/i })).toBeNull();
    expect(
      announcer.getHistory().some((entry) => /cancelled/i.test(entry.message)),
    ).toBe(true);
  });

  it('discards the capture on cancel, and returns focus to its turn', () => {
    // Section 3: the capture goes with the panel, and section 6 requires a
    // defined return, which is the turn the capture was taken from.
    const { container } = renderWorkspace();
    openPanel();
    const turnId = container
      .querySelector('[data-excerpt]')!
      .closest('[data-turn-id]')!
      .getAttribute('data-turn-id');

    press({ key: 'Escape' });

    expect(document.querySelector('.excerpt-toolbar__state')).toHaveAttribute(
      'data-state',
      'idle',
    );
    expect(document.querySelector('[data-excerpt]')).toBeNull();
    expect(document.activeElement).toHaveAttribute('data-turn-id', turnId!);
  });

  it('returns focus to the search field from the transcript', () => {
    const { container } = renderWorkspace();
    openPanel();

    act(() => {
      container.querySelector<HTMLElement>('[data-turn-id]')!.focus();
    });
    chord('codes.focusSearch');

    expect(screen.getByRole('searchbox', { name: /search the codebook/i })).toHaveFocus();
  });

  it('clears the query and removes the results region', () => {
    renderWorkspace();
    openPanel();
    search('water');
    expect(region('search-results')).toBeInTheDocument();

    chord('codes.clearSearch');

    expect(panel().querySelector('[data-region="search-results"]')).toBeNull();
    expect(screen.getByRole('searchbox', { name: /search the codebook/i })).toHaveFocus();
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
    expect(order).toEqual([
      'search-results',
      'recent',
      'codebook',
      'create',
      'note',
      'actions',
    ]);
  });

  it('keeps conditional regions absent rather than empty', () => {
    renderWorkspace();
    openPanel();

    // 4: no query, no results region.
    expect(panel().querySelector('[data-region="search-results"]')).toBeNull();
    // 7: no provisional codes exist yet, so no proposed region.
    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();
  });

  it('collapses recently used codes by default, per showRecentCodes', () => {
    renderWorkspace();
    openPanel();

    const details = region('recent').querySelector('details')!;
    expect(details.open).toBe(false);
  });

  it('omits the recent region when the flag is off', () => {
    renderWorkspace({ ...defaultFlags, showRecentCodes: false });
    openPanel();

    expect(panel().querySelector('[data-region="recent"]')).toBeNull();
  });

  it('lists a used code under recently used', () => {
    renderWorkspace();
    openPanel();
    fireEvent.click(checkboxFor(region('codebook'), 'Waiting list'));

    const details = region('recent').querySelector('details')!;
    act(() => {
      details.open = true;
    });
    expect(within(region('recent')).getByText('Waiting list')).toBeInTheDocument();
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

  it('shows the short definition beside every code name', () => {
    renderWorkspace();
    openPanel();

    const first = fixture.codes.find((code) => code.canonicalOrderIndex === 0)!;
    expect(within(region('codebook')).getByText(first.shortDefinition)).toBeInTheDocument();
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
  it('searches definitions and synonyms, not only names', () => {
    renderWorkspace();
    openPanel();

    search('spigot');
    const names = within(region('search-results'))
      .getAllByRole('checkbox')
      .map((box) => box.getAttribute('data-code-id'));
    expect(names.length).toBeGreaterThan(0);
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
