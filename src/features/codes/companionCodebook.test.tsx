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
 * The companion codebook.
 *
 * Specification: decision D-048, docs/patterns/code-selection.md section 2.2.
 *
 * D-048 closes the modality question rather than reopening it: instead of
 * un-trapping the panel so a coder can reach the Codebook destination
 * mid-capture, the codebook comes to the coder. So what these tests are really
 * about is that the two are one surface — one focus scope, one Escape stack,
 * and one component behind both renderings.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;
const codebookUrl = `/projects/${project.projectId}/codebook`;

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
const toggle = () => within(panel()).getByRole('button', { name: /open codebook/i });

/** Opens the panel on a fresh capture from the focused turn. */
function openPanel() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');
}

/** Every code name and definition a surface renders, in document order. */
function codebookContentOf(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-family-id] [data-code-id]')).map((record) => {
    const name = record.querySelector('.codebook__name')!.textContent ?? '';
    const definition = record.querySelector('.codebook__definition')!.textContent ?? '';
    return `${name}||${definition}`;
  });
}

describe('opening and closing, per D-048', () => {
  it('takes focus to the companion search and gives it back to the button', () => {
    // Contract 2.4: a temporary view defines focus entry and focus return, and
    // this is the round trip the task names.
    renderAt(sourceUrl);
    openPanel();

    expect(companion()).toBeNull();
    fireEvent.click(toggle());

    expect(companion()).not.toBeNull();
    return waitFor(() => {
      expect(within(companion()!).getByRole('searchbox', { name: 'Search codebook' })).toHaveFocus();
    }).then(() => {
      fireEvent.click(toggle());
      expect(companion()).toBeNull();
      return waitFor(() => expect(toggle()).toHaveFocus());
    });
  });

  it('reports its state on the button rather than only by what is on screen', () => {
    renderAt(sourceUrl);
    openPanel();

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(toggle()).toHaveAttribute('aria-controls', companion()!.id);
  });

  it('stays inside the dialog, so it is inside the panel focus scope', () => {
    // The whole reason the panel could stay modal: the companion is part of the
    // same composite surface rather than something outside the trap.
    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());

    expect(panel().contains(companion())).toBe(true);
  });
});

describe('Escape layers, per D-048 and D-042', () => {
  it('closes the companion first and the panel second', async () => {
    const { container } = renderAt(sourceUrl);
    openPanel();

    const firstCode = fixture.codes[0];
    fireEvent.click(panel().querySelector(`[data-code-id="${firstCode.codeId}"]`)!);
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    escape();
    expect(companion(), 'the first Escape closes the companion').toBeNull();
    expect(panelIsOpen(), 'and leaves the panel standing').toBe(true);

    escape();
    expect(panelIsOpen(), 'the second Escape closes the panel').toBe(false);
    // And it committed, per D-042: the layering must not change what closing
    // the panel means.
    const saved = container.querySelector('[data-saved-excerpts]')!;
    expect(saved.getAttribute('data-saved-assignments')).toBe('1');
  });

  it('layers the same way from focus in the panel, not just inside the companion', async () => {
    // The handler is on `document`, so the layering has to hold wherever focus
    // sits in the composite surface. Focus in the panel's own list is the case
    // a companion-scoped handler would miss.
    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    const checkbox = panel().querySelector<HTMLInputElement>('[data-code-id]')!;
    act(() => checkbox.focus());

    escape();
    expect(companion()).toBeNull();
    expect(panelIsOpen()).toBe(true);
  });
});

describe('the companion adds no capability', () => {
  it('offers no checkbox, so codes cannot be checked from it', async () => {
    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    expect(companion()!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(within(companion()!).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('leaves the pending assignment untouched across an open and close', async () => {
    renderAt(sourceUrl);
    openPanel();

    const [first, second] = fixture.codes;
    fireEvent.click(panel().querySelector(`[data-code-id="${first.codeId}"]`)!);
    fireEvent.click(panel().querySelector(`[data-code-id="${second.codeId}"]`)!);

    const checked = () =>
      Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
        .filter((box) => box.checked)
        .map((box) => box.dataset.codeId!);
    const before = checked();

    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());
    fireEvent.click(toggle());

    expect(checked()).toEqual(before);
  });
});

describe('one component, two surfaces', () => {
  it('renders the same codebook beside the panel as the destination page does', async () => {
    // The guard on "reuse the component; do not fork it". Two renderings built
    // from different code drift the first time either is edited, and this is
    // what would notice.
    const page = renderAt(codebookUrl);
    const fromPage = codebookContentOf(page.container);
    expect(fromPage.length).toBe(fixture.codes.length);
    page.unmount();

    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    expect(codebookContentOf(companion()!)).toEqual(fromPage);
  });

  it('sits a level deeper than the page, under the dialog heading', async () => {
    // The page puts families at h2 under its route h1. Inside the dialog they
    // cannot: its own title is the h2, so the companion starts at h3.
    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    const families = fixture.codes.filter((code) => code.parentCodeId === null);
    const headings = within(companion()!)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);

    for (const family of families) expect(headings).toContain(family.name);
  });
});

describe('companion state, per D-048', () => {
  it('persists while the panel stays open', async () => {
    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    // Work in the panel; the companion is still there afterwards.
    fireEvent.click(panel().querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    fireEvent.change(within(panel()).getByRole('searchbox', { name: 'Search codes' }), {
      target: { value: 'water' },
    });

    expect(companion()).not.toBeNull();
  });

  it('starts closed when the panel is opened again', async () => {
    renderAt(sourceUrl);
    openPanel();
    fireEvent.click(toggle());
    await waitFor(() => expect(companion()).not.toBeNull());

    // Close the panel with nothing checked, which discards and creates nothing.
    escape();
    escape();
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    openPanel();
    expect(companion()).toBeNull();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });
});
