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

const panel = () => screen.getByRole('region', { name: /code selection/i });
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

function writeNote(text: string) {
  fireEvent.change(within(region('note')).getByLabelText(/note about this excerpt/i), {
    target: { value: text },
  });
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

    const pending = within(region('pending')).getAllByRole('listitem');
    expect(pending).toHaveLength(3);
    expect(panel()).toBeInTheDocument();
    expect(lastAnnouncement()).toContain('3 pending');
  });
});

describe('acceptance: cancel creates nothing', () => {
  it('writes no assignment and no note, leaving the excerpt confirmed', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');
    writeNote('A thought I will not keep.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));

    // Asks first, because this destroys pending codes and a draft note.
    const confirm = panel().querySelector('[data-confirm="cancel"]')!;
    expect(confirm).toBeInTheDocument();
    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });

    fireEvent.click(within(confirm as HTMLElement).getByRole('button', { name: /discard them/i }));

    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    // Section 3: cancel discards the capture and creates nothing. v0.1 left the
    // excerpt confirmed, because rebuilding a range was expensive; native
    // selection makes reselecting cheap, so D-036 dropped the holding state.
    expect(excerptState()).toBe('idle');
    expect(screen.queryByRole('region', { name: /code selection/i })).toBeNull();
  });

  it('keeps everything when the confirmation is declined', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    writeNote('Still writing this.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));

    expect(within(region('pending')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(region('note')).getByLabelText(/note about this excerpt/i)).toHaveValue(
      'Still writing this.',
    );
    expect(panel()).toBeInTheDocument();
  });

  it('announces the confirmation assertively, per contract 2.3', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));

    const entry = announcer.getHistory().find((item) => /discard/i.test(item.message))!;
    expect(entry.politeness).toBe('assertive');
    expect(entry.reason).toBe('destructiveConfirmation');
  });

  it('closes without asking when there is nothing to lose', () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('region', { name: /code selection/i })).toBeNull();
    expect(excerptState()).toBe('idle');
  });

  it('asks first on Escape too, since it is the same command', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    press({ key: 'Escape' });

    expect(panel().querySelector('[data-confirm="cancel"]')).toBeInTheDocument();
    expect(panel()).toBeInTheDocument();
  });
});

describe('acceptance: return location is announced', () => {
  it('states how many codes were applied and where focus returned', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    const message = announced().find((text) => /codes applied/i.test(text))!;
    expect(message).toContain('2 codes applied');
    // Turn rather than sentence: D-038 retired sentence-level position.
    expect(message).toMatch(/returned to speaker turn \d+ of \d+/i);
  });

  it('lands focus on the turn holding the return target', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

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

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

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

    // Pending membership is stated in words as well.
    expect(within(region('pending')).getByText('Waiting list')).toBeInTheDocument();
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

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(saved(container)).toEqual({ excerpts: 1, assignments: 2, notes: 0 });
  });

  it('writes the note when one was drafted, and none when it was not', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    writeNote('Worth returning to in review.');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(saved(container).notes).toBe(1);
  });

  it('marks the saved sentences coded in the transcript', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    for (const segment of [resolved.segments[1], resolved.segments[2]]) {
      const rendered = container.querySelector(`[data-segment-id="${segment.segmentId}"]`);
      expect(rendered?.getAttribute('data-display-state')).toMatch(/^coded/);
    }
  });

  it('leaves the selection ready for the next excerpt', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(excerptState()).toBe('saved');
    expect(screen.queryByRole('region', { name: /code selection/i })).toBeNull();

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

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    // Nothing written.
    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    // Everything still here.
    expect(within(region('pending')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(region('note')).getByLabelText(/note about this excerpt/i)).toHaveValue(
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

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

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

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(panel()).getByRole('button', { name: /retry save/i }));

    expect(saved(container)).toEqual({ excerpts: 1, assignments: 2, notes: 1 });
    expect(excerptState()).toBe('saved');
    expect(screen.queryByRole('region', { name: /code selection/i })).toBeNull();
  });

  it('fails one save, not every save', () => {
    // The point is rehearsing recovery. A failure that never clears would make
    // the retry untestable and the workflow unfinishable.
    const { container } = renderWorkspace(armed);
    openPanel();
    checkCode('Waiting list');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(panel()).getByRole('button', { name: /retry save/i }));
    expect(saved(container).excerpts).toBe(1);

    // A second excerpt saves first time.
    focusTurn(2);
    chord('excerpt.code');
    checkCode('Mutual aid');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(saved(container).excerpts).toBe(2);
    expect(screen.queryByRole('button', { name: /retry save/i })).toBeNull();
  });

  it('does not fail at all without the flag', () => {
    const { container } = renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(saved(container).excerpts).toBe(1);
    expect(screen.queryByRole('button', { name: /retry save/i })).toBeNull();
  });
});

describe('save availability, per section 8', () => {
  it('is unavailable with an empty pending assignment, and says why', () => {
    renderWorkspace();
    openPanel();

    const save = within(panel()).getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');

    const reasonId = save.getAttribute('aria-describedby')!;
    expect(document.getElementById(reasonId)?.textContent).toMatch(/no codes are pending/i);
  });

  it('does nothing but explain itself when pressed while empty', () => {
    const { container } = renderWorkspace();
    openPanel();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(saved(container)).toEqual({ excerpts: 0, assignments: 0, notes: 0 });
    expect(lastAnnouncement()).toMatch(/no codes are pending/i);
    expect(panel()).toBeInTheDocument();
  });

  it('becomes available once a code is pending', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    expect(within(panel()).getByRole('button', { name: 'Save' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

describe('the uncertainty control, per D-021', () => {
  it('announces its change like any other pending change', () => {
    renderWorkspace();
    openPanel();

    fireEvent.click(
      within(region('uncertainty')).getByRole('checkbox', { name: /mark this assignment uncertain/i }),
    );

    expect(lastAnnouncement()).toMatch(/marked uncertain/i);
  });

  it('has a visible label and a programmatic state', () => {
    renderWorkspace();
    openPanel();

    const control = within(region('uncertainty')).getByRole('checkbox', {
      name: /mark this assignment uncertain/i,
    }) as HTMLInputElement;
    expect(control.checked).toBe(false);
    fireEvent.click(control);
    expect(control.checked).toBe(true);
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

  it('moves focus to the next pending code when one is removed', async () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    checkCode('Mutual aid');

    const rows = within(region('pending')).getAllByRole('button', { name: /^Remove / });
    fireEvent.click(rows[0]);

    await act(async () => {
      await Promise.resolve();
    });

    const remaining = within(region('pending')).getAllByRole('button', { name: /^Remove / });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveFocus();
  });

  it('moves focus to the region heading when the last one is removed', async () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');

    fireEvent.click(within(region('pending')).getByRole('button', { name: /^Remove / }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(within(region('pending')).getByRole('heading', { level: 3 })).toHaveFocus();
  });

  it('survives searching and browsing, per section 12', () => {
    renderWorkspace();
    openPanel();
    checkCode('Waiting list');
    writeNote('Kept through everything.');

    fireEvent.change(screen.getByRole('searchbox', { name: /search the codebook/i }), {
      target: { value: 'water' },
    });
    fireEvent.change(screen.getByRole('searchbox', { name: /search the codebook/i }), {
      target: { value: '' },
    });

    expect(within(region('pending')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(region('note')).getByLabelText(/note about this excerpt/i)).toHaveValue(
      'Kept through everything.',
    );
  });
});

