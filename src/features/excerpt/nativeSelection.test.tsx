import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * Specification: docs/patterns/excerpt-selection.md section 4.0, decision D-034.
 *
 * Native selection is an entry route into the application-owned range. The
 * tests that matter are that the snap never shrinks what was dragged, that the
 * command route is untouched, and that nothing depends on a selection existing.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});
let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  document.getSelection()?.removeAllRanges();
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

function segmentElement(container: HTMLElement, index: number): HTMLElement {
  const id = resolved.segments[index].segmentId;
  return container.querySelector<HTMLElement>(`[data-segment-id="${id}"]`)!;
}

/**
 * Drags from one character offset to another, exactly as a pointer would leave
 * the document, then fires the event the browser fires.
 */
function drag(
  container: HTMLElement,
  from: { index: number; offset: number },
  to: { index: number; offset: number },
) {
  const startNode = segmentElement(container, from.index).firstChild!;
  const endNode = segmentElement(container, to.index).firstChild!;

  act(() => {
    const range = document.createRange();
    range.setStart(startNode, from.offset);
    range.setEnd(endNode, to.offset);

    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    // jsdom does not emit selectionchange for programmatic selection; the
    // browser does, and the Playwright suite exercises the real event.
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/**
 * What a browser does when the user presses a control: the selection is cleared
 * on mousedown, and the `selectionchange` that follows is queued. Whether it
 * lands before or after the control's click handler is up to the engine, so the
 * application has to survive the order where it lands first.
 */
function collapseSelectionOnControlPress(control: HTMLElement) {
  act(() => {
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    const collapsed = document.createRange();
    collapsed.setStart(control, 0);
    collapsed.collapse(true);
    selection.addRange(collapsed);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/** A click inside the transcript, which is the user finishing with a selection. */
function collapseSelectionInsideTranscript(target: HTMLElement) {
  act(() => {
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    const collapsed = document.createRange();
    collapsed.setStart(target.firstChild ?? target, 0);
    collapsed.collapse(true);
    selection.addRange(collapsed);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

function rangeSegmentIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-excerpt]')).map(
    (element) => element.getAttribute('data-segment-id') ?? '',
  );
}

function state(): string {
  return document.querySelector('.excerpt-toolbar__state')?.getAttribute('data-state') ?? '';
}

const lastAnnouncement = () => announcer.getLast()?.message ?? '';

describe('adoption snaps outward and never shrinks', () => {
  it('adopts whole sentences from a drag across part of two', () => {
    const { container } = renderWorkspace();

    // From the middle of sentence 1 to the middle of sentence 2.
    drag(container, { index: 1, offset: 5 }, { index: 2, offset: 6 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(rangeSegmentIds(container)).toEqual([
      resolved.segments[1].segmentId,
      resolved.segments[2].segmentId,
    ]);
    expect(state()).toBe('anchored');
  });

  it('takes the whole sentence when the drag covers part of one', () => {
    const { container } = renderWorkspace();

    const text = resolved.segments[3].text;
    drag(container, { index: 3, offset: 2 }, { index: 3, offset: Math.min(6, text.length) });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(rangeSegmentIds(container)).toEqual([resolved.segments[3].segmentId]);
  });

  it('announces the adopted size and that boundaries were extended', () => {
    const { container } = renderWorkspace();

    drag(container, { index: 1, offset: 4 }, { index: 2, offset: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(lastAnnouncement()).toMatch(/from your selection/i);
    expect(lastAnnouncement()).toContain('2 sentences');
    expect(lastAnnouncement()).toMatch(/extended to whole sentences/i);
  });

  it('does not claim an extension when the drag already covered whole sentences', () => {
    const { container } = renderWorkspace();

    const first = segmentElement(container, 1).firstChild!;
    const second = segmentElement(container, 2).firstChild!;
    act(() => {
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(second, second.textContent!.length);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));
    expect(lastAnnouncement()).not.toMatch(/extended/i);
  });

  it('adopts across a turn boundary', () => {
    const { container } = renderWorkspace();

    // Turn 0 ends at segment 1 in the fixture's first source; drag into turn 1.
    const firstTurnEnd = resolved.turns[0].segments[resolved.turns[0].segments.length - 1];
    const secondTurnStart = resolved.turns[1].segments[0];
    const startIndex = resolved.segments.findIndex((s) => s.segmentId === firstTurnEnd.segmentId);
    const endIndex = resolved.segments.findIndex((s) => s.segmentId === secondTurnStart.segmentId);

    drag(container, { index: startIndex, offset: 3 }, { index: endIndex, offset: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(rangeSegmentIds(container)).toEqual([firstTurnEnd.segmentId, secondTurnStart.segmentId]);
    expect(lastAnnouncement()).toMatch(/across 2 turns/);
  });

  it('makes the adopted range the origin, so revert restores all of it', () => {
    const { container } = renderWorkspace();

    drag(container, { index: 1, offset: 2 }, { index: 3, offset: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));
    const adopted = rangeSegmentIds(container);
    expect(adopted).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Expand end' }));
    expect(state()).toBe('adjusting');

    fireEvent.click(screen.getByRole('button', { name: /Revert to start/ }));

    expect(state()).toBe('anchored');
    expect(rangeSegmentIds(container)).toEqual(adopted);
  });
});

describe('a drag survives the press that adopts it', () => {
  it('adopts the whole range even when the selection is cleared first', () => {
    // The engine-dependent ordering: pressing the control clears the selection,
    // and the notification arrives before the click handler runs.
    const { container } = renderWorkspace();
    drag(container, { index: 1, offset: 3 }, { index: 3, offset: 3 });

    const control = screen.getByRole('button', { name: 'Start excerpt' });
    collapseSelectionOnControlPress(control);
    fireEvent.click(control);

    expect(rangeSegmentIds(container)).toEqual([
      resolved.segments[1].segmentId,
      resolved.segments[2].segmentId,
      resolved.segments[3].segmentId,
    ]);
    expect(state()).toBe('anchored');
  });

  it('still reaches the panel in one action when the selection is cleared first', () => {
    const { container } = renderWorkspace();
    drag(container, { index: 1, offset: 3 }, { index: 3, offset: 3 });

    const control = screen.getByRole('button', { name: 'Code this excerpt' });
    collapseSelectionOnControlPress(control);
    fireEvent.click(control);

    expect(state()).toBe('confirmed');
    expect(rangeSegmentIds(container)).toHaveLength(3);
    expect(screen.getByRole('region', { name: /code selection/i })).toBeInTheDocument();
  });

  it('forgets the drag once the user clicks back inside the transcript', () => {
    const { container } = renderWorkspace();
    drag(container, { index: 1, offset: 3 }, { index: 3, offset: 3 });

    // A click in the transcript is the user finishing with that selection.
    const sentence = container.querySelector<HTMLElement>(
      `[data-segment-id="${resolved.segments[6].segmentId}"]`,
    )!;
    collapseSelectionInsideTranscript(sentence);
    fireEvent.click(sentence);

    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    // The command route, anchored where they clicked, not the abandoned drag.
    expect(rangeSegmentIds(container)).toEqual([resolved.segments[6].segmentId]);
  });
});

describe('the click a drag ends with', () => {
  it('does not move the reading position when a selection is standing', () => {
    // A browser dispatches this click on the common ancestor of the gesture,
    // which for a drag inside one turn is the prose span, not a sentence.
    const { container } = renderWorkspace();
    drag(container, { index: 3, offset: 2 }, { index: 5, offset: 2 });

    const prose = container.querySelector<HTMLElement>('.transcript-turn__prose')!;
    fireEvent.click(prose);

    expect(container.querySelector('[data-active="true"]')).toBeNull();
    expect(lastAnnouncement()).not.toContain(resolved.segments[0].text);
  });

  it('still activates the turn on a genuine click with nothing selected', () => {
    // transcript-segment.md section 2.1: activating a turn container makes the
    // turn's first sentence active. Unchanged.
    const { container } = renderWorkspace();
    const turn = resolved.turns[1];
    const prose = container
      .querySelector<HTMLElement>(`[data-turn-id="${turn.turn.turnId}"]`)!
      .querySelector<HTMLElement>('.transcript-turn__prose')!;

    fireEvent.click(prose);

    expect(container.querySelector('[data-active="true"]')?.getAttribute('data-segment-id')).toBe(
      turn.segments[0].segmentId,
    );
  });
});

describe('adoption clears the native selection', () => {
  it('leaves the application indicator as the only selection', () => {
    const { container } = renderWorkspace();

    drag(container, { index: 1, offset: 2 }, { index: 2, offset: 2 });
    expect(document.getSelection()?.isCollapsed).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    const selection = document.getSelection()!;
    expect(selection.rangeCount === 0 || selection.isCollapsed).toBe(true);
    expect(rangeSegmentIds(container).length).toBeGreaterThan(0);
  });
});

describe('code this excerpt, from a drag, in one action', () => {
  it('lands confirmed with the panel open and focus in the search field', () => {
    const { container } = renderWorkspace();

    drag(container, { index: 1, offset: 3 }, { index: 3, offset: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Code this excerpt' }));

    expect(state()).toBe('confirmed');
    expect(rangeSegmentIds(container)).toHaveLength(3);
    expect(screen.getByRole('region', { name: /code selection/i })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search the codebook/i })).toHaveFocus();
    expect(
      announcer.getHistory().some((entry) => /confirmed from your selection/i.test(entry.message)),
    ).toBe(true);
  });

  it('is enabled in idle only while a selection exists', () => {
    const { container } = renderWorkspace();

    const control = () => screen.getByRole('button', { name: 'Code this excerpt' });
    expect(control()).toHaveAttribute('aria-disabled', 'true');

    drag(container, { index: 1, offset: 3 }, { index: 2, offset: 3 });
    expect(control()).not.toHaveAttribute('aria-disabled');
  });

  it('keeps its disabled reason when there is no selection', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Code this excerpt' }));

    expect(state()).toBe('idle');
    expect(lastAnnouncement()).toMatch(/no excerpt in progress/i);
  });
});

describe('what adoption must not do', () => {
  it('ignores a collapsed selection', () => {
    const { container } = renderWorkspace();

    act(() => {
      const range = document.createRange();
      range.setStart(segmentElement(container, 2).firstChild!, 3);
      range.collapse(true);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(screen.getByRole('button', { name: 'Code this excerpt' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('ignores a selection outside the transcript', () => {
    renderWorkspace();

    act(() => {
      const heading = document.querySelector('.excerpt-toolbar__state')!;
      const range = document.createRange();
      range.selectNodeContents(heading);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(screen.getByRole('button', { name: 'Code this excerpt' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clamps a selection that starts outside the transcript to its sentences', () => {
    const { container } = renderWorkspace();

    act(() => {
      const range = document.createRange();
      range.setStart(document.querySelector('.excerpt-toolbar__state')!.firstChild!, 0);
      range.setEnd(segmentElement(container, 1).firstChild!, 4);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(rangeSegmentIds(container)).toEqual([
      resolved.segments[0].segmentId,
      resolved.segments[1].segmentId,
    ]);
  });

  it('does not begin a second excerpt from a selection made while one is live', () => {
    const { container } = renderWorkspace();

    drag(container, { index: 1, offset: 2 }, { index: 2, offset: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));
    const adopted = rangeSegmentIds(container);

    drag(container, { index: 6, offset: 2 }, { index: 7, offset: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(rangeSegmentIds(container)).toEqual(adopted);
    expect(lastAnnouncement()).toMatch(/already in progress/i);
  });
});

describe('with the flag off', () => {
  const commandOnly = { ...defaultFlags, adoptNativeSelection: false };

  it('attaches no selection listener at all', () => {
    const add = vi.spyOn(document, 'addEventListener');
    renderWorkspace(commandOnly);

    const listened = add.mock.calls.map(([type]) => type);
    expect(listened).not.toContain('selectionchange');
  });

  it('ignores a drag entirely', () => {
    const { container } = renderWorkspace(commandOnly);

    drag(container, { index: 1, offset: 2 }, { index: 3, offset: 2 });

    expect(screen.getByRole('button', { name: 'Code this excerpt' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));
    expect(state()).toBe('idle');
    expect(lastAnnouncement()).toMatch(/no position is set/i);
  });
});

describe('the command route is unchanged', () => {
  it('begins at the active segment when no selection exists', () => {
    const { container } = renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Next sentence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next sentence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    expect(rangeSegmentIds(container)).toEqual([resolved.segments[1].segmentId]);
    expect(lastAnnouncement()).toContain('Excerpt started at');
    expect(lastAnnouncement()).not.toMatch(/from your selection/i);
  });

  it('leaves both controls behaving exactly as before with no selection', () => {
    renderWorkspace();

    const start = screen.getByRole('button', { name: 'Start excerpt' });
    const code = screen.getByRole('button', { name: 'Code this excerpt' });

    // Neither is available with no position and no selection.
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(code).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Next sentence' }));
    expect(screen.getByRole('button', { name: 'Start excerpt' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.getByRole('button', { name: 'Code this excerpt' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('adjusts an adopted excerpt with the same commands as any other', () => {
    const { container } = renderWorkspace();

    drag(container, { index: 2, offset: 2 }, { index: 2, offset: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Start excerpt' }));

    fireEvent.click(screen.getByRole('button', { name: 'Expand start' }));
    expect(rangeSegmentIds(container)).toEqual([
      resolved.segments[1].segmentId,
      resolved.segments[2].segmentId,
    ]);
    expect(lastAnnouncement()).toContain('Added:');

    const toolbar = screen.getByRole('region', { name: 'Excerpt' });
    expect(within(toolbar).getByText(/adjusting boundaries/i)).toBeInTheDocument();
  });
});
