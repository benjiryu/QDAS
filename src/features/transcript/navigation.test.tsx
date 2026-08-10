import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions, readSourcePosition } from '../../data/sourcePositionStore';
import { deriveSegmentDisplayStates, resolveSource, segmentsWithState } from '../../domain';
import { TranscriptWorkspace } from './TranscriptWorkspace';

/**
 * Specification: docs/patterns/transcript-segment.md sections 2, 4, 5, 6.
 *
 * Acceptance criteria under test, from section 10:
 * - "Scroll does not move the active segment"
 * - "Position agreement"
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});
const displayStates = deriveSegmentDisplayStates(resolved, {
  excerpts: fixture.excerpts,
  codeAssignments: fixture.codeAssignments,
});

const USER_ID = 'us-test';
const bindings = bindingsFor(detectPlatform());

let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 10, clearGapMs: 1 });
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
        displayStates={displayStates}
        codes={fixture.codes}
        userId={USER_ID}
        flags={flags}
      />
    </AnnouncerProvider>,
  );
}

/** Presses the chord bound to a command, exactly as the user would. */
function pressChord(command: Command) {
  const chord = bindings[command];
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

function announced(): string[] {
  return announcer.getHistory().map((entry) => entry.message);
}

function lastAnnouncement(): string {
  return announcer.getLast()?.message ?? '';
}

function activeSegmentId(container: HTMLElement): string | null {
  return container.querySelector('[data-active="true"]')?.getAttribute('data-segment-id') ?? null;
}

function ribbonText(): string {
  return document.querySelector('.position-ribbon')?.textContent ?? '';
}

describe('the active segment', () => {
  it('starts unset and reports so, rather than guessing a position', () => {
    const { container } = renderWorkspace();

    expect(activeSegmentId(container)).toBeNull();
    expect(ribbonText()).toContain('Not set');
    expect(announced()[0]).toContain(resolved.source.title);
    expect(announced()[0]).toContain('No saved position');
  });

  it('moves one sentence at a time and announces the sentence text', () => {
    const { container } = renderWorkspace();

    pressChord('segment.next');
    expect(activeSegmentId(container)).toBe(resolved.segments[0].segmentId);
    expect(lastAnnouncement()).toContain(resolved.segments[0].text);

    pressChord('segment.next');
    expect(activeSegmentId(container)).toBe(resolved.segments[1].segmentId);
    expect(lastAnnouncement()).toContain(resolved.segments[1].text);

    pressChord('segment.previous');
    expect(activeSegmentId(container)).toBe(resolved.segments[0].segmentId);
  });

  it('moves by turn and announces the speaker before the sentence', () => {
    const { container } = renderWorkspace();

    pressChord('turn.next');
    pressChord('turn.next');

    const secondTurn = resolved.turns[1];
    expect(activeSegmentId(container)).toBe(secondTurn.segments[0].segmentId);
    expect(lastAnnouncement().startsWith(`${secondTurn.speaker!.label}.`)).toBe(true);
    expect(lastAnnouncement()).toContain(secondTurn.segments[0].text);
  });

  it('says why it did not move at the first sentence', () => {
    renderWorkspace();

    pressChord('segment.next');
    pressChord('segment.previous');

    expect(lastAnnouncement()).toMatch(/already at the first sentence/i);
  });

  it('is set by clicking a sentence, a pointer affordance per section 2.1', () => {
    const { container } = renderWorkspace();
    const target = resolved.segments[5];

    fireEvent.click(container.querySelector(`[data-segment-id="${target.segmentId}"]`)!);

    expect(activeSegmentId(container)).toBe(target.segmentId);
    expect(lastAnnouncement()).toContain(target.text);
  });

  it('announces coded status and code count on entering a coded segment', () => {
    // Section 6, third row.
    const { container } = renderWorkspace();
    const coded = segmentsWithState(displayStates, 'coded')[0];

    fireEvent.click(container.querySelector(`[data-segment-id="${coded}"]`)!);

    expect(lastAnnouncement()).toMatch(/coded/i);
    expect(lastAnnouncement()).toMatch(/\d+ codes?/);
  });

  it('says nothing about coding on an uncoded segment', () => {
    const { container } = renderWorkspace();
    const uncoded = segmentsWithState(displayStates, 'inactive')[0];

    fireEvent.click(container.querySelector(`[data-segment-id="${uncoded}"]`)!);

    expect(lastAnnouncement()).not.toMatch(/coded/i);
  });

  it('repeats the current sentence without moving', () => {
    const { container } = renderWorkspace();

    pressChord('segment.next');
    pressChord('segment.next');
    const before = activeSegmentId(container);

    pressChord('segment.repeat');

    expect(activeSegmentId(container)).toBe(before);
    expect(lastAnnouncement()).toContain(resolved.segments[1].text);
  });

  it('reports speaker and timestamp on request', () => {
    renderWorkspace();
    pressChord('segment.next');

    pressChord('segment.speaker');
    expect(lastAnnouncement()).toContain(resolved.turns[0].speaker!.label);

    pressChord('segment.timestamp');
    expect(lastAnnouncement()).toMatch(/timestamp \d+:\d{2}/i);
  });
});

describe('acceptance criterion: scroll does not move the active segment', () => {
  it('keeps the reported position unchanged through scrolling', () => {
    const { container } = renderWorkspace();

    pressChord('segment.next');
    pressChord('segment.next');
    pressChord('segment.next');

    const before = activeSegmentId(container);
    const ribbonBefore = ribbonText();
    const announcementsBefore = announced().length;

    // Scroll the transcript and the window, to the end and back.
    act(() => {
      fireEvent.scroll(document, { target: { scrollY: 5000 } });
      fireEvent.scroll(window, { target: { scrollY: 12000 } });
      const list = container.querySelector('.transcript__turns')!;
      fireEvent.scroll(list, { target: { scrollTop: 9000 } });
    });

    expect(activeSegmentId(container)).toBe(before);
    expect(ribbonText()).toBe(ribbonBefore);
    // Scrolling is not an action, so it says nothing either.
    expect(announced()).toHaveLength(announcementsBefore);
  });

  it('offers a way back once the active segment is out of view', () => {
    const { container } = renderWorkspace();
    pressChord('segment.next');

    expect(screen.queryByRole('button', { name: /return to active segment/i })).toBeNull();

    // jsdom has no layout, so visibility is driven directly.
    act(() => {
      const observer = (globalThis as unknown as { __lastObserver?: FakeObserver }).__lastObserver;
      observer?.emit(false);
    });

    expect(screen.getByRole('button', { name: /return to active segment/i })).toBeInTheDocument();

    // And returning does not change where the position is.
    const before = activeSegmentId(container);
    fireEvent.click(screen.getByRole('button', { name: /return to active segment/i }));
    expect(activeSegmentId(container)).toBe(before);
  });
});

describe('acceptance criterion: position agreement', () => {
  it('announces exactly the values the ribbon shows', () => {
    renderWorkspace();

    pressChord('turn.next');
    pressChord('segment.next');
    pressChord('position.report');

    const spoken = lastAnnouncement();
    const ribbon = ribbonText();

    const fields = document.querySelectorAll('.position-ribbon__field');
    expect(fields.length).toBeGreaterThan(0);

    for (const field of fields) {
      const label = field.querySelector('.position-ribbon__label')!.textContent!;
      const value = field.querySelector('.position-ribbon__value')!.textContent!;
      expect(spoken).toContain(`${label} ${value}`);
      expect(ribbon).toContain(value);
    }
  });

  it('agrees at every position through a walk of the source', () => {
    renderWorkspace();

    for (let step = 0; step < 12; step += 1) {
      pressChord('segment.next');
      pressChord('position.report');

      const spoken = lastAnnouncement();
      const value = document.querySelector('.position-ribbon__value')!.textContent!;
      expect(spoken).toContain(value);
      expect(value).toBe(`${step + 1} of ${resolved.segments.length}`);
    }
  });

  it('reports turn and timestamp as well when the detail flag is full', () => {
    renderWorkspace({ ...defaultFlags, positionReportDetail: 'full' });

    pressChord('segment.next');
    pressChord('position.report');

    expect(ribbonText()).toContain('Speaker turn');
    expect(ribbonText()).toContain('Timestamp');
    expect(lastAnnouncement()).toContain('Speaker turn 1 of');
    expect(lastAnnouncement()).toMatch(/Timestamp \d+:\d{2}/);
  });

  it('never labels reading position as progress, per D-009', () => {
    renderWorkspace();
    pressChord('segment.next');

    expect(ribbonText()).not.toMatch(/progress/i);
    expect(ribbonText()).toMatch(/reading position/i);
  });
});

describe('visible controls', () => {
  it('offers a control for every command, showing its chord', () => {
    renderWorkspace();
    const toolbar = screen.getByRole('group', { name: 'Transcript navigation' });

    for (const name of [
      'Previous sentence',
      'Next sentence',
      'Previous turn',
      'Next turn',
      'Repeat sentence',
      'Speaker',
      'Timestamp',
      'Where am I',
    ]) {
      expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    }

    // The hint is generated from the binding table, never written by hand.
    const chord = bindings['segment.next'];
    const hint = within(toolbar).getByRole('button', { name: 'Next sentence' }).textContent ?? '';
    expect(hint).toContain(chord.key);
  });

  it('runs the same action from the control as from the chord', () => {
    const { container } = renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Next sentence' }));
    expect(activeSegmentId(container)).toBe(resolved.segments[0].segmentId);

    fireEvent.click(screen.getByRole('button', { name: 'Next sentence' }));
    expect(activeSegmentId(container)).toBe(resolved.segments[1].segmentId);
  });

  it('marks an unavailable control and still explains it when invoked', () => {
    renderWorkspace();
    pressChord('segment.next');

    const previous = screen.getByRole('button', { name: 'Previous sentence' });
    expect(previous).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(previous);
    expect(lastAnnouncement()).toMatch(/already at the first sentence/i);
  });

  it('creates no live region of its own', () => {
    // Contract 2.3: the application has exactly two, both owned by the service.
    // The two in the document are the provider's; the feature adds none.
    const { container } = renderWorkspace();

    expect(container.querySelectorAll('[aria-live]')).toHaveLength(2);
    for (const region of container.querySelectorAll('[aria-live]')) {
      expect(region.closest('.position-ribbon, .transcript-toolbar, .transcript')).toBeNull();
    }
  });
});

describe('position persistence', () => {
  it('stores the position per user and per source', () => {
    renderWorkspace();

    pressChord('segment.next');
    pressChord('segment.next');

    const stored = readSourcePosition(USER_ID, resolved.source.sourceId);
    expect(stored?.activeSegmentId).toBe(resolved.segments[1].segmentId);
  });

  it('restores the position on re-entry and announces that it did', () => {
    const first = renderWorkspace();
    pressChord('segment.next');
    pressChord('segment.next');
    pressChord('segment.next');
    first.unmount();

    announcer.reset();
    const again = renderWorkspace();

    expect(activeSegmentId(again.container)).toBe(resolved.segments[2].segmentId);
    expect(announced()[0]).toMatch(/position restored/i);
    expect(announced()[0]).toContain('Sentence 3 of');
  });

  it('ignores a stored position that no longer resolves', () => {
    renderWorkspace().unmount();
    localStorage.setItem(
      'qdas.sourcePositions.v1',
      JSON.stringify({
        [`${USER_ID}|${resolved.source.sourceId}`]: {
          userId: USER_ID,
          sourceId: resolved.source.sourceId,
          activeSegmentId: 'sg-gone',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      }),
    );

    const { container } = renderWorkspace();

    expect(activeSegmentId(container)).toBeNull();
    expect(ribbonText()).toContain('Not set');
  });
});

/* ---------- IntersectionObserver stub ---------- */

interface FakeObserver {
  emit: (isIntersecting: boolean) => void;
}

class StubIntersectionObserver implements FakeObserver {
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    (globalThis as unknown as { __lastObserver?: FakeObserver }).__lastObserver = this;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  emit(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
