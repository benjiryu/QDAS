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

const at = (start: string, end: string, startOffset = 0, endOffset = 0): CapturedRange => ({
  startSegmentId: start,
  endSegmentId: end,
  startOffset,
  endOffset,
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
    });
  });

  it('counts sentences and turns across a boundary', () => {
    expect(excerptSize(resolved, at('s2', 's4'))).toEqual({
      sentenceCount: 3,
      turnCount: 3,
      spansTurns: true,
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
    endOffset: 0,
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
