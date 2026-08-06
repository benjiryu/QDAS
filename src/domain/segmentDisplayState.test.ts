import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../data/seed';
import {
  codingOf,
  deriveSegmentDisplayStates,
  displayStateOf,
  segmentsWithState,
} from './segmentDisplayState';
import { resolveSource } from './source';
import { buildTestSource, TEST_SOURCE_ID } from './testing/buildTestSource';
import type { CodeAssignment, Excerpt } from './types';

/** Specification: docs/patterns/transcript-segment.md section 3. */

/* ---------- Helpers for the built source ---------- */

const built = buildTestSource(); // s0..s9 across turns of 3, 1, 4, 2

function excerptOver(
  excerptId: string,
  startSegmentId: string,
  endSegmentId: string,
  createdAt = '2026-07-01T00:00:00.000Z',
): Excerpt {
  return {
    excerptId,
    sourceId: TEST_SOURCE_ID,
    startSegmentId,
    endSegmentId,
    startOffset: 0,
    endOffset: 0,
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    createdAt,
    updatedAt: createdAt,
  };
}

function assignment(excerptId: string, codeId: string): CodeAssignment {
  return {
    assignmentId: `as-${excerptId}-${codeId}`,
    excerptId,
    codeId,
    coderId: 'us-1',
    codingRoundId: 'rd-1',
    codebookVersionId: 'cv-1',
    status: 'active',
    uncertaintyFlag: false,
    visibility: 'team',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('coded and coded-multiple', () => {
  it('marks every segment of a coded excerpt and leaves the rest inactive', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's4', 's6')],
      codeAssignments: [assignment('ex-1', 'cd-a')],
    });

    expect(segmentsWithState(states, 'coded')).toEqual(['s4', 's5', 's6']);
    expect(displayStateOf(states, 's3')).toBe('inactive');
    expect(displayStateOf(states, 's7')).toBe('inactive');
    expect(states.bySegmentId.size).toBe(built.segments.length);
  });

  it('marks the shared segments of two excerpts coded-multiple, and the rest coded', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's2', 's5'), excerptOver('ex-2', 's4', 's7')],
      codeAssignments: [assignment('ex-1', 'cd-a'), assignment('ex-2', 'cd-b')],
    });

    expect(segmentsWithState(states, 'coded-multiple')).toEqual(['s4', 's5']);
    expect(segmentsWithState(states, 'coded')).toEqual(['s2', 's3', 's6', 's7']);
  });

  it('marks a single shared segment coded-multiple, with coded either side', () => {
    // The boundary case: one excerpt ends exactly where the next begins.
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's2', 's5'), excerptOver('ex-2', 's5', 's8')],
      codeAssignments: [assignment('ex-1', 'cd-a'), assignment('ex-2', 'cd-b')],
    });

    expect(segmentsWithState(states, 'coded-multiple')).toEqual(['s5']);
    expect(displayStateOf(states, 's4')).toBe('coded');
    expect(displayStateOf(states, 's6')).toBe('coded');
    expect(codingOf(states, 's5').excerptIds).toEqual(['ex-1', 'ex-2']);
  });

  it('does not mark abutting excerpts that share no segment', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's2', 's4'), excerptOver('ex-2', 's5', 's8')],
      codeAssignments: [assignment('ex-1', 'cd-a'), assignment('ex-2', 'cd-b')],
    });

    expect(segmentsWithState(states, 'coded-multiple')).toEqual([]);
    expect(segmentsWithState(states, 'coded')).toHaveLength(7);
  });

  it('marks a fully nested excerpt coded-multiple throughout the inner range', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-outer', 's1', 's8'), excerptOver('ex-inner', 's4', 's5')],
      codeAssignments: [assignment('ex-outer', 'cd-a'), assignment('ex-inner', 'cd-b')],
    });

    expect(segmentsWithState(states, 'coded-multiple')).toEqual(['s4', 's5']);
    expect(displayStateOf(states, 's1')).toBe('coded');
  });

  it('counts excerpts, not codes: one excerpt with three codes stays coded', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's4', 's5')],
      codeAssignments: [
        assignment('ex-1', 'cd-a'),
        assignment('ex-1', 'cd-b'),
        assignment('ex-1', 'cd-c'),
      ],
    });

    expect(displayStateOf(states, 's4')).toBe('coded');
    expect(codingOf(states, 's4').codeIds).toEqual(['cd-a', 'cd-b', 'cd-c']);
    expect(codingOf(states, 's4').assignmentCount).toBe(3);
  });

  it('marks a single-segment excerpt', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's7', 's7')],
      codeAssignments: [assignment('ex-1', 'cd-a')],
    });

    expect(segmentsWithState(states, 'coded')).toEqual(['s7']);
  });

  it('marks nothing when there are no excerpts', () => {
    const states = deriveSegmentDisplayStates(built, { excerpts: [], codeAssignments: [] });

    expect(segmentsWithState(states, 'inactive')).toHaveLength(built.segments.length);
    expect(states.unresolvedExcerptIds).toEqual([]);
  });
});

describe('what counts as coded', () => {
  it('ignores an excerpt carrying no code assignment', () => {
    // Save requires at least one code, so an excerpt without one is not saved
    // and coded work. excerpt-selection.md section 3.
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's4', 's6')],
      codeAssignments: [],
    });

    expect(segmentsWithState(states, 'coded')).toEqual([]);
  });

  it('does not let an uncoded excerpt contribute to coded-multiple', () => {
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [excerptOver('ex-1', 's2', 's5'), excerptOver('ex-2', 's4', 's7')],
      codeAssignments: [assignment('ex-1', 'cd-a')],
    });

    expect(segmentsWithState(states, 'coded-multiple')).toEqual([]);
    expect(segmentsWithState(states, 'coded')).toEqual(['s2', 's3', 's4', 's5']);
  });

  it('honours a caller filter, so who counts stays the caller\'s decision', () => {
    const mine = excerptOver('ex-mine', 's2', 's5');
    const theirs: Excerpt = { ...excerptOver('ex-theirs', 's4', 's7'), coderId: 'us-2' };

    const states = deriveSegmentDisplayStates(built, {
      excerpts: [mine, theirs],
      codeAssignments: [assignment('ex-mine', 'cd-a'), assignment('ex-theirs', 'cd-b')],
      includeExcerpt: (excerpt, assignments) =>
        assignments.length > 0 && excerpt.coderId === 'us-1',
    });

    expect(segmentsWithState(states, 'coded-multiple')).toEqual([]);
    expect(segmentsWithState(states, 'coded')).toEqual(['s2', 's3', 's4', 's5']);
  });

  it('ignores excerpts belonging to another source', () => {
    const foreign: Excerpt = { ...excerptOver('ex-other', 's4', 's6'), sourceId: 'src-other' };
    const states = deriveSegmentDisplayStates(built, {
      excerpts: [foreign],
      codeAssignments: [assignment('ex-other', 'cd-a')],
    });

    expect(segmentsWithState(states, 'coded')).toEqual([]);
    expect(states.unresolvedExcerptIds).toEqual([]);
  });

  it('reports an excerpt whose boundaries do not resolve instead of throwing', () => {
    const broken = excerptOver('ex-broken', 's4', 'gone');
    const crossed = excerptOver('ex-crossed', 's6', 's2');

    const states = deriveSegmentDisplayStates(built, {
      excerpts: [broken, crossed, excerptOver('ex-ok', 's8', 's9')],
      codeAssignments: [
        assignment('ex-broken', 'cd-a'),
        assignment('ex-crossed', 'cd-b'),
        assignment('ex-ok', 'cd-c'),
      ],
    });

    expect(states.unresolvedExcerptIds).toEqual(['ex-broken', 'ex-crossed']);
    expect(segmentsWithState(states, 'coded')).toEqual(['s8', 's9']);
  });
});

describe('ordering of excerpts on a segment', () => {
  it('orders by start position, then creation time, per excerpt-selection 8', () => {
    const later = excerptOver('ex-later', 's2', 's6', '2026-07-02T00:00:00.000Z');
    const earlierStart = excerptOver('ex-earlier', 's1', 's6', '2026-07-03T00:00:00.000Z');
    const sameStartOlder = excerptOver('ex-same', 's2', 's6', '2026-07-01T00:00:00.000Z');

    const states = deriveSegmentDisplayStates(built, {
      excerpts: [later, earlierStart, sameStartOlder],
      codeAssignments: [
        assignment('ex-later', 'cd-a'),
        assignment('ex-earlier', 'cd-b'),
        assignment('ex-same', 'cd-c'),
      ],
    });

    expect(codingOf(states, 's4').excerptIds).toEqual(['ex-earlier', 'ex-same', 'ex-later']);
  });
});

describe('against the overlapping pairs in the seed fixture', () => {
  const fixture = createSeedFixture();
  const resolved = resolveSource({
    source: fixture.sources[0],
    segments: fixture.segments,
    turns: fixture.turns,
    speakers: fixture.speakers,
  });
  const states = deriveSegmentDisplayStates(resolved, {
    excerpts: fixture.excerpts,
    codeAssignments: fixture.codeAssignments,
  });

  const excerptById = new Map(fixture.excerpts.map((excerpt) => [excerpt.excerptId, excerpt]));
  const position = new Map(
    fixture.segments.map((segment) => [segment.segmentId, segment.sequenceIndex]),
  );

  /** The segments two fixture excerpts have in common. */
  function sharedSegmentIds(firstId: string, secondId: string): string[] {
    const first = excerptById.get(firstId)!;
    const second = excerptById.get(secondId)!;
    const from = Math.max(
      position.get(first.startSegmentId)!,
      position.get(second.startSegmentId)!,
    );
    const to = Math.min(position.get(first.endSegmentId)!, position.get(second.endSegmentId)!);
    return resolved.segments.slice(from, to + 1).map((segment) => segment.segmentId);
  }

  it('resolves every stored excerpt of the source', () => {
    expect(states.unresolvedExcerptIds).toEqual([]);
    expect(states.bySegmentId.size).toBe(resolved.segments.length);
  });

  it('marks the overlap of each seeded pair coded-multiple', () => {
    const pairs: [string, string][] = [
      ['ex-9d27b014', 'ex-5c1908be'],
      ['ex-4b8e30da', 'ex-77e0ac53'],
      ['ex-d1750ae6', 'ex-6c40b8ff'],
      ['ex-c47b2059', 'ex-90e3f471'],
      ['ex-6a3d80e1', 'ex-08fc71a5'],
    ];

    for (const [first, second] of pairs) {
      const shared = sharedSegmentIds(first, second);
      expect(shared.length).toBeGreaterThan(0);

      for (const segmentId of shared) {
        expect(displayStateOf(states, segmentId)).toBe('coded-multiple');
        expect(codingOf(states, segmentId).excerptIds).toEqual(
          expect.arrayContaining([first, second]),
        );
      }
    }
  });

  it('marks the non-shared part of an overlapping pair coded, not coded-multiple', () => {
    const shared = new Set(sharedSegmentIds('ex-9d27b014', 'ex-5c1908be'));
    const dana = excerptById.get('ex-9d27b014')!;
    const danaOnly = resolved.segments
      .slice(position.get(dana.startSegmentId)!, position.get(dana.endSegmentId)! + 1)
      .filter((segment) => !shared.has(segment.segmentId));

    expect(danaOnly.length).toBeGreaterThan(0);
    for (const segment of danaOnly) {
      expect(displayStateOf(states, segment.segmentId)).toBe('coded');
    }
  });

  it('carries the codes of both excerpts on a shared segment', () => {
    const [segmentId] = sharedSegmentIds('ex-d1750ae6', 'ex-6c40b8ff');
    const coding = codingOf(states, segmentId);

    const expected = new Set(
      fixture.codeAssignments
        .filter((a) => a.excerptId === 'ex-d1750ae6' || a.excerptId === 'ex-6c40b8ff')
        .map((a) => a.codeId),
    );
    expect(new Set(coding.codeIds)).toEqual(expected);
  });

  it('leaves uncoded stretches of the transcript inactive', () => {
    const covered = new Set(
      fixture.excerpts
        .filter((excerpt) => excerpt.sourceId === resolved.source.sourceId)
        .flatMap((excerpt) =>
          resolved.segments
            .slice(
              position.get(excerpt.startSegmentId)!,
              position.get(excerpt.endSegmentId)! + 1,
            )
            .map((segment) => segment.segmentId),
        ),
    );

    const inactive = segmentsWithState(states, 'inactive');
    expect(inactive.length).toBe(resolved.segments.length - covered.size);
    for (const segmentId of inactive) expect(covered.has(segmentId)).toBe(false);
  });

  it('drops every coded-multiple when the caller counts one coder only', () => {
    // The R-4 case: if a participant should not see another coder's work during
    // independent coding, the caller filters and every overlap disappears,
    // because each seeded pair is one excerpt from each of two coders.
    const secondCoderId = fixture.users[1].userId;
    const oneCoder = deriveSegmentDisplayStates(resolved, {
      excerpts: fixture.excerpts,
      codeAssignments: fixture.codeAssignments,
      includeExcerpt: (excerpt, assignments) =>
        assignments.length > 0 && excerpt.coderId === secondCoderId,
    });

    expect(segmentsWithState(states, 'coded-multiple').length).toBeGreaterThan(0);
    expect(segmentsWithState(oneCoder, 'coded-multiple')).toEqual([]);
  });
});
