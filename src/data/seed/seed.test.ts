import { describe, expect, it } from 'vitest';
import { createSeedFixture } from './index';

/**
 * The fixture is checked against the required shape in
 * docs/testing/seed-data.md section 4, one test per row of that table.
 *
 * These are not tests of the code that reads the fixture. They exist because a
 * fixture that quietly falls below the required scale invalidates every finding
 * taken against it, and nothing else in the repository would notice.
 */

const fixture = createSeedFixture();
const transcript = fixture.sources[0];

function segmentsOf(sourceId: string) {
  return fixture.segments.filter((segment) => segment.sourceId === sourceId);
}

function turnsOf(sourceId: string) {
  return fixture.turns.filter((turn) => turn.sourceId === sourceId);
}

describe('transcript shape', () => {
  it('carries 300+ sentences in the primary source', () => {
    expect(segmentsOf(transcript.sourceId).length).toBeGreaterThanOrEqual(300);
  });

  it('carries 60+ speaker turns of varied length', () => {
    const lengths = turnsOf(transcript.sourceId).map((turn) => turn.segmentIds.length);
    expect(lengths.length).toBeGreaterThanOrEqual(60);
    expect(new Set(lengths).size).toBeGreaterThan(3);
  });

  it('has at least three turns of 8 or more sentences', () => {
    const long = turnsOf(transcript.sourceId).filter((turn) => turn.segmentIds.length >= 8);
    expect(long.length).toBeGreaterThanOrEqual(3);
  });

  it('has two speakers per source', () => {
    for (const source of fixture.sources) {
      expect(source.speakerCount).toBe(2);
      expect(fixture.speakers.filter((s) => s.sourceId === source.sourceId)).toHaveLength(2);
    }
  });

  it('has 2+ sources in the project', () => {
    expect(fixture.sources.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a segment count matching the segments it has', () => {
    for (const source of fixture.sources) {
      expect(source.segmentCount).toBe(segmentsOf(source.sourceId).length);
    }
  });

  it('orders segments and turns without gaps', () => {
    for (const source of fixture.sources) {
      const segments = segmentsOf(source.sourceId);
      segments.forEach((segment, index) => expect(segment.sequenceIndex).toBe(index));
      turnsOf(source.sourceId).forEach((turn, index) => expect(turn.sequenceIndex).toBe(index));
    }
  });

  it('accounts for every segment in exactly one turn', () => {
    const inTurns = fixture.turns.flatMap((turn) => turn.segmentIds);
    expect(new Set(inTurns).size).toBe(inTurns.length);
    expect(new Set(inTurns)).toEqual(new Set(fixture.segments.map((s) => s.segmentId)));
  });

  it('advances timestamps monotonically within a source', () => {
    for (const source of fixture.sources) {
      const segments = segmentsOf(source.sourceId);
      for (let index = 1; index < segments.length; index += 1) {
        expect(segments[index].startTimeMs ?? 0).toBeGreaterThanOrEqual(
          segments[index - 1].startTimeMs ?? 0,
        );
      }
    }
  });
});

describe('codebook shape', () => {
  it('has 30+ codes', () => {
    expect(fixture.codes.length).toBeGreaterThanOrEqual(30);
  });

  it('is three levels deep, parent through grandchild', () => {
    const byId = new Map(fixture.codes.map((code) => [code.codeId, code]));
    const depthOf = (codeId: string): number => {
      let depth = 1;
      let current = byId.get(codeId);
      while (current?.parentCodeId) {
        depth += 1;
        current = byId.get(current.parentCodeId);
      }
      return depth;
    };

    const depths = fixture.codes.map((code) => depthOf(code.codeId));
    expect(Math.max(...depths)).toBe(3);
    expect(new Set(depths)).toEqual(new Set([1, 2, 3]));
  });

  it('resolves every parent reference', () => {
    const ids = new Set(fixture.codes.map((code) => code.codeId));
    for (const code of fixture.codes) {
      if (code.parentCodeId !== null) expect(ids.has(code.parentCodeId)).toBe(true);
    }
  });

  it('gives every code a full definition with inclusion and exclusion criteria', () => {
    for (const code of fixture.codes) {
      expect(code.shortDefinition.length).toBeGreaterThan(10);
      expect(code.fullDefinition.length).toBeGreaterThan(40);
      expect(code.inclusionCriteria.length).toBeGreaterThan(20);
      expect(code.exclusionCriteria.length).toBeGreaterThan(20);
    }
  });

  it('includes at least one pair of similarly named codes', () => {
    const names = fixture.codes.map((code) => code.name.toLowerCase());
    const pairs = names.filter((name, index) =>
      names.some(
        (other, otherIndex) =>
          index !== otherIndex && (other.startsWith(name) || name.startsWith(other)),
      ),
    );
    expect(pairs.length).toBeGreaterThanOrEqual(2);
  });

  it('stores a unique canonical order index on every code', () => {
    const indexes = fixture.codes.map((code) => code.canonicalOrderIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('writes no examples, per D-019', () => {
    for (const code of fixture.codes) expect(code.examples).toEqual([]);
  });

  it('lists every code in the codebook version', () => {
    expect(fixture.codebookVersion.codeIds).toHaveLength(fixture.codes.length);
  });
});

describe('pre-existing coded excerpts', () => {
  const secondCoderId = fixture.users[1].userId;

  it('has 15+ excerpts from the simulated second coder', () => {
    const theirs = fixture.excerpts.filter((excerpt) => excerpt.coderId === secondCoderId);
    expect(theirs.length).toBeGreaterThanOrEqual(15);
  });

  it('gives every excerpt at least one code assignment', () => {
    for (const excerpt of fixture.excerpts) {
      const assignments = fixture.codeAssignments.filter(
        (assignment) => assignment.excerptId === excerpt.excerptId,
      );
      expect(assignments.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('records the codebook version on every assignment', () => {
    for (const assignment of fixture.codeAssignments) {
      expect(assignment.codebookVersionId).toBe(fixture.codebookVersion.codebookVersionId);
    }
  });

  it('assigns only codes that exist', () => {
    const codeIds = new Set(fixture.codes.map((code) => code.codeId));
    for (const assignment of fixture.codeAssignments) {
      expect(codeIds.has(assignment.codeId)).toBe(true);
    }
  });

  it('has at least 4 pairs of overlapping excerpts with differing boundaries', () => {
    const order = new Map(
      fixture.segments.map((segment) => [segment.segmentId, segment.sequenceIndex]),
    );
    const range = (excerpt: (typeof fixture.excerpts)[number]) => ({
      start: order.get(excerpt.startSegmentId) ?? -1,
      end: order.get(excerpt.endSegmentId) ?? -1,
    });

    let overlapping = 0;
    for (let i = 0; i < fixture.excerpts.length; i += 1) {
      for (let j = i + 1; j < fixture.excerpts.length; j += 1) {
        const a = fixture.excerpts[i];
        const b = fixture.excerpts[j];
        if (a.sourceId !== b.sourceId) continue;

        const ra = range(a);
        const rb = range(b);
        const overlaps = ra.start <= rb.end && rb.start <= ra.end;
        const differs = ra.start !== rb.start || ra.end !== rb.end;
        if (overlaps && differs) overlapping += 1;
      }
    }

    expect(overlapping).toBeGreaterThanOrEqual(4);
  });

  it('keeps boundaries inside one source and never crossed', () => {
    const byId = new Map(fixture.segments.map((segment) => [segment.segmentId, segment]));
    for (const excerpt of fixture.excerpts) {
      const start = byId.get(excerpt.startSegmentId);
      const end = byId.get(excerpt.endSegmentId);
      expect(start?.sourceId).toBe(excerpt.sourceId);
      expect(end?.sourceId).toBe(excerpt.sourceId);
      expect(start!.sequenceIndex).toBeLessThanOrEqual(end!.sequenceIndex);
    }
  });

  it('attaches every note to an excerpt, untyped, per D-011 and D-020', () => {
    const excerptIds = new Set(fixture.excerpts.map((excerpt) => excerpt.excerptId));
    expect(fixture.notes.length).toBeGreaterThan(0);
    for (const note of fixture.notes) {
      expect(note.relatedExcerptId).not.toBeNull();
      expect(excerptIds.has(note.relatedExcerptId as string)).toBe(true);
      expect(note.noteType).toBeNull();
    }
  });

  it('hides seeded work until independent coding closes, per R-4', () => {
    for (const assignment of fixture.codeAssignments) {
      expect(assignment.visibility).toBe('afterIndependentCoding');
    }
  });
});

describe('identity rules', () => {
  it('uses unique identifiers throughout', () => {
    const ids = [
      ...fixture.segments.map((s) => s.segmentId),
      ...fixture.turns.map((t) => t.turnId),
      ...fixture.speakers.map((s) => s.speakerId),
      ...fixture.sources.map((s) => s.sourceId),
      ...fixture.codes.map((c) => c.codeId),
      ...fixture.excerpts.map((e) => e.excerptId),
      ...fixture.codeAssignments.map((a) => a.assignmentId),
      ...fixture.notes.map((n) => n.noteId),
      ...fixture.users.map((u) => u.userId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries no position in a segment identifier', () => {
    // Opaque means order cannot be read out of an identifier. Sorting by
    // identifier must not reproduce reading order. Domain model section 2.
    const segments = segmentsOf(transcript.sourceId).slice(0, 40);
    const bySequence = segments.map((segment) => segment.segmentId);
    const byIdentifier = [...bySequence].sort();
    expect(byIdentifier).not.toEqual(bySequence);
  });

  it('returns an independent fixture on every call, for session reset', () => {
    const first = createSeedFixture();
    const second = createSeedFixture();
    expect(first.excerpts).not.toBe(second.excerpts);
    expect(first.excerpts.map((e) => e.excerptId)).toEqual(
      second.excerpts.map((e) => e.excerptId),
    );
  });
});
