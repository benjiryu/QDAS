import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { bindingsFor, describeChord, detectPlatform } from '../../config/keybindings';
import type { Command, Platform } from '../../config/keybindings';
import { clearCodingSession } from '../../data/codingSessionStore';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { clearShortcutsHelp } from './shortcutsHelpStore';

/**
 * The shortcuts help.
 *
 * Specification: decision D-057, which names this "the canonical visible
 * surface for the command vocabulary", and D-065, which recorded the gate it
 * closes — removing the command strip left nothing on screen naming a command.
 *
 * Two things here are worth more than the rest. One is the completeness guard:
 * D-057 says this surface lists every command, so a command added later without
 * a row should fail here rather than go quietly undocumented. The other is what
 * Escape does with the code panel open beneath — it closes the help and leaves
 * the panel exactly as it was, because a help dialog that costs a coder their
 * pending codes is worse than no help dialog.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSourcePositions();
  clearShortcutsHelp();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSourcePositions();
  clearShortcutsHelp();
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

const escape = () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

const help = () => screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
const helpIsOpen = () =>
  screen.queryAllByRole('dialog', { name: 'Keyboard shortcuts' }).length > 0;
const helpControl = () => screen.getByRole('button', { name: 'Keyboard shortcuts' });

const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const panelIsOpen = () => screen.queryAllByRole('dialog', { name: /code assignment/i }).length > 0;

/** Every chord the help renders, keyed by the label beside it. */
function renderedChords(): string[] {
  return within(help())
    .getAllByText((_, element) => element?.tagName === 'KBD')
    .map((element) => element.textContent ?? '');
}

const noteRegion = () => panel().querySelector<HTMLElement>('[data-region="note"]')!;
const noteRow = () => within(noteRegion()).getByRole('button', { name: /add note|edit note/i });
const noteField = () =>
  within(noteRegion()).getByLabelText(/note about this excerpt/i) as HTMLTextAreaElement;

/** Opens the panel on a fresh capture from the focused turn. */
function openPanel() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');
}

describe('what the help lists', () => {
  it('lists every command in the vocabulary', () => {
    /*
      D-057's claim as a test. The union is the vocabulary; anything in it that
      no group documents is a command a coder can only learn by reading source.
    */
    renderAt(sourceUrl);
    chord('help.shortcuts');

    const documented = new Set(
      [...help().querySelectorAll<HTMLElement>('[data-command]')].map(
        (row) => row.dataset.command,
      ),
    );

    for (const command of Object.keys(bindings) as Command[]) {
      expect(documented.has(command), `${command} has no row in the help`).toBe(true);
    }
  });

  it('reads every chord from the binding table rather than writing one down', () => {
    /*
      The constraint the task set: content derives from the tables at runtime.
      Every rendered chord has to be some binding's description, so a hardcoded
      string — even a currently correct one — fails here rather than waiting to
      be wrong after a rebinding.
    */
    renderAt(sourceUrl);
    chord('help.shortcuts');

    const fromTable = new Set(
      (Object.keys(bindings) as Command[]).map((command) =>
        describeChord(bindings[command], detectPlatform()),
      ),
    );

    for (const rendered of renderedChords()) {
      expect(fromTable.has(rendered), `"${rendered}" is not in the binding table`).toBe(true);
    }
  });

  it('describes the same commands with the keys of the platform in hand', () => {
    // Both tables are honoured, so a mac coder is not shown Windows keys. The
    // describing is `describeChord`'s job; what matters here is that the two
    // tables really do differ, or the test above would prove nothing.
    const platforms: Platform[] = ['mac', 'other'];
    const described = platforms.map((platform) => {
      const table = bindingsFor(platform);
      return (Object.keys(table) as Command[])
        .map((command) => describeChord(table[command], platform))
        .join('|');
    });

    expect(described[0]).not.toBe(described[1]);
  });

  it('is named, and groups its commands into named lists', () => {
    renderAt(sourceUrl);
    chord('help.shortcuts');

    const lists = within(help()).getAllByRole('list');
    expect(lists.length).toBeGreaterThan(1);
    for (const list of lists) {
      expect(list).toHaveAccessibleName();
    }
  });
});

describe('reaching the help', () => {
  it('opens from the banner control, which is the way in that needs no chord', async () => {
    /*
      The gate D-065 recorded. A shortcuts surface reachable only by Ctrl and a
      key teaches chords to people who already know one, so this control is the
      part of the task that actually closes it.
    */
    renderAt(sourceUrl);
    expect(helpIsOpen()).toBe(false);

    act(() => helpControl().click());

    await waitFor(() => expect(helpIsOpen()).toBe(true));
  });

  it('opens from its chord', async () => {
    renderAt(sourceUrl);
    chord('help.shortcuts');

    await waitFor(() => expect(helpIsOpen()).toBe(true));
  });

  it('returns focus to whatever opened it', async () => {
    renderAt(sourceUrl);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('help.shortcuts');
    await waitFor(() => expect(helpIsOpen()).toBe(true));

    escape();

    await waitFor(() => expect(helpIsOpen()).toBe(false));
    await waitFor(() => expect(turn).toHaveFocus());
  });

  it('returns focus to the banner control when that is what opened it', async () => {
    renderAt(sourceUrl);

    act(() => helpControl().focus());
    act(() => helpControl().click());
    await waitFor(() => expect(helpIsOpen()).toBe(true));

    act(() => void within(help()).getByRole('button', { name: 'Close' }).click());

    await waitFor(() => expect(helpIsOpen()).toBe(false));
    await waitFor(() => expect(helpControl()).toHaveFocus());
  });
});

describe('Escape above the code panel', () => {
  it('closes the help and leaves the panel untouched', async () => {
    /*
      The requirement stated as an assertion. Asking what a chord does is not a
      decision about the excerpt, so it cannot commit the assignment and it
      cannot discard it — the panel is still open afterwards with the same code
      pending and the same note text, exactly as it was left.
    */
    renderAt(sourceUrl);
    openPanel();
    await waitFor(() => expect(panelIsOpen()).toBe(true));

    const checkbox = panel().querySelector<HTMLInputElement>('[data-code-id]')!;
    act(() => void fireEvent.click(checkbox));
    act(() => void fireEvent.click(noteRow()));
    act(() => void fireEvent.change(noteField(), { target: { value: 'still here' } }));

    chord('help.shortcuts');
    await waitFor(() => expect(helpIsOpen()).toBe(true));

    escape();

    await waitFor(() => expect(helpIsOpen()).toBe(false));
    expect(panelIsOpen(), 'the panel did not close underneath').toBe(true);
    expect(
      panel().querySelector<HTMLInputElement>(`[data-code-id="${checkbox.dataset.codeId}"]`),
    ).toBeChecked();
    expect(noteField()).toHaveValue('still here');
  });

  it('hands Escape back to the panel once the help is gone', async () => {
    // A stack, not a swallow: the second Escape does what the first would have
    // done had the help never been opened.
    renderAt(sourceUrl);
    openPanel();
    await waitFor(() => expect(panelIsOpen()).toBe(true));

    chord('help.shortcuts');
    await waitFor(() => expect(helpIsOpen()).toBe(true));
    escape();
    await waitFor(() => expect(helpIsOpen()).toBe(false));

    escape();

    await waitFor(() => expect(panelIsOpen()).toBe(false));
  });
});
