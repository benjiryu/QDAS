import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions, readSourcePosition } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from './TranscriptWorkspace';

/**
 * Specification: docs/patterns/transcript-segment.md section 5 and its v0.2
 * banner, decision D-038.
 *
 * The acceptance criterion that survives from section 10 is "Position
 * agreement": the spoken report and the visible ribbon are built from the same
 * fields and cannot disagree. "Scroll does not move the active segment" is
 * gone with the active segment, and its successor is stronger — nothing but
 * focus can move the position at all, because nothing else is consulted.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
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
        seedExcerpts={fixture.excerpts}
        seedAssignments={fixture.codeAssignments}
        codingRoundId={fixture.codingRound.codingRoundId}
        codebookVersionId={fixture.codebookVersion.codebookVersionId}
        codes={fixture.codes}
        projectId={fixture.project.projectId}
        userId={USER_ID}
        flags={flags}
      />
    </AnnouncerProvider>,
  );
}

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

const turnElements = () => Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]'));
const focusTurn = (index: number) => act(() => turnElements()[index].focus());

const announced = () => announcer.getHistory().map((entry) => entry.message);
const lastAnnouncement = () => announcer.getLast()?.message ?? '';
const ribbonText = () => document.querySelector('.position-ribbon')?.textContent ?? '';

describe('focus is the position', () => {
  it('starts with none, and says so rather than guessing one', () => {
    renderWorkspace();

    expect(ribbonText()).toContain('No speaker turn focused');
    expect(announced()[0]).toContain(resolved.source.title);
    expect(announced()[0]).toContain('No saved position');
  });

  it('follows focus into a turn', () => {
    renderWorkspace();

    focusTurn(2);

    expect(ribbonText()).toContain('Speaker turn 3 of');
  });

  it('follows focus wherever it lands, including backwards', () => {
    renderWorkspace();

    focusTurn(4);
    expect(ribbonText()).toContain('Speaker turn 5 of');

    focusTurn(1);
    expect(ribbonText()).toContain('Speaker turn 2 of');
  });

  it('draws no indicator of its own on the transcript', () => {
    // D-038: clicking or focusing a turn shows the focus ring and nothing
    // else, so a captured excerpt's highlight is unmistakable as the only
    // thing the application draws.
    const { container } = renderWorkspace();
    focusTurn(2);

    expect(container.querySelector('[data-active]')).toBeNull();
  });

  it('is not moved by scrolling', () => {
    // There is no scroll listener to remove: this asserts that none appeared.
    renderWorkspace();
    focusTurn(1);

    act(() => {
      fireEvent.scroll(document, { target: { scrollY: 4000 } });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(ribbonText()).toContain('Speaker turn 2 of');
  });
});

describe('the three orientation commands', () => {
  it('names the speaker of the focused turn', () => {
    renderWorkspace();
    focusTurn(3);

    pressChord('segment.speaker');

    expect(lastAnnouncement()).toContain(resolved.turns[3].speaker!.label);
  });

  it('gives the timestamp the focused turn opens at', () => {
    renderWorkspace();
    focusTurn(3);

    pressChord('segment.timestamp');

    expect(lastAnnouncement()).toMatch(/timestamp \d/i);
  });

  it('reports the turn position, matching the ribbon exactly', () => {
    // "Position agreement", from section 10. Both come from one function, and
    // this is the assertion that keeps it that way.
    renderWorkspace();
    focusTurn(5);

    pressChord('position.report');

    const spoken = lastAnnouncement();
    expect(spoken).toContain('Speaker turn 6 of');
    for (const part of spoken.split('. ').filter(Boolean)) {
      expect(ribbonText().replace(/\s+/g, ' ')).toContain(part.replace(/\.$/, ''));
    }
  });

  it('reports no sentence position, since there is no active sentence', () => {
    renderWorkspace();
    focusTurn(2);

    pressChord('position.report');

    expect(lastAnnouncement()).not.toMatch(/sentence/i);
    expect(ribbonText()).not.toMatch(/sentence/i);
  });

  it('says how to get a position when nothing is focused', () => {
    // Contract 2.6: an unavailable command is never a dead end, and after
    // D-038 there is no command that would establish a position.
    renderWorkspace();

    pressChord('position.report');

    expect(lastAnnouncement()).toMatch(/tab/i);
  });


});

describe('what the movement commands left behind', () => {
  it('makes every turn a tab stop, which is the only movement there is', () => {
    const { container } = renderWorkspace();

    const stops = container.querySelectorAll('[data-turn-id][tabindex="0"]');
    expect(stops).toHaveLength(resolved.turns.length);
    expect(container.querySelectorAll('[data-segment-id][tabindex]')).toHaveLength(0);
  });


  it('offers no return-to-position control, since focus never left', () => {
    renderWorkspace();
    focusTurn(1);

    expect(screen.queryByRole('button', { name: /return to/i })).toBeNull();
  });
});

describe('the strip is gone, and every command it carried is a chord', () => {
  /*
    The five controls D-038 named were removed as the prototype tidied up. What
    replaced them is nothing: each command keeps its chord, and capture is also
    on the context menu. D-057's discoverability floor named `help.shortcuts` as
    the surface that would teach them, and that command is still unbuilt — a gap
    recorded in the decision log rather than papered over here.
  */
  it('renders no command buttons on the transcript page', () => {
    renderWorkspace();

    expect(screen.queryByRole('group', { name: 'Orientation' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Excerpt' })).toBeNull();

    const labels = screen
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace(/(Control|Shift|Alt).*$/, '').trim());

    for (const gone of ['Speaker', 'Timestamp', 'Where am I', 'Assign code', 'Add note']) {
      expect(labels, `${gone} still has a control`).not.toContain(gone);
    }
  });

  it('still answers each orientation command from its chord', () => {
    // The commands did not go with their controls, which is the whole basis on
    // which removing the controls was acceptable.
    renderWorkspace();
    focusTurn(3);

    for (const command of ['segment.speaker', 'segment.timestamp', 'position.report'] as const) {
      const before = announcer.getHistory().length;
      pressChord(command);
      expect(announcer.getHistory().length, command).toBeGreaterThan(before);
    }
  });
});


describe('position restoration', () => {
  it('records the focused turn, by its first sentence', () => {
    renderWorkspace();

    focusTurn(2);

    const stored = readSourcePosition(USER_ID, resolved.source.sourceId);
    expect(stored?.activeSegmentId).toBe(resolved.turns[2].segments[0].segmentId);
  });

  it('restores it on the next visit without moving focus', () => {
    // Contract 2.4 forbids moving focus on load. The position is brought into
    // view and announced, and the reader tabs into it when they choose.
    const first = renderWorkspace();
    focusTurn(3);
    first.unmount();
    announcer.reset();

    const { container } = renderWorkspace();

    expect(announced()[0]).toContain('Position restored');
    expect(announced()[0]).toContain('Speaker turn 4 of');
    expect(ribbonText()).toContain('Speaker turn 4 of');
    expect(container.contains(document.activeElement)).toBe(false);
  });

  it('discards a stored position that no longer resolves', () => {
    renderWorkspace().unmount();
    announcer.reset();
    window.localStorage.setItem(
      'qdas.sourcePositions.v1',
      JSON.stringify({
        [`${USER_ID}|${resolved.source.sourceId}`]: {
          userId: USER_ID,
          sourceId: resolved.source.sourceId,
          activeSegmentId: 'sg-does-not-exist',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      }),
    );

    renderWorkspace();

    expect(announced()[0]).toContain('No saved position');
    expect(ribbonText()).toContain('No speaker turn focused');
  });
});
