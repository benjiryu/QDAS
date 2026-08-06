import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../data/seed';
import {
  movementAvailability,
  nextSegment,
  nextTurn,
  positionReport,
  previousSegment,
  previousTurn,
} from './navigation';
import { resolveSource } from './source';
import { buildTestSource } from './testing/buildTestSource';

/** Specification: docs/patterns/transcript-segment.md sections 4.1 and 5. */

const resolved = buildTestSource(); // turns of 3, 1, 4, 2 sentences; s0 to s9

describe('segment movement', () => {
  it('advances one sentence', () => {
    expect(nextSegment(resolved, 's0')?.segmentId).toBe('s1');
  });

  it('moves back one sentence', () => {
    expect(previousSegment(resolved, 's5')?.segmentId).toBe('s4');
  });

  it('crosses a turn boundary by sentence', () => {
    // s2 is the last sentence of turn 0, s3 the only sentence of turn 1.
    expect(nextSegment(resolved, 's2')?.segmentId).toBe('s3');
    expect(previousSegment(resolved, 's3')?.segmentId).toBe('s2');
  });

  it('returns null at the first sentence rather than clamping', () => {
    expect(previousSegment(resolved, 's0')).toBeNull();
  });

  it('returns null at the last sentence rather than clamping', () => {
    expect(nextSegment(resolved, 's9')).toBeNull();
  });

  it('returns null for a segment that is not in the source', () => {
    expect(nextSegment(resolved, 'nope')).toBeNull();
    expect(previousSegment(resolved, 'nope')).toBeNull();
  });
});

describe('turn movement', () => {
  it('moves to the first sentence of the next turn', () => {
    expect(nextTurn(resolved, 's0')?.segmentId).toBe('s3');
  });

  it('moves to the next turn from anywhere inside the current one', () => {
    expect(nextTurn(resolved, 's1')?.segmentId).toBe('s3');
    expect(nextTurn(resolved, 's2')?.segmentId).toBe('s3');
  });

  it('moves to the first sentence of the previous turn, not the current one', () => {
    // From s6, midway through turn 2, the destination is turn 1 rather than s4.
    expect(previousTurn(resolved, 's6')?.segmentId).toBe('s3');
  });

  it('returns null in the first turn', () => {
    expect(previousTurn(resolved, 's0')).toBeNull();
    expect(previousTurn(resolved, 's2')).toBeNull();
  });

  it('returns null in the last turn', () => {
    expect(nextTurn(resolved, 's8')).toBeNull();
    expect(nextTurn(resolved, 's9')).toBeNull();
  });
});

describe('movement availability', () => {
  it('reports both directions unavailable at the ends of a source', () => {
    expect(movementAvailability(resolved, 's0')).toEqual({
      'segment.next': true,
      'segment.previous': false,
      'turn.next': true,
      'turn.previous': false,
    });

    expect(movementAvailability(resolved, 's9')).toEqual({
      'segment.next': false,
      'segment.previous': true,
      'turn.next': false,
      'turn.previous': true,
    });
  });
});

describe('position report', () => {
  it('reports sentence index, turn index, and percentage', () => {
    const report = positionReport(resolved, 's4');

    expect(report).toMatchObject({
      sentenceIndex: 5,
      sentenceCount: 10,
      turnIndex: 3,
      turnCount: 4,
      percentage: 50,
    });
  });

  it('reports the speaker and the timestamp of the active segment', () => {
    expect(positionReport(resolved, 's3')).toMatchObject({
      speakerLabel: 'Ben',
      timestampMs: 15000,
    });
  });

  it('reports one based indexes at the first and last sentence', () => {
    expect(positionReport(resolved, 's0')).toMatchObject({
      sentenceIndex: 1,
      turnIndex: 1,
      percentage: 10,
    });
    expect(positionReport(resolved, 's9')).toMatchObject({
      sentenceIndex: 10,
      turnIndex: 4,
      percentage: 100,
    });
  });

  it('returns null for a segment that is not in the source', () => {
    expect(positionReport(resolved, 'nope')).toBeNull();
  });

  it('agrees with a walk through the source, so spoken and visible cannot diverge', () => {
    let current = resolved.segments[0];
    let steps = 1;
    for (;;) {
      const report = positionReport(resolved, current.segmentId);
      expect(report?.sentenceIndex).toBe(steps);

      const next = nextSegment(resolved, current.segmentId);
      if (!next) break;
      current = next;
      steps += 1;
    }
    expect(steps).toBe(resolved.segments.length);
  });
});

describe('against the seed fixture', () => {
  const fixture = createSeedFixture();
  const built = resolveSource({
    source: fixture.sources[0],
    segments: fixture.segments,
    turns: fixture.turns,
    speakers: fixture.speakers,
  });

  it('walks the whole transcript by sentence and lands on the last one', () => {
    let current = built.segments[0];
    let visited = 1;
    for (let next = nextSegment(built, current.segmentId); next; ) {
      current = next;
      visited += 1;
      next = nextSegment(built, current.segmentId);
    }

    expect(visited).toBe(built.segments.length);
    expect(current.segmentId).toBe(built.segments[built.segments.length - 1].segmentId);
    expect(positionReport(built, current.segmentId)?.percentage).toBe(100);
  });

  it('walks the whole transcript by turn', () => {
    let current = built.segments[0];
    let turns = 1;
    for (let next = nextTurn(built, current.segmentId); next; ) {
      current = next;
      turns += 1;
      next = nextTurn(built, current.segmentId);
    }

    expect(turns).toBe(built.turns.length);
  });
});
