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
import type { CapturedRange, ExcerptRange } from './excerpt';
import type { SegmentDisplayStates } from './segmentDisplayState';
import type { Code, CodeAssignment, Excerpt, Id, Note } from './types';
// Type only: the domain reads no configuration, and the caller passes the value.
import type { PostCodingReturn } from '../config/flags';

export interface PendingAssignmentInput {
  range: CapturedRange;
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

  if (positionOf(resolved, pending.range.endSegmentId) === null) return null;

  const excerptId = ids.excerptId ?? newId('ex');

  const excerpt: Excerpt = {
    excerptId,
    sourceId: identity.sourceId,
    startSegmentId: pending.range.startSegmentId,
    endSegmentId: pending.range.endSegmentId,
    // Exact characters, per D-036 section 5. Nothing snaps to a sentence:
    // boundary variation between coders is data, and review compares at
    // sentence granularity without altering what was stored.
    startOffset: pending.range.startOffset,
    endOffset: pending.range.endOffset,
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

/* ---------- Reopening a saved excerpt, per D-030 ---------- */

export interface SavedExcerptSummary {
  excerptId: Id;
  range: CapturedRange;
  /** Assignments still standing. Superseded ones are not counted. */
  codeIds: Id[];
  /** One based, for identifying the excerpt by range in a chooser. */
  startSentence: number;
  endSentence: number;
}

/**
 * What a speaker turn carries, for the code rail and its programmatic twin.
 *
 * Specification: decision D-041.
 *
 * The rail and the turn's accessible description are both built from this, so
 * the glance channel and the announced one cannot disagree — which is the
 * condition that makes hiding the rail from assistive technology legitimate at
 * all.
 *
 * Codes are distinct, not per assignment: the description states the number of
 * pills the rail shows, and two excerpts sharing a code show one pill.
 *
 * Note presence is derived here and stored nowhere on the turn, per D-011.
 */
export interface TurnCoding {
  excerptCount: number;
  /** Distinct, in the order the turn's excerpts introduce them. */
  codeIds: Id[];
  hasNote: boolean;
}

export function turnCoding(
  resolved: ResolvedSource,
  turnId: Id,
  excerpts: Excerpt[],
  assignments: CodeAssignment[],
  notes: Note[] = [],
): TurnCoding {
  // The same derivation `excerpt.open` uses: each intersecting excerpt once,
  // superseded assignments dropped, and excerpts with nothing standing on them
  // left out entirely.
  const summaries = savedExcerptsInTurn(resolved, turnId, excerpts, assignments);

  const codeIds: Id[] = [];
  for (const summary of summaries) {
    for (const codeId of summary.codeIds) if (!codeIds.includes(codeId)) codeIds.push(codeId);
  }

  const excerptIds = new Set(summaries.map((summary) => summary.excerptId));

  return {
    excerptCount: summaries.length,
    codeIds,
    hasNote: notes.some(
      (note) => note.relatedExcerptId !== null && excerptIds.has(note.relatedExcerptId),
    ),
  };
}

/**
 * Saved excerpts a whole speaker turn intersects, per D-030 as revised by
 * D-038.
 *
 * A turn rather than a sentence, because focus is the only position the
 * application knows since D-038, and focus lands on turns. An excerpt that
 * covers any part of the turn is offered; the coder chooses when there are
 * several, exactly as before.
 */
export function savedExcerptsInTurn(
  resolved: ResolvedSource,
  turnId: Id,
  excerpts: Excerpt[],
  assignments: CodeAssignment[],
): SavedExcerptSummary[] {
  const turn = resolved.turns.find((candidate) => candidate.turn.turnId === turnId);
  if (!turn) return [];

  const seen = new Set<Id>();
  const summaries: SavedExcerptSummary[] = [];

  for (const segment of turn.segments) {
    for (const summary of savedExcerptsAt(resolved, segment.segmentId, excerpts, assignments)) {
      if (seen.has(summary.excerptId)) continue;
      seen.add(summary.excerptId);
      summaries.push(summary);
    }
  }

  return summaries;
}

/**
 * The saved excerpts covering a segment, in canonical order.
 *
 * Returns every match rather than a best one. Where a segment falls inside two
 * or more, per D-030 the command does not guess: the caller presents the list
 * and the coder chooses.
 */
export function savedExcerptsAt(
  resolved: ResolvedSource,
  segmentId: Id,
  excerpts: Excerpt[],
  assignments: CodeAssignment[],
): SavedExcerptSummary[] {
  const position = positionOf(resolved, segmentId);
  if (position === null) return [];

  return excerpts
    .filter((excerpt) => excerpt.sourceId === resolved.source.sourceId)
    .map((excerpt) => {
      const start = positionOf(resolved, excerpt.startSegmentId);
      const end = positionOf(resolved, excerpt.endSegmentId);
      if (start === null || end === null || position < start || position > end) return null;

      const codeIds = assignments
        .filter(
          (assignment) =>
            assignment.excerptId === excerpt.excerptId && assignment.status !== 'superseded',
        )
        .map((assignment) => assignment.codeId);

      // An excerpt with nothing standing on it is not coded, so it is not
      // something to reopen.
      if (codeIds.length === 0) return null;

      return {
        excerptId: excerpt.excerptId,
        range: {
          startSegmentId: excerpt.startSegmentId,
          endSegmentId: excerpt.endSegmentId,
          startOffset: excerpt.startOffset,
          endOffset: excerpt.endOffset,
        },
        codeIds,
        startSentence: start + 1,
        endSentence: end + 1,
      };
    })
    .filter((summary): summary is SavedExcerptSummary => summary !== null)
    .sort((a, b) => a.startSentence - b.startSentence || a.endSentence - b.endSentence);
}

export interface ReopenedSaveDiff {
  /** Codes checked that were not saved before. */
  added: CodeAssignment[];
  /** Assignments whose code was unchecked. Superseded, never deleted. */
  supersededAssignmentIds: Id[];
  /** Codes that were saved and are still checked. Untouched. */
  unchangedCodeIds: Id[];
}

/**
 * What a save writes when the excerpt was reopened, per D-030.
 *
 * Save writes the difference rather than creating a new set. A removed code
 * sets its assignment to `superseded` and the row is retained: the project
 * preserves before-and-after history rather than overwriting it, and a removed
 * assignment is evidence about how interpretation changed.
 */
export function diffReopenedAssignments(
  excerptId: Id,
  existing: CodeAssignment[],
  pendingCodeIds: Id[],
  identity: CodingIdentity,
  codeById: Map<Id, Code>,
  uncertain: boolean,
  now: string,
): ReopenedSaveDiff {
  const standing = existing.filter(
    (assignment) => assignment.excerptId === excerptId && assignment.status !== 'superseded',
  );
  const savedCodeIds = new Set(standing.map((assignment) => assignment.codeId));
  const pending = new Set(pendingCodeIds);

  const added = pendingCodeIds
    .filter((codeId) => !savedCodeIds.has(codeId))
    .map((codeId, index) => ({
      assignmentId: `as-${excerptId.slice(3)}-r${now.slice(11, 19).replace(/:/g, '')}-${index}`,
      excerptId,
      codeId,
      coderId: identity.coderId,
      codingRoundId: identity.codingRoundId,
      codebookVersionId: identity.codebookVersionId,
      status: (codeById.get(codeId)?.status === 'provisional'
        ? 'provisional'
        : 'active') as CodeAssignment['status'],
      uncertaintyFlag: uncertain,
      visibility: 'afterIndependentCoding' as const,
      createdAt: now,
      updatedAt: now,
    }));

  const supersededAssignmentIds = standing
    .filter((assignment) => !pending.has(assignment.codeId))
    .map((assignment) => assignment.assignmentId);

  const unchangedCodeIds = standing
    .filter((assignment) => pending.has(assignment.codeId))
    .map((assignment) => assignment.codeId);

  return { added, supersededAssignmentIds, unchangedCodeIds };
}

/**
 * Marks the assignments a coder has removed, per D-030.
 *
 * Removal supersedes rather than deletes: the project keeps before-and-after
 * history, and an assignment a coder took off an excerpt is evidence about how
 * interpretation changed. The record stays and its status changes.
 *
 * Shared rather than repeated, because two surfaces read it and they must agree
 * on what is still standing. The transcript decides from this which sentences
 * still draw as coded; the Coded data page decides from it which assignments a
 * count includes, which is its own acceptance criterion.
 */
export function applySupersession(
  assignments: CodeAssignment[],
  supersededIds: ReadonlySet<Id> | readonly Id[],
): CodeAssignment[] {
  const superseded = supersededIds instanceof Set ? supersededIds : new Set(supersededIds);
  if (superseded.size === 0) return assignments;

  return assignments.map((assignment) =>
    superseded.has(assignment.assignmentId)
      ? { ...assignment, status: 'superseded' as const }
      : assignment,
  );
}

/**
 * Whether an assignment still stands.
 *
 * Everything except superseded. Deliberately not `status === 'active'`: an
 * assignment of a provisional code is written `provisional`, and a coder's own
 * proposed code showing a count of zero while its excerpt sits in the results
 * below would be incoherent. destinations.md section 2 says "active assignments
 * only" and gives its reason as excluding superseded ones, which is what this
 * does. Raised in the task report.
 */
export function isStanding(assignment: CodeAssignment): boolean {
  return assignment.status !== 'superseded';
}
