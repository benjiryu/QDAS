import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search codes' }), {
    target: { value: query },
  });
}

const lastAnnouncement = () => announcer.getLast()?.message ?? '';

/** The empty search result's one action, per D-070. Null when it is not offered. */
const proposeButton = () =>
  within(region('search-results')).queryByRole('button', { name: /propose/i });

/** How many codes are checked, which is the pending assignment now. */
function checkedCodeIds(): string[] {
  const ids = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
    .filter((box) => box.checked)
    .map((box) => box.dataset.codeId!);
  return [...new Set(ids)];
}

/** Expands the Create code disclosure, per D-039 and D-073. */
function openCreate() {
  fireEvent.click(within(region('create')).getByRole('button', { name: /create new code/i }));
}

/**
 * Proposes a code from the empty search: the accelerator, per D-070.
 *
 * A name is the whole form, per D-046, and here the query is the name.
 */
function createCode(name: string) {
  search(name);
  fireEvent.click(proposeButton()!);
}

/**
 * The same, by the standing disclosure — the other door D-073 restored.
 *
 * Scoped to `region('create')` throughout: "Create new code" is also the
 * Codebook page's button, and since D-048 the panel can render the companion
 * codebook inside its own dialog.
 */
function createCodeFromForm(name: string) {
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

describe('creating a provisional code, per section 7', () => {
  it('enters the pending assignment immediately and announces that it did', () => {
    renderWorkspace();
    openPanel();

    createCode('Winter planning');

    // Checked is the pending state, per D-039: there is no second region
    // restating it.
    expect(checkedCodeIds()).toHaveLength(1);
    expect(within(region('proposed')).getByRole('checkbox')).toBeChecked();
    // One sentence for one action, per D-070: the coder asked for a code and
    // got one, checked. The old two-clause creation announcement went with the
    // form that used to produce it.
    expect(lastAnnouncement()).toBe('Proposed and checked: Winter planning');
  });

  it('returns focus to the search field', async () => {
    /*
      The button the coder pressed unmounts with the empty state it lived in, so
      focus would fall to the body. Back to the field: the query is still there
      and the code they just made is now the only result for it.
    */
    renderWorkspace();
    openPanel();
    createCode('Seed swaps');
    await act(async () => {});

    expect(screen.getByRole('searchbox', { name: 'Search codes' })).toHaveFocus();
  });

  it('cannot be asked for an empty name, the query being the name', () => {
    /*
      The validation that used to exist here is gone because the case is: the
      empty state only renders on a query that has already been trimmed and
      found non-empty, so there is no way to reach the action without one.
    */
    renderWorkspace();
    openPanel();
    search('   ');

    expect(panel().querySelector('[data-region="search-results"]')).toBeNull();
  });

  it('asks for nothing at all, per D-046 and D-070', () => {
    /*
      The whole point of the change: proposing a code mid-coding costs one
      press, not a form. Asserted as the absence of any field in the results
      region rather than by a label query, so renaming one cannot make it pass.
    */
    renderWorkspace();
    openPanel();
    search('zzzznotacode');

    expect(region('search-results').querySelectorAll('input, textarea')).toHaveLength(0);
    expect(proposeButton()).toBeInTheDocument();
  });

  it('finds a code it already proposed rather than offering to make it twice', () => {
    /*
      The search covers proposed codes since D-070 put creation in the empty
      state. Without that, searching for a code you proposed a minute ago finds
      nothing and offers to propose it again — and two codes with one name is
      not something a coder can undo from here.
    */
    renderWorkspace();
    openPanel();
    createCode('Gate code sharing');

    search('Gate code');

    expect(proposeButton()).toBeNull();
    expect(within(region('search-results')).getByText('Gate code sharing')).toBeInTheDocument();
  });

  it('keeps the proposed region absent until a code is proposed', () => {
    renderWorkspace();
    openPanel();

    expect(panel().querySelector('[data-region="proposed"]')).toBeNull();
  });

  it('offers no creation at all where the project does not permit it', () => {
    renderWorkspace({ ...defaultFlags, allowProvisionalCodes: false });
    openPanel();

    // Both doors and the region a proposal would land in: a build that hides
    // proposed codes must offer no way to make one.
    expect(panel().querySelector('[data-region="create"]')).toBeNull();
    search('zzzznotacode');
    expect(proposeButton()).toBeNull();
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

describe('a provisional code says so wherever it renders, per D-070', () => {
  it('carries the word in its description and never in its name', () => {
    /*
      Both channels, and the right one for each. D-051 pins a code row's
      accessible name to exactly the code name — search, sorting and the
      type-ahead redirect all operate on clean names — so the mark rides the
      D-054 description channel beside the lineage, and the visible half sits
      outside the label where it cannot join the name.
    */
    renderWorkspace();
    openPanel();
    createCode('Winter planning');

    const box = within(region('proposed')).getByRole('checkbox');
    expect(box).toHaveAccessibleName('Winter planning');
    expect(box).toHaveAccessibleDescription('Provisional');

    // The visible half, and hidden from the tree so the row does not say it
    // twice — the second stop D-051 removed from these rows.
    const tag = region('proposed').querySelector('.code-panel__provisional')!;
    expect(tag).toHaveTextContent('Provisional');
    expect(tag).toHaveAttribute('aria-hidden', 'true');
  });

  it('says nothing of the sort on a canonical code', () => {
    renderWorkspace();
    openPanel();

    const box = region('codebook').querySelector('[data-code-id]')!;
    expect(box).not.toHaveAccessibleDescription('Provisional');
  });

  it('draws a rail pill for it, so the rail and the description agree', async () => {
    /*
      The failure this closes, and the sharpest one: the rail resolved a
      provisional assignment to nothing and drew one pill fewer, while
      `turnDescription` counted it. One turn said "1 excerpt, 1 code" and drew
      nothing — two channels D-041 built to agree, disagreeing, at the moment
      right after the coder saved.
    */
    renderWorkspace();
    openPanel();
    createCode('Winter planning');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );

    // The turn the panel opened on, which is the second: the first carries
    // seeded coding and would make the counts ambiguous.
    const turn = document.querySelectorAll<HTMLElement>('[data-turn-id]')[1];
    const pills = Array.from(turn.querySelectorAll('.transcript-turn__pill'));
    expect(pills.some((pill) => pill.textContent === 'Winter planning (provisional)')).toBe(true);

    // The agreement itself, which is what the bug broke: the description
    // counted the assignment the rail had dropped.
    const describedBy = turn.getAttribute('aria-describedby')!;
    const spoken = document.getElementById(describedBy)!.textContent ?? '';
    const counted = Number(/(\d+) codes?/.exec(spoken)![1]);
    expect(pills).toHaveLength(counted);
  });

  it('keeps the mark when the search finds it', () => {
    // The row is the same component in all three regions, so one mark covers
    // the codebook list, the results and the proposed region at once.
    renderWorkspace();
    openPanel();
    createCode('Winter planning');
    search('Winter');

    const box = within(region('search-results')).getByRole('checkbox', { name: 'Winter planning' });
    expect(box).toHaveAccessibleDescription('Provisional');
  });
});

describe('the Create code disclosure, per D-039 and D-073', () => {
  /*
    Removed by D-070 and restored here. Task 50 made the empty search the only
    route on a reasoning of economy; the discoverability cost showed at once,
    and a coder who does not know that route cannot find it.
  */
  const row = () => within(region('create')).getByRole('button', { name: /create new code/i });
  const nameField = () => within(region('create')).queryByLabelText('Code name');

  it('starts collapsed, as one row', () => {
    renderWorkspace();
    openPanel();

    expect(row()).toHaveAttribute('aria-expanded', 'false');
    expect(row()).not.toHaveAttribute('aria-controls');
    expect(nameField()).toBeNull();
  });

  it('focuses the name field on expanding', async () => {
    renderWorkspace();
    openPanel();

    openCreate();
    await act(async () => {});

    expect(nameField()).toHaveFocus();
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
    expect(nameField()).toBeNull();
  });

  it('collapses on Escape, returning focus to the row', async () => {
    renderWorkspace();
    openPanel();
    openCreate();
    await act(async () => {});

    fireEvent.keyDown(nameField()!, { key: 'Escape' });
    await act(async () => {});

    expect(row()).toHaveAttribute('aria-expanded', 'false');
    expect(row()).toHaveFocus();
  });

  it('leaves the panel open when Escape collapses the form', async () => {
    /*
      One key, one effect. The panel's own Escape handler is on `document` and
      would close the whole panel; the form's handler stops the event before it
      gets there, which works because React forwards `stopPropagation` to the
      native event.
    */
    renderWorkspace();
    openPanel();
    openCreate();
    await act(async () => {});

    fireEvent.keyDown(nameField()!, { key: 'Escape' });
    await act(async () => {});

    expect(panel()).toBeInTheDocument();
  });

  it('still requires a name, and refuses without losing the form', () => {
    // The validation the empty-search route cannot reach, because a query is
    // non-empty by the time it offers anything. Contract 2.6: the refusal says
    // what happened and puts focus where the fix is.
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
  });

  it('refuses a name a code already has, which is the guard both doors share', () => {
    /*
      The empty-search route cannot produce a duplicate — its search covers
      proposals, so an existing name is found rather than offered. The form can
      reach the case, and two provisional codes a coder cannot tell apart is
      exactly what that search change existed to prevent, so the guard lives in
      the shared core and this door reports it.
    */
    renderWorkspace();
    openPanel();

    createCodeFromForm('Winter planning');
    openCreate();
    const create = region('create');
    fireEvent.change(within(create).getByLabelText('Code name'), {
      target: { value: 'winter PLANNING' },
    });
    fireEvent.click(within(create).getByRole('button', { name: /create provisional code/i }));

    expect(within(create).getByText(/already has that name/i)).toBeInTheDocument();
    expect(within(region('proposed')).getAllByRole('checkbox')).toHaveLength(1);
  });
});

describe('two routes, one creation flow, per D-073', () => {
  it('produces the same record whichever door made it', () => {
    /*
      The point of the task. What is shared is the record, the checking and the
      provisional semantics; what differs is the sentence spoken and where focus
      lands, which belong to the door rather than to the code.
    */
    renderWorkspace();
    openPanel();

    createCode('From the search');
    createCodeFromForm('From the form');

    const rows = within(region('proposed')).getAllByRole('checkbox');
    expect(rows).toHaveLength(2);

    // Both checked for the capture, both marked provisional in the same channel.
    for (const box of rows) {
      expect(box).toBeChecked();
      expect(box).toHaveAccessibleDescription('Provisional');
    }

    // And both out of the canonical list, which is section 7's rule.
    expect(within(region('codebook')).queryByText('From the search')).toBeNull();
    expect(within(region('codebook')).queryByText('From the form')).toBeNull();
  });

  it('says a different sentence for each, once, because they leave the coder elsewhere', async () => {
    /*
      Counted rather than read off the end. The shared core stays silent and
      each door speaks once; an announcement left in the core would have the
      search route say two sentences, and reading only the last would not
      notice.
    */
    renderWorkspace();
    openPanel();

    createCode('From the search');
    const spokenOfSearch = announcer
      .getHistory()
      .filter((entry) => entry.message.includes('From the search'));
    expect(spokenOfSearch.map((entry) => entry.message)).toEqual([
      'Proposed and checked: From the search',
    ]);

    createCodeFromForm('From the form');
    await act(async () => {});
    const spokenOfForm = announcer
      .getHistory()
      .filter((entry) => entry.message.includes('From the form'));
    expect(spokenOfForm).toHaveLength(1);
    expect(spokenOfForm[0].message).toBe(
      'From the form created as provisional and added to pending. 2 pending.',
    );
  });
});
