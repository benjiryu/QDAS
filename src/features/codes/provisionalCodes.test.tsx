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
  chord('segment.next');
  chord('segment.next');
  chord('excerpt.begin');
  chord('excerpt.confirm');
}

const panel = () => screen.getByRole('region', { name: /code selection/i });
const region = (name: string) => panel().querySelector<HTMLElement>(`[data-region="${name}"]`)!;

function codebookOrder(): string[] {
  return Array.from(region('codebook').querySelectorAll('.code-panel__code-name')).map(
    (element) => element.textContent ?? '',
  );
}

function search(query: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: /search the codebook/i }), {
    target: { value: query },
  });
}

const lastAnnouncement = () => announcer.getLast()?.message ?? '';

function createCode(name: string, shortDefinition: string, fullDefinition = '') {
  const create = region('create');
  fireEvent.change(within(create).getByLabelText('Code name'), { target: { value: name } });
  fireEvent.change(within(create).getByLabelText('Short definition'), {
    target: { value: shortDefinition },
  });
  if (fullDefinition) {
    fireEvent.change(within(create).getByLabelText(/full definition/i), {
      target: { value: fullDefinition },
    });
  }
  fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));
}

describe('acceptance: provisional codes do not enter the canonical list', () => {
  it('appears under Proposed codes with the codebook order unchanged', () => {
    const { container } = renderWorkspace();
    openPanel();
    const before = codebookOrder();

    createCode('Compost queue', 'Waiting to use the shared compost bays.');

    // In Proposed codes, not in the codebook.
    expect(within(region('proposed')).getByText('Compost queue')).toBeInTheDocument();
    expect(codebookOrder()).toEqual(before);
    expect(codebookOrder()).toEqual(canonicalOrder);
    expect(within(region('codebook')).queryByText('Compost queue')).toBeNull();

    // And still there, still outside the codebook, when the panel is reopened.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    chord('excerpt.start.expand');
    chord('excerpt.confirm');

    expect(within(region('proposed')).getByText('Compost queue')).toBeInTheDocument();
    expect(codebookOrder()).toEqual(before);
    expect(container.querySelectorAll('[data-region="proposed"]')).toHaveLength(1);
  });

  it('shows its short definition in the row, like any other code', () => {
    // The only definition text the panel shows, per D-035.
    renderWorkspace();
    openPanel();
    createCode('Tool sharing', 'Borrowing and returning shared tools.', 'The full account.');

    expect(
      within(region('proposed')).getByText('Borrowing and returning shared tools.'),
    ).toBeInTheDocument();
  });
});

describe('creating a provisional code, per section 7', () => {
  it('enters the pending assignment immediately and announces that it did', () => {
    renderWorkspace();
    openPanel();

    createCode('Winter planning', 'Deciding in the off season what to grow.');

    const pending = within(region('pending')).getAllByRole('listitem');
    expect(pending).toHaveLength(1);
    expect(pending[0].textContent).toContain('Winter planning');
    expect(lastAnnouncement()).toMatch(/provisional/i);
    expect(lastAnnouncement()).toMatch(/1 pending/);
  });

  it('moves focus to the pending assignment region, per section 9', () => {
    renderWorkspace();
    openPanel();
    createCode('Seed swaps', 'Exchanging seed between members.');

    const heading = within(region('pending')).getByRole('heading', { level: 3 });
    expect(heading).toHaveFocus();
  });

  it('requires a name and a short definition, losing nothing on a refusal', () => {
    renderWorkspace();
    openPanel();

    const create = region('create');
    fireEvent.change(within(create).getByLabelText('Short definition'), {
      target: { value: 'A definition with no name.' },
    });
    fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));

    expect(within(create).getByText(/needs a name/i)).toBeInTheDocument();
    expect(within(create).getByLabelText('Code name')).toHaveFocus();
    // What was typed is still there.
    expect(within(create).getByLabelText('Short definition')).toHaveValue(
      'A definition with no name.',
    );
    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();

    fireEvent.change(within(create).getByLabelText('Code name'), { target: { value: 'Named' } });
    fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));
    expect(within(region('proposed')).getByText('Named')).toBeInTheDocument();
  });

  it('treats the full definition as optional', () => {
    renderWorkspace();
    openPanel();
    createCode('Bench repair', 'Fixing the shared seating.');

    expect(within(region('proposed')).getByText('Bench repair')).toBeInTheDocument();
  });

  it('empties the form once the code exists', () => {
    renderWorkspace();
    openPanel();
    createCode('Gate code sharing', 'Passing the entry code to non-members.');

    const create = region('create');
    expect(within(create).getByLabelText('Code name')).toHaveValue('');
    expect(within(create).getByLabelText('Short definition')).toHaveValue('');
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
    createCode('Mulch delivery', 'Arranging bulk mulch drops.');

    const box = within(region('proposed')).getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);
    expect(within(region('pending')).queryAllByRole('listitem')).toHaveLength(0);
    // The proposal itself survives being unchecked.
    expect(within(region('proposed')).getByText('Mulch delivery')).toBeInTheDocument();
  });

  it('keeps the region order fixed once both new regions exist', () => {
    renderWorkspace();
    openPanel();
    createCode('Water rota', 'Who waters when.');
    search('water');

    const order = Array.from(panel().querySelectorAll('[data-region]')).map((element) =>
      element.getAttribute('data-region'),
    );
    expect(order).toEqual([
      'search-results',
      'recent',
      'codebook',
      'proposed',
      'create',
      'pending',
      'note',
      'uncertainty',
      'actions',
    ]);
  });
});
