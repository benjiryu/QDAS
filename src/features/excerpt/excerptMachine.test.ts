import { describe, expect, it } from 'vitest';
import { canAdjust, excerptReducer, IDLE } from './excerptMachine';
import type { ExcerptSelection } from './excerptMachine';

/** Specification: docs/patterns/excerpt-selection.md sections 2 and 3. */

const range = { startSegmentId: 's4', endSegmentId: 's4' };
const wider = { startSegmentId: 's3', endSegmentId: 's5' };

const anchored: ExcerptSelection = {
  state: 'anchored',
  range,
  originSegmentId: 's4',
  originRange: range,
  reopenedExcerptId: null,
};
const adjusting: ExcerptSelection = {
  state: 'adjusting',
  range: wider,
  originSegmentId: 's4',
  originRange: range,
  reopenedExcerptId: null,
};
const confirmedSelection: ExcerptSelection = {
  state: 'confirmed',
  range: wider,
  originSegmentId: 's4',
  originRange: range,
  reopenedExcerptId: null,
};

describe('the transition table', () => {
  it('idle, begin, anchored', () => {
    const next = excerptReducer(IDLE, { type: 'begin', range, originSegmentId: 's4' });

    expect(next).toEqual({
      state: 'anchored',
      range,
      originSegmentId: 's4',
      originRange: range,
      reopenedExcerptId: null,
    });
  });

  it('anchored, boundary change, adjusting', () => {
    expect(excerptReducer(anchored, { type: 'boundaryChange', range: wider })).toEqual({
      state: 'adjusting',
      range: wider,
      originSegmentId: 's4',
      originRange: range,
      reopenedExcerptId: null,
    });
  });

  it('adjusting, boundary change, adjusting', () => {
    const next = excerptReducer(adjusting, { type: 'boundaryChange', range });
    expect(next.state).toBe('adjusting');
    expect(next.range).toEqual(range);
  });

  it('anchored or adjusting, confirm, confirmed', () => {
    expect(excerptReducer(anchored, { type: 'confirm' }).state).toBe('confirmed');
    expect(excerptReducer(adjusting, { type: 'confirm' }).state).toBe('confirmed');
  });

  it('adjusting, revert, anchored, with the range back at the origin', () => {
    const next = excerptReducer(adjusting, { type: 'revert' });

    expect(next.state).toBe('anchored');
    expect(next.range).toEqual(range);
    expect(next.originSegmentId).toBe('s4');
  });

  it('confirmed, boundary change, adjusting, which is the recovery path', () => {
    const next = excerptReducer(confirmedSelection, { type: 'boundaryChange', range });

    expect(next.state).toBe('adjusting');
    expect(next.range).toEqual(range);
    expect(next.originSegmentId).toBe('s4');
  });

  it('confirmed, discard, idle', () => {
    expect(excerptReducer(confirmedSelection, { type: 'discard' })).toEqual(IDLE);
  });

  it('anchored or adjusting, cancel, idle, with no record left behind', () => {
    expect(excerptReducer(anchored, { type: 'discard' })).toEqual(IDLE);
    expect(excerptReducer(adjusting, { type: 'discard' })).toEqual(IDLE);
  });
});

describe('transitions the specification does not define', () => {
  it('does not begin over a live excerpt', () => {
    expect(excerptReducer(anchored, { type: 'begin', range: wider, originSegmentId: 's9' })).toBe(
      anchored,
    );
    expect(
      excerptReducer(confirmedSelection, { type: 'begin', range: wider, originSegmentId: 's9' }),
    ).toBe(confirmedSelection);
  });

  it('does not adjust an excerpt that does not exist', () => {
    expect(excerptReducer(IDLE, { type: 'boundaryChange', range })).toBe(IDLE);
  });

  it('reverts only from adjusting, since anchored has nothing to revert', () => {
    expect(excerptReducer(anchored, { type: 'revert' })).toBe(anchored);
    expect(excerptReducer(confirmedSelection, { type: 'revert' })).toBe(confirmedSelection);
  });

  it('does not confirm from idle or re-confirm', () => {
    expect(excerptReducer(IDLE, { type: 'confirm' })).toBe(IDLE);
    expect(excerptReducer(confirmedSelection, { type: 'confirm' })).toBe(confirmedSelection);
  });

  it('does not discard when there is nothing in progress', () => {
    expect(excerptReducer(IDLE, { type: 'discard' })).toBe(IDLE);
  });

  it('has no cancelled state: cancelling is indistinguishable from never starting', () => {
    const cancelled = excerptReducer(adjusting, { type: 'discard' });
    expect(cancelled).toEqual(IDLE);
    expect(cancelled.range).toBeNull();
    expect(cancelled.originSegmentId).toBeNull();
  });
});

describe('adjustable states', () => {
  it('allows boundary work in anchored, adjusting, and confirmed only', () => {
    expect(canAdjust('anchored')).toBe(true);
    expect(canAdjust('adjusting')).toBe(true);
    expect(canAdjust('confirmed')).toBe(true);
    expect(canAdjust('idle')).toBe(false);
    expect(canAdjust('saved')).toBe(false);
  });

  it('keeps the origin through every adjustment, so revert always has a target', () => {
    let selection = excerptReducer(IDLE, { type: 'begin', range, originSegmentId: 's4' });
    selection = excerptReducer(selection, { type: 'boundaryChange', range: wider });
    selection = excerptReducer(selection, { type: 'confirm' });
    selection = excerptReducer(selection, { type: 'boundaryChange', range });

    expect(selection.originSegmentId).toBe('s4');
  });
});
