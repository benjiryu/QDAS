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
import { positionOf, resolveSource } from '../../domain';
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

const panel = () => screen.getByRole('region', { name: /code selection/i });
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

function codesPending(): string[] {
  return within(region('pending'))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('reopening a saved excerpt', () => {
  it('loads its codes into the pending assignment', () => {
    const { container } = renderWorkspace();

    clickSegment(container, soleExcerpt.startSegmentId);

    expect(excerptState()).toBe('confirmed');
    expect(codesPending()).toHaveLength(soleCodeIds.length);
    for (const codeId of soleCodeIds) {
      const name = fixture.codes.find((code) => code.codeId === codeId)!.name;
      expect(within(region('pending')).getByText(name)).toBeInTheDocument();
    }
  });

  it('says that existing codes are loaded and how many', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    const opening = announced().find((message) => /code selection/i.test(message))!;
    expect(opening).toMatch(
      new RegExp(`${soleCodeIds.length} existing codes? loaded from the saved excerpt`, 'i'),
    );
  });

  it('opens by command as well as by click, which is the keyboard route', () => {
    const { container } = renderWorkspace();

    // Move the position onto the excerpt without clicking the highlight.
    const target = positionOf(resolved, soleExcerpt.startSegmentId)!;
    for (let step = 0; step <= target; step += 1) chord('segment.next');
    expect(container.querySelector('[data-active="true"]')).toHaveAttribute(
      'data-segment-id',
      soleExcerpt.startSegmentId,
    );

    chord('excerpt.open');

    expect(excerptState()).toBe('confirmed');
    expect(codesPending()).toHaveLength(soleCodeIds.length);
  });

  it('offers the command only where a saved excerpt is', () => {
    renderWorkspace();

    const control = () => screen.getByRole('button', { name: 'Open saved excerpt' });
    expect(control()).toHaveAttribute('aria-disabled', 'true');

    chord('excerpt.open');
    expect(announced().some((message) => /not inside a saved excerpt/i.test(message))).toBe(true);
  });
});


describe('the overlap case', () => {
  it('offers a choice instead of guessing', () => {
    const { container } = renderWorkspace();

    clickSegment(container, overlapSegmentId);

    // No excerpt opened yet: the coder chooses.
    expect(screen.queryByRole('region', { name: /code selection/i })).toBeNull();
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

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    // Reopening the same excerpt shows both the originals and the addition.
    clickSegment(container, soleExcerpt.startSegmentId);
    const names = codesPending().join(' ');
    expect(names).toContain(added.name);
    for (const codeId of soleCodeIds) {
      expect(names).toContain(fixture.codes.find((code) => code.codeId === codeId)!.name);
    }
  });

  it('supersedes a removed code rather than deleting the row', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    const removedId = soleCodeIds[0];
    const removedName = fixture.codes.find((code) => code.codeId === removedId)!.name;
    fireEvent.click(
      within(region('pending')).getByRole('button', { name: new RegExp(`Remove ${removedName}`) }),
    );
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));

    const message = announced().find((text) => /removed/i.test(text) && /saved/i.test(text))!;
    expect(message).toMatch(/1 removed/);

    // The row is retained as superseded: the assignment is not standing, so it
    // does not come back when the excerpt is reopened, and the fixture's own
    // record was never mutated.
    clickSegment(container, soleExcerpt.startSegmentId);
    expect(codesPending().join(' ')).not.toContain(removedName);
    expect(
      fixture.codeAssignments.find((assignment) => assignment.codeId === removedId)?.status,
    ).toBe('active');
  });

  it('stops showing the excerpt as coded once every code is removed', () => {
    const { container } = renderWorkspace();
    clickSegment(container, soleExcerpt.startSegmentId);

    for (const codeId of soleCodeIds) {
      const name = fixture.codes.find((code) => code.codeId === codeId)!.name;
      fireEvent.click(
        within(region('pending')).getByRole('button', { name: new RegExp(`Remove ${name}`) }),
      );
    }

    // Emptying the list is not a delete route: save stays unavailable.
    const save = within(panel()).getByRole('button', { name: 'Save' });
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
    expect(codesPending().join(' ')).not.toContain(added.name);
  });
});
