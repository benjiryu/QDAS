/**
 * Turning a pending assignment into records, and deciding where a save returns.
 *
 * Specification: docs/patterns/code-selection.md sections 8, 9, and 13.
 *
 * Pure. No React, no DOM, no announcements. The panel collects the pending
 * assignment; this builds what gets written and where the user lands.
 */

import { nextSegment } from './navigation';
import { positionOf } from './source';
import type { ResolvedSource } from './source';
import type { ExcerptRange } from './excerpt';
import type { SegmentDisplayStates } from './segmentDisplayState';
import type { Code, CodeAssignment, Excerpt, Id, Note } from './types';
// Type only: the domain reads no configuration, and the caller passes the value.
import type { PostCodingReturn } from '../config/flags';

export interface PendingAssignmentInput {
  range: ExcerptRange;
  /** In the order the coder checked them. */
  codeIds: Id[];
  /** Empty string when the coder wrote nothing. */
  noteText: string;
  uncertain: boolean;
}

export interface CodingIdentity {
  sourceId: Id;
  coderId: Id;
  codingRoundId: Id;
  codebookVersionId: Id;
}

export interface CodingRecords {
  excerpt: Excerpt;
  /** One per pending code, per section 8. */
  assignments: CodeAssignment[];
  /** Null when no note was drafted. One note per excerpt, per D-011. */
  note: Note | null;
}

/** Opaque identifiers for records created during a session. */
function newId(prefix: string): Id {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(16).slice(2, 12);
  return `${prefix}-${random}`;
}

/**
 * Builds everything a save writes.
 *
 * Returns null when there is nothing to write. Save is unavailable with an
 * empty pending assignment, per section 8, so a save with no codes is a caller
 * error rather than a silent no-op.
 *
 * The time and the identifiers are passed in rather than read here, so the same
 * inputs always produce the same records and a test can assert them exactly.
 */
export function buildCodingRecords(
  resolved: ResolvedSource,
  pending: PendingAssignmentInput,
  identity: CodingIdentity,
  codeById: Map<Id, Code>,
  now: string,
  ids: { excerptId?: Id; noteId?: Id } = {},
): CodingRecords | null {
  if (pending.codeIds.length === 0) return null;

  const endSegment = resolved.segments[positionOf(resolved, pending.range.endSegmentId) ?? -1];
  if (!endSegment) return null;

  const excerptId = ids.excerptId ?? newId('ex');

  const excerpt: Excerpt = {
    excerptId,
    sourceId: identity.sourceId,
    startSegmentId: pending.range.startSegmentId,
    endSegmentId: pending.range.endSegmentId,
    // Whole-segment bounds, always. Offsets are reserved so word-level
    // boundaries could arrive later without migrating stored excerpts. D-016.
    startOffset: 0,
    endOffset: endSegment.text.length,
    coderId: identity.coderId,
    codingRoundId: identity.codingRoundId,
    createdAt: now,
    updatedAt: now,
  };

  const assignments: CodeAssignment[] = pending.codeIds.map((codeId, index) => ({
    assignmentId: `as-${excerptId.slice(3)}-${index}`,
    excerptId,
    codeId,
    coderId: identity.coderId,
    codingRoundId: identity.codingRoundId,
    // Recorded so a later codebook change never retroactively alters what this
    // coder was working from. Section 13.
    codebookVersionId: identity.codebookVersionId,
    // An assignment against a code still awaiting approval is distinguishable
    // from one against an approved code. Section 13.
    status: codeById.get(codeId)?.status === 'provisional' ? 'provisional' : 'active',
    // D-021: set on every assignment written at this save. It does not affect
    // review ordering in v0.1.
    uncertaintyFlag: pending.uncertain,
    visibility: 'afterIndependentCoding',
    createdAt: now,
    updatedAt: now,
  }));

  const noteText = pending.noteText.trim();
  const note: Note | null =
    noteText === ''
      ? null
      : {
          noteId: ids.noteId ?? newId('nt'),
          authorId: identity.coderId,
          // Free text with no type in v0.1. Types belong to the notes page
          // specification, per D-020.
          noteType: null,
          noteText,
          visibility: 'afterIndependentCoding',
          status: 'active',
          createdAt: now,
          relatedExcerptId: excerptId,
          // Reserved and unwritten, per D-011 and section 13.
          relatedSourceId: null,
          relatedAssignmentId: null,
          relatedCodeId: null,
          relatedReviewItemId: null,
        };

  return { excerpt, assignments, note };
}

/**
 * Where a successful save leaves the reader, per the `postCodingReturn` flag.
 *
 * Returns a segment identifier. The caller makes it the active segment,
 * moves focus to its turn, and says so, because the user needs to know where
 * they are before deciding what to do next.
 */
export function postCodingReturnTarget(
  resolved: ResolvedSource,
  range: ExcerptRange,
  mode: PostCodingReturn,
  displayStates: SegmentDisplayStates,
): Id {
  switch (mode) {
    case 'excerptStartSegment':
      return range.startSegmentId;

    case 'excerptEndSegment':
      return range.endSegmentId;

    case 'nextSegment':
      return nextSegment(resolved, range.endSegmentId)?.segmentId ?? range.endSegmentId;

    case 'nextUncodedSegment': {
      // Walks forward from the end of what was just coded. Falling back to the
      // end boundary keeps the user inside the source rather than nowhere.
      let candidate = nextSegment(resolved, range.endSegmentId);
      while (candidate) {
        const state = displayStates.bySegmentId.get(candidate.segmentId)?.state ?? 'inactive';
        if (state === 'inactive') return candidate.segmentId;
        candidate = nextSegment(resolved, candidate.segmentId);
      }
      return range.endSegmentId;
    }
  }
}
