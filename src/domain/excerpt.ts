/**
 * Excerpt ranges: validity, contents, and size.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 3 and 5 (v0.2).
 *
 * Pure. These functions know nothing about state machines, focus, or
 * announcements.
 *
 * A range is identifiers and offsets, never copied text. Copied text detaches
 * from the source and cannot be re-read in context or compared against another
 * coder's differently bounded range. That half of D-001 survives D-036.
 *
 * The boundary adjustment API this module used to carry is gone with D-036.
 * v0.1's version of it is preserved at tag `v0.1`.
 */

import { positionOf, segmentById, segmentsBetween, turnsSpanned } from './source';
import type { ResolvedSource } from './source';
import type { Excerpt, Id, TranscriptSegment } from './types';

export interface ExcerptRange {
  startSegmentId: Id;
  endSegmentId: Id;
}

/**
 * A captured range, exact to the character.
 *
 * Section 5: boundaries are `startSegmentId` plus `startOffset` through
 * `endSegmentId` plus `endOffset`, and nothing snaps to a sentence. Offsets
 * were reserved in v0.1 and are written for real from D-036 onward, because
 * boundary variation between coders is data rather than noise.
 */
export interface CapturedRange extends ExcerptRange {
  /** Characters into the start segment's text. */
  startOffset: number;
  /** Characters into the end segment's text, exclusive. */
  endOffset: number;
}

/** The whole of a range, for the turn fallback and for reopened excerpts. */
export function wholeSegments(
  resolved: ResolvedSource,
  startSegmentId: Id,
  endSegmentId: Id,
): CapturedRange | null {
  const end = segmentById(resolved, endSegmentId);
  if (!end || !segmentById(resolved, startSegmentId)) return null;
  return { startSegmentId, endSegmentId, startOffset: 0, endOffset: end.text.length };
}

/* ---------- Creation and conversion ---------- */

export function rangeOf(excerpt: Excerpt): CapturedRange {
  return {
    startSegmentId: excerpt.startSegmentId,
    endSegmentId: excerpt.endSegmentId,
    startOffset: excerpt.startOffset,
    endOffset: excerpt.endOffset,
  };
}

/**
 * Write a captured range back onto an excerpt record, offsets and all.
 *
 * D-036 supersedes D-016's whole-sentence rule: what was dragged is what is
 * stored.
 */
export function withRange(excerpt: Excerpt, range: CapturedRange, updatedAt: string): Excerpt {
  return {
    ...excerpt,
    startSegmentId: range.startSegmentId,
    endSegmentId: range.endSegmentId,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    updatedAt,
  };
}

/* ---------- Validity ---------- */

export type RangeProblem =
  | 'startNotInSource'
  | 'endNotInSource'
  | 'boundariesCrossed';

export interface RangeValidity {
  valid: boolean;
  problem: RangeProblem | null;
}

/**
 * Boundaries cannot cross, and both must belong to the source. Section 4.
 *
 * A range whose start and end are the same segment is valid: that is what a
 * newly anchored excerpt is.
 */
export function validateRange(resolved: ResolvedSource, range: ExcerptRange): RangeValidity {
  const start = positionOf(resolved, range.startSegmentId);
  const end = positionOf(resolved, range.endSegmentId);

  if (start === null) return { valid: false, problem: 'startNotInSource' };
  if (end === null) return { valid: false, problem: 'endNotInSource' };
  if (start > end) return { valid: false, problem: 'boundariesCrossed' };
  return { valid: true, problem: null };
}

export function isValidRange(resolved: ResolvedSource, range: ExcerptRange): boolean {
  return validateRange(resolved, range).valid;
}

/** Segments covered by the range, in canonical order. Empty if invalid. */
export function excerptSegments(
  resolved: ResolvedSource,
  range: ExcerptRange,
): TranscriptSegment[] {
  if (!isValidRange(resolved, range)) return [];
  return segmentsBetween(resolved, range.startSegmentId, range.endSegmentId);
}

/** Full excerpt text, for read-on-request. Section 5. */
export function excerptText(resolved: ResolvedSource, range: ExcerptRange): string {
  return excerptSegments(resolved, range)
    .map((segment) => segment.text)
    .join(' ');
}

/* ---------- Size ---------- */

export interface ExcerptSize {
  sentenceCount: number;
  turnCount: number;
  /** True when the range crosses a turn boundary. */
  spansTurns: boolean;
}

export function excerptSize(resolved: ResolvedSource, range: ExcerptRange): ExcerptSize {
  const segments = excerptSegments(resolved, range);
  const turnCount = turnsSpanned(resolved, segments).length;
  return { sentenceCount: segments.length, turnCount, spansTurns: turnCount > 1 };
}

/**
 * Size as a phrase, per section 5.1: sentences alone within one turn,
 * sentences plus turn count once the range crosses a turn boundary, because a
 * raw sentence count stops carrying orientation at that point.
 *
 * Turns rather than speakers, since one speaker can hold several consecutive
 * turns and the turn count is what the data model stores.
 *
 * Wording is provisional. Section 5 fixes the information content and leaves
 * the phrasing open, and the phrasing is itself a candidate for testing.
 */
export function describeExcerptSize(size: ExcerptSize): string {
  const sentences = `${size.sentenceCount} ${size.sentenceCount === 1 ? 'sentence' : 'sentences'}`;
  if (!size.spansTurns) return sentences;
  return `${sentences} across ${size.turnCount} turns`;
}

