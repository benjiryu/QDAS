import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../../data/seed';
import { CURRENT_CODER_ID, SECOND_CODER_ID, THIRD_CODER_ID } from '../../data/seed/project';
import { buildCodedData } from './codedDataView';
import type { CodedDataView } from './resolveView';

/**
 * The same-excerpt indicator, per decision D-066.
 *
 * Specification: D-066, and docs/pages/destinations.md section 2's results
 * list. Tested here rather than only through the page because what D-066
 * decides is a derivation — who qualifies, in which view — and the page's job
 * is to put it on screen.
 */

const fixture = createSeedFixture();

function build(view: CodedDataView, overrides: Partial<Parameters<typeof buildCodedData>[0]> = {}) {
  return buildCodedData({
    view,
    currentUserId: CURRENT_CODER_ID,
    sources: fixture.sources,
    segments: fixture.segments,
    turns: fixture.turns,
    speakers: fixture.speakers,
    users: fixture.users,
    codes: fixture.codes,
    excerpts: fixture.excerpts,
    assignments: fixture.codeAssignments,
    notes: fixture.notes,
    supersededIds: [],
    ...overrides,
  });
}

const rowFor = (view: CodedDataView, excerptId: string) =>
  build(view).results.find((result) => result.excerptId === excerptId);

const nameOf = (userId: string) =>
  fixture.users.find((user) => user.userId === userId)!.displayName;

describe('who else coded the same excerpt', () => {
  it('names the other coder on both rows of a pair above the threshold', () => {
    /*
      The relation is symmetric, and so is the poke. D-066 works by letting a
      reader compare adjacent rows, which only holds if both rows point at each
      other rather than one being designated the original.
    */
    expect(rowFor('projectWide', 'ex-5806e4b2')?.alsoCodedBy).toEqual([nameOf(THIRD_CODER_ID)]);
    expect(rowFor('projectWide', 'ex-4f92d7c1')?.alsoCodedBy).toEqual([nameOf(SECOND_CODER_ID)]);
  });

  it('says nothing on a pair that overlaps below the threshold', () => {
    // These two overlap by two sentences of seven. Overlapping is not the same
    // as being the same excerpt, which is the whole point of having a number.
    expect(rowFor('projectWide', 'ex-9d27b014')?.alsoCodedBy).toEqual([]);
    expect(rowFor('projectWide', 'ex-5c1908be')?.alsoCodedBy).toEqual([]);
  });

  it('says nothing on an excerpt nobody else touched', () => {
    expect(rowFor('projectWide', 'ex-0a41f7c3')?.alsoCodedBy).toEqual([]);
  });
});

describe('the own view', () => {
  it('carries no same-excerpt line at all', () => {
    /*
      R-4. During independent coding the page shows the coder's own work, and
      naming another coder — even only to say one exists — is exactly the leak
      the rule exists to prevent.

      What holds this today is the own view's coder filter, not the view gate
      beside the comparison: the filter runs first, so no cross-coder pair ever
      reaches the gate. Removing the gate does not fail this test, and the
      derivation says so where the gate is. Asserted over every row rather than
      a chosen one, since the property is about the view, not about a row.
    */
    const lead = build('own', { currentUserId: SECOND_CODER_ID });

    expect(lead.results.length).toBeGreaterThan(0);
    for (const result of lead.results) expect(result.alsoCodedBy).toEqual([]);
  });
});

describe('what counts as somebody else having coded it', () => {
  it('lists several coders by name, alphabetically', () => {
    /*
      D-066 says multiple coders list all names and does not say in what order.
      Alphabetical, so the line reads the same on every render — record order
      would put whichever excerpt was captured first at the front, which is not
      information the reader has any use for.

      Built by lending the current coder an excerpt over the same passage, which
      the fixture deliberately does not seed.
    */
    const borrowed = fixture.excerpts.find((excerpt) => excerpt.excerptId === 'ex-4f92d7c1')!;
    const mine = { ...borrowed, excerptId: 'ex-borrowed', coderId: CURRENT_CODER_ID };
    const assignments = fixture.codeAssignments
      .filter((assignment) => assignment.excerptId === borrowed.excerptId)
      .map((assignment) => ({
        ...assignment,
        assignmentId: `${assignment.assignmentId}-borrowed`,
        excerptId: mine.excerptId,
        coderId: CURRENT_CODER_ID,
      }));

    const data = build('projectWide', {
      excerpts: [...fixture.excerpts, mine],
      assignments: [...fixture.codeAssignments, ...assignments],
    });
    const row = data.results.find((result) => result.excerptId === 'ex-5806e4b2');

    expect(row?.alsoCodedBy).toEqual(
      [nameOf(CURRENT_CODER_ID), nameOf(THIRD_CODER_ID)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('ignores an overlapping excerpt whose codes have all been superseded', () => {
    /*
      Only rows can trigger the line. An excerpt with nothing standing on it is
      not on this page, and D-066's reasoning is that the reader looks at the
      neighbouring row to see what the other coder chose — so pointing at a row
      that is not there would send them hunting, and "also coded by" would name
      somebody carrying no code at all.
    */
    const superseded = fixture.codeAssignments
      .filter((assignment) => assignment.excerptId === 'ex-4f92d7c1')
      .map((assignment) => assignment.assignmentId);

    const data = build('projectWide', { supersededIds: superseded });

    expect(data.results.map((result) => result.excerptId)).not.toContain('ex-4f92d7c1');
    expect(data.results.find((result) => result.excerptId === 'ex-5806e4b2')?.alsoCodedBy).toEqual(
      [],
    );
  });
});
