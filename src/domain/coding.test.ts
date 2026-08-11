import { describe, expect, it } from 'vitest';
import { buildCodingRecords, postCodingReturnTarget, savedExcerptsInTurn } from './coding';
import { deriveSegmentDisplayStates } from './segmentDisplayState';
import { buildTestSource } from './testing/buildTestSource';
import type { Code, CodeAssignment, Excerpt, Id } from './types';

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
          endOffset: 0,
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
    endOffset: 0,
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
