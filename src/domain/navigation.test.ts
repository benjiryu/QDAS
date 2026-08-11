import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../data/seed';
import { nextSegment, positionReport } from './navigation';
import { resolveSource } from './source';
import { buildTestSource } from './testing/buildTestSource';

/**
 * Specification: docs/patterns/transcript-segment.md section 5 and its v0.2
 * banner, decision D-038.
 *
 * The movement tests this file used to carry went with the commands they
 * covered. They are preserved at tag `v0.1`.
 */

const resolved = buildTestSource(); // turns of 3, 1, 4, 2 sentences; s0 to s9
const turnIds = resolved.turns.map((turn) => turn.turn.turnId);

describe('the sentence after a stored range', () => {
  it('advances one sentence', () => {
    expect(nextSegment(resolved, 's0')?.segmentId).toBe('s1');
  });

  it('crosses a turn boundary, because a range does not stop at one', () => {
    expect(nextSegment(resolved, 's2')?.segmentId).toBe('s3');
  });

  it('returns null at the last sentence rather than clamping', () => {
    // A caller that could not tell "moved" from "was already there" would
    // announce a move that did not happen.
    expect(nextSegment(resolved, 's9')).toBeNull();
  });

  it('returns null for a segment that is not in the source', () => {
    expect(nextSegment(resolved, 'nope')).toBeNull();
  });
});

describe('position of a speaker turn', () => {
  it('reports the turn index and count, one based for speech', () => {
    expect(positionReport(resolved, turnIds[0])).toMatchObject({ turnIndex: 1, turnCount: 4 });
    expect(positionReport(resolved, turnIds[3])).toMatchObject({ turnIndex: 4, turnCount: 4 });
  });

  it('reports no sentence index, since there is no active sentence', () => {
    // D-038: sentence-level position went with the active segment. A number
    // the reader is not necessarily on is worse than no number.
    expect(positionReport(resolved, turnIds[1])).not.toHaveProperty('sentenceIndex');
  });

  it('measures the percentage in sentences, from the turn’s first sentence', () => {
    // Turn index over turn count would tell a reader most of the way through a
    // long interview that they were a quarter of the way in.
    // t0 = s0..s2, t1 = s3, t2 = s4..s7, t3 = s8..s9, of ten sentences.
    expect(positionReport(resolved, turnIds[0])?.percentage).toBe(10);
    expect(positionReport(resolved, turnIds[1])?.percentage).toBe(40);
    expect(positionReport(resolved, turnIds[2])?.percentage).toBe(50);
    expect(positionReport(resolved, turnIds[3])?.percentage).toBe(90);
  });

  it('carries the speaker and the turn’s opening timestamp', () => {
    const report = positionReport(resolved, turnIds[2])!;

    expect(report.speakerLabel).toBe(resolved.turns[2].speaker?.label ?? null);
    expect(report.timestampMs).toBe(resolved.turns[2].segments[0].startTimeMs);
  });

  it('returns null for a turn that is not in the source', () => {
    expect(positionReport(resolved, 'nope')).toBeNull();
  });
});

describe('against the seeded fixture', () => {
  const fixture = createSeedFixture();
  const seeded = resolveSource({
    source: fixture.sources[0],
    segments: fixture.segments,
    turns: fixture.turns,
    speakers: fixture.speakers,
  });

  it('reaches 100 percent only at the turn holding the last sentence', () => {
    const last = seeded.turns[seeded.turns.length - 1];
    const report = positionReport(seeded, last.turn.turnId)!;

    expect(report.turnIndex).toBe(report.turnCount);
    // The last turn starts before its own last sentence, so the percentage is
    // the position of where the reader is, not of where the source ends.
    expect(report.percentage).toBeLessThanOrEqual(100);
    expect(report.percentage).toBeGreaterThan(90);
  });

  it('never reports a position outside one and the turn count', () => {
    for (const turn of seeded.turns) {
      const report = positionReport(seeded, turn.turn.turnId)!;
      expect(report.turnIndex).toBeGreaterThanOrEqual(1);
      expect(report.turnIndex).toBeLessThanOrEqual(report.turnCount);
    }
  });
});
