/**
 * Resolving a source into the ordered structure every other domain function
 * reads.
 *
 * Specification: docs/patterns/transcript-segment.md sections 1 and 1.1.
 *
 * Pure. No React, no DOM, no imports from the presentation layer.
 *
 * The two-level model is the reason this module exists. A speaker turn is the
 * reading unit and a sentence is the addressing unit, so almost every operation
 * needs to move between "which sentence" and "which turn contains it" without
 * scanning the transcript each time.
 *
 * Order comes from `sequenceIndex`, never from array position in the input and
 * never from an identifier. Identifiers are opaque, per domain-model.md
 * section 2, so this module sorts defensively rather than trusting the caller
 * to have passed things in order.
 */

import type { Id, Source, Speaker, SpeakerTurn, TranscriptSegment } from './types';

export interface ResolvedTurn {
  turn: SpeakerTurn;
  /** Position among the turns of this source, zero based. */
  index: number;
  segments: TranscriptSegment[];
  speaker: Speaker | null;
}

export interface ResolvedSource {
  source: Source;
  /** Every segment in the source, in canonical order. */
  segments: TranscriptSegment[];
  /** Every turn in the source, in canonical order, each carrying its segments. */
  turns: ResolvedTurn[];
  speakers: Speaker[];
}

interface SourceInput {
  source: Source;
  segments: TranscriptSegment[];
  turns: SpeakerTurn[];
  speakers?: Speaker[];
}

/**
 * Internal lookups. Kept off `ResolvedSource` so the resolved value stays
 * plain data that a test can construct and compare.
 */
const indexes = new WeakMap<
  ResolvedSource,
  {
    segmentById: Map<Id, TranscriptSegment>;
    /** Position of a segment within the source, zero based. */
    segmentPosition: Map<Id, number>;
    turnById: Map<Id, ResolvedTurn>;
    /** The turn containing a given segment. */
    turnOfSegment: Map<Id, ResolvedTurn>;
  }
>();

function indexesFor(resolved: ResolvedSource) {
  const existing = indexes.get(resolved);
  if (existing) return existing;

  const built = {
    segmentById: new Map(resolved.segments.map((segment) => [segment.segmentId, segment])),
    segmentPosition: new Map(
      resolved.segments.map((segment, position) => [segment.segmentId, position]),
    ),
    turnById: new Map(resolved.turns.map((turn) => [turn.turn.turnId, turn])),
    turnOfSegment: new Map(
      resolved.turns.flatMap((turn) =>
        turn.segments.map((segment) => [segment.segmentId, turn] as const),
      ),
    ),
  };
  indexes.set(resolved, built);
  return built;
}

/**
 * Builds the ordered view of one source.
 *
 * Input may contain material from several sources; anything belonging to a
 * different source is ignored rather than treated as an error, because callers
 * hold a whole fixture and pass it wholesale.
 *
 * Throws when a turn names a segment that is not present. That is a broken
 * source rather than a state the workflow can carry, and finding it at load is
 * much cheaper than finding it mid-session.
 */
export function resolveSource({ source, segments, turns, speakers = [] }: SourceInput): ResolvedSource {
  const sourceId = source.sourceId;

  const ownSegments = segments
    .filter((segment) => segment.sourceId === sourceId)
    .slice()
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const segmentById = new Map(ownSegments.map((segment) => [segment.segmentId, segment]));
  const ownSpeakers = speakers.filter((speaker) => speaker.sourceId === sourceId);
  const speakerById = new Map(ownSpeakers.map((speaker) => [speaker.speakerId, speaker]));

  const resolvedTurns: ResolvedTurn[] = turns
    .filter((turn) => turn.sourceId === sourceId)
    .slice()
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((turn, index) => ({
      turn,
      index,
      speaker: speakerById.get(turn.speakerId) ?? null,
      segments: turn.segmentIds.map((segmentId) => {
        const segment = segmentById.get(segmentId);
        if (!segment) {
          throw new Error(
            `Source ${sourceId}: turn ${turn.turnId} names segment ${segmentId}, which is not in the source.`,
          );
        }
        return segment;
      }),
    }));

  return { source, segments: ownSegments, turns: resolvedTurns, speakers: ownSpeakers };
}

export function segmentById(resolved: ResolvedSource, segmentId: Id): TranscriptSegment | null {
  return indexesFor(resolved).segmentById.get(segmentId) ?? null;
}

/** Zero-based position of a segment in the source, or null if it is not in it. */
export function positionOf(resolved: ResolvedSource, segmentId: Id): number | null {
  return indexesFor(resolved).segmentPosition.get(segmentId) ?? null;
}

export function turnOf(resolved: ResolvedSource, segmentId: Id): ResolvedTurn | null {
  return indexesFor(resolved).turnOfSegment.get(segmentId) ?? null;
}

export function turnById(resolved: ResolvedSource, turnId: Id): ResolvedTurn | null {
  return indexesFor(resolved).turnById.get(turnId) ?? null;
}

/** Throws if the segment is not in this source. For callers that require one. */
export function requireSegment(resolved: ResolvedSource, segmentId: Id): TranscriptSegment {
  const segment = segmentById(resolved, segmentId);
  if (!segment) {
    throw new Error(`Segment ${segmentId} is not in source ${resolved.source.sourceId}.`);
  }
  return segment;
}

export function requireTurnOf(resolved: ResolvedSource, segmentId: Id): ResolvedTurn {
  const turn = turnOf(resolved, segmentId);
  if (!turn) {
    throw new Error(`Segment ${segmentId} is not in any turn of ${resolved.source.sourceId}.`);
  }
  return turn;
}

export function firstSegment(resolved: ResolvedSource): TranscriptSegment | null {
  return resolved.segments[0] ?? null;
}

export function lastSegment(resolved: ResolvedSource): TranscriptSegment | null {
  return resolved.segments[resolved.segments.length - 1] ?? null;
}

/** Segments between two positions inclusive, in canonical order. */
export function segmentsBetween(
  resolved: ResolvedSource,
  startSegmentId: Id,
  endSegmentId: Id,
): TranscriptSegment[] {
  const start = positionOf(resolved, startSegmentId);
  const end = positionOf(resolved, endSegmentId);
  if (start === null || end === null) return [];
  const [from, to] = start <= end ? [start, end] : [end, start];
  return resolved.segments.slice(from, to + 1);
}

/** The turns a range of segments touches, in canonical order. */
export function turnsSpanned(
  resolved: ResolvedSource,
  segments: TranscriptSegment[],
): ResolvedTurn[] {
  const seen = new Set<Id>();
  const spanned: ResolvedTurn[] = [];
  for (const segment of segments) {
    if (seen.has(segment.turnId)) continue;
    seen.add(segment.turnId);
    const turn = turnById(resolved, segment.turnId);
    if (turn) spanned.push(turn);
  }
  return spanned;
}
