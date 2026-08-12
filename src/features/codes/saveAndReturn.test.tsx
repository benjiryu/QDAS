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
import { requireTurnOf, resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * Specification: docs/patterns/code-selection.md sections 8, 9, 12, and
 * docs/patterns/excerpt-selection.md section 9.
 *
 * The remaining acceptance criteria from section 14 are here under their own
 * names, including "Save failure preserves everything".
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

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

/** Selects two whole sentences the way a drag does, then captures them. */
function drag(from: [string, number], to: [string, number]) {
  const element = (segmentId: string) =>
    document.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)!;
  const range = document.createRange();
  range.setStart(element(from[0]).firstChild!, from[1]);
  range.setEnd(element(to[0]).firstChild!, to[1]);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusTurn(index: number) {
  act(() => {
    document.querySelectorAll<HTMLElement>('[data-turn-id]')[index].focus();
  });
}

/** Captures a two-sentence excerpt, which opens the panel. */
function openPanel() {
  drag(
    [resolved.segments[1].segmentId, 0],
    [resolved.segments[2].segmentId, resolved.segments[2].text.length],
  );
  chord('excerpt.code');
}

const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const region = (name: string) => panel().querySelector<HTMLElement>(`[data-region="${name}"]`)!;
const lastAnnouncement = () => announcer.getLast()?.message ?? '';
const announced = () => announcer.getHistory().map((entry) => entry.message);

function saved(container: HTMLElement) {
  const element = container.querySelector('[data-saved-excerpts]')!;
  return {
    excerpts: Number(element.getAttribute('data-saved-excerpts')),
    assignments: Number(element.getAttribute('data-saved-assignments')),
    notes: Number(element.getAttribute('data-saved-notes')),
  };
}

/**
 * Checks a code by identifier.
 *
 * By id rather than by accessible name: a name query computes the accessible
 * name of every checkbox in a fifty-code panel, which is slow enough to time
 * out under a loaded test run, and it cannot tell the fixture's deliberately
 * similar names apart.
 */
function checkCode(name: string) {
  const code = fixture.codes.find((candidate) => candidate.name === name)!;
  fireEvent.click(region('codebook').querySelector(`[data-code-id="${code.codeId}"]`)!);
}

/** Expands the note disclosure if it is collapsed, and returns the field. */
function noteField(): HTMLTextAreaElement {
  const note = region('note');
  const row = within(note).getByRole('button', { name: /add note|edit note/i });
  if (row.getAttribute('aria-expanded') !== 'true') fireEvent.click(row);
  return within(note).getByLabelText(/note about this excerpt/i) as HTMLTextAreaElement;
}

function writeNote(text: string) {
  fireEvent.change(noteField(), { target: { value: text } });
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

const excerptState = () =>
  document.querySelector('.excerpt-toolbar__state')?.getAttribute('data-state') ?? '';

describe('acceptance: multiple codes in one pass', () => {
  it('holds three codes with the panel still open', () => {
    renderWorkspace();
    openPanel();

    checkCode('Waiting list');
    checkCode('Water access rules');
    checkCode('Mutual aid');

    expect(checkedCodeIds()).toHaveLength(3);
    expect(panel()).toBeInTheDocument();
    expect(lastAnnouncement()).toContain('3 pending');
  });
});

describe('acceptance: closing keeps the work, per D-042', () => {
  it('commits the codes and the note, and closes, with nothing to confirm', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');
    writeNote('A thought worth keeping.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));

    // This is Save & Close under another name: the records exist.
    expect(saved(container)).toMatchObject({ excerpts: 1, assignments: 2, notes: 1 });
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
    // And nothing asked, because nothing was at risk.
    expect(document.querySelector('[data-confirm="cancel"]')).toBeNull();
  });

  it('creates nothing when no code is checked', () => {
    // Save is unavailable on an empty assignment, so there is nothing to
    // commit and the capture goes. This is the way out of a panel opened by
    // mistake, which is why it does not refuse to close.
    const { container } = renderWorkspace();
    openPanel();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));

    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    expect(excerptState()).toBe('idle');
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
  });

  it('does the same on Escape, since it is the same command', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    press({ key: 'Escape' });

    expect(saved(container)).toMatchObject({ excerpts: 1, assignments: 1 });
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
  });

  it('never raises a discard confirmation in any state', () => {
    // The control D-042 removed. Asserted by absence across both states,
    // because a stray branch that still rendered it would otherwise only show
    // up in a session.
    renderWorkspace();
    openPanel();
    expect(document.querySelector('[data-confirm="cancel"]')).toBeNull();

    checkCode('Waiting list');
    writeNote('Something to lose.');
    expect(document.querySelector('[data-confirm="cancel"]')).toBeNull();
  });
});

describe('acceptance: return location is announced', () => {
  it('states how many codes were applied and where focus returned', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    const message = announced().find((text) => /codes applied/i.test(text))!;
    expect(message).toContain('2 codes applied');
    // Turn rather than sentence: D-038 retired sentence-level position.
    expect(message).toMatch(/returned to speaker turn \d+ of \d+/i);
  });

  it('lands focus on the turn holding the return target', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    // Default postCodingReturn is the excerpt's start segment.
    const start = resolved.segments[1];
    const turn = resolved.turns.find((candidate) =>
      candidate.segments.some((segment) => segment.segmentId === start.segmentId),
    )!;
    // Focus is the return, and since D-038 focus is also the position: there
    // is no second value that could disagree with it.
    expect(document.activeElement).toBe(
      container.querySelector(`[data-turn-id="${turn.turn.turnId}"]`),
    );
  });

  it('honours a different return destination', () => {
    const { container } = renderWorkspace({
      ...defaultFlags,
      postCodingReturn: 'excerptEndSegment',
    });
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    const end = requireTurnOf(resolved, resolved.segments[2].segmentId);
    expect(document.activeElement).toBe(
      container.querySelector(`[data-turn-id="${end.turn.turnId}"]`),
    );
  });
});

describe('acceptance: not colour-only', () => {
  it('identifies a code and its checked state without colour', () => {
    renderWorkspace();
    openPanel();

    const box = within(region('codebook')).getByRole('checkbox', {
      name: /Waiting list/,
    }) as HTMLInputElement;

    // The name is text and the state is a native checkbox, which carries shape.
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);

    // The name is beside the box, so the row identifies itself without colour.
    expect(within(region('codebook')).getByText('Waiting list')).toBeInTheDocument();
    // The only colour channel is hidden from assistive technology.
    expect(region('codebook').querySelector('.code-panel__swatch')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('what save writes, per section 8', () => {
  it('writes one assignment per pending code and one excerpt', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(saved(container)).toEqual({ excerpts: 1, assignments: 2, notes: 0 });
  });

  it('writes the note when one was drafted, and none when it was not', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    writeNote('Worth returning to in review.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(saved(container).notes).toBe(1);
  });

  it('marks the saved sentences coded in the transcript', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    for (const segment of [resolved.segments[1], resolved.segments[2]]) {
      const rendered = container.querySelector(`[data-segment-id="${segment.segmentId}"]`);
      expect(rendered?.getAttribute('data-display-state')).toMatch(/^coded/);
    }
  });

  it('leaves the selection ready for the next excerpt', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(excerptState()).toBe('saved');
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();

    // And a second excerpt can be captured straight from `saved`.
    focusTurn(2);
    chord('excerpt.code');
    expect(excerptState()).toBe('confirmed');
  });
});

describe('acceptance: save failure preserves everything', () => {
  const armed = { ...defaultFlags, simulateSaveFailure: true };

  it('keeps both codes, the note, and the excerpt, and offers a retry', () => {
    const { container } = renderWorkspace(armed);
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');
    writeNote('A note I would hate to retype.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    // Nothing written.
    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    // Everything still here.
    expect(checkedCodeIds()).toHaveLength(2);
    expect(noteField()).toHaveValue(
      'A note I would hate to retype.',
    );
    expect(excerptState()).toBe('confirmed');
    expect(panel()).toBeInTheDocument();
    // And a retry.
    expect(within(panel()).getByRole('button', { name: /retry save/i })).toBeInTheDocument();
  });

  it('announces what failed and that nothing was lost, assertively', () => {
    renderWorkspace(armed);
    openPanel();
    checkCode('Waiting list');
    writeNote('Kept.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    const failure = announcer.getHistory().find((entry) => /could not be written/i.test(entry.message))!;
    // Contract 2.3 reserves the assertive region for exactly this.
    expect(failure.politeness).toBe('assertive');
    expect(failure.reason).toBe('saveFailure');
    expect(failure.message).toMatch(/nothing was lost/i);
    expect(failure.message).toMatch(/1 pending code and your note/i);
    expect(failure.message).toMatch(/retry is available/i);
  });

  it('succeeds on retry, writing everything that was held', () => {
    const { container } = renderWorkspace(armed);
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');
    writeNote('Survived the failure.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
    fireEvent.click(within(panel()).getByRole('button', { name: /retry save/i }));

    expect(saved(container)).toEqual({ excerpts: 1, assignments: 2, notes: 1 });
    expect(excerptState()).toBe('saved');
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
  });

  it('fails one save, not every save', () => {
    // The point is rehearsing recovery. A failure that never clears would make
    // the retry untestable and the workflow unfinishable.
    const { container } = renderWorkspace(armed);
    openPanel();
    checkCode('Waiting list');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
    fireEvent.click(within(panel()).getByRole('button', { name: /retry save/i }));
    expect(saved(container).excerpts).toBe(1);

    // A second excerpt saves first time.
    focusTurn(2);
    chord('excerpt.code');
    checkCode('Mutual aid');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(saved(container).excerpts).toBe(2);
    expect(screen.queryByRole('button', { name: /retry save/i })).toBeNull();
  });

  it('does not fail at all without the flag', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(saved(container).excerpts).toBe(1);
    expect(screen.queryByRole('button', { name: /retry save/i })).toBeNull();
  });
});

describe('save availability, per section 8', () => {
  it('is unavailable with an empty pending assignment, saying why on attempt', () => {
    // The reason is spoken, not shown: no help text sits under the button. The
    // control still explains itself rather than being a dead end, which is what
    // contract 2.6 asks for.
    renderWorkspace();
    openPanel();

    const save = within(panel()).getByRole('button', { name: 'Save & Close' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toHaveAttribute('aria-describedby');
    // The wording widened when a note became enough to save: nothing is
    // pending, rather than no codes. The behaviour with an empty panel and no
    // note is unchanged.
    expect(panel().textContent).not.toMatch(/nothing is pending/i);

    fireEvent.click(save);

    expect(lastAnnouncement()).toMatch(/nothing is pending/i);
  });

  it('does nothing but explain itself when pressed while empty', () => {
    const { container } = renderWorkspace();
    openPanel();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    expect(lastAnnouncement()).toMatch(/nothing is pending/i);
    expect(panel()).toBeInTheDocument();
  });

  it('becomes available once a code is pending', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    expect(within(panel()).getByRole('button', { name: 'Save & Close' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

describe('the uncertainty checkbox, per D-021 and D-040', () => {
  const uncertainBox = () =>
    within(region('actions')).getByRole('checkbox', {
      name: /^Flag$/,
    }) as HTMLInputElement;

  it('sits in the footer beside Save & Close', () => {
    // A checkbox rather than a button, because uncertainty is state that
    // modifies the save and not an action of its own. D-040.
    renderWorkspace();
    openPanel();

    const footer = region('actions');
    expect(within(footer).getByRole('checkbox', { name: /^Flag$/ })).toBeInTheDocument();
    expect(within(footer).getByRole('button', { name: 'Save & Close' })).toBeInTheDocument();
  });

  it('announces its change like any other pending change', () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(uncertainBox());

    expect(lastAnnouncement()).toMatch(/marked uncertain/i);
  });

  it('has a visible label and a programmatic state', () => {
    renderWorkspace();
    openPanel();

    const control = uncertainBox();
    expect(control.checked).toBe(false);
    fireEvent.click(control);
    expect(control.checked).toBe(true);
  });

  it('writes the flag on every assignment the save produces', () => {
    // D-040 un-defers collection: the data D-023 needs for slice 3 review
    // ordering is gathered in v0.2 after all.
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');
    fireEvent.click(uncertainBox());

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(saved(container).assignments).toBe(2);
    expect(announced().join(' ')).toMatch(/marked uncertain/i);
  });
});

describe('the pending assignment region, per sections 8 and 9', () => {
  it('announces every change with the new count', () => {
    renderWorkspace();
    openPanel();

    checkCode('Waiting list');
    expect(lastAnnouncement()).toMatch(/waiting list added\. 1 pending/i);

    checkCode('Mutual aid');
    expect(lastAnnouncement()).toMatch(/2 pending/);
  });


  it('survives searching and browsing, per section 12', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    writeNote('Kept through everything.');

    fireEvent.change(screen.getByRole('searchbox', { name: /find codes/i }), {
      target: { value: 'water' },
    });
    fireEvent.change(screen.getByRole('searchbox', { name: /find codes/i }), {
      target: { value: '' },
    });

    expect(checkedCodeIds()).toHaveLength(1);
    expect(noteField()).toHaveValue(
      'Kept through everything.',
    );
  });
});


describe('the four ways out of the dialog', () => {
  const overlay = () => document.querySelector<HTMLElement>('.code-panel__overlay')!;
  const isOpen = () => screen.queryByRole('dialog', { name: /code assignment/i }) !== null;

  /**
   * A pointer press landing on the backdrop rather than on the card.
   *
   * The whole sequence, because dismiss-on-outside watches for a press and its
   * release rather than for a synthetic click: a drag that starts inside the
   * dialog and ends outside it is not a dismissal.
   */
  function clickOutside() {
    act(() => {
      const target = overlay();
      fireEvent.pointerDown(target, { button: 0, isPrimary: true, pointerType: 'mouse' });
      fireEvent.pointerUp(target, { button: 0, isPrimary: true, pointerType: 'mouse' });
      fireEvent.click(target);
    });
  }

  /** Two codes and a note: everything an exit used to be able to destroy. */
  function draftWork() {
    checkCode('Waiting list');
    checkCode('Mutual aid');
    writeNote('A thought I would hate to lose.');
  }

  const exits: [string, () => void][] = [
    ['the close control', () => fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }))],
    ['Escape', () => press({ key: 'Escape' })],
    ['a click outside', () => clickOutside()],
  ];

  it('saves and closes on Save & Close', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    expect(isOpen()).toBe(false);
    expect(saved(container)).toMatchObject({ excerpts: 1, assignments: 1 });
  });

  it.each(exits)('commits the work and closes on %s', (_name, exit) => {
    // The rule D-042 settled: all four exits agree, so there is one thing to
    // learn about leaving the panel. Clicking outside is the one that most
    // easily happens by accident, and it now keeps the work rather than
    // destroying it.
    const { container } = renderWorkspace();
    openPanel();
    draftWork();

    exit();

    expect(isOpen()).toBe(false);
    expect(saved(container)).toMatchObject({ excerpts: 1, assignments: 2, notes: 1 });
  });

  it.each(exits)('closes on %s with nothing checked, creating nothing', (_name, exit) => {
    const { container } = renderWorkspace();
    openPanel();

    exit();

    expect(isOpen()).toBe(false);
    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
  });

  it.each(exits)('leaves the panel open and loses nothing when the save fails on %s', (_name, exit) => {
    // The one case where an exit does not close. Contract 2.4: no user work is
    // discarded as a side effect of an error, and that has to hold on the
    // routes that are not the Save button just as much as on the one that is.
    const { container } = renderWorkspace({ ...defaultFlags, simulateSaveFailure: true });
    openPanel();
    draftWork();

    exit();

    expect(isOpen()).toBe(true);
    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    expect(checkedCodeIds()).toHaveLength(2);
    expect(noteField()).toHaveValue('A thought I would hate to lose.');
    expect(within(panel()).getByRole('button', { name: /retry save/i })).toBeInTheDocument();
  });

  it('does not dismiss on a click inside the dialog', () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(within(panel()).getByRole('heading', { level: 2 }));

    expect(isOpen()).toBe(true);
  });
});
