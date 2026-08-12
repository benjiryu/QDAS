import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from './TranscriptWorkspace';

/**
 * The code rail and its programmatic twin.
 *
 * Specification: decision D-041.
 *
 * The rail is a glance channel and is out of the accessibility tree; the turn's
 * description is what makes hiding it legitimate. Both are asserted here,
 * because either one alone would be a contract failure.
 */

const fixture = createSeedFixture();
const source = fixture.sources[0];
const resolved = resolveSource({
  source,
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearSourcePositions();
});

function renderWorkspace() {
  return render(
    <AnnouncerProvider announcer={announcer}>
      <TranscriptWorkspace
        resolved={resolved}
        seedExcerpts={fixture.excerpts}
        seedAssignments={fixture.codeAssignments}
        seedNotes={fixture.notes}
        codingRoundId={fixture.codingRound.codingRoundId}
        codebookVersionId={fixture.codebookVersion.codebookVersionId}
        codes={fixture.codes}
        projectId={fixture.project.projectId}
        userId="us-test"
        flags={defaultFlags}
      />
    </AnnouncerProvider>,
  );
}

const turnElement = (turnId: string) =>
  document.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`)!;

const railOf = (turnId: string) =>
  turnElement(turnId).querySelector<HTMLElement>('.transcript-turn__rail');

/** What a screen reader would announce as the turn's description. */
function describedText(turnId: string): string | null {
  const id = turnElement(turnId).getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

/**
 * Expected counts, worked out from the fixture rather than from the derivation
 * under test. Checking `turnCoding` against `turnCoding` would pass whatever
 * it did.
 */
function expectedFor(turnId: string) {
  const turn = resolved.turns.find((candidate) => candidate.turn.turnId === turnId)!;
  const positionOf = (segmentId: string) =>
    resolved.segments.findIndex((segment) => segment.segmentId === segmentId);
  const first = positionOf(turn.segments[0].segmentId);
  const last = positionOf(turn.segments[turn.segments.length - 1].segmentId);

  const excerpts = fixture.excerpts.filter((excerpt) => {
    if (excerpt.sourceId !== source.sourceId) return false;
    const start = positionOf(excerpt.startSegmentId);
    const end = positionOf(excerpt.endSegmentId);
    const overlaps = start <= last && end >= first;
    const codes = fixture.codeAssignments.filter(
      (assignment) => assignment.excerptId === excerpt.excerptId,
    );
    return overlaps && codes.length > 0;
  });

  const codeIds = new Set(
    excerpts.flatMap((excerpt) =>
      fixture.codeAssignments
        .filter((assignment) => assignment.excerptId === excerpt.excerptId)
        .map((assignment) => assignment.codeId),
    ),
  );

  const hasNote = fixture.notes.some((note) =>
    excerpts.some((excerpt) => excerpt.excerptId === note.relatedExcerptId),
  );

  return { excerptCount: excerpts.length, codeCount: codeIds.size, hasNote, excerpts };
}

/** A turn the fixture's overlapping pairs land in: two or more excerpts. */
const overlappedTurnId = resolved.turns.find(
  (turn) => expectedFor(turn.turn.turnId).excerptCount > 1,
)!.turn.turnId;

/** A turn carrying the seeded note. */
const notedTurnId = resolved.turns.find((turn) => expectedFor(turn.turn.turnId).hasNote)?.turn
  .turnId;

const uncodedTurnId = resolved.turns.find(
  (turn) => expectedFor(turn.turn.turnId).excerptCount === 0,
)!.turn.turnId;

/** A turn with exactly one excerpt, so deleting it empties both channels. */
const soleExcerptTurnId = resolved.turns.find(
  (turn) => expectedFor(turn.turn.turnId).excerptCount === 1,
)!.turn.turnId;

describe('the rail is out of the accessibility tree', () => {
  it('is aria-hidden wherever it appears', () => {
    renderWorkspace();

    const rails = document.querySelectorAll('.transcript-turn__rail');
    expect(rails.length).toBeGreaterThan(0);
    for (const rail of rails) expect(rail).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps its code names out of the turn’s description', () => {
    // The description is the twin of the glance, not a recitation of it.
    renderWorkspace();

    const rail = railOf(overlappedTurnId)!;
    const description = describedText(overlappedTurnId)!;

    const names = Array.from(rail.querySelectorAll('.transcript-turn__pill')).map(
      (pill) => pill.textContent ?? '',
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(description).not.toContain(name);
  });

  it('puts the description out of continuous reading too', () => {
    // Visually hidden alone would leave it read as part of the prose, which is
    // what D-041 rules out; aria-hidden alone would leave it on the screen.
    renderWorkspace();

    const id = turnElement(overlappedTurnId).getAttribute('aria-describedby')!;
    expect(document.getElementById(id)).toHaveAttribute('aria-hidden', 'true');
    expect(document.getElementById(id)).toHaveClass('transcript-turn__description');
  });
});

describe('the turn’s description', () => {
  it('is correct on a turn with overlapping excerpts', () => {
    const expected = expectedFor(overlappedTurnId);
    expect(expected.excerptCount).toBeGreaterThan(1);

    renderWorkspace();

    expect(describedText(overlappedTurnId)).toBe(
      `${expected.excerptCount} excerpts, ${expected.codeCount} codes${
        expected.hasNote ? ', note' : ''
      }`,
    );
  });

  it('states as many codes as the rail shows pills', () => {
    renderWorkspace();

    const pills = railOf(overlappedTurnId)!.querySelectorAll('.transcript-turn__pill');
    expect(describedText(overlappedTurnId)).toContain(`${pills.length} codes`);
  });

  it('says "note" and shows the icon together, from the seeded note', () => {
    expect(notedTurnId).toBeDefined();
    renderWorkspace();

    expect(describedText(notedTurnId!)).toMatch(/, note$/);
    expect(railOf(notedTurnId!)!.querySelector('.transcript-turn__note')).not.toBeNull();
  });

  it('leaves an uncoded turn with no rail and no description at all', () => {
    renderWorkspace();

    expect(railOf(uncodedTurnId)).toBeNull();
    expect(turnElement(uncodedTurnId)).not.toHaveAttribute('aria-describedby');
  });

  it('names no code anywhere in the accessibility tree', () => {
    // The rail's labels reach the eye only. Detail stays on request through
    // excerpt.open, which is the third tier of glance, brief, detail.
    const { container } = renderWorkspace();
    const codedNames = expectedFor(overlappedTurnId).excerpts.flatMap((excerpt) =>
      fixture.codeAssignments
        .filter((assignment) => assignment.excerptId === excerpt.excerptId)
        .map(
          (assignment) =>
            fixture.codes.find((code) => code.codeId === assignment.codeId)!.name,
        ),
    );

    const transcript = within(container.querySelector('[data-transcript]')!);
    for (const name of codedNames) {
      // Present in the DOM for the eye, and inside an aria-hidden subtree.
      const found = transcript.getAllByText(name, { ignore: false });
      expect(found.length).toBeGreaterThan(0);
      for (const node of found) expect(node.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

describe('the rail follows the stored excerpts', () => {
  it('loses its pills and its description when the excerpt is deleted', () => {
    // Derived, not rendered once: deleting the excerpt has to take both
    // channels with it, or the glance and the description start disagreeing.
    const sole = expectedFor(soleExcerptTurnId);

    renderWorkspace();
    expect(railOf(soleExcerptTurnId)).not.toBeNull();
    expect(describedText(soleExcerptTurnId)).toBe(
      `1 excerpt, ${sole.codeCount} ${sole.codeCount === 1 ? 'code' : 'codes'}`,
    );

    // Reopen it by clicking its highlight, then delete it.
    fireEvent.click(
      document.querySelector(`[data-segment-id="${sole.excerpts[0].startSegmentId}"]`)!,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete excerpt/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete it/i }));

    expect(railOf(soleExcerptTurnId)).toBeNull();
    expect(turnElement(soleExcerptTurnId)).not.toHaveAttribute('aria-describedby');
  });
});
