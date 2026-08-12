import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { clearCodingSession } from '../../data/codingSessionStore';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';

/**
 * The companion hop.
 *
 * Specification: decision D-053, docs/patterns/code-selection.md section 2.2.
 *
 * The round trip D-048 left was one-way. `codes.focusSearch` came back from
 * anywhere; going out meant finding the button, and Escape was the only other
 * route, which closes the companion rather than leaves it. So the workflow the
 * companion exists for — read a definition, check the code, read a sibling
 * definition — paid a reopen every lap.
 *
 * What these tests are about is that the two chords are one habit: F is always
 * the panel, B is always the codebook, and neither closes anything.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSourcePositions();
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

const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const panelIsOpen = () => screen.queryAllByRole('dialog', { name: /code assignment/i }).length > 0;
const companion = () => document.querySelector<HTMLElement>('[data-companion-codebook]');

const panelSearch = () => within(panel()).getByRole('searchbox', { name: 'Search codes' });
const companionSearch = () =>
  within(companion()!).getByRole('searchbox', { name: 'Search codebook' });

/** Opens the panel on a fresh capture from the focused turn. */
function openPanel() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');
}

/** Opens the panel and hops out to the companion, the state most tests start in. */
async function openPanelAndCompanion() {
  openPanel();
  chord('codes.codebook');
  await waitFor(() => expect(companion()).not.toBeNull());
  await waitFor(() => expect(companionSearch()).toHaveFocus());
}

describe('the three cases of codes.codebook, per D-053', () => {
  it('opens the companion and focuses its search when it is closed', async () => {
    // Identical to activating the button, which is what D-053 asks for: one
    // opening behaviour, not a second path that could drift from the first.
    renderAt(sourceUrl);
    openPanel();
    expect(companion()).toBeNull();

    chord('codes.codebook');

    await waitFor(() => expect(companion()).not.toBeNull());
    await waitFor(() => expect(companionSearch()).toHaveFocus());
  });

  it('jumps from the panel to the companion search', async () => {
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    // Back into the panel by hand, to a checkbox rather than the search field —
    // which is where the done-when starts, and where a handler scoped to either
    // search field would miss.
    const checkbox = panel().querySelector<HTMLInputElement>('[data-code-id]')!;
    act(() => checkbox.focus());

    chord('codes.codebook');

    await waitFor(() => expect(companionSearch()).toHaveFocus());
  });

  it('jumps from the companion back to the panel search, leaving it open', async () => {
    /*
      The case that separates a hop from Escape. Returning to the panel with the
      codebook still standing is the whole point: the comparison workflow reads
      a definition, checks the code, and reads the next definition, and closing
      the companion on the way back makes every lap a reopen.
    */
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    chord('codes.codebook');

    await waitFor(() => expect(panelSearch()).toHaveFocus());
    expect(companion(), 'the hop closes nothing').not.toBeNull();
  });

  it('hops back and forth without ever closing anything', async () => {
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    for (let lap = 0; lap < 3; lap += 1) {
      chord('codes.codebook');
      await waitFor(() => expect(panelSearch()).toHaveFocus());
      chord('codes.codebook');
      await waitFor(() => expect(companionSearch()).toHaveFocus());
      expect(companion(), `still open on lap ${lap + 1}`).not.toBeNull();
    }
  });
});

describe('the pair reads as one habit', () => {
  it('takes codes.focusSearch back to the panel from inside the companion too', async () => {
    // D-053's claim about the two together: F always means the panel, whichever
    // surface you are on. B is the one that depends on where you are.
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    chord('codes.focusSearch');

    await waitFor(() => expect(panelSearch()).toHaveFocus());
    expect(companion()).not.toBeNull();
  });

  it('leaves Escape layering exactly as it was', async () => {
    // The reason the hop exists is that Escape was doing this job badly, not
    // that Escape should stop doing it.
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    escape();
    expect(companion(), 'the first Escape closes the companion').toBeNull();
    expect(panelIsOpen(), 'and leaves the panel standing').toBe(true);

    escape();
    expect(panelIsOpen(), 'the second Escape closes the panel').toBe(false);
  });
});

describe('naming, per D-053', () => {
  it('gives the two searches distinct accessible names on one screen', async () => {
    /*
      The point of the rename. With both fields present, "which search am I in"
      has to be answerable from the field's own name, because that is all a
      screen reader reads on arrival.
    */
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    // Each name resolving at all is the assertion: a name query that matched
    // both fields would throw rather than pick one.
    const searches = screen.getAllByRole('searchbox');
    expect(searches).toHaveLength(2);
    expect(searches).toEqual(expect.arrayContaining([panelSearch(), companionSearch()]));
    expect(panelSearch()).not.toBe(companionSearch());
  });

  it('exposes the companion as a region named Codebook', async () => {
    // The free route: a browse-mode user reaches it by landmark without knowing
    // the chord at all.
    renderAt(sourceUrl);
    await openPanelAndCompanion();

    const region = screen.getByRole('region', { name: 'Codebook' });
    expect(region).toBe(companion());
  });

  it('shows the chord on the button without putting it in any name', async () => {
    /*
      Contract 2.2 wants the chord visible on the control. It stays out of the
      accessible name for the toolbar's reason, and here for a second one: this
      button also names the codebook list through `aria-labelledby`.
    */
    renderAt(sourceUrl);
    openPanel();

    const button = within(panel()).getByRole('button', { name: 'Open Codebook' });
    const shown = button.querySelector('.code-panel__chord')!;

    expect(shown.textContent).toMatch(/plus b$/i);
    expect(shown).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('list', { name: 'Open Codebook' })).toBeInTheDocument();
  });
});
