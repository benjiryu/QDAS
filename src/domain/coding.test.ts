import { describe, expect, it } from 'vitest';
import {
  buildCodingRecords,
  canReadNote,
  postCodingReturnTarget,
  savedExcerptsInTurn,
  turnCoding,
} from './coding';
import { deriveSegmentDisplayStates } from './segmentDisplayState';
import { buildTestSource } from './testing/buildTestSource';
import type { Code, CodeAssignment, Excerpt, Id, Note } from './types';

/** Specification: docs/patterns/code-selection.md sections 8, 9, 13. */

const resolved = buildTestSource(); // s0..s9 across turns of 3, 1, 4, 2

function code(codeId: Id, status: Code['status'] = 'approved'): Code {
  return {
    codeId,
    projectId: 'prj-test',
    parentCodeId: null,
    name: codeId,
    shortDefinition: 'short',
    fullDefinition: 'full',
    inclusionCriteria: 'in',
    exclusionCriteria: 'out',
    examples: [],
    synonyms: [],
    colorToken: 'token',
    status,
    canonicalOrderIndex: 0,
  };
}

const codeById = new Map<Id, Code>([
  ['cd-a', code('cd-a')],
  ['cd-b', code('cd-b')],
  ['cd-prov', code('cd-prov', 'provisional')],
]);

const identity = {
  sourceId: resolved.source.sourceId,
  coderId: 'us-1',
  codingRoundId: 'rd-1',
  codebookVersionId: 'cv-1',
};

const NOW = '2026-08-10T12:00:00.000Z';
const textOf = (segmentId: Id) =>
  resolved.segments.find((segment) => segment.segmentId === segmentId)!.text;
const range = { startSegmentId: 's4', endSegmentId: 's6', startOffset: 3, endOffset: 7 };

function build(overrides: Partial<Parameters<typeof buildCodingRecords>[1]> = {}) {
  return buildCodingRecords(
    resolved,
    { range, codeIds: ['cd-a', 'cd-b'], noteText: '', uncertain: false, ...overrides },
    identity,
    codeById,
    NOW,
    { excerptId: 'ex-fixed', noteId: 'nt-fixed' },
  );
}

describe('what a save writes', () => {
  it('writes one assignment per pending code, sharing the excerpt and round', () => {
    const records = build()!;

    expect(records.assignments).toHaveLength(2);
    for (const assignment of records.assignments) {
      expect(assignment.excerptId).toBe('ex-fixed');
      expect(assignment.coderId).toBe('us-1');
      expect(assignment.codingRoundId).toBe('rd-1');
      // Recorded so a later codebook change never alters what this coder saw.
      expect(assignment.codebookVersionId).toBe('cv-1');
    }
    expect(records.assignments.map((a) => a.codeId)).toEqual(['cd-a', 'cd-b']);
  });

  it('writes the exact characters captured, per D-036', () => {
    // Nothing snaps to a sentence. What was dragged is what is stored.
    const records = build()!;

    expect(records.excerpt.startSegmentId).toBe('s4');
    expect(records.excerpt.endSegmentId).toBe('s6');
    expect(records.excerpt.startOffset).toBe(3);
    expect(records.excerpt.endOffset).toBe(7);
  });

  it('sets the uncertainty flag on every assignment, per D-021', () => {
    const records = build({ uncertain: true })!;

    expect(records.assignments.every((assignment) => assignment.uncertaintyFlag)).toBe(true);
  });

  it('leaves the flag off when the assignment is not marked uncertain', () => {
    expect(build()!.assignments.every((assignment) => !assignment.uncertaintyFlag)).toBe(true);
  });

  it('marks an assignment against an unapproved code provisional, per section 13', () => {
    const records = build({ codeIds: ['cd-a', 'cd-prov'] })!;

    expect(records.assignments[0].status).toBe('active');
    expect(records.assignments[1].status).toBe('provisional');
  });

  it('writes one untyped note attached to the excerpt, per D-011 and D-020', () => {
    const records = build({ noteText: '  A thought.  ' })!;

    expect(records.note).toMatchObject({
      noteId: 'nt-fixed',
      noteText: 'A thought.',
      noteType: null,
      relatedExcerptId: 'ex-fixed',
      relatedSourceId: null,
      relatedAssignmentId: null,
      relatedCodeId: null,
    });
  });

  it('writes no note when nothing was drafted', () => {
    expect(build()!.note).toBeNull();
    expect(build({ noteText: '   ' })!.note).toBeNull();
  });

  it('writes nothing at all with an empty pending assignment', () => {
    expect(build({ codeIds: [] })).toBeNull();
  });
});

describe('where a save returns', () => {
  const empty = deriveSegmentDisplayStates(resolved, { excerpts: [], codeAssignments: [] });

  it('returns to the excerpt start by default', () => {
    expect(postCodingReturnTarget(resolved, range, 'excerptStartSegment', empty)).toBe('s4');
  });

  it('returns to the excerpt end when the flag says so', () => {
    expect(postCodingReturnTarget(resolved, range, 'excerptEndSegment', empty)).toBe('s6');
  });

  it('returns to the sentence after the excerpt', () => {
    expect(postCodingReturnTarget(resolved, range, 'nextSegment', empty)).toBe('s7');
  });

  it('stays inside the source when the excerpt ends it', () => {
    const atEnd = { startSegmentId: 's9', endSegmentId: 's9' };
    expect(postCodingReturnTarget(resolved, atEnd, 'nextSegment', empty)).toBe('s9');
  });

  it('skips past what is already coded to the next uncoded sentence', () => {
    const coded = deriveSegmentDisplayStates(resolved, {
      excerpts: [
        {
          excerptId: 'ex-1',
          sourceId: resolved.source.sourceId,
          startSegmentId: 's7',
          endSegmentId: 's8',
          startOffset: 0,
          // Whole segments. Zero would cover no characters of s8 at all.
          endOffset: textOf('s8').length,
          coderId: 'us-1',
          codingRoundId: 'rd-1',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      codeAssignments: [
        {
          assignmentId: 'as-1',
          excerptId: 'ex-1',
          codeId: 'cd-a',
          coderId: 'us-1',
          codingRoundId: 'rd-1',
          codebookVersionId: 'cv-1',
          status: 'active',
          uncertaintyFlag: false,
          visibility: 'team',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    expect(postCodingReturnTarget(resolved, range, 'nextUncodedSegment', coded)).toBe('s9');
  });
});

describe('saved excerpts a focused turn intersects, per D-038', () => {
  const excerptAt = (excerptId: Id, startSegmentId: Id, endSegmentId: Id): Excerpt => ({
    excerptId,
    sourceId: resolved.source.sourceId,
    startSegmentId,
    endSegmentId,
    startOffset: 0,
    endOffset: textOf(endSegmentId).length,
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    createdAt: NOW,
    updatedAt: NOW,
  });

  const assignmentFor = (excerptId: Id, assignmentId: Id): CodeAssignment => ({
    assignmentId,
    excerptId,
    codeId: 'cd-a',
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    codebookVersionId: 'cv-1',
    status: 'active',
    uncertaintyFlag: false,
    visibility: 'team',
    createdAt: NOW,
    updatedAt: NOW,
  });

  // t2 is s4..s7, so an excerpt on s6 starts three sentences into the turn.
  const turnId = resolved.turns[2].turn.turnId;

  it('finds an excerpt that starts partway through the turn', () => {
    // Checking only the turn's first sentence would miss this, and the coder
    // would be told there is nothing here to reopen while looking at a
    // highlight.
    const found = savedExcerptsInTurn(
      resolved,
      turnId,
      [excerptAt('ex-mid', 's6', 's6')],
      [assignmentFor('ex-mid', 'as-mid')],
    );

    expect(found.map((summary) => summary.excerptId)).toEqual(['ex-mid']);
  });

  it('finds an excerpt that merely overlaps the turn from outside it', () => {
    const found = savedExcerptsInTurn(
      resolved,
      turnId,
      [excerptAt('ex-across', 's2', 's5')],
      [assignmentFor('ex-across', 'as-across')],
    );

    expect(found.map((summary) => summary.excerptId)).toEqual(['ex-across']);
  });

  it('lists each overlapping excerpt once, in order, for the coder to choose', () => {
    const found = savedExcerptsInTurn(
      resolved,
      turnId,
      [excerptAt('ex-1', 's4', 's6'), excerptAt('ex-2', 's5', 's7')],
      [assignmentFor('ex-1', 'as-1'), assignmentFor('ex-2', 'as-2')],
    );

    expect(found.map((summary) => summary.excerptId)).toEqual(['ex-1', 'ex-2']);
  });

  it('finds nothing in a turn no excerpt reaches', () => {
    expect(
      savedExcerptsInTurn(
        resolved,
        resolved.turns[0].turn.turnId,
        [excerptAt('ex-mid', 's6', 's6')],
        [assignmentFor('ex-mid', 'as-mid')],
      ),
    ).toEqual([]);
  });

  it('finds nothing for a turn that is not in the source', () => {
    expect(savedExcerptsInTurn(resolved, 'nope', [], [])).toEqual([]);
  });
});

/**
 * What a turn carries, for the code rail and its programmatic twin. D-041.
 *
 * The two channels are built from this one derivation, so they cannot disagree.
 */
describe('turn coding, per D-041', () => {
  const NOW_ISO = NOW;

  const excerptAt = (excerptId: Id, startSegmentId: Id, endSegmentId: Id): Excerpt => ({
    excerptId,
    sourceId: resolved.source.sourceId,
    startSegmentId,
    endSegmentId,
    startOffset: 0,
    endOffset: textOf(endSegmentId).length,
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const assignmentFor = (excerptId: Id, assignmentId: Id, codeId: Id): CodeAssignment => ({
    assignmentId,
    excerptId,
    codeId,
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    codebookVersionId: 'cv-1',
    status: 'active',
    uncertaintyFlag: false,
    visibility: 'team',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const noteOn = (excerptId: Id | null) => ({
    noteId: 'nt-1',
    projectId: 'prj-test',
    authorId: 'us-1',
    noteType: null,
    noteText: 'A thought.',
    visibility: 'afterIndependentCoding' as const,
    status: 'active' as const,
    createdAt: NOW_ISO,
    relatedExcerptId: excerptId,
    relatedSourceId: null,
    relatedAssignmentId: null,
    relatedCodeId: null,
    relatedReviewItemId: null,
  });

  // t2 is s4..s7.
  const turnId = resolved.turns[2].turn.turnId;

  it('counts the excerpts a turn intersects', () => {
    const coding = turnCoding(
      resolved,
      turnId,
      [excerptAt('ex-1', 's4', 's5'), excerptAt('ex-2', 's6', 's7')],
      [assignmentFor('ex-1', 'as-1', 'cd-a'), assignmentFor('ex-2', 'as-2', 'cd-b')],
    );

    expect(coding.excerptCount).toBe(2);
    expect(coding.codeIds).toEqual(['cd-a', 'cd-b']);
  });

  it('counts a shared code once, matching the number of pills the rail shows', () => {
    // The description states the pill count. Two excerpts sharing a code show
    // one pill, so counting assignments would make the two channels disagree,
    // which is the thing D-041 forbids.
    const coding = turnCoding(
      resolved,
      turnId,
      [excerptAt('ex-1', 's4', 's5'), excerptAt('ex-2', 's6', 's7')],
      [assignmentFor('ex-1', 'as-1', 'cd-a'), assignmentFor('ex-2', 'as-2', 'cd-a')],
    );

    expect(coding.excerptCount).toBe(2);
    expect(coding.codeIds).toEqual(['cd-a']);
  });

  it('reports a note on any of the turn’s excerpts', () => {
    const excerpts = [excerptAt('ex-1', 's4', 's5')];
    const assignments = [assignmentFor('ex-1', 'as-1', 'cd-a')];

    expect(turnCoding(resolved, turnId, excerpts, assignments, [noteOn('ex-1')]).hasNote).toBe(true);
    expect(turnCoding(resolved, turnId, excerpts, assignments, [noteOn('ex-other')]).hasNote).toBe(
      false,
    );
    expect(turnCoding(resolved, turnId, excerpts, assignments, [noteOn(null)]).hasNote).toBe(false);
    expect(turnCoding(resolved, turnId, excerpts, assignments).hasNote).toBe(false);
  });

  it('ignores an excerpt with nothing standing on it', () => {
    const coding = turnCoding(resolved, turnId, [excerptAt('ex-1', 's4', 's5')], []);

    expect(coding).toEqual({ excerptCount: 0, codeIds: [], hasNote: false });
  });

  it('is empty for a turn no excerpt reaches, and for a turn that is not there', () => {
    const excerpts = [excerptAt('ex-1', 's4', 's5')];
    const assignments = [assignmentFor('ex-1', 'as-1', 'cd-a')];

    expect(turnCoding(resolved, resolved.turns[0].turn.turnId, excerpts, assignments).excerptCount)
      .toBe(0);
    expect(turnCoding(resolved, 'nope', excerpts, assignments).excerptCount).toBe(0);
  });
});

describe('who may read a note, per D-067 and R-4', () => {
  const note = (overrides: Partial<Note> = {}): Note => ({
    noteId: 'nt-1',
    authorId: 'us-mine',
    noteType: null,
    noteText: 'A thought.',
    visibility: 'afterIndependentCoding',
    status: 'active',
    createdAt: '2026-06-01T00:00:00.000Z',
    relatedExcerptId: 'ex-1',
    relatedSourceId: null,
    relatedAssignmentId: null,
    relatedCodeId: null,
    relatedReviewItemId: null,
    ...overrides,
  });

  const coding = { viewerId: 'us-mine', identitiesVisible: false };
  const review = { viewerId: 'us-mine', identitiesVisible: true };

  it('lets an author read their own note', () => {
    expect(canReadNote(note(), coding)).toBe(true);
    expect(canReadNote(note(), review)).toBe(true);
  });

  it('lets nobody read a deleted one, its author included', () => {
    /*
      The rule that makes a disclosure safe to build. Deletion is written as a
      status rather than a removal, so this is the only thing between a deleted
      note and a surface that still reveals its text.
    */
    expect(canReadNote(note({ status: 'deleted' }), coding)).toBe(false);
    expect(canReadNote(note({ status: 'deleted' }), review)).toBe(false);
  });

  it('hides another coder’s note while identities are hidden', () => {
    // R-4, and the reason this page shows own work during independent coding.
    expect(canReadNote(note({ authorId: 'us-theirs' }), coding)).toBe(false);
  });

  it('reveals another coder’s note once identities are visible', () => {
    // The project-wide view, where the veil has lifted either because the
    // viewer is the lead or because independent coding has closed.
    expect(canReadNote(note({ authorId: 'us-theirs' }), review)).toBe(true);
  });

  it('keeps a private note private, even there', () => {
    // `visibility` has been on the record since v0.1 and nothing read it until
    // now. Private means the author, and no phase changes that.
    expect(canReadNote(note({ authorId: 'us-theirs', visibility: 'private' }), review)).toBe(false);
    expect(canReadNote(note({ visibility: 'private' }), coding)).toBe(true);
  });
});
