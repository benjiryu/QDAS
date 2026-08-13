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
 * Lineage in the description, and typing in the list reaching search.
 *
 * Specification: decision D-054, docs/patterns/code-selection.md section 4.
 *
 * Both come from screen reader participant interviews, and both are workflow
 * findings rather than access blockers: the tasks were completed, the structure
 * under-communicated. Hierarchy was carried entirely by nesting and indentation,
 * which screen readers flatten in form contexts, so it never reached the ear.
 * And first-letter navigation was expected where the list's role never had it.
 *
 * The description resolves in jsdom — checked before these were written, since
 * a description query that silently found nothing would pass for the wrong
 * reason — so the accessible name and description are both asserted here.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;

/** A family, one of its children, and one of that child's children. */
const family = fixture.codes.find(
  (code) =>
    code.parentCodeId === null &&
    fixture.codes.some((child) =>
      fixture.codes.some(
        (grandchild) =>
          child.parentCodeId === code.codeId && grandchild.parentCodeId === child.codeId,
      ),
    ),
)!;
const child = fixture.codes.find(
  (code) =>
    code.parentCodeId === family.codeId &&
    fixture.codes.some((grandchild) => grandchild.parentCodeId === code.codeId),
)!;
const grandchild = fixture.codes.find((code) => code.parentCodeId === child.codeId)!;

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

const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const panelSearch = () => within(panel()).getByRole('searchbox', { name: 'Search codes' });

/** The checkbox for a code, in the codebook region rather than the results. */
const boxFor = (codeId: string) =>
  document.querySelector<HTMLInputElement>(
    `[data-region="codebook"] [data-code-id="${codeId}"]`,
  )!;

function openPanel() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');
}

describe('lineage rides in the description, per D-054', () => {
  it('says nothing about family for a top-level code', () => {
    // There is no lineage to give, and "in" with nothing after it would be
    // worse than silence.
    renderAt(sourceUrl);
    openPanel();

    expect(boxFor(family.codeId)).not.toHaveAccessibleDescription();
  });

  it('describes a child by its parent', () => {
    renderAt(sourceUrl);
    openPanel();

    expect(boxFor(child.codeId)).toHaveAccessibleDescription(`in ${family.name}`);
  });

  it('describes a grandchild by its whole path, outermost first', () => {
    // The done-when: name, state, then family. The path reads general to
    // specific inside itself while the row reads specific to general overall.
    renderAt(sourceUrl);
    openPanel();

    expect(boxFor(grandchild.codeId)).toHaveAccessibleDescription(
      `in ${family.name}, ${child.name}`,
    );
  });

  it('keeps every accessible name exactly the code name', () => {
    /*
      The amended D-051 assertion, and the one that matters most here: a lineage
      that leaked into the name would break search, sorting, and the redirect,
      and would make checking a box read out a path rather than a code.

      Asserted with `toHaveAccessibleName`, which is exact — a name query
      matching on substring would pass while the name grew.
    */
    renderAt(sourceUrl);
    openPanel();

    for (const code of [family, child, grandchild]) {
      expect(boxFor(code.codeId), code.name).toHaveAccessibleName(code.name);
    }
  });

  it('leaves the row one stop, with the description outside the label', () => {
    // The description must not be inside the wrapping label: there its text
    // would join the name rather than stay a description.
    renderAt(sourceUrl);
    openPanel();

    const box = boxFor(grandchild.codeId);
    const describedById = box.getAttribute('aria-describedby')!;
    const description = document.getElementById(describedById)!;

    expect(box.closest('label')!.contains(description)).toBe(false);
    expect(description.textContent).toBe(`in ${family.name}, ${child.name}`);
  });

  it('describes a search result too, without also reading its path as text', async () => {
    /*
      The results rows show the same lineage on screen. Said as loose text as
      well as in the description it would be heard twice, which is the second
      stop D-051 removed from these rows.
    */
    renderAt(sourceUrl);
    openPanel();

    fireEvent.change(panelSearch(), { target: { value: grandchild.name } });

    const results = await screen.findByRole('list', { name: /results? for/ });
    const box = within(results).getByRole('checkbox', { name: grandchild.name });

    expect(box).toHaveAccessibleDescription(`in ${family.name}, ${child.name}`);

    const path = results.querySelector('.code-panel__path')!;
    expect(path, 'the path stays on screen').toBeInTheDocument();
    expect(path).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('typing in the list reaches search, per D-054', () => {
  it('moves focus to search and starts the query with the character typed', async () => {
    // Type-ahead in spirit, the search machinery in fact. The character is not
    // swallowed: the first keystroke counts.
    renderAt(sourceUrl);
    openPanel();

    const box = boxFor(family.codeId);
    act(() => box.focus());
    fireEvent.keyDown(box, { key: 'w' });

    await waitFor(() => expect(panelSearch()).toHaveFocus());
    expect(panelSearch()).toHaveValue('w');
  });

  it('takes a second character in the field, and settles on one count', async () => {
    /*
      The done-when: "wa" in the field and one settled count announcement. The
      second character is ordinary typing, because focus is already there. The
      count coalesces through the continuous class per D-050 rather than
      reporting a count for "w" that is no longer true.
    */
    renderAt(sourceUrl);
    openPanel();

    const box = boxFor(family.codeId);
    act(() => box.focus());
    fireEvent.keyDown(box, { key: 'w' });
    await waitFor(() => expect(panelSearch()).toHaveFocus());
    fireEvent.change(panelSearch(), { target: { value: 'wa' } });

    expect(panelSearch()).toHaveValue('wa');

    await waitFor(() => {
      const counts = announcer.getHistory().filter((entry) => /results? for/.test(entry.message));
      expect(counts).toHaveLength(1);
      expect(counts[0].message).toMatch(/for wa\.$/);
    });
  });

  it('leaves Space toggling the checkbox', () => {
    /*
      Space is printable and is the one character that must not redirect: it is
      how a keyboard user checks the box they are standing on. Driven as the
      keydown the redirect would intercept, so this fails if the exclusion goes.
    */
    renderAt(sourceUrl);
    openPanel();

    const box = boxFor(family.codeId);
    act(() => box.focus());
    fireEvent.keyDown(box, { key: ' ' });

    expect(box).toHaveFocus();
    expect(panelSearch()).toHaveValue('');
  });

  it('leaves Enter alone', () => {
    renderAt(sourceUrl);
    openPanel();

    const box = boxFor(family.codeId);
    act(() => box.focus());
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(box).toHaveFocus();
    expect(panelSearch()).toHaveValue('');
  });

  it('leaves modified keys to the chords', async () => {
    // `codes.focusSearch` carries a letter. Redirecting on it would swallow
    // every chord that does, and start the query with an "f" nobody typed.
    renderAt(sourceUrl);
    openPanel();

    const box = boxFor(family.codeId);
    act(() => box.focus());
    chord('codes.focusSearch');

    await waitFor(() => expect(panelSearch()).toHaveFocus());
    expect(panelSearch(), 'the chord moved focus without typing into it').toHaveValue('');
  });
});
