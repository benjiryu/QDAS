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
import { CURRENT_CODER_ID } from '../../data/seed/project';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from './TranscriptWorkspace';

/**
 * A highlighted range is a mark, per D-052.
 *
 * The wash and the underline are seen. Read straight through with a screen
 * reader, a styled span says nothing at all, so a coded passage was a visual
 * secret until D-041's description fired on focus — and focus is not how anyone
 * reads a transcript. `mark` is what NVDA and JAWS already report as
 * highlighted, at the verbosity their user chose, and it puts nothing into the
 * prose to do it.
 *
 * Asserted through `getByRole('mark')` rather than by tag name, because what
 * matters is what reaches the accessibility tree. Confirmed available here:
 * aria-query 5.3.0 maps the element to the role, so this query is a real check
 * rather than one that silently finds nothing. What Chromium exposes is measured
 * in tests/e2e/transcript-reading.spec.ts, and what each screen reader says
 * belongs to the manual smoke test, which is where the done-when actually lives.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

const CODE = fixture.codes.find((code) => code.name === 'Motivation and meaning')!;
const multiSentenceTurn = resolved.turns.find((turn) => turn.segments.length >= 3)!;

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

const segmentElement = (segmentId: string) =>
  document.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)!;

/** Selects exact characters, the way a drag does. D-036 stores them as such. */
function drag(from: [string, number], to: [string, number]) {
  const range = document.createRange();
  range.setStart(segmentElement(from[0]).firstChild!, from[1]);
  range.setEnd(segmentElement(to[0]).firstChild!, to[1]);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

const firstTurn = () => document.querySelector<HTMLElement>('[data-turn-id]')!;

function openPanelOnFirstTurn() {
  act(() => firstTurn().focus());
  chord('excerpt.code');
}

async function saveAndClose() {
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() => expect(panelIsOpen()).toBe(false));
}

/** Codes the whole first turn, through the panel a coder would use. */
async function codeFirstTurn() {
  openPanelOnFirstTurn();
  fireEvent.click(panel().querySelector(`[data-code-id="${CODE.codeId}"]`)!);
  await saveAndClose();
}

/** A note and no code at all, which is the state D-052 does not name. */
async function noteFirstTurn() {
  openPanelOnFirstTurn();
  fireEvent.click(within(panel()).getByRole('button', { name: 'Add note' }));
  fireEvent.change(within(panel()).getByRole('textbox', { name: /note about this excerpt/i }), {
    target: { value: 'Worth returning to.' },
  });
  await saveAndClose();
}

describe('a highlighted range exposes the mark role', () => {
  it('when it is coded', async () => {
    renderWorkspace();
    await codeFirstTurn();

    const marks = screen.getAllByRole('mark');
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(mark).toHaveAttribute('data-coded-run', 'coded');
  });

  it('while it is still being captured', async () => {
    /*
      Queried with `hidden` because of something worth recording rather than
      working around: a capture exists only while the code panel is open, every
      command that captures opens it, and closing it with nothing to save
      discards the capture. The panel is modal, so for as long as a captured
      range exists the whole transcript is `aria-hidden` beneath it.

      So the element is what D-052 asks for and no screen reader is in a
      position to report it. That is a question about the two decisions together,
      not something to settle by weakening this test, and it goes in the task
      report. What is checked here is the half that is this task's to get right:
      the captured range carries the role, ready if that ever changes.
    */
    renderWorkspace();
    const [first, , third] = multiSentenceTurn.segments;

    drag([first.segmentId, 6], [third.segmentId, 4]);
    chord('excerpt.code');
    await waitFor(() => expect(panelIsOpen()).toBe(true));

    expect(screen.queryAllByRole('mark')).toHaveLength(0);
    const marks = screen.getAllByRole('mark', { hidden: true });
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(mark).toHaveAttribute('data-captured');
  });

  it('when it carries a note and no code', async () => {
    /*
      D-052 names coded and captured ranges; the note-only state was written
      after it. Marked here because it is highlighted on screen like every other
      range, and leaving it the one a screen reader passes over in silence would
      rebuild the exact gap D-052 closed. Flagged for the decision log rather
      than settled in this test.
    */
    renderWorkspace();
    await noteFirstTurn();

    const marks = screen.getAllByRole('mark');
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(mark).toHaveAttribute('data-coded-run', 'noted');
  });
});

describe('only the highlighted characters are marked', () => {
  it('leaves the rest of a partly captured sentence unmarked', async () => {
    /*
      A sentence captured from character 6 to character 12 is one mark and two
      plain stretches. Marking the whole sentence would tell a reader that words
      they never selected are part of the range.
    */
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    const text = segment.text;

    drag([segment.segmentId, 6], [segment.segmentId, 12]);
    chord('excerpt.code');
    await waitFor(() => expect(panelIsOpen()).toBe(true));

    const sentence = segmentElement(segment.segmentId);
    // `hidden` for the same reason as above: the panel is open over it.
    const marks = within(sentence).getAllByRole('mark', { hidden: true });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent(text.slice(6, 12));

    // The characters on either side are still there, and still not highlighted.
    const runs = Array.from(sentence.children);
    expect(runs).toHaveLength(3);
    expect(runs.map((run) => run.tagName.toLowerCase())).toEqual(['span', 'mark', 'span']);
    expect(sentence).toHaveTextContent(text);
  });
});

describe('the two-level reading model is unchanged', () => {
  it('leaves the turn as the only tab stop', async () => {
    // What adding elements inside prose is most likely to break, and what D-002
    // exists to protect: the turn is the reading unit, and a mark must not
    // become a fourth thing to arrow past.
    renderWorkspace();
    await codeFirstTurn();

    const turn = firstTurn();
    expect(turn.tabIndex).toBe(0);
    expect(turn.querySelectorAll('[tabindex]')).toHaveLength(0);
    for (const mark of within(turn).getAllByRole('mark')) {
      expect(mark).not.toHaveAttribute('tabindex');
      expect(mark).not.toHaveAttribute('role');
    }
  });

  it('leaves the prose reading as one continuous string', async () => {
    renderWorkspace();
    const prose = () => firstTurn().querySelector('.transcript-turn__prose')!.textContent;
    const before = prose();

    await codeFirstTurn();

    // Same characters, same order. The element around them changed and nothing
    // was inserted into what is read.
    expect(prose()).toBe(before);
  });
});

describe('a mark is still click-to-reopen', () => {
  it('reopens the excerpt when the marked text itself is clicked', async () => {
    // The click lands on the mark now rather than a span, and the handler finds
    // the sentence by walking up from the target. D-030.
    renderWorkspace();
    await codeFirstTurn();

    fireEvent.click(screen.getAllByRole('mark')[0]);
    await waitFor(() => expect(panelIsOpen()).toBe(true));
  });
});
