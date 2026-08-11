/**
 * Where a reader is in a source.
 *
 * Specification: docs/patterns/transcript-segment.md section 5 and its v0.2
 * banner, decision D-038.
 *
 * Pure. What remains after D-038 is orientation, not movement: the browser and
 * the screen reader move the reader, and the application only answers where
 * they have got to. The movement functions this file used to hold went with the
 * commands that called them and are preserved at tag `v0.1`.
 *
 * `nextSegment` survives because the post-coding return in coding.ts still
 * needs the sentence after an excerpt, which is a question about a stored
 * range rather than about navigation.
 */

import { positionOf } from './source';
import type { ResolvedSource } from './source';
import type { Id, TranscriptSegment } from './types';

/** `segment.next`. Null at the last sentence of the source. */
export function nextSegment(
  resolved: ResolvedSource,
  segmentId: Id,
): TranscriptSegment | null {
  const position = positionOf(resolved, segmentId);
  if (position === null) return null;
  return resolved.segments[position + 1] ?? null;
}

export interface PositionReport {
  /** One based, for speech. "Speaker turn 4 of 78." */
  turnIndex: number;
  turnCount: number;
  /** Whole percent through the source, by sentence count. */
  percentage: number;
  /** Present only when the source carries audio. Section 5. */
  timestampMs: number | null;
  speakerLabel: string | null;
}

/**
 * Position of a speaker turn, per section 5 as revised by D-038.
 *
 * Sentence-level position went with the active sentence: the application no
 * longer tracks one, and reporting a sentence the reader is not necessarily on
 * would be a number that means nothing.
 *
 * The percentage is still measured in sentences, from the turn's first
 * sentence, because turns vary enormously in length and turn index over turn
 * count would tell a reader halfway through a long interview that they were a
 * fifth of the way in. It advances a turn at a time, which is the granularity
 * the whole layer now works at.
 *
 * Derived from the focused turn for every user, so the spoken report and the
 * visible ribbon cannot disagree. Never derived from scroll offset, per D-009.
 */
export function positionReport(resolved: ResolvedSource, turnId: Id): PositionReport | null {
  const index = resolved.turns.findIndex((candidate) => candidate.turn.turnId === turnId);
  if (index < 0) return null;

  const turn = resolved.turns[index];
  const first = turn.segments[0];
  const sentencesBefore = first ? positionOf(resolved, first.segmentId) : null;
  const sentenceCount = resolved.segments.length;

  return {
    turnIndex: index + 1,
    turnCount: resolved.turns.length,
    percentage:
      sentencesBefore === null || sentenceCount === 0
        ? 0
        : Math.round(((sentencesBefore + 1) / sentenceCount) * 100),
    timestampMs: first?.startTimeMs ?? null,
    speakerLabel: turn.speaker?.label ?? null,
  };
}
