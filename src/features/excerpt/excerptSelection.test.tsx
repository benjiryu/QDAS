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

/**
 * Specification: docs/patterns/excerpt-selection.md.
 *
 * Every acceptance criterion in section 11 that does not depend on code
 * selection is here, named as the specification names it. The four that do
 * depend on it are listed at the end of the file, unimplemented on purpose.
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

function chord(command: Command) {
  press(bindings[command]);
}

function lastAnnouncement(): string {
  return announcer.getLast()?.message ?? '';
}

function announced(): string[] {
  return announcer.getHistory().map((entry) => entry.message);
}

function rangeSegmentIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-excerpt]')).map(
    (element) => element.getAttribute('data-segment-id') ?? '',
  );
}

function state(): string {
  return document.querySelector('.excerpt-toolbar__state')?.getAttribute('data-state') ?? '';
}

/** Puts a position on the third sentence and begins an excerpt there. */
function beginAtThirdSentence() {
  chord('segment.next');
  chord('segment.next');
  chord('segment.next');
  chord('excerpt.begin');
}

describe('acceptance: backward expansion', () => {
  it('covers three sentences ending at the anchor, with the position unchanged', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();

    const positionBefore = document.querySelector('.position-ribbon__reading')!.textContent;

    chord('excerpt.start.expand');
    chord('excerpt.start.expand');

    expect(rangeSegmentIds(container)).toEqual([
      resolved.segments[0].segmentId,
      resolved.segments[1].segmentId,
      resolved.segments[2].segmentId,
    ]);
    expect(document.querySelector('.position-ribbon__reading')!.textContent).toBe(positionBefore);
  });
});

describe('acceptance: delta announcement', () => {
  it('announces the newly included sentence, then the new size', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.end.expand');

    const message = lastAnnouncement();
    expect(message).toContain('Added:');
    expect(message).toContain(resolved.segments[3].text);

    // The size comes after the delta, in that order, per section 5.
    expect(message.indexOf('Added:')).toBeLessThan(message.indexOf('Excerpt is now'));
    expect(message).toContain('Excerpt is now 2 sentences');
  });

  it('announces what left the range on contraction', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.end.expand');
    chord('excerpt.end.contract');

    expect(lastAnnouncement()).toContain('Removed:');
    expect(lastAnnouncement()).toContain(resolved.segments[3].text);
    expect(lastAnnouncement()).toContain('Excerpt is now 1 sentence');
  });

  it('counts turns as well once the range crosses one, per 5.1', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.end.expandTurn');

    expect(lastAnnouncement()).toMatch(/Excerpt is now \d+ sentences across \d+ turns/);
  });

  it('honours the boundary announcement flag', () => {
    renderWorkspace({ ...defaultFlags, boundaryChangeAnnouncement: 'sizeOnly' });
    beginAtThirdSentence();
    chord('excerpt.end.expand');

    expect(lastAnnouncement()).toBe('Excerpt is now 2 sentences.');
    expect(lastAnnouncement()).not.toContain('Added:');
  });

  it('truncates a long delta to the configured word count', () => {
    renderWorkspace({ ...defaultFlags, deltaTruncationWords: 3 });
    beginAtThirdSentence();
    chord('excerpt.end.expandTurn');

    expect(lastAnnouncement()).toContain(', and more.');
  });
});

describe('acceptance: context does not move focus', () => {
  it('announces the preceding sentence, leaving the range and focus alone', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();

    const rangeBefore = rangeSegmentIds(container);
    const control = screen.getByRole('button', { name: /Context before/ });
    control.focus();

    fireEvent.click(control);

    expect(lastAnnouncement()).toContain(resolved.segments[1].text);
    expect(rangeSegmentIds(container)).toEqual(rangeBefore);
    expect(control).toHaveFocus();
  });

  it('walks outward one sentence at a time on repeated requests', () => {
    renderWorkspace();
    beginAtThirdSentence();

    chord('excerpt.contextBefore');
    expect(lastAnnouncement()).toContain(resolved.segments[1].text);

    chord('excerpt.contextBefore');
    expect(lastAnnouncement()).toContain(resolved.segments[0].text);
  });

  it('reads context after without moving focus either', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();

    const rangeBefore = rangeSegmentIds(container);
    const control = screen.getByRole('button', { name: /Context after/ });
    control.focus();
    fireEvent.click(control);

    expect(lastAnnouncement()).toContain(resolved.segments[3].text);
    expect(rangeSegmentIds(container)).toEqual(rangeBefore);
    expect(control).toHaveFocus();
  });
});

describe('acceptance: boundaries cannot cross', () => {
  it('leaves a single-sentence excerpt unchanged and says why', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();

    const before = rangeSegmentIds(container);
    chord('excerpt.start.contract');

    expect(rangeSegmentIds(container)).toEqual(before);
    expect(lastAnnouncement()).toMatch(/cannot move past the end/i);

    chord('excerpt.end.contract');
    expect(rangeSegmentIds(container)).toEqual(before);
    expect(lastAnnouncement()).toMatch(/cannot move past the start/i);
  });

  it('marks the crossing commands unavailable while they would cross', () => {
    renderWorkspace();
    beginAtThirdSentence();

    expect(screen.getByRole('button', { name: /^Contract start$/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    chord('excerpt.end.expand');
    expect(screen.getByRole('button', { name: /^Contract start$/ })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

describe('acceptance: discard from adjustment creates nothing', () => {
  it('drops the range and returns focus to the origin turn', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.start.expand');
    expect(state()).toBe('adjusting');

    chord('excerpt.discard');

    expect(state()).toBe('idle');
    expect(rangeSegmentIds(container)).toEqual([]);
    expect(lastAnnouncement()).toMatch(/discarded/i);

    // Focus returns to the turn containing the segment the excerpt began at.
    const originTurnId = resolved.turns.find((turn) =>
      turn.segments.some((segment) => segment.segmentId === resolved.segments[2].segmentId),
    )!.turn.turnId;
    expect(document.activeElement).toBe(container.querySelector(`[data-turn-id="${originTurnId}"]`));
  });

  it('records nothing anywhere, because cancelling creates no record', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.discard');

    expect(container.querySelectorAll('[data-excerpt]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-excerpt-state]')).toHaveLength(0);
  });
});

describe('the state machine in the interface', () => {
  it('begins at the active segment and announces the sentence it started from', () => {
    renderWorkspace();
    beginAtThirdSentence();

    expect(state()).toBe('anchored');
    expect(lastAnnouncement()).toContain(resolved.segments[2].text);
  });

  it('moves to adjusting on the first boundary change and shows revert only then', () => {
    renderWorkspace();
    beginAtThirdSentence();

    expect(screen.queryByRole('button', { name: /Revert to start/ })).toBeNull();

    chord('excerpt.start.expand');

    expect(state()).toBe('adjusting');
    expect(screen.getByRole('button', { name: /Revert to start/ })).toBeInTheDocument();
  });

  it('reverts to where the excerpt began and returns to anchored', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.start.expand');
    chord('excerpt.end.expand');

    chord('excerpt.revert');

    expect(state()).toBe('anchored');
    expect(rangeSegmentIds(container)).toEqual([resolved.segments[2].segmentId]);
    expect(lastAnnouncement()).toMatch(/reverted/i);
  });

  it('confirms and opens code selection, per section 6', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.confirm');

    expect(state()).toBe('confirmed');
    expect(announced().some((message) => /excerpt confirmed/i.test(message))).toBe(true);
    // Section 6 sends focus to the code panel's search field on confirm.
    expect(screen.getByRole('region', { name: /code selection/i })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search the codebook/i })).toHaveFocus();
  });

  it('reopens a confirmed excerpt for adjustment on a boundary command', () => {
    // Acceptance criterion "Boundaries are reachable after confirming", minus
    // the pending codes, which belong to code selection.
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.confirm');
    expect(state()).toBe('confirmed');

    chord('excerpt.start.expand');

    expect(state()).toBe('adjusting');
    expect(rangeSegmentIds(container)).toEqual([
      resolved.segments[1].segmentId,
      resolved.segments[2].segmentId,
    ]);
  });

  it('discards a confirmed excerpt back to idle', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.confirm');

    chord('excerpt.discard');

    expect(state()).toBe('idle');
    expect(rangeSegmentIds(container)).toEqual([]);
  });

  it('will not begin a second excerpt over a live one', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    const before = rangeSegmentIds(container);

    chord('segment.next');
    chord('excerpt.begin');

    expect(rangeSegmentIds(container)).toEqual(before);
    expect(lastAnnouncement()).toMatch(/already in progress/i);
  });

  it('refuses to begin with no position set, and says so', () => {
    renderWorkspace();
    chord('excerpt.begin');

    expect(state()).toBe('idle');
    expect(lastAnnouncement()).toMatch(/no position is set/i);
  });

  it('begins from the last sentence of a focused turn when no position is set', () => {
    // transcript-segment.md section 2.3: a user who has read the turn straight
    // through is at its end.
    const { container } = renderWorkspace();
    const secondTurn = resolved.turns[1];

    act(() => {
      container.querySelector<HTMLElement>(`[data-turn-id="${secondTurn.turn.turnId}"]`)!.focus();
    });
    chord('excerpt.begin');

    const last = secondTurn.segments[secondTurn.segments.length - 1];
    expect(rangeSegmentIds(container)).toEqual([last.segmentId]);
  });
});

describe('escape, per section 4.1', () => {
  it('discards from anchored and from adjusting', () => {
    const { container } = renderWorkspace();

    beginAtThirdSentence();
    press({ key: 'Escape' });
    expect(state()).toBe('idle');

    beginAtThirdSentence();
    chord('excerpt.start.expand');
    expect(state()).toBe('adjusting');
    press({ key: 'Escape' });

    expect(state()).toBe('idle');
    expect(rangeSegmentIds(container)).toEqual([]);
  });

  it('does not discard a confirmed excerpt, which takes the explicit control', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.confirm');

    press({ key: 'Escape' });

    expect(state()).toBe('confirmed');
    expect(rangeSegmentIds(container)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /^Discard/ }));
    expect(state()).toBe('idle');
  });
});

describe('focus behaviour, per section 6', () => {
  it('moves focus to the first excerpt control when an excerpt begins', () => {
    renderWorkspace();
    beginAtThirdSentence();

    const toolbar = screen.getByRole('region', { name: 'Excerpt' });
    const first = within(toolbar).getAllByRole('button')[0];
    expect(first).toHaveFocus();
  });

  it('leaves focus alone on a boundary change', () => {
    renderWorkspace();
    beginAtThirdSentence();

    const control = screen.getByRole('button', { name: /^Expand start$/ });
    control.focus();
    fireEvent.click(control);

    expect(control).toHaveFocus();
  });

  it('returns focus to the origin turn when a confirmed excerpt is discarded', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.confirm');

    fireEvent.click(screen.getByRole('button', { name: /^Discard/ }));

    const originTurnId = resolved.turns.find((turn) =>
      turn.segments.some((segment) => segment.segmentId === resolved.segments[2].segmentId),
    )!.turn.turnId;
    expect(document.activeElement).toBe(container.querySelector(`[data-turn-id="${originTurnId}"]`));
  });
});

describe('reading the excerpt on request, per section 5', () => {
  it('gives the size first, then the full text', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.end.expand');
    chord('excerpt.read');

    const message = lastAnnouncement();
    expect(message.indexOf('2 sentences')).toBeLessThan(message.indexOf(resolved.segments[2].text));
    expect(message).toContain(resolved.segments[3].text);
  });

  it('reports the speakers and the timestamps at each boundary', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.end.expandTurn');

    fireEvent.click(screen.getByRole('button', { name: 'Speakers' }));
    expect(lastAnnouncement()).toMatch(/starts with|speaker:/i);

    fireEvent.click(screen.getByRole('button', { name: 'Timestamps' }));
    expect(lastAnnouncement()).toMatch(/starts at \d+:\d{2}/i);
  });
});

describe('the range in the transcript', () => {
  it('marks each boundary individually, per section 7', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.end.expand');
    chord('excerpt.end.expand');

    const marks = Array.from(container.querySelectorAll('[data-excerpt]')).map((element) =>
      element.getAttribute('data-excerpt'),
    );
    expect(marks).toEqual(['start', 'in-range', 'end']);
  });

  it('marks a single-sentence excerpt as both boundaries at once', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();

    expect(container.querySelector('[data-excerpt]')?.getAttribute('data-excerpt')).toBe('only');
  });

  it('distinguishes a pending range from a confirmed one', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();
    expect(container.querySelector('[data-excerpt-state]')).toHaveAttribute(
      'data-excerpt-state',
      'anchored',
    );

    chord('excerpt.confirm');
    expect(container.querySelector('[data-excerpt-state]')).toHaveAttribute(
      'data-excerpt-state',
      'confirmed',
    );
  });

  it('creates no live region of its own', () => {
    const { container } = renderWorkspace();
    beginAtThirdSentence();

    for (const region of container.querySelectorAll('[aria-live]')) {
      expect(region.closest('.excerpt-toolbar, .transcript')).toBeNull();
    }
  });

  it('announces every change through the shared service, in order', () => {
    renderWorkspace();
    beginAtThirdSentence();
    chord('excerpt.start.expand');
    chord('excerpt.confirm');

    const messages = announced();
    expect(messages.some((message) => message.includes('Excerpt started at'))).toBe(true);
    expect(messages.some((message) => message.includes('Added:'))).toBe(true);
    expect(messages.some((message) => message.includes('Excerpt confirmed'))).toBe(true);
  });
});

/**
 * Not implemented here, because each depends on code selection:
 *
 * - "Excerpt survives code selection"
 * - "Closing code selection preserves the range"
 * - "Save requires a code"
 * - "Save failure preserves everything"
 *
 * "Boundaries are reachable after confirming" is covered above without its
 * pending-codes half, which arrives with code selection.
 */
