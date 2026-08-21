import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { clearCodingSession } from '../../data/codingSessionStore';
import { createSeedFixture } from '../../data/seed';
import { CURRENT_CODER_ID, SECOND_CODER_ID } from '../../data/seed/project';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * Notes: open-ended, saveable alone, and editable on return.
 *
 * The change that matters most here is not new behaviour but a repair. The
 * reopened-save path diffed the assignments and returned before the note was
 * written, so a note edited on a revisited excerpt was discarded on save
 * without a word. Nothing asserted it, so nothing noticed.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

const FIRST = fixture.codes[0];
const SECOND = fixture.codes[1];

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

/** Seeded work is the second coder's, so these render with none of it. */
function renderWorkspace() {
  return render(
    <AnnouncerProvider announcer={announcer}>
      <TranscriptWorkspace
        resolved={resolved}
        seedExcerpts={[]}
        seedAssignments={[]}
        seedNotes={[]}
        codingRoundId={fixture.codingRound.codingRoundId}
        codebookVersionId={fixture.codebookVersion.codebookVersionId}
        codes={fixture.codes}
        projectId={fixture.project.projectId}
        userId={CURRENT_CODER_ID}
        flags={defaultFlags}
      />
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
const panelIsOpen = () => screen.queryAllByRole('dialog', { name: /code assignment/i }).length > 0;
const noteRegion = () => panel().querySelector<HTMLElement>('[data-region="note"]')!;
const noteRow = () => within(noteRegion()).getByRole('button', { name: /add note|edit note/i });
const saveButton = () => within(panel()).getByRole('button', { name: 'Save & Close' });

function saved(container: HTMLElement) {
  const element = container.querySelector('[data-saved-excerpts]')!;
  return {
    excerpts: Number(element.getAttribute('data-saved-excerpts')),
    assignments: Number(element.getAttribute('data-saved-assignments')),
    notes: Number(element.getAttribute('data-saved-notes')),
  };
}

/** Opens the note box if it is shut, and returns the field. */
function noteField(): HTMLTextAreaElement {
  const row = noteRow();
  if (row.getAttribute('aria-expanded') !== 'true') fireEvent.click(row);
  return within(noteRegion()).getByLabelText(/note about this excerpt/i) as HTMLTextAreaElement;
}

function captureFirstTurn() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');
}

/** Reopens the saved excerpt by clicking its own turn. */
/**
 * Reopens the first turn's excerpt into the code panel.
 *
 * By `excerpt.open` rather than by clicking. Clicking routes by what the
 * excerpt carries, so on a note-only excerpt it opens the note panel — which
 * is what makes the round trip below, note first and codes after, need the
 * command. That is the command's job: it reopens for coding whatever is there.
 */
async function reopenFirstTurn() {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.open');
  await waitFor(() => expect(panelIsOpen()).toBe(true));
}

describe('1: the box opens with no caption, and is still named', () => {
  it('shows no visible caption but keeps an accessible name', () => {
    renderWorkspace();
    captureFirstTurn();

    const field = noteField();
    // Asserted as the computed name, so deleting the label fails here rather
    // than leaving a nameless box that passes an attribute check.
    expect(field).toHaveAccessibleName('Note about this excerpt');

    const label = noteRegion().querySelector('label')!;
    expect(label).toHaveClass('code-panel__note-label');
  });
});

describe('2: a note alone is enough to save', () => {
  it('makes Save & Close operable and writes the note', async () => {
    const { container } = renderWorkspace();
    captureFirstTurn();

    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(noteField(), { target: { value: 'Worth returning to.' } });
    expect(saveButton()).not.toHaveAttribute('aria-disabled');

    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    expect(saved(container)).toMatchObject({ excerpts: 1, assignments: 0, notes: 1 });
  });
});

describe('3: a note-only excerpt is visible on its turn and its own words', () => {
  it('paints a noted run, shows the note icon, and says so in the description', async () => {
    renderWorkspace();
    captureFirstTurn();
    fireEvent.change(noteField(), { target: { value: 'A thought with no code.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    expect(turn.querySelector('.transcript-turn__note')).not.toBeNull();
    // No code, so no pill and no family hue on the run.
    expect(turn.querySelector('.transcript-turn__pill')).toBeNull();

    // The passage the note is about is painted, so the reader can see which
    // words it concerns rather than only that the turn carries one.
    const run = turn.querySelector('[data-coded-run]')!;
    expect(run).toHaveAttribute('data-coded-run', 'noted');
    expect(run).not.toHaveAttribute('data-color-token');
    expect(turn.querySelector('[data-segment-id]')).toHaveAttribute(
      'data-display-state',
      'noted',
    );

    const describedBy = turn.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe('1 excerpt, 0 codes, note');
  });
});

describe('3b: codes win over a note', () => {
  it('turns the run coded when a code is added, and back when it is removed', async () => {
    // Precedence, and the round trip: a note never masks coding, and losing the
    // last code does not lose the note's own highlight.
    renderWorkspace();
    captureFirstTurn();
    fireEvent.change(noteField(), { target: { value: 'Only a note for now.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    const runState = () =>
      document.querySelector('[data-turn-id] [data-coded-run]')?.getAttribute('data-coded-run');
    expect(runState()).toBe('noted');

    await reopenFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    expect(runState()).toBe('coded');
    expect(
      document.querySelector('[data-turn-id] [data-coded-run]'),
    ).toHaveAttribute('data-color-token', FIRST.colorToken);
  });
});

describe('4: revisiting shows the note', () => {
  it('reads "Edit note" and opens already on the note', async () => {
    renderWorkspace();
    captureFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.change(noteField(), { target: { value: 'The first thought.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    await reopenFirstTurn();

    /*
      Open on it, not shut over it. Reopening an excerpt that carries a note now
      lands the coder in the field, so the collapsed preview that used to show
      the text is not what they meet — the text is in the box they are in.
    */
    expect(noteRow()).toHaveTextContent('Edit note');
    expect(noteRow()).toHaveAttribute('aria-expanded', 'true');
    expect(within(noteRegion()).getByLabelText(/note about this excerpt/i)).toHaveValue(
      'The first thought.',
    );
  });
});

describe('5: editing a note on a revisited excerpt keeps it', () => {
  it('updates the note rather than dropping or duplicating it', async () => {
    // The regression this change exists for. The reopened branch diffed the
    // assignments and returned, so the edit vanished on save.
    const { container } = renderWorkspace();
    captureFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.change(noteField(), { target: { value: 'First draft.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    await reopenFirstTurn();
    fireEvent.change(noteField(), { target: { value: 'Second draft, after rereading.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    // One note, not two, and it carries the new text.
    expect(saved(container)).toMatchObject({ notes: 1 });

    await reopenFirstTurn();
    expect(within(noteRegion()).getByLabelText(/note about this excerpt/i)).toHaveValue(
      'Second draft, after rereading.',
    );
  });
});

describe('6: an empty pending list never supersedes', () => {
  it('keeps the codes when everything is unchecked and a note is written', async () => {
    // D-030's guard, which making a note saveable would otherwise reopen:
    // uncheck everything, write a note, save, and the codes would be stripped.
    const { container } = renderWorkspace();
    captureFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.click(panel().querySelector(`[data-code-id="${SECOND.codeId}"]`)!);
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));
    expect(saved(container)).toMatchObject({ assignments: 2 });

    await reopenFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.click(panel().querySelector(`[data-code-id="${SECOND.codeId}"]`)!);
    fireEvent.change(noteField(), { target: { value: 'Unsure about these.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    // The note is written and both codes still stand.
    expect(saved(container)).toMatchObject({ assignments: 2, notes: 1 });
    await reopenFirstTurn();
    const checked = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
      .filter((box) => box.checked)
      .map((box) => box.dataset.codeId!);
    expect(checked).toEqual([FIRST.codeId, SECOND.codeId]);
  });

  it('still supersedes when one of two is unchecked', async () => {
    const { container } = renderWorkspace();
    captureFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.click(panel().querySelector(`[data-code-id="${SECOND.codeId}"]`)!);
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    await reopenFirstTurn();
    fireEvent.click(panel().querySelector(`[data-code-id="${FIRST.codeId}"]`)!);
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    await reopenFirstTurn();
    const checked = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
      .filter((box) => box.checked)
      .map((box) => box.dataset.codeId!);
    expect(checked).toEqual([SECOND.codeId]);
    void container;
  });
});

describe('7: another coder’s note is not overwritten', () => {
  it('writes a new note instead of editing theirs', async () => {
    // The seeded excerpts belong to the second coder and are reopenable, so
    // this is reachable rather than hypothetical.
    const theirNote = fixture.notes.find((note) => {
      const excerpt = fixture.excerpts.find(
        (candidate) => candidate.excerptId === note.relatedExcerptId,
      );
      return excerpt?.sourceId === resolved.source.sourceId && note.authorId === SECOND_CODER_ID;
    });
    expect(theirNote, 'the fixture must seed a note on one of their excerpts').toBeDefined();
    const theirExcerpt = fixture.excerpts.find(
      (excerpt) => excerpt.excerptId === theirNote!.relatedExcerptId,
    )!;

    const { container } = render(
      <AnnouncerProvider announcer={announcer}>
        <TranscriptWorkspace
          resolved={resolved}
          seedExcerpts={fixture.excerpts}
          seedAssignments={fixture.codeAssignments}
          seedNotes={fixture.notes}
          codingRoundId={fixture.codingRound.codingRoundId}
          codebookVersionId={fixture.codebookVersion.codebookVersionId}
          codes={fixture.codes}
          projectId={fixture.project.projectId}
          userId={CURRENT_CODER_ID}
          flags={defaultFlags}
        />
      </AnnouncerProvider>,
    );

    fireEvent.click(
      container.querySelector(`[data-segment-id="${theirExcerpt.startSegmentId}"]`)!,
    );
    await waitFor(() => expect(panelIsOpen()).toBe(true));

    fireEvent.change(noteField(), { target: { value: 'My own reading of this.' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    // A note of the coder's own was added; theirs was not edited.
    expect(saved(container).notes).toBe(1);
  });
});

describe('8: closing keeps a note-only draft', () => {
  it('commits on Escape rather than discarding it, per D-042', async () => {
    const { container } = renderWorkspace();
    captureFirstTurn();
    fireEvent.change(noteField(), { target: { value: 'Kept on the way out.' } });

    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    await waitFor(() => expect(panelIsOpen()).toBe(false));

    expect(saved(container)).toMatchObject({ excerpts: 1, notes: 1 });
  });
});
