import { describe, expect, it } from 'vitest';
import {
  contextAfter,
  contextBefore,
  contractEnd,
  contractEndByTurn,
  contractStart,
  contractStartByTurn,
  createExcerptAt,
  describeExcerptSize,
  excerptAvailability,
  excerptDelta,
  excerptSegments,
  excerptSize,
  excerptText,
  expandEnd,
  expandEndByTurn,
  expandStart,
  expandStartByTurn,
  isValidRange,
  rangeOf,
  truncateWords,
  validateRange,
  withRange,
} from './excerpt';
import type { ExcerptRange } from './excerpt';
import { buildTestSource } from './testing/buildTestSource';
import type { Excerpt } from './types';

/** Specification: docs/patterns/excerpt-selection.md sections 4, 5, 5.1, 10. */

// Ten sentences, four turns: t0 = s0..s2, t1 = s3, t2 = s4..s7, t3 = s8..s9.
const resolved = buildTestSource();

const at = (start: string, end: string): ExcerptRange => ({
  startSegmentId: start,
  endSegmentId: end,
});

const ids = (range: ExcerptRange | null) =>
  range === null ? null : [range.startSegmentId, range.endSegmentId];

describe('creation', () => {
  it('anchors at the active sentence', () => {
    expect(ids(createExcerptAt(resolved, 's5'))).toEqual(['s5', 's5']);
  });

  it('anchors on the whole turn when the flag says so', () => {
    expect(ids(createExcerptAt(resolved, 's5', 'activeSpeakerTurn'))).toEqual(['s4', 's7']);
  });

  it('anchors on a single-sentence turn without widening it', () => {
    expect(ids(createExcerptAt(resolved, 's3', 'activeSpeakerTurn'))).toEqual(['s3', 's3']);
  });

  it('returns null for a segment that is not in the source', () => {
    expect(createExcerptAt(resolved, 'nope')).toBeNull();
  });
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

describe('expansion and contraction by sentence', () => {
  it('expands the start backward', () => {
    expect(ids(expandStart(resolved, at('s5', 's5')))).toEqual(['s4', 's5']);
  });

  it('covers three sentences ending at the anchor after two backward expansions', () => {
    // Acceptance criterion "Backward expansion", section 11.
    const anchored = createExcerptAt(resolved, 's5') as ExcerptRange;
    const once = expandStart(resolved, anchored) as ExcerptRange;
    const twice = expandStart(resolved, once) as ExcerptRange;

    expect(ids(twice)).toEqual(['s3', 's5']);
    expect(excerptSize(resolved, twice).sentenceCount).toBe(3);
    expect(twice.endSegmentId).toBe(anchored.endSegmentId);
  });

  it('expands the end forward', () => {
    expect(ids(expandEnd(resolved, at('s5', 's5')))).toEqual(['s5', 's6']);
  });

  it('contracts the start forward', () => {
    expect(ids(contractStart(resolved, at('s4', 's7')))).toEqual(['s5', 's7']);
  });

  it('contracts the end backward', () => {
    expect(ids(contractEnd(resolved, at('s4', 's7')))).toEqual(['s4', 's6']);
  });

  it('will not expand the start past the first sentence of the source', () => {
    expect(expandStart(resolved, at('s0', 's2'))).toBeNull();
  });

  it('will not expand the end past the last sentence of the source', () => {
    expect(expandEnd(resolved, at('s7', 's9'))).toBeNull();
  });

  it('will not contract either boundary of a single-sentence excerpt', () => {
    // Acceptance criterion "Boundaries cannot cross", section 11.
    expect(contractStart(resolved, at('s5', 's5'))).toBeNull();
    expect(contractEnd(resolved, at('s5', 's5'))).toBeNull();
  });

  it('contracts to a single sentence and no further', () => {
    const twoSentences = at('s4', 's5');
    const contracted = contractStart(resolved, twoSentences) as ExcerptRange;

    expect(ids(contracted)).toEqual(['s5', 's5']);
    expect(contractStart(resolved, contracted)).toBeNull();
  });

  it('adjusts a range that spans the whole source at one end only', () => {
    const whole = at('s0', 's9');
    expect(expandStart(resolved, whole)).toBeNull();
    expect(expandEnd(resolved, whole)).toBeNull();
    expect(ids(contractStart(resolved, whole))).toEqual(['s1', 's9']);
    expect(ids(contractEnd(resolved, whole))).toEqual(['s0', 's8']);
  });
});

describe('expansion by turn', () => {
  it('expands the start to the first sentence of the previous turn', () => {
    // From s4, the first sentence of turn 2, back to turn 1.
    expect(ids(expandStartByTurn(resolved, at('s4', 's5')))).toEqual(['s3', 's5']);
  });

  it('expands the start to the previous turn from midway through its own turn', () => {
    // s6 sits inside turn 2. The destination is turn 1, and the sentences of
    // turn 2 before s6 come in with it, because the range is contiguous.
    const expanded = expandStartByTurn(resolved, at('s6', 's7')) as ExcerptRange;

    expect(ids(expanded)).toEqual(['s3', 's7']);
    expect(excerptSegments(resolved, expanded).map((s) => s.segmentId)).toEqual([
      's3',
      's4',
      's5',
      's6',
      's7',
    ]);
  });

  it('expands the end to the last sentence of the next turn', () => {
    expect(ids(expandEndByTurn(resolved, at('s5', 's6')))).toEqual(['s5', 's9']);
  });

  it('will not expand the start when it is already in the first turn', () => {
    expect(expandStartByTurn(resolved, at('s1', 's5'))).toBeNull();
    expect(expandStartByTurn(resolved, at('s0', 's0'))).toBeNull();
  });

  it('will not expand the end when it is already in the last turn', () => {
    expect(expandEndByTurn(resolved, at('s5', 's8'))).toBeNull();
  });

  it('crosses several turns with repeated expansion', () => {
    let range = at('s9', 's9');
    range = expandStartByTurn(resolved, range) as ExcerptRange;
    expect(ids(range)).toEqual(['s4', 's9']);
    range = expandStartByTurn(resolved, range) as ExcerptRange;
    expect(ids(range)).toEqual(['s3', 's9']);
    range = expandStartByTurn(resolved, range) as ExcerptRange;
    expect(ids(range)).toEqual(['s0', 's9']);
    expect(expandStartByTurn(resolved, range)).toBeNull();
  });
});

describe('contraction by turn, which no specification defines', () => {
  // These functions exist because the task asked for contraction by turn.
  // excerpt-selection.md section 4 has no such command and keybindings.ts has
  // no chord for one. Not to be wired to a control until the team defines it.

  it('moves the start to the first sentence of the next turn', () => {
    expect(ids(contractStartByTurn(resolved, at('s1', 's9')))).toEqual(['s3', 's9']);
  });

  it('moves the end to the last sentence of the previous turn', () => {
    expect(ids(contractEndByTurn(resolved, at('s0', 's9')))).toEqual(['s0', 's7']);
  });

  it('will not contract the start past the end', () => {
    // The next turn begins after the end of the range.
    expect(contractStartByTurn(resolved, at('s1', 's2'))).toBeNull();
  });

  it('will not contract the end past the start', () => {
    expect(contractEndByTurn(resolved, at('s5', 's6'))).toBeNull();
  });

  it('will not contract by turn out of the last or first turn', () => {
    expect(contractStartByTurn(resolved, at('s8', 's9'))).toBeNull();
    expect(contractEndByTurn(resolved, at('s0', 's2'))).toBeNull();
  });
});

describe('availability and reasons', () => {
  it('explains why each unavailable command is unavailable', () => {
    const wholeSource = excerptAvailability(resolved, at('s0', 's9'));
    expect(wholeSource['excerpt.start.expand']).toEqual({
      available: false,
      reason: 'atSourceStart',
    });
    expect(wholeSource['excerpt.end.expand']).toEqual({
      available: false,
      reason: 'atSourceEnd',
    });
    expect(wholeSource['excerpt.start.expandTurn']).toEqual({
      available: false,
      reason: 'inFirstTurn',
    });
    expect(wholeSource['excerpt.end.expandTurn']).toEqual({
      available: false,
      reason: 'inLastTurn',
    });

    const single = excerptAvailability(resolved, at('s5', 's5'));
    expect(single['excerpt.start.contract']).toEqual({
      available: false,
      reason: 'wouldCrossEnd',
    });
    expect(single['excerpt.end.contract']).toEqual({
      available: false,
      reason: 'wouldCrossStart',
    });
  });

  it('marks context unavailable at the ends of the source', () => {
    expect(excerptAvailability(resolved, at('s0', 's4'))['excerpt.contextBefore'].available).toBe(
      false,
    );
    expect(excerptAvailability(resolved, at('s4', 's9'))['excerpt.contextAfter'].available).toBe(
      false,
    );
  });

  it('marks everything unavailable on an invalid range', () => {
    const availability = excerptAvailability(resolved, at('s6', 's2'));
    for (const entry of Object.values(availability)) {
      expect(entry).toEqual({ available: false, reason: 'invalidRange' });
    }
  });

  it('agrees with what the adjustment functions actually do', () => {
    const range = at('s3', 's3');
    const availability = excerptAvailability(resolved, range);

    expect(availability['excerpt.start.expand'].available).toBe(
      expandStart(resolved, range) !== null,
    );
    expect(availability['excerpt.start.contract'].available).toBe(
      contractStart(resolved, range) !== null,
    );
    expect(availability['excerpt.end.expand'].available).toBe(
      expandEnd(resolved, range) !== null,
    );
    expect(availability['excerpt.end.contract'].available).toBe(
      contractEnd(resolved, range) !== null,
    );
    expect(availability['excerpt.start.expandTurn'].available).toBe(
      expandStartByTurn(resolved, range) !== null,
    );
    expect(availability['excerpt.end.expandTurn'].available).toBe(
      expandEndByTurn(resolved, range) !== null,
    );
  });
});

describe('context retrieval', () => {
  it('returns the sentences before and after without changing the range', () => {
    const range = at('s4', 's5');

    expect(contextBefore(resolved, range).map((s) => s.segmentId)).toEqual(['s3']);
    expect(contextAfter(resolved, range).map((s) => s.segmentId)).toEqual(['s6']);
    expect(ids(range)).toEqual(['s4', 's5']);
  });

  it('returns several sentences of context in order', () => {
    expect(contextBefore(resolved, at('s4', 's5'), 3).map((s) => s.segmentId)).toEqual([
      's1',
      's2',
      's3',
    ]);
  });

  it('returns nothing at the ends of the source', () => {
    expect(contextBefore(resolved, at('s0', 's2'))).toEqual([]);
    expect(contextAfter(resolved, at('s8', 's9'))).toEqual([]);
  });
});

describe('size', () => {
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

  it('describes a range inside one turn in sentences alone', () => {
    expect(describeExcerptSize(excerptSize(resolved, at('s4', 's7')))).toBe('4 sentences');
  });

  it('describes a range crossing turns in sentences and turns, per 5.1', () => {
    expect(describeExcerptSize(excerptSize(resolved, at('s2', 's4')))).toBe(
      '3 sentences across 3 turns',
    );
  });

  it('uses the singular for one sentence', () => {
    expect(describeExcerptSize(excerptSize(resolved, at('s5', 's5')))).toBe('1 sentence');
  });
});

describe('delta', () => {
  it('reports what entered on expansion', () => {
    const before = at('s5', 's5');
    const after = expandStart(resolved, before) as ExcerptRange;
    const delta = excerptDelta(resolved, before, after);

    expect(delta.direction).toBe('expanded');
    expect(delta.added.map((s) => s.segmentId)).toEqual(['s4']);
    expect(delta.addedText).toBe('Sentence 4.');
    expect(delta.removed).toEqual([]);
    expect(delta.startMoved).toBe(true);
    expect(delta.endMoved).toBe(false);
  });

  it('reports what left on contraction', () => {
    const before = at('s4', 's7');
    const after = contractEnd(resolved, before) as ExcerptRange;
    const delta = excerptDelta(resolved, before, after);

    expect(delta.direction).toBe('contracted');
    expect(delta.removed.map((s) => s.segmentId)).toEqual(['s7']);
    expect(delta.removedText).toBe('Sentence 7.');
    expect(delta.added).toEqual([]);
  });

  it('reports several sentences entering when a turn is taken in', () => {
    const before = at('s8', 's9');
    const after = expandStartByTurn(resolved, before) as ExcerptRange;
    const delta = excerptDelta(resolved, before, after);

    expect(delta.added.map((s) => s.segmentId)).toEqual(['s4', 's5', 's6', 's7']);
    expect(delta.addedText).toBe('Sentence 4. Sentence 5. Sentence 6. Sentence 7.');
  });

  it('reports both lists when a range moves wholesale', () => {
    const delta = excerptDelta(resolved, at('s0', 's2'), at('s4', 's6'));

    expect(delta.direction).toBe('moved');
    expect(delta.added.map((s) => s.segmentId)).toEqual(['s4', 's5', 's6']);
    expect(delta.removed.map((s) => s.segmentId)).toEqual(['s0', 's1', 's2']);
  });

  it('reports nothing changed when the range is the same', () => {
    const delta = excerptDelta(resolved, at('s4', 's6'), at('s4', 's6'));

    expect(delta).toMatchObject({ direction: 'unchanged', startMoved: false, endMoved: false });
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
  });
});

describe('truncation for announcement', () => {
  it('leaves a short delta alone', () => {
    expect(truncateWords('Four words go here', 25)).toEqual({
      text: 'Four words go here',
      truncated: false,
    });
  });

  it('cuts a long delta to the word count and says that it did', () => {
    expect(truncateWords('one two three four five', 3)).toEqual({
      text: 'one two three',
      truncated: true,
    });
  });

  it('handles an empty delta', () => {
    expect(truncateWords('', 25)).toEqual({ text: '', truncated: false });
  });
});

describe('writing a range back to an excerpt record', () => {
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

  it('reads a range off an excerpt', () => {
    expect(rangeOf(excerpt)).toEqual({ startSegmentId: 's5', endSegmentId: 's5' });
  });

  it('writes whole-segment offsets, never partial ones', () => {
    const updated = withRange(excerpt, at('s3', 's6'), resolved, '2026-08-02T00:00:00.000Z');

    expect(updated.startSegmentId).toBe('s3');
    expect(updated.endSegmentId).toBe('s6');
    expect(updated.startOffset).toBe(0);
    expect(updated.endOffset).toBe('Sentence 6.'.length);
    expect(updated.updatedAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('does not mutate the excerpt it was given', () => {
    withRange(excerpt, at('s3', 's6'), resolved, '2026-08-02T00:00:00.000Z');
    expect(excerpt.startSegmentId).toBe('s5');
  });

  it('round-trips a range through an excerpt record', () => {
    const updated = withRange(excerpt, at('s3', 's6'), resolved, excerpt.updatedAt);
    expect(isValidRange(resolved, rangeOf(updated))).toBe(true);
    expect(rangeOf(updated)).toEqual(at('s3', 's6'));
  });
});
