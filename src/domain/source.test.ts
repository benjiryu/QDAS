import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../data/seed';
import {
  firstSegment,
  lastSegment,
  positionOf,
  requireSegment,
  resolveSource,
  segmentById,
  segmentsBetween,
  turnById,
  turnOf,
  turnsSpanned,
} from './source';
import { buildTestSource, TEST_SOURCE_ID } from './testing/buildTestSource';
import type { Source, SpeakerTurn, TranscriptSegment } from './types';

/** Specification: docs/patterns/transcript-segment.md sections 1 and 1.1. */

const resolved = buildTestSource(); // turns of 3, 1, 4, 2 sentences

describe('resolveSource', () => {
  it('orders segments and turns by sequence index, not by input order', () => {
    const shuffled = {
      source: resolved.source,
      segments: [...resolved.segments].reverse(),
      turns: [...resolved.turns.map((turn) => turn.turn)].reverse(),
      speakers: resolved.speakers,
    };

    const rebuilt = resolveSource(shuffled);
    expect(rebuilt.segments.map((segment) => segment.segmentId)).toEqual(
      resolved.segments.map((segment) => segment.segmentId),
    );
    expect(rebuilt.turns.map((turn) => turn.index)).toEqual([0, 1, 2, 3]);
  });

  it('ignores material belonging to another source', () => {
    const other: TranscriptSegment = {
      ...resolved.segments[0],
      segmentId: 'other-1',
      sourceId: 'src-other',
    };
    const otherTurn: SpeakerTurn = {
      turnId: 'other-turn',
      sourceId: 'src-other',
      speakerId: 'spk-x',
      sequenceIndex: 0,
      segmentIds: ['other-1'],
    };

    const rebuilt = resolveSource({
      source: resolved.source,
      segments: [...resolved.segments, other],
      turns: [...resolved.turns.map((turn) => turn.turn), otherTurn],
      speakers: resolved.speakers,
    });

    expect(rebuilt.segments).toHaveLength(10);
    expect(rebuilt.turns).toHaveLength(4);
  });

  it('throws when a turn names a segment the source does not have', () => {
    const brokenTurn: SpeakerTurn = {
      ...resolved.turns[0].turn,
      segmentIds: ['s0', 'missing'],
    };

    expect(() =>
      resolveSource({
        source: resolved.source,
        segments: resolved.segments,
        turns: [brokenTurn],
        speakers: resolved.speakers,
      }),
    ).toThrow(/missing/);
  });

  it('attaches each turn its segments and its speaker', () => {
    expect(resolved.turns.map((turn) => turn.segments.length)).toEqual([3, 1, 4, 2]);
    expect(resolved.turns.map((turn) => turn.speaker?.label)).toEqual([
      'Ana',
      'Ben',
      'Ana',
      'Ben',
    ]);
  });

  it('resolves an empty source without throwing', () => {
    const empty: Source = { ...resolved.source, segmentCount: 0 };
    const built = resolveSource({ source: empty, segments: [], turns: [] });

    expect(built.segments).toEqual([]);
    expect(firstSegment(built)).toBeNull();
    expect(lastSegment(built)).toBeNull();
  });
});

describe('lookups', () => {
  it('finds a segment and its position', () => {
    expect(segmentById(resolved, 's4')?.text).toBe('Sentence 4.');
    expect(positionOf(resolved, 's4')).toBe(4);
    expect(positionOf(resolved, 'nope')).toBeNull();
    expect(segmentById(resolved, 'nope')).toBeNull();
  });

  it('finds the turn containing a segment', () => {
    expect(turnOf(resolved, 's0')?.index).toBe(0);
    expect(turnOf(resolved, 's2')?.index).toBe(0);
    expect(turnOf(resolved, 's3')?.index).toBe(1);
    expect(turnOf(resolved, 's9')?.index).toBe(3);
    expect(turnOf(resolved, 'nope')).toBeNull();
  });

  it('finds a turn by identifier', () => {
    expect(turnById(resolved, 't2')?.segments).toHaveLength(4);
    expect(turnById(resolved, 'nope')).toBeNull();
  });

  it('reports the first and last segment', () => {
    expect(firstSegment(resolved)?.segmentId).toBe('s0');
    expect(lastSegment(resolved)?.segmentId).toBe('s9');
  });

  it('requires a segment loudly', () => {
    expect(requireSegment(resolved, 's1').segmentId).toBe('s1');
    expect(() => requireSegment(resolved, 'nope')).toThrow(/not in source/);
  });
});

describe('ranges over segments', () => {
  it('returns the segments between two boundaries, inclusive', () => {
    expect(segmentsBetween(resolved, 's2', 's5').map((s) => s.segmentId)).toEqual([
      's2',
      's3',
      's4',
      's5',
    ]);
  });

  it('returns a single segment when both boundaries are the same', () => {
    expect(segmentsBetween(resolved, 's7', 's7').map((s) => s.segmentId)).toEqual(['s7']);
  });

  it('returns nothing when a boundary is not in the source', () => {
    expect(segmentsBetween(resolved, 's2', 'nope')).toEqual([]);
  });

  it('lists the turns a range touches, in order and without repeats', () => {
    const spanned = turnsSpanned(resolved, segmentsBetween(resolved, 's2', 's5'));
    expect(spanned.map((turn) => turn.index)).toEqual([0, 1, 2]);
  });

  it('lists one turn for a range inside a single turn', () => {
    const spanned = turnsSpanned(resolved, segmentsBetween(resolved, 's4', 's6'));
    expect(spanned.map((turn) => turn.index)).toEqual([2]);
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

  it('resolves the realistic source without loss', () => {
    expect(built.segments).toHaveLength(fixture.sources[0].segmentCount);
    expect(built.turns.length).toBeGreaterThanOrEqual(60);
  });

  it('places every segment in exactly one turn', () => {
    const fromTurns = built.turns.flatMap((turn) => turn.segments.map((s) => s.segmentId));
    expect(new Set(fromTurns).size).toBe(built.segments.length);
  });

  it('keeps the two sources apart', () => {
    expect(built.segments.every((segment) => segment.sourceId === built.source.sourceId)).toBe(
      true,
    );
    expect(built.source.sourceId).not.toBe(TEST_SOURCE_ID);
  });
});
