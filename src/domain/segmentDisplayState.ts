/**
 * Which display state each segment carries, derived from stored excerpts.
 *
 * Specification: docs/patterns/transcript-segment.md section 3.
 *
 * Pure. No React, no DOM.
 *
 * Scope is the two coded states. `inactive` is the absence of them, and
 * `in-pending-excerpt` and `in-confirmed-excerpt` describe a range being drawn
 * right now, which is workflow state rather than anything derivable from stored
 * records. Section 3 does not say which state wins when a segment is both coded
 * and inside a range in progress, so this module does not decide it. See the
 * task report.
 *
 * `active` is orthogonal and is not part of this at all. A segment can be
 * active and coded at once and must be distinguishable as both, so the active
 * segment is tracked separately and combined at render time.
 */

import { positionOf } from './source';
import type { ResolvedSource } from './source';
import type { CodeAssignment, Excerpt, Id, SegmentDisplayState } from './types';

/** The states this module can produce. */
export type CodedDisplayState = Extract<
  SegmentDisplayState,
  'inactive' | 'coded' | 'coded-multiple' | 'noted'
>;

/**
 * A stretch of characters within one sentence carrying the same coding.
 *
 * Since D-036 an excerpt covers exact characters, so a sentence can be coded in
 * part. The segment-level fields below answer "is this sentence coded at all",
 * which is the sentence granularity R-1 compares at; these answer "which
 * characters", which is what gets painted.
 */
export interface CodedSpan {
  /** Characters into the sentence's text. */
  start: number;
  /** Exclusive. */
  end: number;
  state: Exclude<CodedDisplayState, 'inactive'>;
  excerptIds: Id[];
  codeIds: Id[];
}

export interface SegmentCoding {
  state: CodedDisplayState;
  /**
   * Excerpts covering this segment, ordered by start position then creation
   * time, per excerpt-selection.md section 8. A screen reader user requesting
   * code detail hears each excerpt described separately, so the order has to be
   * stable and it has to be the same order the code column shows.
   */
  excerptIds: Id[];
  /** Distinct codes applied to this segment across those excerpts. */
  codeIds: Id[];
  /** Assignments, which exceeds `codeIds.length` when two excerpts share a code. */
  assignmentCount: number;
  /**
   * The coded stretches within this sentence, in order and non-overlapping.
   *
   * Empty when the sentence is `inactive`. One span covering the whole sentence
   * when every covering excerpt covers it whole, which is the common case.
   */
  spans: CodedSpan[];
}

export interface DeriveInput {
  excerpts: Excerpt[];
  codeAssignments: CodeAssignment[];
  /**
   * Which excerpts count as coded. Defaults to every excerpt carrying at least
   * one code assignment.
   *
   * This is a parameter and not a policy because who counts is a research
   * decision. Whether another coder's excerpts should show as coded to a
   * participant during independent coding is open; the caller filters, and this
   * module counts what it is given.
   */
  includeExcerpt?: (excerpt: Excerpt, assignments: CodeAssignment[]) => boolean;
}

export interface SegmentDisplayStates {
  /** One entry per segment in the source, including uncoded ones. */
  bySegmentId: Map<Id, SegmentCoding>;
  /**
   * Excerpts that name this source but whose boundaries do not resolve against
   * it, so they were not counted.
   *
   * Reported rather than thrown. A stored range that has gone bad must not
   * blank a transcript in the middle of a participant session, and it must not
   * disappear silently either. Callers can assert this is empty; the fixture
   * builder already fails at authoring time.
   */
  unresolvedExcerptIds: Id[];
}

/**
 * A factory, not a shared constant. Spreading one template object would give
 * every segment the same `excerptIds` and `codeIds` arrays, so coding one
 * segment would appear to code the whole transcript.
 */
function emptyCoding(): SegmentCoding {
  return { state: 'inactive', excerptIds: [], codeIds: [], assignmentCount: 0, spans: [] };
}

/** Which characters of a segment an excerpt covers, clamped to the text. */
function coveredInterval(
  excerpt: Excerpt,
  segmentId: Id,
  textLength: number,
): { start: number; end: number } | null {
  const isStart = excerpt.startSegmentId === segmentId;
  const isEnd = excerpt.endSegmentId === segmentId;

  const start = isStart ? Math.max(0, Math.min(excerpt.startOffset, textLength)) : 0;
  const end = isEnd ? Math.max(0, Math.min(excerpt.endOffset, textLength)) : textLength;

  // A range stored inside out, or one whose offsets have gone stale against a
  // resegmented source, covers nothing rather than covering everything.
  return end > start ? { start, end } : null;
}

interface Interval {
  start: number;
  end: number;
  excerptId: Id;
  codeIds: Id[];
}

/**
 * Intervals to spans: one span per stretch of characters covered by the same
 * set of excerpts.
 *
 * Boundaries are swept rather than intersected pairwise, so overlapping,
 * nested, and disjoint ranges all fall out of the same pass. Adjacent stretches
 * covered by the same excerpts are merged, so a sentence coded whole by two
 * excerpts is one span and not three.
 */
function spansFrom(intervals: Interval[]): CodedSpan[] {
  if (intervals.length === 0) return [];

  const boundaries = [...new Set(intervals.flatMap(({ start, end }) => [start, end]))].sort(
    (a, b) => a - b,
  );

  const spans: CodedSpan[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    // Intervals arrive in canonical excerpt order, so the covering list is too.
    const covering = intervals.filter(
      (interval) => interval.start <= start && interval.end >= end,
    );
    if (covering.length === 0) continue;

    const excerptIds = covering.map((interval) => interval.excerptId);
    const previous = spans[spans.length - 1];

    if (
      previous &&
      previous.end === start &&
      previous.excerptIds.length === excerptIds.length &&
      previous.excerptIds.every((id, position) => id === excerptIds[position])
    ) {
      previous.end = end;
      continue;
    }

    const codeIds: Id[] = [];
    for (const interval of covering) {
      for (const codeId of interval.codeIds) if (!codeIds.includes(codeId)) codeIds.push(codeId);
    }

    spans.push({
      start,
      end,
      /*
        Two or more excerpts over these characters, matching how the
        segment-level state counts excerpts rather than codes — unless none of
        them carries a code at all, which is a note and not coding.

        Asked of `covering` rather than of `codeIds`, which is built after the
        merge check above.
      */
      state: !covering.some((interval) => interval.codeIds.length > 0)
        ? 'noted'
        : covering.length > 1
          ? 'coded-multiple'
          : 'coded',
      excerptIds,
      codeIds,
    });
  }

  return spans;
}

/**
 * By default an excerpt counts only if it carries a code assignment.
 *
 * The workspace overrides this to admit an excerpt carrying only a note, which
 * is what paints the note's own passage rather than leaving the reader with an
 * icon on the turn and no way to tell which words it concerns.
 *
 * Section 3 states the condition on `coded` and not on `coded-multiple`, which
 * reads as shorthand rather than as a difference: excerpt-selection.md section
 * 3 makes "save with at least one code" the only transition into `saved`, so an
 * excerpt with no assignment is not a saved coded excerpt and cannot be one of
 * the two that make a segment `coded-multiple`.
 */
function carriesAnAssignment(_excerpt: Excerpt, assignments: CodeAssignment[]): boolean {
  return assignments.length > 0;
}

export function deriveSegmentDisplayStates(
  resolved: ResolvedSource,
  { excerpts, codeAssignments, includeExcerpt = carriesAnAssignment }: DeriveInput,
): SegmentDisplayStates {
  const assignmentsByExcerpt = new Map<Id, CodeAssignment[]>();
  for (const assignment of codeAssignments) {
    const existing = assignmentsByExcerpt.get(assignment.excerptId);
    if (existing) existing.push(assignment);
    else assignmentsByExcerpt.set(assignment.excerptId, [assignment]);
  }

  const bySegmentId = new Map<Id, SegmentCoding>(
    resolved.segments.map((segment) => [segment.segmentId, emptyCoding()]),
  );
  const unresolvedExcerptIds: Id[] = [];

  const candidates = excerpts
    .filter((excerpt) => excerpt.sourceId === resolved.source.sourceId)
    .filter((excerpt) =>
      includeExcerpt(excerpt, assignmentsByExcerpt.get(excerpt.excerptId) ?? []),
    )
    .map((excerpt) => ({
      excerpt,
      start: positionOf(resolved, excerpt.startSegmentId),
      end: positionOf(resolved, excerpt.endSegmentId),
    }));

  const resolvable = candidates.filter((candidate) => {
    const usable =
      candidate.start !== null && candidate.end !== null && candidate.start <= candidate.end;
    if (!usable) unresolvedExcerptIds.push(candidate.excerpt.excerptId);
    return usable;
  }) as { excerpt: Excerpt; start: number; end: number }[];

  // Ordered by start position, then creation time, then identifier so that a
  // tie is still deterministic. excerpt-selection.md section 8.
  resolvable.sort(
    (a, b) =>
      a.start - b.start ||
      a.excerpt.createdAt.localeCompare(b.excerpt.createdAt) ||
      a.excerpt.excerptId.localeCompare(b.excerpt.excerptId),
  );

  /** Collected in canonical excerpt order, then swept into spans below. */
  const intervalsBySegment = new Map<Id, Interval[]>();

  for (const { excerpt, start, end } of resolvable) {
    const assignments = assignmentsByExcerpt.get(excerpt.excerptId) ?? [];
    const codeIds = assignments.map((assignment) => assignment.codeId);

    for (let position = start; position <= end; position += 1) {
      const segment = resolved.segments[position];
      const coding = bySegmentId.get(segment.segmentId);
      if (!coding) continue;

      coding.excerptIds.push(excerpt.excerptId);
      coding.assignmentCount += assignments.length;
      for (const assignment of assignments) {
        if (!coding.codeIds.includes(assignment.codeId)) coding.codeIds.push(assignment.codeId);
      }

      // Two or more excerpts, not two or more codes. One excerpt carrying three
      // codes is `coded`; the state distinguishes overlapping ranges, because
      // that is what the visual and the spoken detail have to separate.
      //
      // This stays a fact about the whole sentence even where the excerpts
      // cover different parts of it: D-036 section 5 keeps comparison at
      // sentence granularity, and the spans below carry the exact truth.
      /*
        Codes win over a note. A sentence covered by a coded excerpt and a
        note-only one is coded, so a note never masks coding; `noted` describes
        only a sentence where nothing standing carries a code.

        Read off the accumulated codes, which the loop above has just added to,
        so the precedence needs no second pass.
      */
      coding.state =
        coding.codeIds.length === 0
          ? 'noted'
          : coding.excerptIds.length > 1
            ? 'coded-multiple'
            : 'coded';

      const interval = coveredInterval(excerpt, segment.segmentId, segment.text.length);
      if (!interval) continue;

      const existing = intervalsBySegment.get(segment.segmentId);
      const entry = { ...interval, excerptId: excerpt.excerptId, codeIds };
      if (existing) existing.push(entry);
      else intervalsBySegment.set(segment.segmentId, [entry]);
    }
  }

  for (const [segmentId, intervals] of intervalsBySegment) {
    const coding = bySegmentId.get(segmentId);
    if (coding) coding.spans = spansFrom(intervals);
  }

  return { bySegmentId, unresolvedExcerptIds };
}

export function codingOf(states: SegmentDisplayStates, segmentId: Id): SegmentCoding {
  return states.bySegmentId.get(segmentId) ?? emptyCoding();
}

export function displayStateOf(
  states: SegmentDisplayStates,
  segmentId: Id,
): CodedDisplayState {
  return codingOf(states, segmentId).state;
}

/** Segment identifiers carrying a given state, in canonical order. */
export function segmentsWithState(
  states: SegmentDisplayStates,
  state: CodedDisplayState,
): Id[] {
  const matching: Id[] = [];
  for (const [segmentId, coding] of states.bySegmentId) {
    if (coding.state === state) matching.push(segmentId);
  }
  return matching;
}
