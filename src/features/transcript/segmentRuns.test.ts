import { describe, expect, it } from 'vitest';
import { segmentRuns } from './segmentRuns';
import type { CodedSpan } from '../../domain';

/**
 * Specification: docs/patterns/transcript-segment.md section 3 and
 * docs/patterns/excerpt-selection.md section 6, decision D-036.
 */

// Offsets below index into this: 0123456789...
const TEXT = 'The gate was open all summer.';

const span = (start: number, end: number, state: CodedSpan['state'] = 'coded'): CodedSpan => ({
  start,
  end,
  state,
  excerptIds: ['ex-1'],
  codeIds: ['cd-a'],
});

const shape = (runs: ReturnType<typeof segmentRuns>) =>
  runs.map((run) => [run.text, run.coded, run.captured]);

describe('a sentence with nothing on it', () => {
  it('is one plain run, so the caller can render a bare text node', () => {
    expect(segmentRuns(TEXT, [], null)).toEqual([
      { text: TEXT, coded: null, codeIds: [], captured: false },
    ]);
  });

  it('is no runs at all when the sentence is empty', () => {
    expect(segmentRuns('', [], null)).toEqual([]);
  });
});

describe('coded stretches', () => {
  it('cuts the sentence where the coding starts and stops', () => {
    expect(shape(segmentRuns(TEXT, [span(4, 8)], null))).toEqual([
      ['The ', null, false],
      ['gate', 'coded', false],
      [' was open all summer.', null, false],
    ]);
  });

  it('keeps a whole-sentence span as a single run', () => {
    expect(shape(segmentRuns(TEXT, [span(0, TEXT.length)], null))).toEqual([
      [TEXT, 'coded', false],
    ]);
  });

  it('carries each span’s own state', () => {
    expect(shape(segmentRuns(TEXT, [span(0, 4), span(4, 8, 'coded-multiple')], null))).toEqual([
      ['The ', 'coded', false],
      ['gate', 'coded-multiple', false],
      [' was open all summer.', null, false],
    ]);
  });
});

describe('the range being captured', () => {
  it('cuts the sentence at the capture boundaries', () => {
    expect(shape(segmentRuns(TEXT, [], { start: 9, end: 13 }))).toEqual([
      ['The gate ', null, false],
      ['was ', null, true],
      ['open all summer.', null, false],
    ]);
  });

  it('is ignored when it covers nothing', () => {
    expect(segmentRuns(TEXT, [], { start: 5, end: 5 })).toEqual([
      { text: TEXT, coded: null, codeIds: [], captured: false },
    ]);
  });

  it('clamps to the sentence rather than running past it', () => {
    expect(shape(segmentRuns(TEXT, [], { start: -5, end: 999 }))).toEqual([[TEXT, null, true]]);
  });
});

describe('coding and capture at once', () => {
  it('splits at both sets of boundaries, so no run is partly either', () => {
    // Coded 4..8, captured 6..13: three distinct stretches plus the plain ends.
    expect(shape(segmentRuns(TEXT, [span(4, 8)], { start: 6, end: 13 }))).toEqual([
      ['The ', null, false],
      ['ga', 'coded', false],
      ['te', 'coded', true],
      [' was ', null, true],
      ['open all summer.', null, false],
    ]);
  });

  it('reports a run that is both, since it has to be drawn as both', () => {
    const runs = segmentRuns(TEXT, [span(0, TEXT.length)], { start: 4, end: 8 });
    const both = runs.find((run) => run.captured)!;

    expect(both.coded).toBe('coded');
    expect(both.text).toBe('gate');
  });
});

describe('fragmentation', () => {
  it('merges adjacent stretches that look the same', () => {
    // Two spans meeting at 8 with the same state produce one run, not two.
    expect(shape(segmentRuns(TEXT, [span(4, 8), span(8, 12)], null))).toEqual([
      ['The ', null, false],
      ['gate was', 'coded', false],
      [' open all summer.', null, false],
    ]);
  });

  it('keeps stretches apart when their codes differ, so families cannot bleed', () => {
    // The reason `codeIds` is part of "look the same". Two excerpts meeting at
    // one point, coded from different families: merged, the run would wear one
    // family's colour over characters belonging to the other's.
    const left = { ...span(4, 8), codeIds: ['cd-a'] };
    const right = { ...span(8, 12), codeIds: ['cd-b'] };

    const runs = segmentRuns(TEXT, [left, right], null);
    const coded = runs.filter((run) => run.coded);

    expect(coded).toHaveLength(2);
    expect(coded.map((run) => run.text)).toEqual(['gate', ' was']);
    expect(coded.map((run) => [...run.codeIds])).toEqual([['cd-a'], ['cd-b']]);
  });

  it('still merges stretches carrying the same codes in a different order', () => {
    // By value and order-independent: what the render takes from this is the
    // set's family, which the order cannot change.
    const left = { ...span(4, 8), codeIds: ['cd-a', 'cd-b'] };
    const right = { ...span(8, 12), codeIds: ['cd-b', 'cd-a'] };

    const coded = segmentRuns(TEXT, [left, right], null).filter((run) => run.coded);

    expect(coded).toHaveLength(1);
    expect(coded[0].text).toBe('gate was');
  });

  it('puts every character back exactly once, whatever the inputs', () => {
    const runs = segmentRuns(TEXT, [span(4, 8), span(20, 25)], { start: 6, end: 22 });

    expect(runs.map((run) => run.text).join('')).toBe(TEXT);
  });
});
