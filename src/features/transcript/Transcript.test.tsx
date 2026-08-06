import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultFlags } from '../../config/flags';
import { createSeedFixture } from '../../data/seed';
import { deriveSegmentDisplayStates, resolveSource, segmentsWithState } from '../../domain';
import type { ResolvedSource, SegmentDisplayStates } from '../../domain';
import { Transcript } from './Transcript';
import { formatTimestamp } from './formatTimestamp';

/** Specification: docs/patterns/transcript-segment.md sections 1 and 7. */

const fixture = createSeedFixture();

function view(index: number): { resolved: ResolvedSource; displayStates: SegmentDisplayStates } {
  const resolved = resolveSource({
    source: fixture.sources[index],
    segments: fixture.segments,
    turns: fixture.turns,
    speakers: fixture.speakers,
  });
  const displayStates = deriveSegmentDisplayStates(resolved, {
    excerpts: fixture.excerpts,
    codeAssignments: fixture.codeAssignments,
  });
  return { resolved, displayStates };
}

const sourceA = view(0);

function renderTranscript(
  target = sourceA,
  flags = defaultFlags,
) {
  return render(
    <Transcript resolved={target.resolved} displayStates={target.displayStates} flags={flags} />,
  );
}

describe('turns', () => {
  it('renders one focusable list item per speaker turn', () => {
    renderTranscript();

    const turns = screen.getAllByRole('listitem');
    expect(turns).toHaveLength(sourceA.resolved.turns.length);
    for (const turn of turns) {
      expect(turn).toHaveAttribute('tabindex', '0');
    }
  });

  it('reads a turn as continuous prose, speaker first then every sentence', () => {
    renderTranscript();

    const turn = sourceA.resolved.turns[1];
    const rendered = screen.getAllByRole('listitem')[1];
    const text = rendered.textContent ?? '';

    expect(text.startsWith(`${turn.speaker?.label}`)).toBe(true);
    for (const segment of turn.segments) {
      expect(text).toContain(segment.text);
    }
    // Sentences run together with single spaces, not as separate blocks.
    expect(text).toContain(`${turn.segments[0].text} ${turn.segments[1].text}`);
  });

  it('puts nothing focusable or named inside a turn', () => {
    // Section 1: sentences are addressable, not independently focusable. A role
    // or a name on a sentence would make a screen reader stop on it.
    renderTranscript();

    const turn = screen.getAllByRole('listitem')[1];
    expect(within(turn).queryAllByRole('listitem')).toHaveLength(0);
    expect(turn.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(turn.querySelectorAll('[role], [aria-label], [aria-labelledby]')).toHaveLength(0);
  });

  it('is a labelled region, findable in browse mode', () => {
    renderTranscript();
    expect(screen.getByRole('region', { name: 'Transcript' })).toBeInTheDocument();
  });
});

describe('sentences', () => {
  it('renders every sentence as an individually addressable span', () => {
    const { container } = renderTranscript();

    const spans = container.querySelectorAll('[data-segment-id]');
    expect(spans).toHaveLength(sourceA.resolved.segments.length);

    const ids = Array.from(spans).map((span) => span.getAttribute('data-segment-id'));
    expect(ids).toEqual(sourceA.resolved.segments.map((segment) => segment.segmentId));
  });

  it('keeps each sentence individually styleable', () => {
    const { container } = renderTranscript();
    const first = sourceA.resolved.segments[0];

    const span = container.querySelector(`[data-segment-id="${first.segmentId}"]`);
    expect(span).toHaveClass('transcript-segment');
    expect(span?.textContent).toBe(first.text);
  });
});

describe('speaker and timestamp', () => {
  it('shows the speaker label at the head of the turn', () => {
    renderTranscript();

    const turn = sourceA.resolved.turns[0];
    const rendered = screen.getAllByRole('listitem')[0];
    expect(within(rendered).getByText(turn.speaker!.label)).toBeInTheDocument();
  });

  it('shows a timestamp, out of the accessibility tree at the default verbosity', () => {
    // Section 6: timestamps are not announced automatically at `onRequest`.
    const { container } = renderTranscript();

    const timestamp = container.querySelector('.transcript-turn__timestamp');
    expect(timestamp).not.toBeNull();
    expect(timestamp).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the timestamp when the flag says announce always', () => {
    const { container } = renderTranscript(sourceA, {
      ...defaultFlags,
      timestampVerbosity: 'always',
    });

    expect(container.querySelector('.transcript-turn__timestamp')).not.toHaveAttribute(
      'aria-hidden',
    );
  });

  it('renders no timestamp at all when the flag says never', () => {
    const { container } = renderTranscript(sourceA, {
      ...defaultFlags,
      timestampVerbosity: 'never',
    });

    expect(container.querySelector('.transcript-turn__timestamp')).toBeNull();
  });

  it('formats timestamps as minutes and seconds, and hours once needed', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(82_000)).toBe('1:22');
    expect(formatTimestamp(3_723_000)).toBe('1:02:03');
  });
});

describe('coded state', () => {
  it('marks coded and coded-multiple sentences from the derived states', () => {
    const { container } = renderTranscript();

    const coded = segmentsWithState(sourceA.displayStates, 'coded');
    const multiple = segmentsWithState(sourceA.displayStates, 'coded-multiple');
    expect(coded.length).toBeGreaterThan(0);
    expect(multiple.length).toBeGreaterThan(0);

    for (const segmentId of coded) {
      expect(container.querySelector(`[data-segment-id="${segmentId}"]`)).toHaveAttribute(
        'data-display-state',
        'coded',
      );
    }
    for (const segmentId of multiple) {
      expect(container.querySelector(`[data-segment-id="${segmentId}"]`)).toHaveAttribute(
        'data-display-state',
        'coded-multiple',
      );
    }
  });

  it('leaves uncoded sentences inactive', () => {
    const { container } = renderTranscript();

    const inactive = segmentsWithState(sourceA.displayStates, 'inactive');
    expect(inactive.length).toBeGreaterThan(0);
    expect(container.querySelector(`[data-segment-id="${inactive[0]}"]`)).toHaveAttribute(
      'data-display-state',
      'inactive',
    );
  });

  it('carries the coded state without adding anything to the accessibility tree', () => {
    // The state is visual here. Coded status reaches a screen reader on entering
    // a coded segment, per section 6, which belongs to segment navigation.
    const { container } = renderTranscript();

    const coded = segmentsWithState(sourceA.displayStates, 'coded')[0];
    const span = container.querySelector(`[data-segment-id="${coded}"]`);

    expect(span).not.toHaveAttribute('aria-label');
    expect(span).not.toHaveAttribute('role');
    expect(span?.textContent).not.toMatch(/coded/i);
  });
});

describe('the second source', () => {
  it('renders the shorter transcript with its own turns', () => {
    const sourceB = view(1);
    renderTranscript(sourceB);

    expect(screen.getAllByRole('listitem')).toHaveLength(sourceB.resolved.turns.length);
  });
});
