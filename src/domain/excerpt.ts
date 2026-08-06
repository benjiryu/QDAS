/**
 * Excerpt ranges: creation, boundary adjustment, validity, size, and delta.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 4, 5, 5.1, and 10.
 *
 * Pure. These functions know nothing about state machines, focus, or
 * announcements. They answer what a range would become and what changed, and
 * the pattern layer decides what to do with that.
 *
 * A range is two segment identifiers, never copied text. Copied text detaches
 * from the source and cannot be re-expanded, re-read in context, or compared
 * against another coder's differently bounded range. Section 10, decision D-001.
 *
 * Every adjustment returns null when the move is unavailable rather than
 * clamping to the same range. Boundaries cannot cross, and a caller that
 * received an unchanged range back would announce a change that did not occur.
 * Use `excerptAvailability` for the reason a control is disabled.
 */

import {
  lastSegment,
  positionOf,
  requireTurnOf,
  segmentById,
  segmentsBetween,
  turnsSpanned,
} from './source';
import type { ResolvedSource } from './source';
import type { Excerpt, Id, TranscriptSegment } from './types';

export interface ExcerptRange {
  startSegmentId: Id;
  endSegmentId: Id;
}

/** What becomes the range when selection begins. Flag `excerptInitialRange`. */
export type InitialRange = 'activeSentence' | 'activeSpeakerTurn';

/* ---------- Creation and conversion ---------- */

/**
 * Begin an excerpt at a segment, per section 3, `idle` to `anchored`.
 *
 * The unit is passed in rather than read from the flags module, so this stays
 * pure and the flag stays in one place. E-1 is open; both values work here.
 */
export function createExcerptAt(
  resolved: ResolvedSource,
  segmentId: Id,
  initialRange: InitialRange = 'activeSentence',
): ExcerptRange | null {
  if (positionOf(resolved, segmentId) === null) return null;

  if (initialRange === 'activeSpeakerTurn') {
    const turn = requireTurnOf(resolved, segmentId);
    const first = turn.segments[0];
    const last = turn.segments[turn.segments.length - 1];
    return { startSegmentId: first.segmentId, endSegmentId: last.segmentId };
  }

  return { startSegmentId: segmentId, endSegmentId: segmentId };
}

export function rangeOf(excerpt: Excerpt): ExcerptRange {
  return { startSegmentId: excerpt.startSegmentId, endSegmentId: excerpt.endSegmentId };
}

/**
 * Write a range back onto an excerpt record.
 *
 * Offsets are always whole-segment bounds in v0.1: reserved in the model so
 * word-level boundaries can arrive later without migrating stored excerpts,
 * and never partial. Section 10, decision D-016.
 */
export function withRange(
  excerpt: Excerpt,
  range: ExcerptRange,
  resolved: ResolvedSource,
  updatedAt: string,
): Excerpt {
  const end = segmentById(resolved, range.endSegmentId);
  return {
    ...excerpt,
    startSegmentId: range.startSegmentId,
    endSegmentId: range.endSegmentId,
    startOffset: 0,
    endOffset: end ? end.text.length : 0,
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

/* ---------- Boundary adjustment ---------- */

function positions(resolved: ResolvedSource, range: ExcerptRange) {
  const start = positionOf(resolved, range.startSegmentId);
  const end = positionOf(resolved, range.endSegmentId);
  if (start === null || end === null || start > end) return null;
  return { start, end };
}

function rangeAt(resolved: ResolvedSource, startPosition: number, endPosition: number) {
  const start = resolved.segments[startPosition];
  const end = resolved.segments[endPosition];
  if (!start || !end) return null;
  return { startSegmentId: start.segmentId, endSegmentId: end.segmentId };
}

/** `excerpt.start.expand`. Null when the start is the first sentence of the source. */
export function expandStart(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at || at.start === 0) return null;
  return rangeAt(resolved, at.start - 1, at.end);
}

/** `excerpt.start.contract`. Null when it would move the start past the end. */
export function contractStart(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at || at.start >= at.end) return null;
  return rangeAt(resolved, at.start + 1, at.end);
}

/** `excerpt.end.expand`. Null when the end is the last sentence of the source. */
export function expandEnd(resolved: ResolvedSource, range: ExcerptRange): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at || at.end >= resolved.segments.length - 1) return null;
  return rangeAt(resolved, at.start, at.end + 1);
}

/** `excerpt.end.contract`. Null when it would move the end past the start. */
export function contractEnd(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at || at.end <= at.start) return null;
  return rangeAt(resolved, at.start, at.end - 1);
}

/**
 * `excerpt.start.expandTurn`. The start moves to the first sentence of the
 * turn before the one it is in. Null when the start is already in the first turn.
 *
 * The destination is the previous turn even when the start sits midway through
 * its own turn, which is what section 4 implies by making the command
 * unavailable on "start is not in first turn" rather than on "start is not the
 * first sentence of the source". Nothing is skipped: the range is contiguous,
 * so the earlier sentences of the start's own turn come in as well.
 *
 * The alternative reading, snapping to the beginning of the current turn first,
 * is flagged in the task report. It differs only in how many presses reach the
 * same place from mid-turn.
 */
export function expandStartByTurn(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at) return null;

  const turn = requireTurnOf(resolved, range.startSegmentId);
  const previous = resolved.turns[turn.index - 1];
  if (!previous) return null;

  const target = positionOf(resolved, previous.segments[0].segmentId);
  if (target === null) return null;
  return rangeAt(resolved, target, at.end);
}

/**
 * `excerpt.end.expandTurn`. The end moves to the last sentence of the turn
 * after the one it is in. Null when the end is already in the last turn.
 */
export function expandEndByTurn(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at) return null;

  const turn = requireTurnOf(resolved, range.endSegmentId);
  const following = resolved.turns[turn.index + 1];
  if (!following) return null;

  const lastOfTurn = following.segments[following.segments.length - 1];
  const target = positionOf(resolved, lastOfTurn.segmentId);
  if (target === null) return null;
  return rangeAt(resolved, at.start, target);
}

/**
 * Contract the start by a whole turn: the start moves to the first sentence of
 * the next turn it can reach without passing the end.
 *
 * NOT IN THE SPECIFICATION. excerpt-selection.md section 4 defines expansion by
 * turn for both boundaries and contraction by sentence only, and
 * src/config/keybindings.ts carries no chord for this. It is implemented here
 * because the task asked for contraction by turn, and it must not be wired to a
 * control or a chord until the team defines its availability condition and its
 * announcement. See the task report.
 */
export function contractStartByTurn(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at) return null;

  const startTurn = requireTurnOf(resolved, range.startSegmentId);
  const following = resolved.turns[startTurn.index + 1];
  if (!following) return null;

  const target = positionOf(resolved, following.segments[0].segmentId);
  if (target === null || target > at.end) return null;
  return rangeAt(resolved, target, at.end);
}

/**
 * Contract the end by a whole turn: the end moves to the last sentence of the
 * previous turn it can reach without passing the start.
 *
 * NOT IN THE SPECIFICATION. See `contractStartByTurn`.
 */
export function contractEndByTurn(
  resolved: ResolvedSource,
  range: ExcerptRange,
): ExcerptRange | null {
  const at = positions(resolved, range);
  if (!at) return null;

  const endTurn = requireTurnOf(resolved, range.endSegmentId);
  const previous = resolved.turns[endTurn.index - 1];
  if (!previous) return null;

  const lastOfTurn = previous.segments[previous.segments.length - 1];
  const target = positionOf(resolved, lastOfTurn.segmentId);
  if (target === null || target < at.start) return null;
  return rangeAt(resolved, at.start, target);
}

/* ---------- Availability ---------- */

export type UnavailableReason =
  | 'atSourceStart'
  | 'atSourceEnd'
  | 'wouldCrossEnd'
  | 'wouldCrossStart'
  | 'inFirstTurn'
  | 'inLastTurn'
  | 'noEarlierTurnInRange'
  | 'noLaterTurnInRange'
  | 'invalidRange';

export interface CommandAvailability {
  available: boolean;
  /** Why not, for the disabled-control explanation required by contract 2.6. */
  reason: UnavailableReason | null;
}

export type AdjustmentCommand =
  | 'excerpt.start.expand'
  | 'excerpt.start.contract'
  | 'excerpt.end.expand'
  | 'excerpt.end.contract'
  | 'excerpt.start.expandTurn'
  | 'excerpt.end.expandTurn'
  | 'excerpt.contextBefore'
  | 'excerpt.contextAfter';

function state(available: boolean, reason: UnavailableReason): CommandAvailability {
  return available ? { available: true, reason: null } : { available: false, reason };
}

/**
 * Availability and reason for every boundary command in section 4.
 *
 * The reasons are codes, not sentences. Announcement wording is not fixed by
 * specification and belongs to the presentation layer, per section 5.
 */
export function excerptAvailability(
  resolved: ResolvedSource,
  range: ExcerptRange,
): Record<AdjustmentCommand, CommandAvailability> {
  const unavailable: CommandAvailability = { available: false, reason: 'invalidRange' };
  const at = positions(resolved, range);
  if (!at) {
    return {
      'excerpt.start.expand': unavailable,
      'excerpt.start.contract': unavailable,
      'excerpt.end.expand': unavailable,
      'excerpt.end.contract': unavailable,
      'excerpt.start.expandTurn': unavailable,
      'excerpt.end.expandTurn': unavailable,
      'excerpt.contextBefore': unavailable,
      'excerpt.contextAfter': unavailable,
    };
  }

  const startTurn = requireTurnOf(resolved, range.startSegmentId);
  const endTurn = requireTurnOf(resolved, range.endSegmentId);
  const atStartOfSource = at.start === 0;
  const atEndOfSource = at.end === resolved.segments.length - 1;

  return {
    'excerpt.start.expand': state(!atStartOfSource, 'atSourceStart'),
    'excerpt.start.contract': state(at.start < at.end, 'wouldCrossEnd'),
    'excerpt.end.expand': state(!atEndOfSource, 'atSourceEnd'),
    'excerpt.end.contract': state(at.end > at.start, 'wouldCrossStart'),
    'excerpt.start.expandTurn': state(startTurn.index > 0, 'inFirstTurn'),
    'excerpt.end.expandTurn': state(
      endTurn.index < resolved.turns.length - 1,
      'inLastTurn',
    ),
    'excerpt.contextBefore': state(!atStartOfSource, 'atSourceStart'),
    'excerpt.contextAfter': state(!atEndOfSource, 'atSourceEnd'),
  };
}

/* ---------- Context, without changing the range ---------- */

/**
 * Sentences immediately before the range, oldest first. Section 5, available on
 * request. Retrieving context never alters the range.
 */
export function contextBefore(
  resolved: ResolvedSource,
  range: ExcerptRange,
  count = 1,
): TranscriptSegment[] {
  const at = positions(resolved, range);
  if (!at) return [];
  return resolved.segments.slice(Math.max(0, at.start - count), at.start);
}

/** Sentences immediately after the range, in order. */
export function contextAfter(
  resolved: ResolvedSource,
  range: ExcerptRange,
  count = 1,
): TranscriptSegment[] {
  const at = positions(resolved, range);
  if (!at) return [];
  return resolved.segments.slice(at.end + 1, at.end + 1 + count);
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

/* ---------- Delta ---------- */

export type DeltaDirection = 'expanded' | 'contracted' | 'moved' | 'unchanged';

export interface ExcerptDelta {
  /** Segments in the new range that were not in the old one, in order. */
  added: TranscriptSegment[];
  /** Segments in the old range that are not in the new one, in order. */
  removed: TranscriptSegment[];
  addedText: string;
  removedText: string;
  /** Which boundary moved. Both can move when a range is replaced wholesale. */
  startMoved: boolean;
  endMoved: boolean;
  direction: DeltaDirection;
}

/**
 * What entered or left the range between two states of the same excerpt.
 *
 * Section 5 requires the text that entered or left to be announced before the
 * new size, because after expanding backward the thing the user most needs is
 * to hear what they just picked up. Reporting only that a boundary moved would
 * force a second command to learn anything, doubling the cost of the most
 * frequent action in the workflow.
 *
 * Both lists can be non-empty at once. That is not reachable through the
 * single-boundary commands, and is reachable by replacing a range, so the shape
 * allows for it rather than assuming one or the other.
 */
export function excerptDelta(
  resolved: ResolvedSource,
  before: ExcerptRange,
  after: ExcerptRange,
): ExcerptDelta {
  const previous = excerptSegments(resolved, before);
  const next = excerptSegments(resolved, after);

  const previousIds = new Set(previous.map((segment) => segment.segmentId));
  const nextIds = new Set(next.map((segment) => segment.segmentId));

  const added = next.filter((segment) => !previousIds.has(segment.segmentId));
  const removed = previous.filter((segment) => !nextIds.has(segment.segmentId));

  const startMoved = before.startSegmentId !== after.startSegmentId;
  const endMoved = before.endSegmentId !== after.endSegmentId;

  let direction: DeltaDirection = 'unchanged';
  if (added.length > 0 && removed.length > 0) direction = 'moved';
  else if (added.length > 0) direction = 'expanded';
  else if (removed.length > 0) direction = 'contracted';

  return {
    added,
    removed,
    addedText: added.map((segment) => segment.text).join(' '),
    removedText: removed.map((segment) => segment.text).join(' '),
    startMoved,
    endMoved,
    direction,
  };
}

/**
 * Cut a delta down to a word count, for the `deltaTruncationWords` flag.
 *
 * The flag value is passed in rather than read here, so the flag stays in
 * src/config/flags.ts and this module stays pure. Whether truncation is
 * signalled in speech is the announcement layer's decision, so the flag is
 * reported rather than marked in the text.
 */
export function truncateWords(
  text: string,
  maxWords: number,
): { text: string; truncated: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  if (maxWords <= 0 || words.length <= maxWords) {
    return { text: words.join(' '), truncated: false };
  }
  return { text: words.slice(0, maxWords).join(' '), truncated: true };
}

/** True when the range ends at the last sentence of the source. */
export function isAtSourceEnd(resolved: ResolvedSource, range: ExcerptRange): boolean {
  const last = lastSegment(resolved);
  return last !== null && range.endSegmentId === last.segmentId;
}
