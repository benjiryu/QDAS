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
 * The isolated note panel.
 *
 * Specification: decision D-055, docs/patterns/excerpt-selection.md sections 3
 * and 4.
 *
 * Session evidence: reaching the note field through the whole code panel cost
 * too much. A coder wanting to record a thought about a passage travelled past
 * search, results, the codebook, proposed codes and create-code to open a
 * disclosure — eight regions to write one sentence.
 *
 * The other half of D-055 is codified rather than created: an excerpt persists
 * with at least one code *or* a note. That was decided during a fix session and
 * never logged, so it kept being re-raised as though open. The last block here
 * confirms it holds rather than building it.
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
  document.getSelection()?.removeAllRanges();
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

const notePanel = () => document.querySelector<HTMLElement>('[data-region="note-panel"]');
const noteField = () => within(notePanel()!).getByRole('textbox', { name: 'Note' });
const codePanelIsOpen = () =>
  screen.queryAllByRole('dialog', { name: /code assignment/i }).length > 0;

/** The code panel, which every route into an existing excerpt now opens. */
const codePanel = () => screen.getByRole('dialog', { name: /code assignment/i });
/** Its note field, which a reopened noted excerpt lands in already expanded. */
const panelNoteField = () =>
  within(codePanel()).getByLabelText(/note about this excerpt/i) as HTMLTextAreaElement;
/** Saves and closes the code panel, per D-042: every way out commits. */
async function saveAndClosePanel() {
  fireEvent.click(within(codePanel()).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() => expect(codePanelIsOpen()).toBe(false));
}

/** Every turn, so a test can pick one that is uncoded in the fixture. */
const turns = () => Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]'));

/** A turn the fixture has not already coded, so a fresh capture is unambiguous. */
function focusFreshTurn(): HTMLElement {
  const turn = turns().find((candidate) => candidate.querySelector('[data-coded-run]') === null)!;
  act(() => turn.focus());
  return turn;
}

const savedCounts = () => {
  const element = document.querySelector('[data-saved-excerpts]')!;
  return {
    excerpts: Number(element.getAttribute('data-saved-excerpts')),
    assignments: Number(element.getAttribute('data-saved-assignments')),
    notes: Number(element.getAttribute('data-saved-notes')),
  };
};

const announced = () => announcer.getHistory().map((entry) => entry.message);

/** Captures the focused turn into a new note and types into it. */
async function writeNoteOn(turn: HTMLElement, text: string) {
  act(() => turn.focus());
  chord('excerpt.note');
  await waitFor(() => expect(notePanel()).not.toBeNull());
  fireEvent.change(noteField(), { target: { value: text } });
  fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() => expect(notePanel()).toBeNull());
}

describe('excerpt.note opens the note and nothing else, per D-055', () => {
  it('persists a note-only excerpt, without code selection ever opening', async () => {
    renderAt(sourceUrl);
    const before = savedCounts();
    const turn = focusFreshTurn();

    await writeNoteOn(turn, 'Worth returning to.');

    const after = savedCounts();
    expect(after.excerpts, 'the excerpt exists').toBe(before.excerpts + 1);
    expect(after.notes, 'and carries the note').toBe(before.notes + 1);
    expect(after.assignments, 'with no codes at all').toBe(before.assignments);
    expect(codePanelIsOpen(), 'code selection was never involved').toBe(false);
  });

  it('opens with focus in the field and lands back on the turn', async () => {
    // Contract 2.4: a temporary view defines focus entry and focus return, and
    // the done-when names this round trip.
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    const turnId = turn.dataset.turnId;

    chord('excerpt.note');
    await waitFor(() => expect(noteField()).toHaveFocus());

    fireEvent.change(noteField(), { target: { value: 'A thought.' } });
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));

    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-turn-id')).toBe(turnId),
    );
  });

  it('names the excerpt in its heading', async () => {
    renderAt(sourceUrl);
    focusFreshTurn();
    chord('excerpt.note');

    await waitFor(() => expect(notePanel()).not.toBeNull());
    expect(
      within(notePanel()!).getByRole('heading', { level: 2 }).textContent,
    ).toMatch(/^Add note: /);
  });

  it('discards a capture closed with nothing written', async () => {
    // Nothing typed means nothing meant. No excerpt, no note, no empty record
    // left behind to puzzle over on the Coded data page.
    renderAt(sourceUrl);
    const before = savedCounts();
    focusFreshTurn();

    chord('excerpt.note');
    await waitFor(() => expect(notePanel()).not.toBeNull());
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());

    expect(savedCounts()).toEqual(before);
  });
});

describe('note.open reaches an existing note, per D-055 as amended', () => {
  /*
    The destination moved. D-055 sent every direct note route to the isolated
    panel, which split an excerpt in half: reopening a passage you had noted
    gave you a surface that could only edit the note, and adding a code meant
    closing and coming back by another chord.

    Now every route into an existing excerpt opens the code panel, and what the
    excerpt carries decides where focus lands rather than which panel opens.
  */
  it('opens the code panel on the note, loaded with what was written', async () => {
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'First thought.');

    act(() => turn.focus());
    chord('note.open');

    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(notePanel(), 'the isolated panel is not this route any more').toBeNull();
    expect(panelNoteField()).toHaveValue('First thought.');
    expect(panelNoteField()).toHaveFocus();
    expect(announced().join(' ')).toContain('Note field focused');
  });

  it('edits the note in place rather than writing a second one', async () => {
    // D-011 allows one note per excerpt, so an edit has to be an edit — and
    // that holds through the code panel's note region as it did through the
    // isolated one, because both always edited the same note.
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'First thought.');
    const afterFirst = savedCounts();

    act(() => turn.focus());
    chord('note.open');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    fireEvent.change(panelNoteField(), { target: { value: 'Second thought.' } });
    await saveAndClosePanel();

    expect(savedCounts().notes, 'still one note').toBe(afterFirst.notes);
    act(() => turn.focus());
    chord('note.open');
    await waitFor(() => expect(panelNoteField()).toHaveValue('Second thought.'));
  });

  it('deletes the note when the field is emptied', async () => {
    // Emptying still deletes, through this panel as through the other: the
    // note is the same record whichever surface edits it, per D-055's last
    // paragraph, which this change leaves standing.
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Delete me.');
    const afterFirst = savedCounts();

    act(() => turn.focus());
    chord('note.open');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));

    fireEvent.change(panelNoteField(), { target: { value: '   ' } });
    await saveAndClosePanel();

    expect(savedCounts().notes).toBe(afterFirst.notes - 1);
  });

  it('is unavailable on a turn with no note, and says which is missing', async () => {
    // Distinct from "not inside a saved excerpt": an excerpt can be here and
    // carry no note, and the other wording would be untrue as well as unhelpful.
    renderAt(sourceUrl);
    focusFreshTurn();

    chord('note.open');

    expect(notePanel()).toBeNull();
    expect(codePanelIsOpen(), 'and nothing else opens either').toBe(false);
    expect(announced().join(' ')).toContain('No note on this speaker turn.');
  });
});

describe('two notes on one turn are disambiguated, per D-055', () => {
  it('offers the choice rather than guessing, identified by range', async () => {
    /*
      The `excerpt.open` pattern reused rather than a second chooser built
      beside it: the question is the same either way — which of these
      overlapping excerpts do you mean — and guessing would silently edit the
      wrong note.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'First note.');
    await writeNoteOn(turn, 'Second note.');

    act(() => turn.focus());
    chord('note.open');

    // Nothing opened on its own.
    expect(notePanel()).toBeNull();
    const choices = await screen.findByRole('list', { name: 'Notes here' });
    const options = within(choices).getAllByRole('button');
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option.textContent).toMatch(/^Sentences \d+ to \d+, a note$/);
    }
    expect(announced().join(' ')).toContain('2 notes on this speaker turn');

    fireEvent.click(options[1]);
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(panelNoteField()).toHaveValue('Second note.');
  });
});

describe('the pointer twin, per D-055', () => {
  it('opens the note from the rail icon without reaching it by Tab', async () => {
    /*
      The rail is `aria-hidden` per D-041, so a focusable control inside it
      would be reachable by Tab and absent from the accessibility tree — a
      genuine defect rather than a trade. The chord is the non-visual route.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Click me open.');

    const icon = turn.querySelector<HTMLButtonElement>('[data-command="note.open"]')!;
    expect(icon.tabIndex, 'out of the tab order, like the rail around it').toBe(-1);
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();

    fireEvent.click(icon);
    // Into the code panel now, on the note: the icon is still the pointer twin
    // of `note.open`, and both arrive at the same place.
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(panelNoteField()).toHaveValue('Click me open.');
  });
});

describe('the code panel keeps its own note region', () => {
  it('takes excerpt.note to that region when the panel is already open', async () => {
    // D-055 keeps the combined flow: with the excerpt already in front of the
    // coder, this command means "take me to the note", not "capture again".
    renderAt(sourceUrl);
    focusFreshTurn();
    chord('excerpt.code');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));

    chord('excerpt.note');

    await waitFor(() => expect(document.activeElement?.tagName).toBe('TEXTAREA'));
    expect(notePanel(), 'the two panels never stack').toBeNull();
    expect(codePanelIsOpen()).toBe(true);
  });

  it('edits the same note the isolated panel wrote', async () => {
    // One note per excerpt, whichever surface reached it.
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Written in the note panel.');

    act(() => turn.focus());
    chord('excerpt.open');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));

    /*
      Open on the note rather than shut over it. The collapsed preview was what
      showed the text while the box was closed; on an excerpt that carries a
      note the box is the thing the coder arrives in, so the text is in the
      field instead.
    */
    expect(within(codePanel()).getByRole('button', { name: /edit note/i })).toBeInTheDocument();
    expect(panelNoteField()).toHaveValue('Written in the note panel.');
    expect(panelNoteField()).toHaveFocus();
  });
});

describe('note-only excerpts, codified rather than created', () => {
  it('renders with the grey highlight, the dotted underline, and mark semantics', async () => {
    /*
      D-055 records what the build already does. The underline is the non-colour
      channel contract 2.5 requires, dotted so it claims neither `coded` nor
      `coded-multiple`, and the run is a `mark` per D-052 so reading through it
      reports as highlighted.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Note with no codes.');

    const runs = Array.from(turn.querySelectorAll('[data-coded-run="noted"]'));
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.tagName.toLowerCase(), 'a mark, per D-052').toBe('mark');
      expect(run.getAttribute('data-color-token'), 'no family, so no hue').toBeNull();
    }
  });
});

describe('clicking routes by what the excerpt carries', () => {
  /*
    Clicking means "open what is here", so it answers with whatever is here.
    The two chords say what they want instead: `excerpt.open` reopens for
    coding — which is the only way a passage noted before it was coded can gain
    codes later — and `note.open` reaches the note.
  */
  const clickFirstSentenceOf = (turn: HTMLElement) =>
    fireEvent.click(turn.querySelector('[data-segment-id]')!);

  it('opens the code panel on the note of an excerpt carrying only a note', async () => {
    /*
      A click means "open what is here", and what is here is the excerpt — all
      of it. The note is where focus lands rather than what decides the panel,
      so the codes are one Tab away instead of a close and a different chord.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Only a note here.');

    clickFirstSentenceOf(turn);

    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(notePanel()).toBeNull();
    expect(panelNoteField()).toHaveValue('Only a note here.');
    expect(panelNoteField()).toHaveFocus();
  });

  it('still opens code selection on a coded excerpt', async () => {
    // The case most at risk from a routing change.
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    act(() => turn.focus());
    chord('excerpt.code');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.click(panel.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(codePanelIsOpen()).toBe(false));

    clickFirstSentenceOf(turn);

    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(notePanel()).toBeNull();
  });

  it('leaves excerpt.open reopening for coding, which is how a note gains codes', async () => {
    /*
      The round trip D-055's codes-win-over-a-note precedence depends on. If
      this command routed by content too, a passage noted before it was coded
      could never become coded: re-capturing the same range makes a second
      excerpt rather than editing the first.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Noted first, coded later.');

    act(() => turn.focus());
    chord('excerpt.open');

    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(notePanel()).toBeNull();

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.click(panel.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(codePanelIsOpen()).toBe(false));

    expect(turn.querySelector('[data-coded-run]')?.getAttribute('data-coded-run')).toBe('coded');
  });

  it('offers one chooser for a mixed overlap, each row saying which it is', async () => {
    /*
      Routing is decided per excerpt, not per invocation, because this is the
      grain the question has: one sentence, one coded excerpt and one note-only
      one, and a different right answer per row.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();

    // A note on the whole turn.
    await writeNoteOn(turn, 'A note over the turn.');

    // And a coded excerpt over the same turn.
    act(() => turn.focus());
    chord('excerpt.code');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.click(panel.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(codePanelIsOpen()).toBe(false));

    clickFirstSentenceOf(turn);

    const choices = await screen.findByRole('list', { name: 'Saved excerpts here' });
    const options = within(choices).getAllByRole('button');
    expect(options).toHaveLength(2);

    const labels = options.map((option) => option.textContent ?? '');
    expect(labels.some((label) => label.endsWith('a note'))).toBe(true);
    expect(labels.some((label) => /\d+ codes?$/.test(label))).toBe(true);

    /*
      Each row still says which it is — the chooser's wording is the one thing
      the intent still shapes — but every row opens the excerpt now, and the
      note it carries is where focus lands.
    */
    const noteRow = options[labels.findIndex((label) => label.endsWith('a note'))];
    fireEvent.click(noteRow);
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(panelNoteField()).toHaveValue('A note over the turn.');
  });
});

describe('one panel for an existing excerpt, whatever the route', () => {
  /*
    The rule this change replaced three with: every route into an excerpt that
    already exists opens the code panel, and what the excerpt carries decides
    where the coder lands rather than which panel opens.
  */
  const codeCheckbox = () =>
    codePanel().querySelector<HTMLInputElement>('[data-region="codebook"] [data-code-id]')!;

  it('lands on the note when the excerpt has one, and on search when it does not', async () => {
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'A thought.');

    act(() => turn.focus());
    chord('excerpt.open');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(panelNoteField(), 'a noted excerpt lands on its note').toHaveFocus();

    // Add a code and drop the note, then come back: no note, so search.
    fireEvent.click(codeCheckbox());
    fireEvent.change(panelNoteField(), { target: { value: '' } });
    await saveAndClosePanel();

    act(() => turn.focus());
    chord('excerpt.open');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    expect(
      within(codePanel()).getByRole('searchbox', { name: 'Search codes' }),
      'and one without lands on search',
    ).toHaveFocus();
  });

  it('lets a note-only excerpt gain a code without leaving the panel', async () => {
    /*
      The round trip the old routing blocked. Reopening a noted passage used to
      give a surface that could only edit the note, so adding a code meant
      closing and coming back by a different chord — the cost recorded when the
      split was built.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Worth coding later.');
    const before = savedCounts();

    fireEvent.click(turn.querySelector('[data-segment-id]')!);
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));
    fireEvent.click(codeCheckbox());
    await saveAndClosePanel();

    const after = savedCounts();
    expect(after.assignments, 'the code went on').toBe(before.assignments + 1);
    expect(after.notes, 'and the note stayed').toBe(before.notes);
    expect(after.excerpts, 'on the same excerpt').toBe(before.excerpts);
  });

  it('deletes the note when its field is emptied, the way the isolated panel did', async () => {
    /*
      D-055 made emptying the field the delete, and that affordance lived in the
      panel this routing replaced. It came across: the note is the same record
      whichever surface edits it.
    */
    renderAt(sourceUrl);
    const turn = focusFreshTurn();
    await writeNoteOn(turn, 'Written by mistake.');
    const before = savedCounts();

    act(() => turn.focus());
    chord('note.open');
    await waitFor(() => expect(codePanelIsOpen()).toBe(true));

    fireEvent.change(panelNoteField(), { target: { value: '   ' } });
    await saveAndClosePanel();

    expect(savedCounts().notes).toBe(before.notes - 1);
  });
});
