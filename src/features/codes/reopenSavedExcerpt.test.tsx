import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Chord, Command } from '../../config/keybindings';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { positionOf, requireTurnOf, resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * Specification: D-030, and docs/patterns/excerpt-selection.md section 4.1.
 *
 * Reopening changes codes, not boundaries. The overlapping pairs in the seed
 * fixture make the disambiguation path reachable without constructing anything.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

const bindings = bindingsFor(detectPlatform());
let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearSourcePositions();
  vi.restoreAllMocks();
});

function renderWorkspace(flags = defaultFlags) {
  return render(
    <AnnouncerProvider announcer={announcer}>
      <TranscriptWorkspace
        resolved={resolved}
        seedExcerpts={fixture.excerpts}
        seedAssignments={fixture.codeAssignments}
        codingRoundId={fixture.codingRound.codingRoundId}
        codebookVersionId={fixture.codebookVersion.codebookVersionId}
        codes={fixture.codes}
        projectId={fixture.project.projectId}
        userId="us-test"
        flags={flags}
      />
    </AnnouncerProvider>,
  );
}

function press(chord: Chord) {
  act(() => {
    fireEvent.keyDown(document, {
      key: chord.key,
      ctrlKey: Boolean(chord.ctrl),
      altKey: Boolean(chord.alt),
      shiftKey: Boolean(chord.shift),
      metaKey: Boolean(chord.meta),
    });
  });
}

const chord = (command: Command) => press(bindings[command]);

const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const region = (name: string) => panel().querySelector<HTMLElement>(`[data-region="${name}"]`)!;
const announced = () => announcer.getHistory().map((entry) => entry.message);
const excerptState = () =>
  document.querySelector('.excerpt-toolbar__state')?.getAttribute('data-state') ?? '';

/**
 * A seeded excerpt that nothing overlaps and that carries more than one code,
 * so removing one still leaves something to save.
 */
const soleExcerpt = fixture.excerpts.find((excerpt) => {
  if (excerpt.sourceId !== resolved.source.sourceId) return false;
  const codeCount = fixture.codeAssignments.filter(
    (assignment) => assignment.excerptId === excerpt.excerptId,
  ).length;
  if (codeCount < 2) return false;
  const start = positionOf(resolved, excerpt.startSegmentId)!;
  const end = positionOf(resolved, excerpt.endSegmentId)!;
  // No other excerpt overlaps it.
  return !fixture.excerpts.some((other) => {
    if (other.excerptId === excerpt.excerptId || other.sourceId !== excerpt.sourceId) return false;
    const otherStart = positionOf(resolved, other.startSegmentId)!;
    const otherEnd = positionOf(resolved, other.endSegmentId)!;
    return otherStart <= end && start <= otherEnd;
  });
})!;

const soleCodeIds = fixture.codeAssignments
  .filter((assignment) => assignment.excerptId === soleExcerpt.excerptId)
  .map((assignment) => assignment.codeId);

/** The first of the fixture's deliberately overlapping pairs. */
const overlapSegmentId = (() => {
  const dana = fixture.excerpts.find((excerpt) => excerpt.excerptId === 'ex-9d27b014')!;
  const priya = fixture.excerpts.find((excerpt) => excerpt.excerptId === 'ex-5c1908be')!;
  const from = Math.max(
    positionOf(resolved, dana.startSegmentId)!,
    positionOf(resolved, priya.startSegmentId)!,
  );
  return resolved.segments[from].segmentId;
})();

/** Puts the position on a segment by clicking it, then opens by command. */
function clickSegment(container: HTMLElement, segmentId: string) {
  fireEvent.click(container.querySelector(`[data-segment-id="${segmentId}"]`)!);
}

/**
 * The pending assignment, which since D-039 is the set of checked boxes.
 *
 * Deduplicated, because one code can have a row in the codebook, in the search
 * results, and in recently used at the same time.
 */
function codesPending(): string[] {
  const ids = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
    .filter((box) => box.checked)
    .map((box) => box.dataset.codeId!);
  return [...new Set(ids)];
}

/** Unchecking is how a code leaves the assignment now. */
function uncheck(codeId: string) {
  fireEvent.click(region('codebook').querySelector(`[data-code-id="${codeId}"]`)!);
}

describe('reopening a saved excerpt', () => {
  it('loads its codes into the pending assignment', () => {
    const { container } = renderWorkspace();

    clickSegment(container, soleExcerpt.startSegmentId);

    expect(excerptState()).toBe('confirmed');
    expect(codesPending()).toHaveLength(soleCodeIds.length);
    // Pre-checked in the codebook, which is the whole pending state now.
    for (const codeId of soleCodeIds) {
      expect(region('codebook').querySelector(`[data-code-id="${codeId}"]`)).toBeChecked();
    }
  });

  it('says that existing codes are loaded and how many', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    const opening = announced().find((message) => /code assignment/i.test(message))!;
    expect(opening).toMatch(
      new RegExp(`${soleCodeIds.length} existing codes? loaded from the saved excerpt`, 'i'),
    );
  });

  it('opens by command as well as by click, which is the keyboard route', () => {
    const { container } = renderWorkspace();

    // Focus the turn the excerpt is in, without clicking the highlight.
    // D-038: `excerpt.open` keys on the focused turn.
    const turn = requireTurnOf(resolved, soleExcerpt.startSegmentId);
    act(() => {
      container.querySelector<HTMLElement>(`[data-turn-id="${turn.turn.turnId}"]`)!.focus();
    });

    chord('excerpt.open');

    expect(excerptState()).toBe('confirmed');
    expect(codesPending()).toHaveLength(soleCodeIds.length);
  });

  it('says why where there is no saved excerpt to open', () => {
    // The command carries no strip control: contract 2.2 no longer asks for
    // one, and D-038 names five. It is reachable by chord and by clicking a
    // coded highlight, and it still explains itself rather than doing nothing.
    renderWorkspace();

    chord('excerpt.open');
    expect(announced().some((message) => /not inside a saved excerpt/i.test(message))).toBe(true);
  });
});


describe('the overlap case', () => {
  it('offers a choice instead of guessing', () => {
    const { container } = renderWorkspace();

    clickSegment(container, overlapSegmentId);

    // No excerpt opened yet: the coder chooses.
    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
    const choices = screen.getByRole('group', { name: 'Saved excerpts here' });
    const options = within(choices).getAllByRole('button');
    expect(options.length).toBeGreaterThanOrEqual(3); // two excerpts plus the decline

    // Identified by range and code count, never by coder.
    expect(within(choices).getAllByText(/Sentences \d+ to \d+, \d+ codes?/).length).toBe(2);
    for (const user of fixture.users) {
      expect(within(choices).queryByText(new RegExp(user.displayName))).toBeNull();
    }
  });

  it('opens the one the coder picks', () => {
    const { container } = renderWorkspace();
    clickSegment(container, overlapSegmentId);

    const choices = screen.getByRole('group', { name: 'Saved excerpts here' });
    const first = within(choices).getAllByRole('button')[0];
    const label = first.textContent ?? '';
    fireEvent.click(first);

    expect(excerptState()).toBe('confirmed');
    const [, start, end] = label.match(/Sentences (\d+) to (\d+)/)!;
    expect(container.querySelector('[data-excerpt="start"]')).toHaveAttribute(
      'data-segment-id',
      resolved.segments[Number(start) - 1].segmentId,
    );
    expect(container.querySelector('[data-excerpt="end"]')).toHaveAttribute(
      'data-segment-id',
      resolved.segments[Number(end) - 1].segmentId,
    );
  });

  it('lets the coder open none of them', () => {
    const { container } = renderWorkspace();
    clickSegment(container, overlapSegmentId);

    fireEvent.click(screen.getByRole('button', { name: /open none of them/i }));

    expect(screen.queryByRole('group', { name: 'Saved excerpts here' })).toBeNull();
    expect(excerptState()).toBe('idle');
    expect(container.querySelector('[data-excerpt]')).toBeNull();
  });
});

describe('saving a reopened excerpt writes the difference', () => {
  it('keeps the original codes and adds the new one', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    const added = fixture.codes.find(
      (code) => !soleCodeIds.includes(code.codeId) && code.name === 'Mutual aid',
    )!;
    fireEvent.click(
      within(region('codebook')).getByRole('checkbox', { name: new RegExp(added.name) }),
    );
    expect(codesPending()).toHaveLength(soleCodeIds.length + 1);

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    // Reopening the same excerpt shows both the originals and the addition.
    clickSegment(container, soleExcerpt.startSegmentId);
    const checked = codesPending();
    expect(checked).toContain(added.codeId);
    for (const codeId of soleCodeIds) expect(checked).toContain(codeId);
  });

  it('supersedes a removed code rather than deleting the row', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    const removedId = soleCodeIds[0];
    uncheck(removedId);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));

    const message = announced().find((text) => /removed/i.test(text) && /saved/i.test(text))!;
    expect(message).toMatch(/1 removed/);

    // The row is retained as superseded: the assignment is not standing, so it
    // does not come back when the excerpt is reopened, and the fixture's own
    // record was never mutated.
    clickSegment(container, soleExcerpt.startSegmentId);
    expect(codesPending()).not.toContain(removedId);
    expect(
      fixture.codeAssignments.find((assignment) => assignment.codeId === removedId)?.status,
    ).toBe('active');
  });

  it('stops showing the excerpt as coded once every code is removed', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    for (const codeId of soleCodeIds) uncheck(codeId);

    // Emptying the list is not a delete route: save stays unavailable.
    const save = within(panel()).getByRole('button', { name: 'Save & Close' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(save);
    expect(panel()).toBeInTheDocument();
    expect(container.querySelector('[data-excerpt]')).not.toBeNull();
  });
});

describe('cancel leaves a reopened excerpt untouched', () => {
  it('keeps its saved assignments after discarding the changes', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    const added = fixture.codes.find((code) => code.name === 'Mutual aid')!;
    fireEvent.click(
      within(region('codebook')).getByRole('checkbox', { name: new RegExp(added.name) }),
    );

    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /discard them/i }));

    // Cancel discards this round of changes and returns to idle, per section 3.
    // What was already saved is untouched, which is what D-030 requires.
    expect(excerptState()).toBe('idle');

    // Reopening shows exactly what was saved before.
    clickSegment(container, soleExcerpt.startSegmentId);
    expect(codesPending()).toHaveLength(soleCodeIds.length);
    expect(codesPending()).not.toContain(added.codeId);
  });
});

/**
 * Deleting a coded excerpt, the "separate explicit action" D-030 named and left
 * unbuilt. Emptying the codes and saving is still not a route to it.
 */
describe('deleting a saved excerpt', () => {
  const deleteButton = () => within(panel()).queryByRole('button', { name: /delete excerpt/i });
  const codedAt = (container: HTMLElement, segmentId: string) =>
    container
      .querySelector(`[data-segment-id="${segmentId}"]`)!
      .getAttribute('data-display-state');

  it('is not offered on a fresh capture, where Cancel already discards', () => {
    const { container } = renderWorkspace();
    const uncoded = resolved.segments.find(
      (segment) => codedAt(container, segment.segmentId) === 'inactive',
    )!;

    // Focus rather than click: the turn fallback captures from focus, and
    // jsdom's click does not move it.
    const turn = requireTurnOf(resolved, uncoded.segmentId);
    act(() => {
      container.querySelector<HTMLElement>(`[data-turn-id="${turn.turn.turnId}"]`)!.focus();
    });
    chord('excerpt.code');

    expect(deleteButton()).toBeNull();
  });

  it('is offered on a reopened saved excerpt', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    expect(deleteButton()).toBeInTheDocument();
  });

  it('asks first, announced assertively', () => {
    // Contract 2.3 reserves the assertive region for save failures and
    // destructive confirmations, and this is the second of those.
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    fireEvent.click(deleteButton()!);

    expect(panel().querySelector('[data-confirm="delete"]')).toBeInTheDocument();
    const entry = announcer.getHistory().find((item) => /delete this excerpt/i.test(item.message))!;
    expect(entry.politeness).toBe('assertive');
    expect(entry.reason).toBe('destructiveConfirmation');
  });

  it('deletes nothing until the confirmation is accepted', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    fireEvent.click(deleteButton()!);
    fireEvent.click(within(panel()).getByRole('button', { name: /keep it/i }));

    expect(panel()).toBeInTheDocument();
    expect(codesPending()).toHaveLength(soleCodeIds.length);
    expect(codedAt(container, soleExcerpt.startSegmentId)).toMatch(/^coded/);
  });

  it('supersedes every standing assignment and closes the panel', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    fireEvent.click(deleteButton()!);
    fireEvent.click(within(panel()).getByRole('button', { name: /delete it/i }));

    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
    // The sentence stops reading as coded, because nothing stands on it now.
    expect(codedAt(container, soleExcerpt.startSegmentId)).toBe('inactive');
    expect(announced().join(' ')).toMatch(/excerpt deleted/i);
  });

  it('retains the excerpt row rather than erasing the history', () => {
    // D-030: the project preserves before-and-after history. The fixture's own
    // records are never mutated, and the assignments are superseded, not gone.
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);
    fireEvent.click(deleteButton()!);
    fireEvent.click(within(panel()).getByRole('button', { name: /delete it/i }));

    for (const codeId of soleCodeIds) {
      expect(
        fixture.codeAssignments.find(
          (assignment) =>
            assignment.excerptId === soleExcerpt.excerptId && assignment.codeId === codeId,
        )?.status,
      ).toBe('active');
    }
    expect(container.querySelector('[data-saved-excerpts]')).toHaveAttribute(
      'data-saved-excerpts',
      '0',
    );
  });

  it('leaves nothing for excerpt.open to reopen', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);
    fireEvent.click(deleteButton()!);
    fireEvent.click(within(panel()).getByRole('button', { name: /delete it/i }));

    clickSegment(container, soleExcerpt.startSegmentId);

    expect(screen.queryByRole('dialog', { name: /code assignment/i })).toBeNull();
  });
});
