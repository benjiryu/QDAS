/**
 * Excerpts, code assignments, and notes already in the project when a
 * participant arrives. Synthetic.
 *
 * Specification: docs/testing/seed-data.md section 4.
 *
 * Nineteen excerpts belong to the simulated second coder. Six more belong to a
 * third coder, so that the overlapping pairs the review phase compares have two
 * different authors rather than one coder overlapping themselves. Section 4
 * asks for 15+ from a second coder and 4+ overlapping pairs; it does not say
 * whether the overlaps are within or across coders, and across is the case
 * slice 3 actually compares. Flagged rather than assumed.
 *
 * Segment identifiers are literals produced by scripts/convert-transcript.mjs.
 * They are opaque: the position comments beside them are for a human reading
 * this file, and nothing in the code derives position from an identifier.
 *
 * Per R-4, everything here is visible only after independent coding closes, so
 * a participant does not see another coder's work while doing their own.
 */

import type { CodeAssignment, Excerpt, Note } from '../../domain/types';
import { segmentsA, segmentsB, sourceA, sourceB } from './transcripts.generated';
import {
  CODEBOOK_VERSION_ID,
  CODING_ROUND_ID,
  CURRENT_CODER_ID,
  SECOND_CODER_ID,
  THIRD_CODER_ID,
} from './project';

const segmentIndex = new Map(
  [...segmentsA, ...segmentsB].map((segment) => [segment.segmentId, segment]),
);

interface ExcerptSpec {
  excerptId: string;
  sourceId: string;
  startSegmentId: string;
  endSegmentId: string;
  coderId: string;
  createdAt: string;
  codeIds: string[];
  uncertain?: boolean;
  note?: string;
}

/**
 * Builds an excerpt and fails loudly on a mistyped identifier or a reversed
 * range. A silently broken fixture surfaces as an unreproducible bug during a
 * session, which is the worst place to find it.
 */
function build(spec: ExcerptSpec): Excerpt {
  const start = segmentIndex.get(spec.startSegmentId);
  const end = segmentIndex.get(spec.endSegmentId);

  if (!start) throw new Error(`Seed excerpt ${spec.excerptId}: unknown start segment.`);
  if (!end) throw new Error(`Seed excerpt ${spec.excerptId}: unknown end segment.`);
  if (start.sourceId !== spec.sourceId || end.sourceId !== spec.sourceId) {
    throw new Error(`Seed excerpt ${spec.excerptId}: segments are not in the stated source.`);
  }
  if (start.sequenceIndex > end.sequenceIndex) {
    throw new Error(`Seed excerpt ${spec.excerptId}: boundaries cross.`);
  }

  return {
    excerptId: spec.excerptId,
    sourceId: spec.sourceId,
    startSegmentId: spec.startSegmentId,
    endSegmentId: spec.endSegmentId,
    // Whole-segment bounds. Offsets are reserved and never partial in v0.1.
    // Domain model, and decision D-016.
    startOffset: 0,
    endOffset: end.text.length,
    coderId: spec.coderId,
    codingRoundId: CODING_ROUND_ID,
    createdAt: spec.createdAt,
    updatedAt: spec.createdAt,
  };
}

const A = sourceA.sourceId;
const B = sourceB.sourceId;

/**
 * Five pairs overlap with differing boundaries, marked below. Each pair is two
 * coders reading the same passage and disagreeing about where it starts or
 * ends, which is the comparison case review exists for.
 */
const specs: ExcerptSpec[] = [
  /* ---------- Second coder, source A ---------- */
  {
    excerptId: 'ex-0a41f7c3',
    sourceId: A,
    startSegmentId: 'sg-cc95c65803', // turn 2, sentence 7
    endSegmentId: 'sg-b3b08fbc4d', // turn 2, sentence 9
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-14T15:02:00.000Z',
    codeIds: ['cd-71fe0d'],
  },
  {
    // Overlap pair 1 with ex-5c1908be.
    excerptId: 'ex-9d27b014',
    sourceId: A,
    startSegmentId: 'sg-d6f1e82ee8', // turn 8, sentence 1
    endSegmentId: 'sg-d9dc06ab1c', // turn 8, sentence 4
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-14T15:11:00.000Z',
    codeIds: ['cd-d20f96'],
    note: 'The February and July contrast reads as the core of this whole section.',
  },
  {
    // Overlap pair 2 with ex-77e0ac53.
    excerptId: 'ex-4b8e30da',
    sourceId: A,
    startSegmentId: 'sg-1d14752e5f', // turn 10, sentence 3
    endSegmentId: 'sg-bf3e03a28d', // turn 10, sentence 6
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-14T15:19:00.000Z',
    codeIds: ['cd-90d4c1'],
  },
  {
    excerptId: 'ex-e30f5a92',
    sourceId: A,
    startSegmentId: 'sg-e46ffbb0c3', // turn 12, sentence 1
    endSegmentId: 'sg-84b06b65cf', // turn 12, sentence 6
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-14T15:26:00.000Z',
    codeIds: ['cd-08fd25', 'cd-90d4c1'],
  },
  {
    excerptId: 'ex-1f6cb748',
    sourceId: A,
    startSegmentId: 'sg-3ffeb41624', // turn 14, sentence 1
    endSegmentId: 'sg-f42e3d094b', // turn 14, sentence 3
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-15T09:41:00.000Z',
    codeIds: ['cd-df6182', 'cd-49a0b7'],
  },
  {
    excerptId: 'ex-72a05e1d',
    sourceId: A,
    startSegmentId: 'sg-5a26211586', // turn 16, sentence 4
    endSegmentId: 'sg-57c7b92cc5', // turn 16, sentence 8
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-15T09:52:00.000Z',
    codeIds: ['cd-86470b', 'cd-df6182'],
    note: 'Attendance shaping the rules is stated more directly here than anywhere else.',
  },
  {
    excerptId: 'ex-b8134c60',
    sourceId: A,
    startSegmentId: 'sg-11e8dac3e8', // turn 18, sentence 1
    endSegmentId: 'sg-fc986034f9', // turn 18, sentence 5
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-15T10:03:00.000Z',
    codeIds: ['cd-5c93df', 'cd-df6182'],
    uncertain: true,
  },
  {
    excerptId: 'ex-3e97d251',
    sourceId: A,
    startSegmentId: 'sg-e8aebe3a15', // turn 18, sentence 6
    endSegmentId: 'sg-d5d1ce6030', // turn 18, sentence 9
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-15T10:07:00.000Z',
    codeIds: ['cd-1d70e8', 'cd-63d802'],
  },
  {
    // Overlap pair 3 with ex-6c40b8ff.
    excerptId: 'ex-d1750ae6',
    sourceId: A,
    startSegmentId: 'sg-960a5e0ee6', // turn 20, sentence 1
    endSegmentId: 'sg-5cde9632e6', // turn 20, sentence 4
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-15T10:18:00.000Z',
    codeIds: ['cd-97af51', 'cd-49a0b7'],
  },
  {
    excerptId: 'ex-5806e4b2',
    sourceId: A,
    startSegmentId: 'sg-38e60a68ff', // turn 22, sentence 1
    endSegmentId: 'sg-71e0426d0a', // turn 22, sentence 5
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-15T10:29:00.000Z',
    codeIds: ['cd-b0e341'],
  },
  {
    excerptId: 'ex-af2916d7',
    sourceId: A,
    startSegmentId: 'sg-8f7a1a4111', // turn 24, sentence 1
    endSegmentId: 'sg-ade06cac2f', // turn 24, sentence 4
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-16T14:02:00.000Z',
    codeIds: ['cd-a15d38'],
  },
  {
    // Overlap pair 4 with ex-90e3f471.
    excerptId: 'ex-c47b2059',
    sourceId: A,
    startSegmentId: 'sg-21b849bcfc', // turn 26, sentence 4
    endSegmentId: 'sg-c61894fc3f', // turn 26, sentence 7
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-16T14:14:00.000Z',
    codeIds: ['cd-6f7204'],
  },
  {
    excerptId: 'ex-2be80c34',
    sourceId: A,
    startSegmentId: 'sg-a6878a3ee1', // turn 28, sentence 3
    endSegmentId: 'sg-e8b83e709c', // turn 28, sentence 8
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-16T14:25:00.000Z',
    codeIds: ['cd-3ca628', 'cd-8a3b96'],
    note: 'This is the passage I would bring to the review meeting first.',
  },
  {
    // Overlap pair 5 with ex-08fc71a5.
    excerptId: 'ex-6a3d80e1',
    sourceId: A,
    startSegmentId: 'sg-713e62305a', // turn 30, sentence 1
    endSegmentId: 'sg-1273dd6c2a', // turn 30, sentence 4
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-16T14:38:00.000Z',
    codeIds: ['cd-f8126e', 'cd-2c9407'],
  },
  {
    excerptId: 'ex-fd5017c9',
    sourceId: A,
    startSegmentId: 'sg-4cdb552e83', // turn 32, sentence 1
    endSegmentId: 'sg-cc7da55594', // turn 32, sentence 5
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-16T14:49:00.000Z',
    codeIds: ['cd-0e8534', 'cd-e2740c'],
    uncertain: true,
    note: 'Unsure whether turnover is the right second code or whether this is only allocation.',
  },
  {
    excerptId: 'ex-84c1e0bd',
    sourceId: A,
    startSegmentId: 'sg-bf835c21c2', // turn 60, sentence 1
    endSegmentId: 'sg-4c403cc523', // turn 60, sentence 4
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-17T11:05:00.000Z',
    codeIds: ['cd-fa2916', 'cd-4826bd'],
  },
  {
    excerptId: 'ex-19b7fa02',
    sourceId: A,
    startSegmentId: 'sg-e62eb5e0f0', // turn 70, sentence 1
    endSegmentId: 'sg-368a59da1f', // turn 70, sentence 5
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-17T11:17:00.000Z',
    codeIds: ['cd-cb7e19', 'cd-63d802'],
  },

  /* ---------- Second coder, source B ---------- */
  {
    excerptId: 'ex-7c0e5b83',
    sourceId: B,
    startSegmentId: 'sg-100f2e6ca3', // turn 10, sentence 2
    endSegmentId: 'sg-2589280114', // turn 10, sentence 6
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-18T09:31:00.000Z',
    codeIds: ['cd-cd0f75', 'cd-8a3b96'],
  },
  {
    excerptId: 'ex-b52f30e7',
    sourceId: B,
    startSegmentId: 'sg-14d1c6fb30', // turn 18, sentence 2
    endSegmentId: 'sg-6c36969a77', // turn 18, sentence 5
    coderId: SECOND_CODER_ID,
    createdAt: '2026-06-18T09:44:00.000Z',
    codeIds: ['cd-63d802', 'cd-8a3b96'],
  },

  /* ---------- Third coder. Each overlaps a second-coder excerpt ---------- */
  {
    // Overlap pair 1. Starts later and runs further than ex-9d27b014.
    excerptId: 'ex-5c1908be',
    sourceId: A,
    startSegmentId: 'sg-9807c07bb3', // turn 8, sentence 3
    endSegmentId: 'sg-dc8c135b20', // turn 8, sentence 7
    coderId: THIRD_CODER_ID,
    createdAt: '2026-06-20T13:12:00.000Z',
    codeIds: ['cd-d20f96', 'cd-7ef653'],
  },
  {
    // Overlap pair 2. Starts earlier and ends earlier than ex-4b8e30da.
    excerptId: 'ex-77e0ac53',
    sourceId: A,
    startSegmentId: 'sg-7deaccd57b', // turn 10, sentence 1
    endSegmentId: 'sg-bc52fedc10', // turn 10, sentence 5
    coderId: THIRD_CODER_ID,
    createdAt: '2026-06-20T13:20:00.000Z',
    codeIds: ['cd-c3082f'],
  },
  {
    // Overlap pair 3. Starts later and runs further than ex-d1750ae6.
    excerptId: 'ex-6c40b8ff',
    sourceId: A,
    startSegmentId: 'sg-424af89f24', // turn 20, sentence 3
    endSegmentId: 'sg-b546ed374f', // turn 20, sentence 7
    coderId: THIRD_CODER_ID,
    createdAt: '2026-06-20T13:29:00.000Z',
    codeIds: ['cd-49a0b7', 'cd-5db8c2'],
    note: 'Read this as being about the schedule rather than the plumbing.',
  },
  {
    // Overlap pair 4. Starts later and runs further than ex-c47b2059.
    excerptId: 'ex-90e3f471',
    sourceId: A,
    startSegmentId: 'sg-0ff131559d', // turn 26, sentence 6
    endSegmentId: 'sg-6837ac6ce5', // turn 26, sentence 10
    coderId: THIRD_CODER_ID,
    createdAt: '2026-06-20T13:41:00.000Z',
    codeIds: ['cd-6f7204', 'cd-3ca628'],
  },
  {
    // Overlap pair 5. Starts later and runs further than ex-6a3d80e1.
    excerptId: 'ex-08fc71a5',
    sourceId: A,
    startSegmentId: 'sg-8f0435e3e1', // turn 30, sentence 3
    endSegmentId: 'sg-5883b40bf7', // turn 30, sentence 8
    coderId: THIRD_CODER_ID,
    createdAt: '2026-06-20T13:52:00.000Z',
    codeIds: ['cd-2c9407', 'cd-0e8534'],
    uncertain: true,
  },
  {
    excerptId: 'ex-31da6047',
    sourceId: B,
    startSegmentId: 'sg-16fdf085d8', // turn 16, sentence 1
    endSegmentId: 'sg-5106763354', // turn 16, sentence 5
    coderId: THIRD_CODER_ID,
    createdAt: '2026-06-20T14:03:00.000Z',
    codeIds: ['cd-19c7e6', 'cd-4826bd'],
  },
];

export const excerpts: Excerpt[] = specs.map(build);

export const codeAssignments: CodeAssignment[] = specs.flatMap((spec) =>
  spec.codeIds.map((codeId, index) => ({
    assignmentId: `as-${spec.excerptId.slice(3)}-${index}`,
    excerptId: spec.excerptId,
    codeId,
    coderId: spec.coderId,
    codingRoundId: CODING_ROUND_ID,
    codebookVersionId: CODEBOOK_VERSION_ID,
    status: 'active' as const,
    uncertaintyFlag: spec.uncertain ?? false,
    // R-4: another coder's work stays hidden until independent coding closes.
    visibility: 'afterIndependentCoding' as const,
    createdAt: spec.createdAt,
    updatedAt: spec.createdAt,
  })),
);

const excerptNotes: Note[] = specs
  .filter((spec) => spec.note !== undefined)
  .map((spec) => ({
    noteId: `nt-${spec.excerptId.slice(3)}`,
    authorId: spec.coderId,
    // Free text, no type, per D-020.
    noteType: null,
    noteText: spec.note as string,
    visibility: 'afterIndependentCoding' as const,
    status: 'active',
    createdAt: spec.createdAt,
    relatedExcerptId: spec.excerptId,
    relatedSourceId: null,
    relatedAssignmentId: null,
    relatedCodeId: null,
    relatedReviewItemId: null,
  }));

/**
 * One file-wide note and one project note, per D-058.
 *
 * Scope is derived rather than stored: `relatedExcerptId` set means excerpt,
 * else `relatedSourceId` means the source, else the project. So these are
 * ordinary notes distinguished only by which relation they carry.
 *
 * The current coder's, deliberately. Every other seeded note belongs to the
 * second coder, and R-4 shows a participant only their own during independent
 * coding — authored by anyone else these would be invisible and the fixture
 * would demonstrate nothing.
 *
 * The excerpt scope has no own-coder example here, so a fresh session shows
 * these two and no excerpt note. Giving it one means seeding an excerpt for the
 * current coder, which moves Coded data's counts and its empty state; that is a
 * change to make deliberately rather than as a side effect of this one.
 */
const scopedNotes: Note[] = [
  {
    noteId: 'nt-file-a1',
    authorId: CURRENT_CODER_ID,
    noteType: null,
    noteText:
      'This interview keeps returning to the waiting list. Worth checking whether the second transcript does the same before deciding it is a theme.',
    visibility: 'afterIndependentCoding',
    status: 'active',
    createdAt: '2026-02-11T09:12:00.000Z',
    relatedExcerptId: null,
    relatedSourceId: sourceA.sourceId,
    relatedAssignmentId: null,
    relatedCodeId: null,
    relatedReviewItemId: null,
  },
  {
    noteId: 'nt-project-a1',
    authorId: CURRENT_CODER_ID,
    noteType: null,
    noteText:
      'Both interviews describe learning that happens beside someone rather than in a workshop. If that holds across the set it may want a code of its own.',
    visibility: 'afterIndependentCoding',
    status: 'active',
    createdAt: '2026-02-11T09:20:00.000Z',
    relatedExcerptId: null,
    relatedSourceId: null,
    relatedAssignmentId: null,
    relatedCodeId: null,
    relatedReviewItemId: null,
  },
];

export const notes: Note[] = [...excerptNotes, ...scopedNotes];
