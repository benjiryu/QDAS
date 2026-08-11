import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { excerptText, resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';
import { resolveCapture } from './capture';

/**
 * The capture rule, read straight off the DOM.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 1.1 and 5,
 * decision D-036.
 *
 * These tests assert the stored range rather than what the user hears, so the
 * "Exact capture" criterion in section 7 is checked where it is decided.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

/** A turn with several sentences, so a drag can cross a sentence boundary. */
const multiSentenceTurn = resolved.turns.find((turn) => turn.segments.length >= 3)!;

let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearSourcePositions();
  document.getSelection()?.removeAllRanges();
});

function renderTranscript() {
  const view = render(
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
        flags={defaultFlags}
      />
    </AnnouncerProvider>,
  );
  return view.container.querySelector<HTMLElement>('[data-transcript]') ?? view.container;
}

function segmentElement(segmentId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)!;
}

/** What a mouse drag leaves behind: a non-collapsed DOM selection. */
function drag(from: [string, number], to: [string, number]) {
  const range = document.createRange();
  range.setStart(segmentElement(from[0]).firstChild!, from[1]);
  range.setEnd(segmentElement(to[0]).firstChild!, to[1]);

  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('step 1: an observable selection', () => {
  it('captures exactly what was dragged, mid-sentence at both ends', () => {
    const container = renderTranscript();
    const [first, , third] = multiSentenceTurn.segments;

    drag([first.segmentId, 6], [third.segmentId, 4]);
    const capture = resolveCapture(container, resolved)!;

    expect(capture.source).toBe('selection');
    expect(capture.range).toEqual({
      startSegmentId: first.segmentId,
      endSegmentId: third.segmentId,
      startOffset: 6,
      endOffset: 4,
    });
  });

  it('captures a range inside a single sentence', () => {
    const container = renderTranscript();
    const segment = multiSentenceTurn.segments[1];

    drag([segment.segmentId, 3], [segment.segmentId, 11]);
    const capture = resolveCapture(container, resolved)!;

    expect(capture.range.startSegmentId).toBe(segment.segmentId);
    expect(capture.range.endSegmentId).toBe(segment.segmentId);
    expect(capture.range.startOffset).toBe(3);
    expect(capture.range.endOffset).toBe(11);
  });

  it('does not snap outward to sentence boundaries', () => {
    // The v0.1 behaviour this replaces. D-036: boundary variation between
    // coders is data, and snapping destroyed it before it could be recorded.
    const container = renderTranscript();
    const [first, second] = multiSentenceTurn.segments;

    drag([first.segmentId, 5], [second.segmentId, 7]);
    const { range } = resolveCapture(container, resolved)!;

    expect(range.startOffset).not.toBe(0);
    expect(range.endOffset).not.toBe(second.text.length);
  });

  it('reports the speaker the range starts with', () => {
    const container = renderTranscript();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 0], [segment.segmentId, 5]);

    expect(resolveCapture(container, resolved)!.speakerLabel).toBe(
      multiSentenceTurn.speaker?.label ?? null,
    );
  });

  it('spans turns when the drag does', () => {
    const container = renderTranscript();
    const firstTurn = resolved.turns[0];
    const secondTurn = resolved.turns[1];
    const start = firstTurn.segments[firstTurn.segments.length - 1];
    const end = secondTurn.segments[0];

    drag([start.segmentId, 2], [end.segmentId, 3]);
    const { range } = resolveCapture(container, resolved)!;

    expect(range.startSegmentId).toBe(start.segmentId);
    expect(range.endSegmentId).toBe(end.segmentId);
  });

  it('ignores a collapsed selection and falls through to the turn', () => {
    const container = renderTranscript();
    const turnElement = document.querySelector<HTMLElement>(
      `[data-turn-id="${multiSentenceTurn.turn.turnId}"]`,
    )!;
    turnElement.focus();

    const range = document.createRange();
    range.setStart(segmentElement(multiSentenceTurn.segments[0].segmentId).firstChild!, 4);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(resolveCapture(container, resolved)!.source).toBe('turn');
  });
});

describe('step 2: the focused turn', () => {
  it('captures the whole turn when there is no selection', () => {
    const container = renderTranscript();
    const turnElement = document.querySelector<HTMLElement>(
      `[data-turn-id="${multiSentenceTurn.turn.turnId}"]`,
    )!;
    turnElement.focus();

    const capture = resolveCapture(container, resolved)!;
    const last = multiSentenceTurn.segments[multiSentenceTurn.segments.length - 1];

    expect(capture.source).toBe('turn');
    expect(capture.range).toEqual({
      startSegmentId: multiSentenceTurn.segments[0].segmentId,
      endSegmentId: last.segmentId,
      startOffset: 0,
      endOffset: last.text.length,
    });
    // The whole turn, first character to last.
    expect(excerptText(resolved, capture.range)).toContain(last.text);
  });

  it('resolves from any turn, since every turn is focusable per D-002', () => {
    const container = renderTranscript();

    for (const turn of resolved.turns.slice(0, 4)) {
      document.querySelector<HTMLElement>(`[data-turn-id="${turn.turn.turnId}"]`)!.focus();
      expect(resolveCapture(container, resolved)).not.toBeNull();
    }
  });
});

describe('step 3: nothing to capture', () => {
  it('returns nothing with focus outside the transcript and no selection', () => {
    const container = renderTranscript();
    document.querySelector<HTMLButtonElement>('[data-command="excerpt.code"]')!.focus();

    expect(resolveCapture(container, resolved)).toBeNull();
  });

  it('returns nothing when the selection is entirely outside the transcript', () => {
    const container = renderTranscript();
    const outside = document.querySelector<HTMLElement>('.excerpt-toolbar__status')!;

    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(resolveCapture(container, resolved)).toBeNull();
  });
});

describe('the current turn when nothing is focused', () => {
  it('falls back to the active segment’s turn, which the movement commands set', () => {
    // transcript-segment section 2: the movement commands change the active
    // segment without moving focus, and section 2 calls that value the anchor
    // for excerpt selection. Without this the primary keyboard route would
    // reach step 3 and be told there is nothing to capture.
    const container = renderTranscript();
    const segment = multiSentenceTurn.segments[1];

    const capture = resolveCapture(container, resolved, segment.segmentId)!;
    const last = multiSentenceTurn.segments[multiSentenceTurn.segments.length - 1];

    expect(capture.source).toBe('turn');
    expect(capture.range.startSegmentId).toBe(multiSentenceTurn.segments[0].segmentId);
    expect(capture.range.endSegmentId).toBe(last.segmentId);
  });

  it('prefers the focused turn over the active segment when both exist', () => {
    const container = renderTranscript();
    const elsewhere = resolved.turns.find(
      (turn) => turn.turn.turnId !== multiSentenceTurn.turn.turnId,
    )!;
    document.querySelector<HTMLElement>(`[data-turn-id="${elsewhere.turn.turnId}"]`)!.focus();

    const capture = resolveCapture(container, resolved, multiSentenceTurn.segments[0].segmentId)!;

    expect(capture.range.startSegmentId).toBe(elsewhere.segments[0].segmentId);
  });
});
