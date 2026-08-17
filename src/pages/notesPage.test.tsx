import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AnnouncerProvider, createAnnouncer } from '../a11y';
import type { Announcer } from '../a11y';
import { bindingsFor, detectPlatform } from '../config/keybindings';
import type { Command } from '../config/keybindings';
import { clearCodingSession, readSavedWork } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID, SECOND_CODER_ID } from '../data/seed/project';
import { clearSourcePositions } from '../data/sourcePositionStore';
import { noteScope } from '../domain';

/**
 * The Notes page.
 *
 * Specification: docs/pages/destinations.md section 3, decision D-058, R-4.
 *
 * D-058 built this page and brought back the two non-excerpt scopes with it.
 * The tests below follow section 3's acceptance criteria one for one, plus the
 * two rules that hold across the page: own notes only, and the page edits
 * nothing itself.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const notesUrl = `/projects/${project.projectId}/notes`;
const sourceA = fixture.sources[0];

/** The coder's own seeded notes: what the page starts from. */
const ownSeeded = fixture.notes.filter((note) => note.authorId === CURRENT_CODER_ID);
const seededProjectNote = ownSeeded.find((note) => noteScope(note) === 'project')!;
const seededSourceNote = ownSeeded.find((note) => noteScope(note) === 'source')!;

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
const cardFor = (noteId: string) =>
  document.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`);
const filter = (name: RegExp) => screen.getByRole('radio', { name });

describe('the page shows the coder’s own notes, every scope, per R-4', () => {
  it('counts and lists them, and no one else’s', () => {
    renderAt(notesUrl);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Notes');
    expect(screen.getByText(`${ownSeeded.length} notes`)).toBeInTheDocument();

    for (const note of ownSeeded) {
      expect(cardFor(note.noteId), note.noteId).not.toBeNull();
    }

    // The seeded excerpt notes all belong to the second coder, and none of them
    // appears. R-4 is the whole reason the fixture had to gain own notes.
    const others = fixture.notes.filter((note) => note.authorId === SECOND_CODER_ID);
    expect(others.length).toBeGreaterThan(0);
    for (const note of others) {
      expect(cardFor(note.noteId), note.noteId).toBeNull();
    }
  });

  it('fuses the count into each filter’s accessible name, per F-4', () => {
    // The one place the count has to be right: a magnification user reading the
    // name has it in the same glance, and a screen reader hears it as part of
    // the control rather than as loose text beside it.
    renderAt(notesUrl);

    expect(filter(new RegExp(`^All notes, ${ownSeeded.length} notes$`))).toBeInTheDocument();
    expect(filter(/^Project notes, 1 note$/)).toBeInTheDocument();
    expect(filter(new RegExp(`^${sourceA.title}, 1 note$`))).toBeInTheDocument();
  });

  it('puts the filter list before the notes list, which is the 320px order', () => {
    /*
      Section 3's last criterion. Asserted as document order rather than as a
      rendered layout, because that is what makes the single column right at
      every width: the two-column view is the same DOM laid out differently, so
      reading order cannot change with the viewport.
    */
    renderAt(notesUrl);

    const filters = document.querySelector('[data-region="filters"]')!;
    const notes = document.querySelector('[data-region="notes"]')!;
    expect(filters.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('a non-excerpt entry opens the panel, per D-058', () => {
  it('loads the note and returns focus to the entry on close', async () => {
    /*
      Section 3's second criterion, and both halves matter. These entries have
      no turn to land on, so the panel is the edit route — and contract 2.4 asks
      a temporary view to say where focus comes back to, which here is the entry
      that opened it rather than the top of the list.
    */
    renderAt(notesUrl);

    /*
      Opened without focusing the entry first, which is what a pointer user
      does. It also makes this test bite: the dialog restores focus to whatever
      held it before it opened, so pre-focusing the entry would let that restore
      satisfy the assertion and the page's own return could be missing entirely.
    */
    const entry = within(cardFor(seededProjectNote.noteId)!).getByRole('button');
    expect(entry).not.toHaveFocus();
    fireEvent.click(entry);

    await waitFor(() => expect(notePanel()).not.toBeNull());
    expect(noteField()).toHaveValue(seededProjectNote.noteText);

    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());
    await waitFor(() =>
      expect(within(cardFor(seededProjectNote.noteId)!).getByRole('button')).toHaveFocus(),
    );
  });

  it('edits the note in place and keeps it in its own scope', async () => {
    renderAt(notesUrl);

    const entry = within(cardFor(seededSourceNote.noteId)!).getByRole('button');
    fireEvent.click(entry);
    await waitFor(() => expect(notePanel()).not.toBeNull());

    // No scope field on an existing note: D-058 gives it for creation and says
    // nothing about moving a note between scopes.
    expect(within(notePanel()!).queryByLabelText(/attach this note to/i)).toBeNull();

    fireEvent.change(noteField(), { target: { value: 'Rewritten.' } });
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());

    expect(cardFor(seededSourceNote.noteId)).toHaveTextContent('Rewritten.');
  });
});

describe('New note, per D-058', () => {
  it('defaults the scope to the active filter and attaches it there', async () => {
    /*
      Section 3's third criterion. A coder filtered to a source is looking at
      that source, so a note written from there belongs to it — the default is
      the whole point of the field, which is why it is checked as a value and
      not merely as a present control.
    */
    renderAt(notesUrl);
    fireEvent.click(filter(new RegExp(`^${sourceA.title},`)));

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(notePanel()).not.toBeNull());

    const scope = within(notePanel()!).getByLabelText(/attach this note to/i);
    expect(scope).toHaveValue(sourceA.sourceId);

    // Focus is in the text, not the scope: the scope arrives right and the text
    // is always empty. D-058.
    expect(noteField()).toHaveFocus();

    fireEvent.change(noteField(), { target: { value: 'About this transcript.' } });
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());

    const written = readSavedWork(project.projectId).notes.at(-1)!;
    expect(written.noteText).toBe('About this transcript.');
    expect(written.relatedSourceId).toBe(sourceA.sourceId);
    expect(written.relatedExcerptId).toBeNull();
    expect(noteScope(written)).toBe('source');
  });

  it('attaches to the project from All notes, and the scope can be changed', async () => {
    renderAt(notesUrl);

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(notePanel()).not.toBeNull());

    const scope = within(notePanel()!).getByLabelText(/attach this note to/i);
    expect(scope).toHaveValue('project');

    fireEvent.change(scope, { target: { value: sourceA.sourceId } });
    fireEvent.change(noteField(), { target: { value: 'Moved before saving.' } });
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());

    // The scope the writer settled on, not the one it opened with.
    expect(readSavedWork(project.projectId).notes.at(-1)!.relatedSourceId).toBe(
      sourceA.sourceId,
    );
  });

  it('discards an empty one, per D-042', async () => {
    renderAt(notesUrl);
    const before = readSavedWork(project.projectId).notes.length;

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(notePanel()).not.toBeNull());
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());

    expect(readSavedWork(project.projectId).notes).toHaveLength(before);
  });
});

describe('an excerpt note entry, per section 3', () => {
  /** Notes a passage in the transcript, which is the only route to an own one. */
  async function noteFirstFreshTurn(text: string) {
    const turn = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]')).find(
      (candidate) => candidate.querySelector('[data-coded-run]') === null,
    )!;
    act(() => turn.focus());
    chord('excerpt.note');
    await waitFor(() => expect(notePanel()).not.toBeNull());
    fireEvent.change(noteField(), { target: { value: text } });
    fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() => expect(notePanel()).toBeNull());
    return turn.dataset.turnId!;
  }

  it('links to the turn holding the excerpt, and shows no codes line when there are none', async () => {
    /*
      Two criteria at once, because they are the same entry: activating lands on
      the turn, and a note-only excerpt shows no codes line — an empty "Codes:"
      would announce codes and then name none.
    */
    const { unmount } = renderAt(`/projects/${project.projectId}/sources/${sourceA.sourceId}`);
    const turnId = await noteFirstFreshTurn('A thought about this passage.');
    unmount();

    renderAt(notesUrl);

    const card = document
      .querySelector('[data-scope="excerpt"]')!
      .closest('[data-note-id]') as HTMLElement;
    expect(card).toHaveTextContent('A thought about this passage.');
    expect(card.querySelector('.notes__codes'), 'no codes line on a note-only excerpt').toBeNull();

    const link = within(card).getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      `/projects/${project.projectId}/sources/${sourceA.sourceId}?turn=${turnId}`,
    );
  });

  it('lands focus on that turn when the link is followed', async () => {
    // Section 3's first criterion. The `?turn=` route the Coded data page
    // already uses, so the two destinations land the same way.
    const { unmount } = renderAt(`/projects/${project.projectId}/sources/${sourceA.sourceId}`);
    const turnId = await noteFirstFreshTurn('Follow me to the turn.');
    unmount();

    renderAt(notesUrl);
    const card = document
      .querySelector('[data-scope="excerpt"]')!
      .closest('[data-note-id]') as HTMLElement;
    fireEvent.click(within(card).getByRole('link'), { button: 0 });

    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-turn-id')).toBe(turnId),
    );
  });
});


/**
 * Codes a fresh turn and writes a note on it in one save.
 *
 * The code panel rather than the isolated one, because this needs an excerpt
 * carrying both — which is the entry that has codes to render, and the route
 * a coder actually takes to produce one.
 */
async function codeAndNoteFreshTurn(text: string) {
  const turn = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]')).find(
    (candidate) => candidate.querySelector('[data-coded-run]') === null,
  )!;
  act(() => turn.focus());
  chord('excerpt.code');

  const panel = await screen.findByRole('dialog', { name: /code assignment/i });
  fireEvent.click(panel.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
  fireEvent.click(within(panel).getByRole('button', { name: /add note/i }));
  fireEvent.change(
    within(panel).getByRole('textbox', { name: /note about this excerpt/i }),
    { target: { value: text } },
  );
  fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() =>
    expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
  );

  const speaker = turn.querySelector('.transcript-turn__speaker')!.textContent!;
  return { turnId: turn.dataset.turnId!, speaker };
}



describe('one channel per fact, per the D-058 addendum', () => {
  const excerptCard = () =>
    document.querySelector('[data-scope="excerpt"]')!.closest('[data-note-id]') as HTMLElement;

  it('names the entry link by speaker and source, so links carry their context', async () => {
    /*
      Section 3's new criterion. A screen reader running down the links hears
      which passage and which file each belongs to; the heading above is not
      available to link-by-link navigation, which is the whole reason the name
      carries the source rather than the card showing it again.
    */
    const { unmount } = renderAt(`/projects/${project.projectId}/sources/${sourceA.sourceId}`);
    const { speaker } = await codeAndNoteFreshTurn('Coded and noted.');
    unmount();

    renderAt(notesUrl);
    const link = within(excerptCard()).getByRole('link');

    expect(link).toHaveAccessibleName(`Note on ${speaker}, ${sourceA.title}`);
    // The visible label is a prefix of the name rather than replaced by it,
    // which is what keeps a speech-input user able to say what they see.
    expect(link.textContent).toContain(`Note on ${speaker}`);
  });

  it('shows the source once on screen, as the section heading', async () => {
    // The duplication the addendum removes: the title on the heading and again
    // on every card beneath it.
    const { unmount } = renderAt(`/projects/${project.projectId}/sources/${sourceA.sourceId}`);
    await codeAndNoteFreshTurn('Coded and noted.');
    unmount();

    renderAt(notesUrl);

    /*
      Scoped to the notes list. The sidebar links every source and the filter
      names every source, both legitimately — the duplication the addendum
      removes is within the list, where the heading already says it.
    */
    const list = document.querySelector('[data-region="notes"]')!;
    const onScreen = Array.from(list.querySelectorAll('*')).filter(
      (element) =>
        element.children.length === 0 &&
        element.textContent === sourceA.title &&
        !element.classList.contains('visually-hidden'),
    );
    expect(onScreen, 'the heading, and nothing else').toHaveLength(1);
    expect(onScreen[0].tagName.toLowerCase()).toBe('h2');
  });

  it('gives the codes one channel each: pills seen, compact text heard', async () => {
    /*
      The transcript rail's treatment. Both channels name the codes, so neither
      rests on colour, and neither is in the other's channel — read straight
      through this is one stop carrying every code rather than one per pill.
    */
    const { unmount } = renderAt(`/projects/${project.projectId}/sources/${sourceA.sourceId}`);
    await codeAndNoteFreshTurn('Coded and noted.');
    unmount();

    renderAt(notesUrl);
    const codes = excerptCard().querySelector('.notes__codes')!;

    const pills = codes.querySelector('.notes__pills')!;
    expect(pills, 'the pills are the visual channel').toHaveAttribute('aria-hidden', 'true');
    expect(pills.textContent, 'and name their codes, never colour alone').toContain(
      fixture.codes[0].name,
    );

    const compact = Array.from(codes.querySelectorAll('span')).find((span) =>
      span.textContent?.startsWith('Codes:'),
    )!;
    expect(compact, 'the compact line is the programmatic channel').toHaveClass(
      'visually-hidden',
    );
    expect(compact.textContent).toContain(fixture.codes[0].name);
  });

  it('puts a file-wide note’s source in its name, not on the card', () => {
    renderAt(notesUrl);
    const card = cardFor(seededSourceNote.noteId)!;
    const entry = within(card).getByRole('button');

    expect(entry).toHaveAccessibleName(`${seededSourceNote.noteText}, ${sourceA.title}`);
    expect(
      Array.from(card.querySelectorAll(':not(.visually-hidden)')).some(
        (element) => element.children.length === 0 && element.textContent === sourceA.title,
      ),
      'nothing on the card repeats the heading',
    ).toBe(false);
  });
});

describe('the empty state names both routes', () => {
  it('says how to note a passage and how to write a project note', async () => {
    /*
      Section 3's fifth criterion. Both routes, because they are genuinely
      different acts — one about a passage, one about the file or the project —
      and naming only one leaves a coder believing the other does not exist.

      Reached by emptying the two seeded notes through the panel rather than by
      reaching into the store, which also exercises the deletion route on a
      seeded note: the fixture is a starting state, so its own notes are the
      coder's to remove.
    */
    renderAt(notesUrl);

    for (const note of ownSeeded) {
      fireEvent.click(within(cardFor(note.noteId)!).getByRole('button'));
      await waitFor(() => expect(notePanel()).not.toBeNull());
      fireEvent.change(noteField(), { target: { value: '' } });
      fireEvent.click(within(notePanel()!).getByRole('button', { name: 'Save & Close' }));
      await waitFor(() => expect(notePanel()).toBeNull());
    }

    expect(screen.getByText('0 notes')).toBeInTheDocument();

    const empty = screen.getByText(/have not written any notes/i);
    expect(empty, 'names noting a passage').toHaveTextContent(/Add note/);
    expect(empty, 'and the New note button').toHaveTextContent(/New note button/);
  });
});

describe('an entry names its two voices, per D-069', () => {
  /*
    A session found that readers could not tell excerpt text from note text.
    Each voice now carries identity in both channels: the participant's words
    are a `blockquote` on the grey block, the coder's are preceded by a
    visually-hidden "Note:".

    The prefix rather than the blockquote is what these tests lean on hardest.
    A blockquote announcement rides the reader's verbosity setting; plain text
    does not, so the prefix is the part that cannot be turned off.
  */
  const excerptCard = () =>
    document.querySelector('[data-scope="excerpt"]')!.closest('[data-note-id]') as HTMLElement;

  /** Renders a coded and noted turn, then the Notes page showing it. */
  async function noteOnAFreshTurn(text: string) {
    const { unmount } = renderAt(`/projects/${project.projectId}/sources/${sourceA.sourceId}`);
    const { turnId } = await codeAndNoteFreshTurn(text);
    unmount();

    renderAt(notesUrl);
    return { card: excerptCard(), turnId };
  }

  it('leaves no disclosure in the entry, and no control but its link', async () => {
    /*
      D-069 removes the disclosure, which is D-068's cost principle applied
      again: a control in the middle of every entry is operated on every visit
      just to read past it.
    */
    const { card } = await noteOnAFreshTurn('A thought about this passage.');

    expect(card.querySelector('details')).toBeNull();
    expect(card.querySelector('summary')).toBeNull();
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).getAllByRole('link')).toHaveLength(1);
  });

  it('renders the excerpt whole, as a blockquote', async () => {
    // Whole is the point: the old treatment cut at 90 characters. Checked
    // against the turn's own first and last sentences rather than a length,
    // so this fails if either end goes missing rather than only if both do.
    const { card, turnId } = await noteOnAFreshTurn('A thought about this passage.');

    const quote = card.querySelector('blockquote')!;
    expect(quote).not.toBeNull();

    const segmentIds = fixture.turns.find((turn) => turn.turnId === turnId)!.segmentIds;
    const textOf = (segmentId: string) =>
      fixture.segments.find((segment) => segment.segmentId === segmentId)!.text;

    expect(quote).toHaveTextContent(textOf(segmentIds[0]));
    expect(quote).toHaveTextContent(textOf(segmentIds[segmentIds.length - 1]));
    expect(quote.textContent).not.toContain('…');
  });

  it('begins the note’s accessible text with "Note:"', async () => {
    // Read off the rendered element rather than the prefix span, because what
    // is being asserted is what a reader hears, not that a span exists.
    const { card } = await noteOnAFreshTurn('A thought about this passage.');

    const note = card.querySelector('.notes__text')!;
    expect(note.textContent).toMatch(/^Note:\s*A thought about this passage\.$/);

    // Off the screen and in the tree, per D-069: identity in both channels
    // means the visible entry is not changed by it.
    expect(note.querySelector('.visually-hidden')).toHaveTextContent('Note:');
  });

  it('reads speaker, excerpt, note, codes, in that order', async () => {
    const { card } = await noteOnAFreshTurn('A thought about this passage.');

    const order = [
      card.querySelector('.notes__link')!,
      card.querySelector('blockquote')!,
      card.querySelector('.notes__text')!,
      card.querySelector('.notes__codes')!,
    ];

    for (let i = 0; i < order.length - 1; i += 1) {
      expect(
        order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `part ${i + 1} should precede part ${i + 2}`,
      ).toBeTruthy();
    }
  });

  it('says nothing of two voices where there is only one', async () => {
    /*
      Scoped to excerpt entries deliberately. destinations.md amends only that
      bullet, a project note has no quoted words to be distinguished from, and
      the prefix would land inside the button's accessible name, which the
      D-058 addendum composed as "[text], [source]".
    */
    renderAt(notesUrl);

    const card = document.querySelector<HTMLElement>('[data-scope="project"]')!;
    expect(card.querySelector('blockquote')).toBeNull();
    expect(card.textContent).not.toContain('Note:');
  });
});
