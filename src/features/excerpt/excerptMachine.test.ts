import { describe, expect, it } from 'vitest';
import { excerptReducer, IDLE } from './excerptMachine';
import type { CapturedRange } from '../../domain';

/**
 * Specification: docs/patterns/excerpt-selection.md section 3 (v0.2).
 *
 * Three states and four transitions. The anchored and adjusting cases this file
 * used to cover went with D-036; they are preserved at tag `v0.1`.
 */

const range: CapturedRange = {
  startSegmentId: 's4',
  endSegmentId: 's6',
  startOffset: 12,
  endOffset: 5,
};

const other: CapturedRange = {
  startSegmentId: 's1',
  endSegmentId: 's1',
  startOffset: 0,
  endOffset: 9,
};

describe('capture', () => {
  it('goes straight from idle to confirmed, keeping the exact offsets', () => {
    const next = excerptReducer(IDLE, { type: 'capture', range, source: 'selection' });

    expect(next.state).toBe('confirmed');
    expect(next.range).toEqual(range);
    expect(next.reopenedExcerptId).toBeNull();
  });

  it('records which rule produced the range', () => {
    expect(excerptReducer(IDLE, { type: 'capture', range, source: 'selection' }).source).toBe(
      'selection',
    );
    expect(excerptReducer(IDLE, { type: 'capture', range, source: 'turn' }).source).toBe('turn');
  });

  it('captures again from saved, replacing the range', () => {
    const saved = excerptReducer(
      excerptReducer(IDLE, { type: 'capture', range, source: 'selection' }),
      { type: 'save' },
    );

    const next = excerptReducer(saved, { type: 'capture', range: other, source: 'turn' });
    expect(next.state).toBe('confirmed');
    expect(next.range).toEqual(other);
  });

  it('does not replace a range that is already captured', () => {
    // Fixing a wrong range means cancelling and reselecting, per section 3.
    const confirmed = excerptReducer(IDLE, { type: 'capture', range, source: 'selection' });

    expect(excerptReducer(confirmed, { type: 'capture', range: other, source: 'turn' })).toBe(
      confirmed,
    );
  });
});

describe('reopening a saved excerpt', () => {
  it('confirms with the saved range and remembers which excerpt it is', () => {
    const next = excerptReducer(IDLE, { type: 'reopen', range, excerptId: 'ex-1' });

    expect(next.state).toBe('confirmed');
    expect(next.range).toEqual(range);
    expect(next.reopenedExcerptId).toBe('ex-1');
    // No capture rule ran, so there is nothing to report about one.
    expect(next.source).toBeNull();
  });

  it('does not interrupt a capture already in progress', () => {
    const confirmed = excerptReducer(IDLE, { type: 'capture', range, source: 'selection' });

    expect(excerptReducer(confirmed, { type: 'reopen', range: other, excerptId: 'ex-1' })).toBe(
      confirmed,
    );
  });
});

describe('save and discard', () => {
  const confirmed = excerptReducer(IDLE, { type: 'capture', range, source: 'selection' });

  it('saves only from confirmed, and clears the range', () => {
    const saved = excerptReducer(confirmed, { type: 'save' });

    expect(saved.state).toBe('saved');
    expect(saved.range).toBeNull();
    expect(excerptReducer(IDLE, { type: 'save' })).toBe(IDLE);
  });

  it('discards a capture back to idle, creating nothing', () => {
    expect(excerptReducer(confirmed, { type: 'discard' })).toEqual(IDLE);
  });

  it('forgets the reopened excerpt on discard', () => {
    const reopened = excerptReducer(IDLE, { type: 'reopen', range, excerptId: 'ex-1' });

    expect(excerptReducer(reopened, { type: 'discard' }).reopenedExcerptId).toBeNull();
  });

  it('does nothing when there is nothing to discard', () => {
    expect(excerptReducer(IDLE, { type: 'discard' })).toBe(IDLE);
  });
});
