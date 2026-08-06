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
  'inactive' | 'coded' | 'coded-multiple'
>;

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
  return { state: 'inactive', excerptIds: [], codeIds: [], assignmentCount: 0 };
}

/**
 * By default an excerpt counts only if it carries a code assignment.
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

  for (const { excerpt, start, end } of resolvable) {
    const assignments = assignmentsByExcerpt.get(excerpt.excerptId) ?? [];

    for (let position = start; position <= end; position += 1) {
      const segmentId = resolved.segments[position].segmentId;
      const coding = bySegmentId.get(segmentId);
      if (!coding) continue;

      coding.excerptIds.push(excerpt.excerptId);
      coding.assignmentCount += assignments.length;
      for (const assignment of assignments) {
        if (!coding.codeIds.includes(assignment.codeId)) coding.codeIds.push(assignment.codeId);
      }

      // Two or more excerpts, not two or more codes. One excerpt carrying three
      // codes is `coded`; the state distinguishes overlapping ranges, because
      // that is what the visual and the spoken detail have to separate.
      coding.state = coding.excerptIds.length > 1 ? 'coded-multiple' : 'coded';
    }
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
