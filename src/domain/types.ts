/**
 * Domain entities. Single source for names and shapes.
 *
 * Specification: docs/domain-model.md
 *
 * Nothing in src/domain imports from the presentation layer.
 */

export type Id = string;

export type UserRole = 'coder' | 'reviewer' | 'qualitativeLead';
export type ProjectPhase =
  | 'setup'
  | 'pilot'
  | 'independentCoding'
  | 'review'
  | 'reflexivity'
  | 'recoding'
  | 'closed';
export type CodeStatus = 'approved' | 'provisional' | 'deprecated' | 'merged';
export type AssignmentStatus = 'active' | 'provisional' | 'superseded';
export type Visibility = 'private' | 'team' | 'administrator' | 'afterIndependentCoding';

export interface Project {
  projectId: Id;
  name: string;
  description: string;
  activeCodebookVersionId: Id;
  activeCodingRoundId: Id;
  phase: ProjectPhase;
}

export interface User {
  userId: Id;
  displayName: string;
  /**
   * What this person is called on screen where a name would not help: the
   * sidebar's title block, per the D-059 addendum, reads it rather than
   * hardcoding a string.
   *
   * Distinct from `role`, which is the permission the application checks, and
   * from `displayName`, which is who they are. A qualitative lead and a coder
   * can both be "AFB Researcher".
   */
  title: string;
  role: UserRole;
}

export interface Source {
  sourceId: Id;
  projectId: Id;
  title: string;
  kind: 'transcript' | 'survey';
  speakerCount: number;
  segmentCount: number;
  durationMs: number | null;
}

export interface Speaker {
  speakerId: Id;
  sourceId: Id;
  label: string;
}

export interface SpeakerTurn {
  turnId: Id;
  sourceId: Id;
  speakerId: Id;
  sequenceIndex: number;
  segmentIds: Id[];
}

/**
 * segmentId is assigned at conversion and never recomputed. Re-running
 * conversion on unchanged input must produce identical identifiers, or every
 * excerpt from a prior session breaks.
 */
export interface TranscriptSegment {
  segmentId: Id;
  sourceId: Id;
  turnId: Id;
  speakerId: Id;
  sequenceIndex: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  text: string;
}

/**
 * Boundaries, never copied text. Copied text detaches from the source and
 * cannot be re-expanded, re-read in context, or compared against another
 * coder's differently bounded range.
 *
 * Offsets are reserved. v0.1 always writes whole-segment bounds. See T-2.
 */
export interface Excerpt {
  excerptId: Id;
  sourceId: Id;
  startSegmentId: Id;
  endSegmentId: Id;
  startOffset: number;
  endOffset: number;
  coderId: Id;
  codingRoundId: Id;
  createdAt: string;
  updatedAt: string;
}

/**
 * canonicalOrderIndex is stored, not computed at render time, so that renaming
 * a code never moves it. See decision D-004 and the predictability finding.
 */
export interface Code {
  codeId: Id;
  projectId: Id;
  parentCodeId: Id | null;
  name: string;
  shortDefinition: string;
  fullDefinition: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  examples: string[];
  synonyms: string[];
  colorToken: string;
  status: CodeStatus;
  canonicalOrderIndex: number;
}

export interface CodebookVersion {
  codebookVersionId: Id;
  projectId: Id;
  versionLabel: string;
  createdAt: string;
  codeIds: Id[];
}

/**
 * codebookVersionId is recorded so a later codebook change never retroactively
 * alters what a coder was working from.
 */
export interface CodeAssignment {
  assignmentId: Id;
  excerptId: Id;
  codeId: Id;
  coderId: Id;
  codingRoundId: Id;
  codebookVersionId: Id;
  status: AssignmentStatus;
  uncertaintyFlag: boolean;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per D-011, a coding note attaches to an excerpt and a file-wide note attaches
 * to a source. A note is never stored against a speaker turn; a turn's note
 * indicator is derived from the excerpts it contains.
 *
 * relatedAssignmentId, relatedCodeId, relatedReviewItemId reserved.
 */
export interface Note {
  noteId: Id;
  authorId: Id;
  noteType: string | null;
  noteText: string;
  visibility: Visibility;
  status: string;
  createdAt: string;
  relatedExcerptId: Id | null;
  /** File-wide notes. Defined now, surface out of scope for v0.1. See N-4. */
  relatedSourceId: Id | null;
  relatedAssignmentId: Id | null;
  relatedCodeId: Id | null;
  relatedReviewItemId: Id | null;
}

export interface CodingRound {
  codingRoundId: Id;
  projectId: Id;
  label: string;
  phase: ProjectPhase;
  opensAt: string | null;
  closesAt: string | null;
}

export interface WorkAssignment {
  assignmentId: Id;
  projectId: Id;
  userId: Id;
  sourceId: Id;
  codingRoundId: Id;
  requiredCoderCount: number;
  status: string;
}

export interface ReviewItem {
  reviewItemId: Id;
  sourceId: Id;
  startSegmentId: Id;
  endSegmentId: Id;
  excerptIds: Id[];
  status: string;
  discussionStatus: string;
}

export interface Resolution {
  resolutionId: Id;
  reviewItemId: Id;
  decision: string;
  rationale: string;
  participantIds: Id[];
  decidedAt: string;
  affectedCodeIds: Id[];
  affectedExcerptIds: Id[];
  recodingRequired: boolean;
}

export interface SourcePosition {
  userId: Id;
  sourceId: Id;
  activeSegmentId: Id;
  updatedAt: string;
}

/* ---------- Workflow state, not persisted ---------- */

/** docs/patterns/excerpt-selection.md section 2. */
export type ExcerptSelectionState =
  | 'idle'
  | 'anchored'
  | 'adjusting'
  | 'confirmed'
  | 'saved';

/** docs/patterns/transcript-segment.md section 3. Orthogonal to `active`. */
export type SegmentDisplayState =
  | 'inactive'
  | 'in-pending-excerpt'
  | 'in-confirmed-excerpt'
  | 'coded'
  | 'coded-multiple'
  /**
   * Inside a saved excerpt that carries a note and no standing code.
   *
   * Its own state rather than `coded`, because this is the sentence-granularity
   * fact R-1 compares at: calling an uncoded sentence coded would put a
   * falsehood into the thing the comparison reads.
   */
  | 'noted';

export interface PendingAssignment {
  excerptId: Id | null;
  codeIds: Id[];
  draftNoteText: string;
  uncertaintyFlag: boolean;
}
