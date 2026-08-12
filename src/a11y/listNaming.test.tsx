import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../App';
import { AnnouncerProvider, createAnnouncer } from '.';
import type { Announcer } from '.';
import { bindingsFor, detectPlatform } from '../config/keybindings';
import type { Command } from '../config/keybindings';
import { clearCodingSession } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { clearSimulatedSession, writeSimulatedSession } from '../data/simulatedSession';
import { clearSourcePositions } from '../data/sourcePositionStore';

/**
 * Every workflow list says what it is, per D-051.
 *
 * The reason is structural navigation: a rotor or list-jump lands on a list
 * with no preceding context, and it announces the list rather than its
 * ancestors. "List, 34 items" does not answer "what is this".
 *
 * Asserted through role queries carrying the `name` option, so what is checked
 * is the computed accessible name. A broken `aria-labelledby` reference fails
 * here rather than passing an attribute check.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSimulatedSession();
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

function openPanel() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');
}

/** Every list in the document that exposes no accessible name. */
function unnamedLists(): string[] {
  return screen
    .queryAllByRole('list')
    .filter((list) => {
      const labelledBy = list.getAttribute('aria-labelledby');
      const named =
        list.getAttribute('aria-label') ??
        (labelledBy ? document.getElementById(labelledBy)?.textContent : null);
      return !named?.trim();
    })
    .map((list) => list.className || list.tagName.toLowerCase());
}

describe('the lists on each surface are named', () => {
  it('names the sidebar’s two lists, and the application nav', () => {
    renderAt(`/projects/${project.projectId}`);

    expect(screen.getByRole('list', { name: 'Project 1 Files' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Destinations' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Application' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Your sources' })).toBeInTheDocument();
  });

  it('names the projects list', () => {
    renderAt('/projects');
    expect(screen.getByRole('list', { name: 'Projects' })).toBeInTheDocument();
  });

  it('names the panel’s code list by the Open Codebook button', () => {
    // The specific gap the Task 28a finding left: the list lost its name when
    // its heading became the button, so the button names it now.
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    expect(screen.getByRole('list', { name: 'Open Codebook' })).toBeInTheDocument();
  });

  it('names the panel’s search results by their count', () => {
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.change(within(panel).getByRole('searchbox', { name: /find codes/i }), {
      target: { value: 'water' },
    });

    expect(screen.getByRole('list', { name: /results for “water”/ })).toBeInTheDocument();
  });

  it('names the Codebook page’s lists', () => {
    renderAt(`/projects/${project.projectId}/codebook`);

    // A family card's subtree takes the parent code's name.
    const family = fixture.codes.find(
      (code) => code.parentCodeId === null && fixture.codes.some((c) => c.parentCodeId === code.codeId),
    )!;
    expect(screen.getByRole('list', { name: family.name })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search the codebook/i }), {
      target: { value: 'water' },
    });
    expect(screen.getByRole('list', { name: /results for “water”/ })).toBeInTheDocument();
  });

  it('names the Coded data page’s lists', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(`/projects/${project.projectId}/coded-data`);

    expect(screen.getByRole('list', { name: 'Codes' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /\d+ excerpts?/ })).toBeInTheDocument();
  });
});

describe('no list anywhere is left unnamed', () => {
  /*
    The sweep that makes the tests above a floor rather than a checklist: a list
    added later without a name fails here, naming itself in the failure.
  */
  it('on the projects route', () => {
    renderAt('/projects');
    expect(unnamedLists()).toEqual([]);
  });

  it('on the project route', () => {
    renderAt(`/projects/${project.projectId}`);
    expect(unnamedLists()).toEqual([]);
  });

  it('on a source, with the panel open and searching', () => {
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.change(within(panel).getByRole('searchbox', { name: /find codes/i }), {
      target: { value: 'water' },
    });
    expect(unnamedLists()).toEqual([]);
  });

  it('on a source, with the companion codebook open', () => {
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.click(within(panel).getByRole('button', { name: /open codebook/i }));

    expect(unnamedLists()).toEqual([]);
  });

  it('on the Codebook page', () => {
    renderAt(`/projects/${project.projectId}/codebook`);
    expect(unnamedLists()).toEqual([]);
  });

  it('on the Coded data page, in both views', () => {
    renderAt(`/projects/${project.projectId}/coded-data`);
    expect(unnamedLists()).toEqual([]);

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'qualitativeLead' } });
    expect(unnamedLists()).toEqual([]);
  });
});

describe('a checkbox and its code pill are one control, per D-051', () => {
  it('takes the code name as its accessible name', () => {
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    const codebook = document.querySelector<HTMLElement>('[data-region="codebook"]')!;
    for (const code of fixture.codes.slice(0, 5)) {
      expect(
        within(codebook).getByRole('checkbox', { name: code.name }),
        `${code.name} has no accessible name of its own`,
      ).toBeInTheDocument();
    }
  });

  it('toggles when the pill text is clicked, not only the box', () => {
    // Driven as a click on the label rather than the input, so it fails if the
    // association is ever broken.
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    const code = fixture.codes[0];
    const box = document.querySelector<HTMLInputElement>(
      `[data-region="codebook"] [data-code-id="${code.codeId}"]`,
    )!;
    const pill = box.closest('.code-panel__code')!.querySelector('.code-panel__code-name')!;

    expect(box.checked).toBe(false);
    fireEvent.click(pill);
    expect(box.checked).toBe(true);
  });

  it('puts the whole row inside the label, so the row is the control', () => {
    // What wrapping buys beyond the `for` association it replaced: the hit area
    // is the row rather than the text, which is the difference at magnification.
    renderAt(`/projects/${project.projectId}/sources/${source.sourceId}`);
    openPanel();

    const box = document.querySelector<HTMLInputElement>(
      `[data-region="codebook"] [data-code-id="${fixture.codes[0].codeId}"]`,
    )!;
    const row = box.closest('.code-panel__code')!;

    expect(row.tagName.toLowerCase()).toBe('label');
    expect(row.contains(box)).toBe(true);
  });
});
