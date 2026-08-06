/**
 * Movement between segments and turns, and position reporting.
 *
 * Specification: docs/patterns/transcript-segment.md sections 4.1 and 5.
 *
 * Pure. Movement functions return the segment a command would make active and
 * never mutate anything; the caller owns `activeSegmentId`.
 *
 * Every function returns null at the ends of the source rather than clamping.
 * A caller that cannot tell "moved to the last sentence" from "was already at
 * the last sentence" would announce a move that did not happen, and the
 * position report and the spoken text would then disagree.
 */

import { positionOf, requireTurnOf, turnOf } from './source';
import type { ResolvedSource, ResolvedTurn } from './source';
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

/** `segment.previous`. Null at the first sentence of the source. */
export function previousSegment(
  resolved: ResolvedSource,
  segmentId: Id,
): TranscriptSegment | null {
  const position = positionOf(resolved, segmentId);
  if (position === null || position === 0) return null;
  return resolved.segments[position - 1] ?? null;
}

/**
 * `turn.next`. The first sentence of the following turn, per section 4.1.
 *
 * Movement is by turn regardless of where in the current turn the segment sits,
 * so a user midway through a long turn reaches the next speaker in one command
 * rather than in as many commands as there are remaining sentences.
 */
export function nextTurn(resolved: ResolvedSource, segmentId: Id): TranscriptSegment | null {
  const turn = turnOf(resolved, segmentId);
  if (!turn) return null;
  const following = resolved.turns[turn.index + 1];
  return following?.segments[0] ?? null;
}

/**
 * `turn.previous`. The first sentence of the preceding turn.
 *
 * From anywhere inside a turn this moves to the previous turn, not to the start
 * of the current one. Section 4.1 describes the command as moving to a turn,
 * and a command whose destination depends on how far into a turn the user
 * happens to be is not predictable by ear.
 */
export function previousTurn(
  resolved: ResolvedSource,
  segmentId: Id,
): TranscriptSegment | null {
  const turn = turnOf(resolved, segmentId);
  if (!turn || turn.index === 0) return null;
  return resolved.turns[turn.index - 1]?.segments[0] ?? null;
}

/** The turn containing a segment. Convenience for callers announcing speaker. */
export function turnContaining(resolved: ResolvedSource, segmentId: Id): ResolvedTurn | null {
  return turnOf(resolved, segmentId);
}

export interface PositionReport {
  /** One based, for speech. "Sentence 12 of 330." */
  sentenceIndex: number;
  sentenceCount: number;
  /** One based. "Speaker turn 4 of 78." */
  turnIndex: number;
  turnCount: number;
  /** Whole percent through the source, by sentence count. */
  percentage: number;
  /** Present only when the source carries audio. Section 5. */
  timestampMs: number | null;
  speakerLabel: string | null;
}

/**
 * Position of the active segment, per section 5.
 *
 * Derived from the active segment in all cases and for all users, so the
 * spoken report and the visible ribbon cannot disagree. Never derived from
 * scroll offset, per section 2.2 and D-009.
 *
 * The percentage is the one-based sentence index over the sentence count, so
 * the last sentence reports 100 and the first sentence of a long source
 * reports 0. Section 5 fixes the quantity and not the rounding; this is the
 * arithmetic, and the wording belongs to the announcement layer.
 */
export function positionReport(
  resolved: ResolvedSource,
  segmentId: Id,
): PositionReport | null {
  const position = positionOf(resolved, segmentId);
  if (position === null) return null;

  const segment = resolved.segments[position];
  const turn = requireTurnOf(resolved, segmentId);
  const sentenceCount = resolved.segments.length;

  return {
    sentenceIndex: position + 1,
    sentenceCount,
    turnIndex: turn.index + 1,
    turnCount: resolved.turns.length,
    percentage: Math.round(((position + 1) / sentenceCount) * 100),
    timestampMs: segment.startTimeMs,
    speakerLabel: turn.speaker?.label ?? null,
  };
}

/**
 * Whether a movement command has anywhere to go. The caller uses this to
 * disable a control and to say why, per accessibility contract 2.6.
 */
export interface MovementAvailability {
  'segment.next': boolean;
  'segment.previous': boolean;
  'turn.next': boolean;
  'turn.previous': boolean;
}

export function movementAvailability(
  resolved: ResolvedSource,
  segmentId: Id,
): MovementAvailability {
  return {
    'segment.next': nextSegment(resolved, segmentId) !== null,
    'segment.previous': previousSegment(resolved, segmentId) !== null,
    'turn.next': nextTurn(resolved, segmentId) !== null,
    'turn.previous': previousTurn(resolved, segmentId) !== null,
  };
}
