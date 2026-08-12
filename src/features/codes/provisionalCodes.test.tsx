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
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * Specification: docs/patterns/code-selection.md section 7.
 *
 * Definition lookup was removed from the panel by D-035, so the acceptance
 * criterion this file used to carry, "Return from definition", no longer
 * exists. What remains is provisional code creation.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});
const canonicalOrder = [...fixture.codes]
  .sort((a, b) => a.canonicalOrderIndex - b.canonicalOrderIndex)
  .map((code) => code.name);

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

function openPanel() {
  act(() => {
    document.querySelectorAll<HTMLElement>('[data-turn-id]')[1].focus();
  });
  chord('excerpt.code');
}

const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
const region = (name: string) => panel().querySelector<HTMLElement>(`[data-region="${name}"]`)!;

function codebookOrder(): string[] {
  return Array.from(region('codebook').querySelectorAll('.code-panel__code-name')).map(
    (element) => element.textContent ?? '',
  );
}

function search(query: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: /find codes/i }), {
    target: { value: query },
  });
}

const lastAnnouncement = () => announcer.getLast()?.message ?? '';

/** Expands the Create code disclosure, per D-039. */
function openCreate() {
  fireEvent.click(within(region('create')).getByRole('button', { name: /create new code/i }));
}

/** How many codes are checked, which is the pending assignment now. */
function checkedCodeIds(): string[] {
  const ids = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
    .filter((box) => box.checked)
    .map((box) => box.dataset.codeId!);
  return [...new Set(ids)];
}

/** A name is the whole form since D-046. */
function createCode(name: string) {
  openCreate();
  const create = region('create');
  fireEvent.change(within(create).getByLabelText('Code name'), { target: { value: name } });
  fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));
}

describe('acceptance: provisional codes do not enter the canonical list', () => {
  it('appears under Proposed codes with the codebook order unchanged', () => {
    renderWorkspace();
    openPanel();
    const before = codebookOrder();

    createCode('Compost queue');

    // In Proposed codes, not in the codebook.
    expect(within(region('proposed')).getByText('Compost queue')).toBeInTheDocument();
    expect(codebookOrder()).toEqual(before);
    expect(codebookOrder()).toEqual(canonicalOrder);
    expect(within(region('codebook')).queryByText('Compost queue')).toBeNull();

    // And still there, still outside the codebook, when the panel is reopened.
    // Closed with nothing checked, so the capture goes and nothing is written.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    chord('excerpt.code');

    expect(within(region('proposed')).getByText('Compost queue')).toBeInTheDocument();
    expect(codebookOrder()).toEqual(before);
    expect(document.querySelectorAll('[data-region="proposed"]')).toHaveLength(1);
  });

  it('shows its name, which since D-046 is all a created code carries', () => {
    renderWorkspace();
    openPanel();
    createCode('Tool sharing');

    expect(within(region('proposed')).getByText('Tool sharing')).toBeInTheDocument();
  });
});

describe('the Create code disclosure, per D-039', () => {
  const row = () => within(region('create')).getByRole('button', { name: /create new code/i });

  it('starts collapsed, as one row', () => {
    // Creating a code is the rare act; five fields of permanent clutter above
    // the note field is what D-039 collapsed.
    renderWorkspace();
    openPanel();

    expect(row()).toHaveAttribute('aria-expanded', 'false');
    expect(within(region('create')).queryByLabelText('Code name')).toBeNull();
  });

  it('focuses the name field on expanding', async () => {
    renderWorkspace();
    openPanel();

    openCreate();
    await act(async () => {});

    expect(within(region('create')).getByLabelText('Code name')).toHaveFocus();
    expect(row()).toHaveAttribute('aria-expanded', 'true');
  });

  it('returns focus to the row on collapsing', async () => {
    renderWorkspace();
    openPanel();
    openCreate();
    await act(async () => {});

    fireEvent.click(row());
    await act(async () => {});

    expect(row()).toHaveFocus();
    expect(within(region('create')).queryByLabelText('Code name')).toBeNull();
  });

  it('collapses on Escape, returning focus to the row', async () => {
    renderWorkspace();
    openPanel();
    openCreate();
    await act(async () => {});

    fireEvent.keyDown(within(region('create')).getByLabelText('Code name'), { key: 'Escape' });
    await act(async () => {});

    expect(row()).toHaveAttribute('aria-expanded', 'false');
    expect(row()).toHaveFocus();
  });

  it('leaves the panel open when Escape collapses the form', async () => {
    // One key, one effect: Escape inside the form collapses it and stops,
    // rather than also cancelling the panel underneath.
    renderWorkspace();
    openPanel();
    openCreate();
    await act(async () => {});

    fireEvent.keyDown(within(region('create')).getByLabelText('Code name'), { key: 'Escape' });
    await act(async () => {});

    expect(panel()).toBeInTheDocument();
  });
});

describe('creating a provisional code, per section 7', () => {
  it('enters the pending assignment immediately and announces that it did', () => {
    renderWorkspace();
    openPanel();

    createCode('Winter planning');

    // Checked is the pending state, per D-039: there is no second region
    // restating it.
    expect(checkedCodeIds()).toHaveLength(1);
    expect(within(region('proposed')).getByRole('checkbox')).toBeChecked();
    expect(lastAnnouncement()).toMatch(/provisional/i);
    expect(lastAnnouncement()).toMatch(/1 pending/);
  });

  it('collapses the disclosure and returns focus to its row, per D-039', async () => {
    renderWorkspace();
    openPanel();
    createCode('Seed swaps');
    // The return runs on a microtask, after the form has gone.
    await act(async () => {});

    const row = within(region('create')).getByRole('button', { name: /create new code/i });
    expect(row).toHaveFocus();
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  it('still requires a name, and refuses without losing the form', () => {
    // The one remaining validation. Contract 2.6: the refusal says what
    // happened and puts focus where the fix is.
    renderWorkspace();
    openPanel();

    openCreate();
    const create = region('create');
    fireEvent.change(within(create).getByLabelText('Code name'), { target: { value: '   ' } });
    fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));

    expect(within(create).getByText(/needs a name/i)).toBeInTheDocument();
    expect(within(create).getByLabelText('Code name')).toHaveFocus();
    expect(within(create).getByLabelText('Code name')).toHaveValue('   ');
    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();

    fireEvent.change(within(create).getByLabelText('Code name'), { target: { value: 'Named' } });
    fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));
    expect(within(region('proposed')).getByText('Named')).toBeInTheDocument();
  });

  it('asks for nothing but a name, per D-046', () => {
    // The whole point of the change: proposing a code mid-coding costs one
    // field, not three. Asserted as the absence of the other inputs rather
    // than by a label query, so renaming one cannot make this pass.
    renderWorkspace();
    openPanel();
    openCreate();

    const fields = region('create').querySelectorAll('input, textarea');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toHaveAccessibleName('Code name');
  });

  it('empties the form once the code exists', () => {
    renderWorkspace();
    openPanel();
    createCode('Gate code sharing');

    // Reopened, since creating collapses the disclosure.
    openCreate();
    const create = region('create');
    expect(within(create).getByLabelText('Code name')).toHaveValue('');
  });

  it('keeps the proposed region absent until a code is proposed', () => {
    renderWorkspace();
    openPanel();

    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();
  });

  it('offers no creation at all where the project does not permit it', () => {
    renderWorkspace({ ...defaultFlags, allowProvisionalCodes: false });
    openPanel();

    expect(panel().querySelector('[data-region="create"]')).toBeNull();
    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();
  });

  it('can be unchecked like any other pending code', () => {
    renderWorkspace();
    openPanel();
    createCode('Mulch delivery');

    const box = within(region('proposed')).getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);
    expect(checkedCodeIds()).toHaveLength(0);
    // The proposal itself survives being unchecked.
    expect(within(region('proposed')).getByText('Mulch delivery')).toBeInTheDocument();
  });

  it('keeps the region order fixed once both new regions exist', () => {
    renderWorkspace();
    openPanel();
    createCode('Water rota');
    search('water');

    const order = Array.from(panel().querySelectorAll('[data-region]')).map((element) =>
      element.getAttribute('data-region'),
    );
    expect(order).toEqual([
      'search-results',
      'codebook',
      'proposed',
      'create',
      'note',
      'actions',
    ]);
  });
});
