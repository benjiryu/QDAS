import { describe, expect, it } from 'vitest';
import {
  describeExcerptSize,
  excerptSegments,
  excerptSize,
  excerptText,
  isValidRange,
  rangeOf,
  validateRange,
  wholeSegments,
  withRange,
} from './excerpt';
import type { CapturedRange } from './excerpt';
import { buildTestSource } from './testing/buildTestSource';
import type { Excerpt } from './types';

/**
 * Specification: docs/patterns/excerpt-selection.md sections 3 and 5 (v0.2).
 *
 * The boundary adjustment tests this file used to carry went with D-036, along
 * with the functions they covered. They are preserved at tag `v0.1`.
 */

// Ten sentences, four turns: t0 = s0..s2, t1 = s3, t2 = s4..s7, t3 = s8..s9.
const resolved = buildTestSource();

/**
 * A range, whole by default. `endOffset` defaults to the end sentence's length
 * rather than to zero: a range ending at character zero covers nothing, and a
 * helper whose default means "empty" makes every test using it a lie.
 */
const at = (start: string, end: string, startOffset = 0, endOffset?: number): CapturedRange => ({
  startSegmentId: start,
  endSegmentId: end,
  startOffset,
  endOffset: endOffset ?? (resolved.segments.find((s) => s.segmentId === end)?.text.length ?? 0),
});

describe('validity', () => {
  it('accepts a single-segment range', () => {
    expect(validateRange(resolved, at('s4', 's4'))).toEqual({ valid: true, problem: null });
  });

  it('rejects crossed boundaries', () => {
    expect(validateRange(resolved, at('s6', 's2'))).toEqual({
      valid: false,
      problem: 'boundariesCrossed',
    });
  });

  it('rejects boundaries that are not in the source', () => {
    expect(validateRange(resolved, at('nope', 's2')).problem).toBe('startNotInSource');
    expect(validateRange(resolved, at('s2', 'nope')).problem).toBe('endNotInSource');
  });

  it('returns no segments and no text for an invalid range', () => {
    expect(excerptSegments(resolved, at('s6', 's2'))).toEqual([]);
    expect(excerptText(resolved, at('s6', 's2'))).toBe('');
  });
});

describe('contents and size', () => {
  it('lists the segments a range covers', () => {
    expect(excerptSegments(resolved, at('s2', 's5')).map((s) => s.segmentId)).toEqual([
      's2',
      's3',
      's4',
      's5',
    ]);
  });

  it('counts sentences within one turn', () => {
    expect(excerptSize(resolved, at('s4', 's6'))).toEqual({
      sentenceCount: 3,
      turnCount: 1,
      spansTurns: false,
      startsMidSentence: false,
      endsMidSentence: false,
    });
  });

  it('counts sentences and turns across a boundary', () => {
    expect(excerptSize(resolved, at('s2', 's4'))).toEqual({
      sentenceCount: 3,
      turnCount: 3,
      spansTurns: true,
      startsMidSentence: false,
      endsMidSentence: false,
    });
  });

  it('describes a range in sentences, adding turns once it crosses one', () => {
    expect(describeExcerptSize(excerptSize(resolved, at('s4', 's7')))).toBe('4 sentences');
    expect(describeExcerptSize(excerptSize(resolved, at('s2', 's4')))).toBe(
      '3 sentences across 3 turns',
    );
    expect(describeExcerptSize(excerptSize(resolved, at('s5', 's5')))).toBe('1 sentence');
  });
});

describe('a range that begins or ends mid-sentence', () => {
  const text = (segmentId: string) =>
    resolved.segments.find((segment) => segment.segmentId === segmentId)!.text;

  it('notices each boundary independently', () => {
    expect(excerptSize(resolved, at('s4', 's6', 3))).toMatchObject({
      startsMidSentence: true,
      endsMidSentence: false,
    });
    expect(excerptSize(resolved, at('s4', 's6', 0, 4))).toMatchObject({
      startsMidSentence: false,
      endsMidSentence: true,
    });
    expect(excerptSize(resolved, at('s4', 's6', 3, 4))).toMatchObject({
      startsMidSentence: true,
      endsMidSentence: true,
    });
  });

  it('still counts the sentences it touches, and says the count is partial', () => {
    // "1 sentence" for six words out of forty would tell a coder they captured
    // something they did not. The count orients; "part of" makes it honest.
    expect(describeExcerptSize(excerptSize(resolved, at('s5', 's5', 4, 9)))).toBe(
      'part of 1 sentence',
    );
    expect(describeExcerptSize(excerptSize(resolved, at('s4', 's6', 3)))).toBe(
      'part of 3 sentences',
    );
    expect(describeExcerptSize(excerptSize(resolved, at('s2', 's4', 0, 5)))).toBe(
      'part of 3 sentences across 3 turns',
    );
  });

  it('calls a whole range whole, so the turn fallback is not qualified', () => {
    expect(describeExcerptSize(excerptSize(resolved, at('s4', 's6')))).toBe('3 sentences');
  });

  it('reads back only the characters captured', () => {
    // What "Read the full excerpt" speaks. Reading a boundary sentence whole
    // would put words into the excerpt the coder never selected.
    expect(excerptText(resolved, at('s5', 's5', 4, 9))).toBe(text('s5').slice(4, 9));
  });

  it('slices both boundary sentences and keeps the middle whole', () => {
    expect(excerptText(resolved, at('s4', 's6', 3, 4))).toBe(
      `${text('s4').slice(3)} ${text('s5')} ${text('s6').slice(0, 4)}`,
    );
  });

  it('reads a whole range unchanged', () => {
    expect(excerptText(resolved, at('s4', 's5'))).toBe(`${text('s4')} ${text('s5')}`);
  });

  it('drops a boundary sentence that the offsets leave empty', () => {
    // An end offset of zero covers no characters of the last sentence, so that
    // sentence contributes nothing rather than contributing itself whole.
    expect(excerptText(resolved, at('s4', 's5', 0, 0))).toBe(text('s4'));
  });
});

describe('whole segments, for the turn fallback', () => {
  it('spans from the first character to the last', () => {
    expect(wholeSegments(resolved, 's4', 's6')).toEqual({
      startSegmentId: 's4',
      endSegmentId: 's6',
      startOffset: 0,
      endOffset: 'Sentence 6.'.length,
    });
  });

  it('returns null for a segment that is not in the source', () => {
    expect(wholeSegments(resolved, 's4', 'nope')).toBeNull();
    expect(wholeSegments(resolved, 'nope', 's4')).toBeNull();
  });
});

describe('reading a range on and off an excerpt record', () => {
  const excerpt: Excerpt = {
    excerptId: 'ex-1',
    sourceId: resolved.source.sourceId,
    startSegmentId: 's5',
    endSegmentId: 's5',
    startOffset: 0,
    endOffset: 11,
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  it('writes exactly what was captured, mid-sentence offsets included', () => {
    // D-036 supersedes D-016: what was dragged is what is stored.
    const updated = withRange(excerpt, at('s3', 's6', 4, 7), '2026-08-02T00:00:00.000Z');

    expect(updated.startSegmentId).toBe('s3');
    expect(updated.endSegmentId).toBe('s6');
    expect(updated.startOffset).toBe(4);
    expect(updated.endOffset).toBe(7);
    expect(updated.updatedAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('does not mutate the excerpt it was given', () => {
    withRange(excerpt, at('s3', 's6', 1, 2), '2026-08-02T00:00:00.000Z');
    expect(excerpt.startSegmentId).toBe('s5');
  });

  it('round-trips a captured range through a record', () => {
    const captured = at('s3', 's6', 4, 7);
    const updated = withRange(excerpt, captured, excerpt.updatedAt);

    expect(rangeOf(updated)).toEqual(captured);
    expect(isValidRange(resolved, rangeOf(updated))).toBe(true);
  });
});
