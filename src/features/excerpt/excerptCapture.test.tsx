import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { bindingsFor, detectPlatform } from '../../config/keybindings';
import type { Chord, Command } from '../../config/keybindings';
import { createSeedFixture } from '../../data/seed';
import { clearCodingSession } from '../../data/codingSessionStore';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * Capture end to end: what is stored, what is highlighted, and what is said.
 *
 * Specification: docs/patterns/excerpt-selection.md section 7 (v0.2), decision
 * D-036.
 *
 * The two menu criteria in section 7, "Menu parity" and "Native menu
 * preserved", belong to the context menu in section 2 and are covered in
 * excerptContextMenu.test.tsx.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

const bindings = bindingsFor(detectPlatform());
const multiSentenceTurn = resolved.turns.find((turn) => turn.segments.length >= 3)!;

let announcer: Announcer;

beforeEach(() => {
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearSourcePositions();
  document.getSelection()?.removeAllRanges();
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

function segmentElement(segmentId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)!;
}

function drag(from: [string, number], to: [string, number]) {
  const range = document.createRange();
  range.setStart(segmentElement(from[0]).firstChild!, from[1]);
  range.setEnd(segmentElement(to[0]).firstChild!, to[1]);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusTurn(turnId: string) {
  act(() => {
    document.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`)!.focus();
  });
}

/** Every highlighted character, in document order: what the coder can see. */
const highlighted = () =>
  Array.from(document.querySelectorAll('[data-captured]'))
    .map((element) => element.textContent ?? '')
    .join('');

const announced = () => announcer.getHistory().map((entry) => entry.message);
const lastAnnouncement = () => announcer.getLast()?.message ?? '';
const excerptState = () =>
  document.querySelector('[data-saved-excerpts]')?.getAttribute('data-excerpt-state') ?? '';
const panelIsOpen = () => screen.queryAllByRole('dialog', { name: /code assignment/i }).length > 0;

function savedCounts() {
  const element = document.querySelector('[data-saved-excerpts]')!;
  return {
    excerpts: Number(element.getAttribute('data-saved-excerpts')),
    assignments: Number(element.getAttribute('data-saved-assignments')),
  };
}

describe('exact capture', () => {
  it('highlights exactly the characters that were dragged', () => {
    renderWorkspace();
    const [first, second, third] = multiSentenceTurn.segments;

    drag([first.segmentId, 6], [third.segmentId, 4]);
    chord('excerpt.code');

    // First sentence from character 6, the middle one whole, the last to
    // character 4. Section 6: the highlight shows exactly what will be coded.
    expect(highlighted()).toBe(
      `${first.text.slice(6)}${second.text}${third.text.slice(0, 4)}`,
    );
  });

  it('leaves the characters outside the range unhighlighted', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 4], [segment.segmentId, 12]);
    chord('excerpt.code');

    expect(highlighted()).toBe(segment.text.slice(4, 12));
    // The rest of the sentence is still on screen, just not captured.
    expect(segmentElement(segment.segmentId).textContent).toBe(segment.text);
  });

  it('clears the native selection, leaving one selection visual', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    chord('excerpt.code');

    expect(document.getSelection()?.isCollapsed ?? true).toBe(true);
  });
});

describe('the announcement names which rule fired', () => {
  it('says the selection was captured, and names the speaker', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 2], [segment.segmentId, 9]);
    chord('excerpt.code');

    const capture = announced().find((message) => message.includes('sentence'))!;
    expect(capture).toContain('Coding your selection');
    expect(capture).toContain(multiSentenceTurn.speaker!.label);
    expect(capture).not.toMatch(/no selection/i);
  });

  it('says a fallback fired, and names the turn it took', () => {
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);

    chord('excerpt.code');

    const capture = announced().find((message) => message.includes('sentence'))!;
    expect(capture).toMatch(/^No selection detected\./);
    expect(capture).toContain('Coding the current turn');
    expect(capture).toContain(multiSentenceTurn.speaker!.label);
  });

  it('makes the two unmistakable from their first words', () => {
    // The honesty requirement in section 1.2. A user who cannot tell these
    // apart cannot tell a captured selection from a captured turn.
    const view = renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 0], [segment.segmentId, 8]);
    chord('excerpt.code');
    const withSelection = announced().find((message) => message.includes('sentence'))!;

    view.unmount();
    announcer.reset();
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);
    chord('excerpt.code');
    const withoutSelection = announced().find((message) => message.includes('sentence'))!;

    const opening = (message: string) => message.split(' ').slice(0, 3).join(' ');
    expect(opening(withSelection)).not.toBe(opening(withoutSelection));
  });

  it('never uses the fallback wording when a selection exists', () => {
    renderWorkspace();
    const [first, second] = multiSentenceTurn.segments;

    // Focus is on a turn as well, so both rules could resolve. Step 1 wins.
    focusTurn(multiSentenceTurn.turn.turnId);
    drag([first.segmentId, 3], [second.segmentId, 5]);
    chord('excerpt.code');

    expect(announced().join(' ')).not.toMatch(/no selection detected/i);
    // And the range is the drag, not the whole turn.
    // The space between sentences belongs to neither, so it is not highlighted.
    expect(highlighted()).toBe(`${first.text.slice(3)}${second.text.slice(0, 5)}`);
  });
});

describe('nothing to capture', () => {
  it('says so, opens no panel, and captures nothing', () => {
    renderWorkspace();
    act(() => {
      // Any control outside the transcript: step 3 is reached by focus being
      // somewhere the capture rule cannot resolve a turn from. The strip's
      // controls used to serve; the text size control is what is left.
      document.querySelector<HTMLButtonElement>('.text-size__button')!.focus();
    });

    chord('excerpt.code');

    expect(lastAnnouncement()).toMatch(/nothing to capture/i);
    expect(panelIsOpen()).toBe(false);
    expect(excerptState()).toBe('idle');
  });
});

describe('the two capture commands', () => {
  it('opens the panel in the search field for excerpt.code', () => {
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);

    chord('excerpt.code');

    expect(panelIsOpen()).toBe(true);
    expect(document.activeElement?.getAttribute('type')).toBe('search');
    expect(announced().join(' ')).toContain('Search field focused');
  });

  it('opens the isolated note panel for excerpt.note', () => {
    /*
      Amended for D-055. This command used to open code selection focused on its
      note row; session evidence was that reaching the field through the whole
      panel cost too much, so it now opens a panel holding the field alone.

      The capture itself is unchanged, which the next test asserts: only where
      it lands is different.
    */
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);

    chord('excerpt.note');

    expect(document.querySelector('[data-region="note-panel"]')).not.toBeNull();
    expect(panelIsOpen(), 'code selection stays out of it').toBe(false);
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    expect(announced().join(' ')).toContain('Field focused');
  });

  it('captures the same range whichever command was used', () => {
    const view = renderWorkspace();
    const segment = multiSentenceTurn.segments[1];

    drag([segment.segmentId, 2], [segment.segmentId, 10]);
    chord('excerpt.code');
    const viaCode = highlighted();

    /*
      Two independent attempts, not a navigation round trip. Since D-044 an
      unmount hands the draft to the session store, so without this the second
      render would resume the first capture instead of starting clean.
    */
    view.unmount();
    clearCodingSession();
    renderWorkspace();
    drag([segment.segmentId, 2], [segment.segmentId, 10]);
    chord('excerpt.note');

    expect(highlighted()).toBe(viaCode);
  });
});

describe('the pointer route, which is the context menu now', () => {
  it('captures the selection a pointer just made', () => {
    /*
      The strip's Assign code control was this route and has been removed with
      the rest of the strip, so the menu is the whole of what a pointer user
      has. Its own mousedown guard is what keeps the selection alive long enough
      to act on — a mousedown collapses the document selection unless the
      default is suppressed, which would leave the command nothing to capture
      and send it silently into the turn fallback.
    */
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 5], [segment.segmentId, 14]);

    act(() => {
      fireEvent.contextMenu(segmentElement(segment.segmentId), { clientX: 40, clientY: 40 });
    });

    const item = screen.getByRole('menuitem', { name: /Assign code/ });
    act(() => {
      const wentThrough = fireEvent.mouseDown(item);
      if (wentThrough) document.getSelection()?.removeAllRanges();
      fireEvent.click(item);
    });

    expect(highlighted()).toBe(segment.text.slice(5, 14));
    expect(announced().join(' ')).toContain('Coding your selection');
  });
});

describe('closing with nothing checked discards', () => {
  it('removes the highlight, records nothing, and returns to idle', () => {
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);
    chord('excerpt.code');
    expect(highlighted()).not.toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(excerptState()).toBe('idle');
    expect(highlighted()).toBe('');
    expect(panelIsOpen()).toBe(false);
    expect(savedCounts().excerpts).toBe(0);
  });

  it('returns focus to the turn the capture started in', async () => {
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);
    chord('excerpt.code');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // After the dialog has unwound its own focus restore.
    await act(async () => {});

    expect(document.activeElement?.getAttribute('data-turn-id')).toBe(
      multiSentenceTurn.turn.turnId,
    );
  });
});

describe('capture survives the panel', () => {
  it('holds the range unchanged through searching, checking, and saving', () => {
    renderWorkspace();
    const [first, second] = multiSentenceTurn.segments;

    drag([first.segmentId, 7], [second.segmentId, 6]);
    chord('excerpt.code');
    const atCapture = highlighted();

    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    fireEvent.change(search, { target: { value: fixture.codes[0].name.slice(0, 4) } });
    expect(highlighted()).toBe(atCapture);

    const codebook = document.querySelector<HTMLElement>('[data-region="codebook"]')!;
    fireEvent.click(codebook.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    expect(highlighted()).toBe(atCapture);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));

    expect(savedCounts()).toEqual({ excerpts: 1, assignments: 1 });
    expect(excerptState()).toBe('saved');
  });
});

describe('a saved partial excerpt stays partial', () => {
  /**
   * Coded characters within one turn, in document order.
   *
   * Scoped to the turn, because the fixture arrives with the second coder's
   * excerpts already saved elsewhere in the transcript.
   */
  const codedText = (turnId = multiSentenceTurn.turn.turnId) =>
    Array.from(
      document.querySelectorAll(`[data-turn-id="${turnId}"] [data-coded-run]`),
    )
      .map((element) => element.textContent ?? '')
      .join('');

  /** Coded characters within named sentences only. */
  const codedTextIn = (...segmentIds: string[]) =>
    segmentIds
      .map((segmentId) =>
        Array.from(segmentElement(segmentId).querySelectorAll('[data-coded-run]'))
          .map((element) => element.textContent ?? '')
          .join(''),
      )
      .join('');

  function saveWithACode() {
    const codebook = document.querySelector<HTMLElement>('[data-region="codebook"]')!;
    fireEvent.click(codebook.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));
  }

  it('paints only the characters that were captured, not the sentence', () => {
    // The reported bug: a half-sentence capture became a whole-sentence
    // highlight the moment it was saved.
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 5], [segment.segmentId, 18]);
    chord('excerpt.code');
    saveWithACode();

    expect(codedTextIn(segment.segmentId)).toBe(segment.text.slice(5, 18));
    // The sentence is still whole on screen; only part of it is coded.
    expect(segmentElement(segment.segmentId).textContent).toBe(segment.text);
  });

  it('slices both boundary sentences and keeps the middle whole', () => {
    renderWorkspace();
    const [first, second, third] = multiSentenceTurn.segments;

    drag([first.segmentId, 6], [third.segmentId, 4]);
    chord('excerpt.code');
    saveWithACode();

    expect(codedTextIn(first.segmentId, second.segmentId, third.segmentId)).toBe(
      `${first.text.slice(6)}${second.text}${third.text.slice(0, 4)}`,
    );
  });

  it('still marks the sentence coded, which is what comparison asks', () => {
    // D-036 section 5 keeps review at sentence granularity. The sentence-level
    // state says "coded"; the runs say which characters.
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 5], [segment.segmentId, 18]);
    chord('excerpt.code');
    saveWithACode();

    expect(segmentElement(segment.segmentId)).toHaveAttribute('data-display-state', 'coded');
  });

  it('leaves a neighbouring sentence untouched', () => {
    renderWorkspace();
    const [first, second] = multiSentenceTurn.segments;

    drag([first.segmentId, 5], [first.segmentId, 18]);
    chord('excerpt.code');
    saveWithACode();

    expect(segmentElement(second.segmentId).querySelector('[data-coded-run]')).toBeNull();
    expect(segmentElement(second.segmentId)).toHaveAttribute('data-display-state', 'inactive');
  });

  it('paints a whole-turn capture whole, so the fallback is unaffected', () => {
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);

    chord('excerpt.code');
    saveWithACode();

    const whole = multiSentenceTurn.segments.map((segment) => segment.text).join('');
    expect(codedText()).toBe(whole);
  });
});

describe('what the excerpt reads back as', () => {
  it('offers only the captured characters for re-reading, not the whole sentence', () => {
    // D-039 removed the read-back control; D-040 replaced it with visually
    // hidden text the reader reaches with their own commands.
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 5], [segment.segmentId, 18]);
    chord('excerpt.code');

    const readBack = document.querySelector('[data-selected-excerpt]')!.textContent ?? '';
    expect(readBack).toContain(segment.text.slice(5, 18));
    expect(readBack).not.toContain(segment.text);
  });

  it('describes a partial capture as partial', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 5], [segment.segmentId, 18]);
    chord('excerpt.code');

    expect(announced().join(' ')).toContain('Part of 1 sentence');
  });

  it('describes a whole capture without qualification', () => {
    renderWorkspace();
    focusTurn(multiSentenceTurn.turn.turnId);

    chord('excerpt.code');

    const capture = announced().find((message) => message.includes('sentence'))!;
    expect(capture).not.toMatch(/part of/i);
  });
});
