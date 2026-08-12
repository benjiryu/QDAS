import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AnnouncerProvider, createAnnouncer } from '.';
import type { Announcer } from '.';
import { bindingsFor, detectPlatform } from '../config/keybindings';
import type { Command } from '../config/keybindings';
import { clearCodingSession } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { clearSimulatedSession } from '../data/simulatedSession';
import { clearSourcePositions } from '../data/sourcePositionStore';

/**
 * Search-as-you-type announces once, per D-050.
 *
 * The announcer's own tests prove the mechanism. These prove the two surfaces
 * are actually wired to it, which is the part that would rot silently: nothing
 * asserted the panel's search announcement before this task, so it had the
 * queued-prefix defect for as long as it existed and no test noticed.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const CONTINUOUS_MS = 600;

let announcer: Announcer;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
  announcer = createAnnouncer({
    intervalMs: 5,
    clearGapMs: 1,
    continuousDelayMs: CONTINUOUS_MS,
  });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
  vi.useRealTimers();
});

function renderAt(path: string) {
  return render(
    <AnnouncerProvider announcer={announcer}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

const bindings = bindingsFor(detectPlatform());

function chord(command: Command) {
  const binding = bindings[command];
  act(() => {
    fireEvent.keyDown(document, {
      key: binding.key,
      ctrlKey: Boolean(binding.ctrl),
      altKey: Boolean(binding.alt),
      shiftKey: Boolean(binding.shift),
      metaKey: Boolean(binding.meta),
    });
  });
}

/** Announcements mentioning a result count, in order. */
const counts = () =>
  announcer
    .getHistory()
    .map((entry) => entry.message)
    .filter((message) => /results? for/.test(message));

/** Types a query one character at a time, faster than the pause. */
function typeQuery(field: HTMLElement, query: string) {
  for (let length = 1; length <= query.length; length += 1) {
    fireEvent.change(field, { target: { value: query.slice(0, length) } });
    act(() => {
      vi.advanceTimersByTime(40);
    });
  }
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(CONTINUOUS_MS + 50);
  });
}

describe('the panel search', () => {
  it('announces the settled count once, not every prefix', () => {
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('excerpt.code');

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    const field = within(panel).getByRole('searchbox', { name: /find codes/i });

    typeQuery(field, 'water');
    // Nothing yet: the coder is still typing.
    expect(counts()).toEqual([]);

    settle();

    expect(counts()).toHaveLength(1);
    expect(counts()[0]).toMatch(/for water\.$/);
  });
});

describe('the Codebook search', () => {
  it('announces its count too, which it did not before', () => {
    // New behaviour rather than a move: this surface said nothing at all, so a
    // screen reader user learned the count only by navigating to the region.
    renderAt(`/projects/${project.projectId}/codebook`);

    const field = screen.getByRole('searchbox', { name: /search the codebook/i });
    typeQuery(field, 'water');
    expect(counts()).toEqual([]);

    settle();

    expect(counts()).toHaveLength(1);
    expect(counts()[0]).toMatch(/for water\.$/);
  });
});

describe('discrete announcements are untouched alongside', () => {
  it('speaks every code toggle, while a count is still settling', () => {
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('excerpt.code');

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    typeQuery(within(panel).getByRole('searchbox', { name: /find codes/i }), 'wa');

    const [first, second] = fixture.codes;
    fireEvent.click(panel.querySelector(`[data-code-id="${first.codeId}"]`)!);
    fireEvent.click(panel.querySelector(`[data-code-id="${second.codeId}"]`)!);

    // Both toggles are already recorded, ahead of the count that is still
    // waiting for the typing to stop.
    const added = announcer.getHistory().filter((entry) => /added\./.test(entry.message));
    expect(added).toHaveLength(2);
    expect(counts()).toEqual([]);
    for (const entry of added) expect(entry.kind).toBe('discrete');
  });
});
