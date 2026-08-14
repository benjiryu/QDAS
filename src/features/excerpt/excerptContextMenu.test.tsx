import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import type { Announcer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import { createSeedFixture } from '../../data/seed';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { resolveSource } from '../../domain';
import { TranscriptWorkspace } from '../transcript/TranscriptWorkspace';

/**
 * The transcript context menu.
 *
 * Specification: docs/patterns/excerpt-selection.md section 2, decision D-037,
 * carrying forward D-028's conditions.
 *
 * "Native menu preserved" is asserted here by the absence of `preventDefault`
 * on the contextmenu event, which is the only thing that would suppress the
 * browser's own menu. Whether the browser then draws one is the browser's
 * business, and the end-to-end spec checks the pointer path in a real one.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

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

function renderWorkspace() {
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
        flags={defaultFlags}
      />
    </AnnouncerProvider>,
  );
}

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

/** Returns true when the default was suppressed, which hides the native menu. */
function rightClick(element: Element): boolean {
  let prevented = false;
  act(() => {
    prevented = !fireEvent.contextMenu(element, { clientX: 120, clientY: 240 });
  });
  return prevented;
}

function pressMenuKey(key: string, shiftKey = false) {
  act(() => {
    fireEvent.keyDown(document, { key, shiftKey });
  });
}

const menu = () => screen.queryByRole('menu');
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
const highlighted = () =>
  Array.from(document.querySelectorAll('[data-captured]'))
    .map((element) => element.textContent ?? '')
    .join('');
const announced = () => announcer.getHistory().map((entry) => entry.message);

describe('when the menu appears', () => {
  it('opens on a right-click over a selection in the transcript', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 3], [segment.segmentId, 12]);

    expect(rightClick(segmentElement(segment.segmentId))).toBe(true);

    expect(menu()).toBeInTheDocument();
    expect(items()).toHaveLength(2);
  });

  it('leaves the native menu alone on transcript text with no selection', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    expect(rightClick(segmentElement(segment.segmentId))).toBe(false);

    expect(menu()).toBeNull();
  });

  it('leaves the native menu alone outside the transcript, selection or not', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 0], [segment.segmentId, 10]);

    const strip = screen.getByRole('region', { name: 'Excerpt' });
    expect(rightClick(strip)).toBe(false);

    expect(menu()).toBeNull();
  });

  it('leaves the native menu alone when the selection is somewhere else', () => {
    // A selection exists, but not in the transcript, so there is nothing here
    // to code. Checking only that the selection is non-collapsed would open a
    // menu whose items would capture the wrong thing, or nothing.
    renderWorkspace();
    const outside = document.querySelector<HTMLElement>('.excerpt-toolbar__status')!;
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(rightClick(segmentElement(multiSentenceTurn.segments[0].segmentId))).toBe(false);
    expect(menu()).toBeNull();
  });

  it('leaves the native menu alone when the selection is collapsed', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    const range = document.createRange();
    range.setStart(segmentElement(segment.segmentId).firstChild!, 4);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(rightClick(segmentElement(segment.segmentId))).toBe(false);
    expect(menu()).toBeNull();
  });
});

describe('the keyboard route, per D-037', () => {
  it('opens on Shift+F10 when a selection exists', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 2], [segment.segmentId, 9]);

    pressMenuKey('F10', true);

    expect(menu()).toBeInTheDocument();
  });

  it('opens on the applications key too', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 2], [segment.segmentId, 9]);

    pressMenuKey('ContextMenu');

    expect(menu()).toBeInTheDocument();
  });

  it('does nothing without a selection, so the key keeps its usual meaning', () => {
    renderWorkspace();
    act(() => {
      document.querySelector<HTMLElement>(`[data-turn-id="${multiSentenceTurn.turn.turnId}"]`)!
        .focus();
    });

    pressMenuKey('F10', true);

    expect(menu()).toBeNull();
    // And no capture happened either: the key is not a second `excerpt.code`.
    expect(highlighted()).toBe('');
  });

  it('offers the same items however it was opened', () => {
    const view = renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 1], [segment.segmentId, 8]);
    rightClick(segmentElement(segment.segmentId));
    const viaPointer = items();

    view.unmount();
    renderWorkspace();
    drag([segment.segmentId, 1], [segment.segmentId, 8]);
    pressMenuKey('F10', true);

    expect(items()).toEqual(viaPointer);
  });
});

describe('menu semantics and focus', () => {
  it('is a menu of menu items, and focus enters on the first', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    rightClick(segmentElement(segment.segmentId));

    expect(menu()).toHaveAttribute('role', 'menu');
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
  });

  it('moves between items with the arrow keys', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    rightClick(segmentElement(segment.segmentId));

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      fireEvent.keyUp(document.activeElement!, { key: 'ArrowDown' });
    });

    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[1]);
  });

  it('closes on Escape and puts focus back where it was', async () => {
    renderWorkspace();
    const turnElement = document.querySelector<HTMLElement>(
      `[data-turn-id="${multiSentenceTurn.turn.turnId}"]`,
    )!;
    act(() => turnElement.focus());

    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    rightClick(segmentElement(segment.segmentId));
    expect(document.activeElement).not.toBe(turnElement);

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      fireEvent.keyUp(document.activeElement!, { key: 'Escape' });
    });
    // The focus return runs after the overlay unwinds its own.
    await act(async () => {
      await Promise.resolve();
    });

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(turnElement);
    // Escape dismissed the menu; it captured nothing.
    expect(highlighted()).toBe('');

    /*
      Whether the DOM selection survives is not asked here, and cannot be.
      jsdom collapses the selection whenever anything is focused — the menu's
      own `autoFocus` is enough — which is a jsdom behaviour and not a browser
      one. D-060's "Selection survives the menu unchanged" is asserted in
      tests/e2e/context-menu.spec.ts, where focus and selection are real.
    */
  });
});

describe('what the items do', () => {
  it('captures the selection the menu opened on, and opens the panel in search', () => {
    renderWorkspace();
    const [first, second] = multiSentenceTurn.segments;
    drag([first.segmentId, 5], [second.segmentId, 7]);
    rightClick(segmentElement(first.segmentId));

    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Assign code/ }));
    });

    expect(highlighted()).toBe(`${first.text.slice(5)}${second.text.slice(0, 7)}`);
    expect(screen.getByRole('dialog', { name: /code assignment/i })).toBeInTheDocument();
    expect(announced().join(' ')).toContain('Coding your selection');
    expect(announced().join(' ')).toContain('Search field focused');
  });

  it('captures the same range into the note field for Add note', () => {
    renderWorkspace();
    const [first, second] = multiSentenceTurn.segments;
    drag([first.segmentId, 5], [second.segmentId, 7]);
    rightClick(segmentElement(first.segmentId));

    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Add note/ }));
    });

    expect(highlighted()).toBe(`${first.text.slice(5)}${second.text.slice(0, 7)}`);
    // The item follows the command's destination, per D-055: the isolated note
    // panel now, rather than code selection's note row. The menu adds no
    // capability, so it goes wherever the strip control goes.
    expect(document.querySelector('[data-region="note-panel"]')).not.toBeNull();
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    expect(announced().join(' ')).toContain('Field focused');
  });

  it('adds no capability: both items are on the strip as well', () => {
    // D-028's condition, carried forward by D-037. A menu that could do
    // something the strip cannot would be a pointer-only path.
    renderWorkspace();
    // Read before opening: an open menu hides the rest of the document from
    // assistive technology, which is what a menu is supposed to do.
    const strip = screen.getByRole('region', { name: 'Excerpt' });

    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    rightClick(segmentElement(segment.segmentId));

    for (const label of items()) {
      const name = label.replace(/Control.*$/, '').trim();
      expect(
        Array.from(strip.querySelectorAll('button')).some((button) =>
          (button.textContent ?? '').startsWith(name),
        ),
      ).toBe(true);
    }
  });

  it('closes the menu once an item is chosen', () => {
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];
    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    rightClick(segmentElement(segment.segmentId));

    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Assign code/ }));
    });

    expect(menu()).toBeNull();
  });
});

describe('nothing is captured until an item is chosen, per D-060', () => {
  /*
    The ownership rule as a test rather than a comment. Before capture the range
    is the browser's, per D-001 and D-036, and the application highlight is the
    visual that *means* captured — so an open menu must paint nothing of its
    own. An earlier fix had it paint its snapshot to survive the browser's
    inactive repaint; D-060 rejected that and moved the problem to the
    stylesheet, where an authored `::selection` keeps the native visual.
  */
  it('paints no application highlight while the menu is open', () => {
    renderWorkspace();
    const [first, second] = multiSentenceTurn.segments;

    drag([first.segmentId, 5], [second.segmentId, 7]);
    rightClick(segmentElement(first.segmentId));

    expect(menu()).not.toBeNull();
    expect(highlighted(), 'an uncaptured range wears no application visual').toBe('');
    expect(document.querySelector('[data-excerpt-state="confirmed"]')).toBeNull();
    expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0);
  });

  it('paints one as soon as an item is chosen', () => {
    // The other half of the same boundary: capture is what turns the visual on.
    renderWorkspace();
    const segment = multiSentenceTurn.segments[0];

    drag([segment.segmentId, 0], [segment.segmentId, 10]);
    rightClick(segmentElement(segment.segmentId));
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Assign code/ }));
    });

    expect(highlighted()).toBe(segment.text.slice(0, 10));
    expect(document.querySelector('[data-excerpt-state="confirmed"]')).not.toBeNull();
  });
});
