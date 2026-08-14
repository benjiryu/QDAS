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
import { CURRENT_CODER_ID } from '../../data/seed/project';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import { clearTextSizes, readTextSize, writeTextSize } from '../../data/textSizeStore';

/**
 * Transcript text sizing.
 *
 * Specification: decision D-056.
 *
 * The Word document-zoom model, which was in the original requirements: the
 * handoff's preference list carries Text size separately from Browser zoom.
 * They compose rather than compete — zoom scales the whole interface, this
 * grows only the reading surface — so a magnification participant can run
 * moderate zoom with large transcript text and compact chrome.
 *
 * What cannot be checked here is layout: jsdom has none, and drops every
 * declaration carrying `var()` besides. Reflow at maximum size, and the fact
 * that the chrome does not move, are measured in
 * tests/e2e/transcript-reading.spec.ts.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSourcePositions();
  clearTextSizes();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSourcePositions();
  clearTextSizes();
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

const group = () => screen.getByRole('group', { name: 'Transcript text size' });
const increase = () => within(group()).getByRole('button', { name: 'Increase text size' });
const decrease = () => within(group()).getByRole('button', { name: 'Decrease text size' });
/*
  The preference is read off the root element since D-061, where D-056 set an
  inline font-size on the transcript. Same claims, new mechanism: one custom
  property on the root reaches every surface that opts in, including pages with
  no transcript on them, which is what the decision is for.
*/
const root = () => document.documentElement;
const shownPercent = () => Number(root().dataset.readingScale);
const scale = () => root().style.getPropertyValue('--reading-scale');
const announced = () => announcer.getHistory().map((entry) => entry.message);

describe('stepping the size, per D-056', () => {
  it('grows and shrinks the reading surface', () => {
    renderAt(sourceUrl);
    expect(shownPercent()).toBe(100);
    expect(scale()).toBe('1');

    fireEvent.click(increase());
    expect(shownPercent()).toBe(125);
    expect(scale()).toBe('1.25');

    fireEvent.click(decrease());
    expect(shownPercent()).toBe(100);
  });

  it('sizes with font-size and never a transform', () => {
    /*
      D-056 names the mechanism rather than leaving it open, and this is why: a
      transform zooms without reflowing, so the text runs off the side and has
      to be panned to — the exact failure contract 2.5 prohibits.
    */
    renderAt(sourceUrl);
    fireEvent.click(increase());
    fireEvent.click(increase());

    expect(scale()).toBe('1.5');
    expect(root().style.transform).toBe('');
    expect(
      document.querySelector<HTMLElement>('[data-transcript]')!.style.transform,
    ).toBe('');
  });

  it('announces every step, not just where it ended up', () => {
    /*
      Discrete, per D-050, and the opposite of the search count. Those coalesce
      because the intermediates are drafts of one fact still settling; each
      press here is its own act, and a run reporting only its last value would
      leave the user unable to tell whether the middle ones registered.
    */
    renderAt(sourceUrl);
    fireEvent.click(increase());
    fireEvent.click(increase());
    fireEvent.click(increase());

    const steps = announced().filter((message) => message.startsWith('Text size'));
    expect(steps).toEqual([
      'Text size 125 percent.',
      'Text size 150 percent.',
      'Text size 175 percent.',
    ]);
  });

  it('stops at each end, unavailable rather than gone, and says why', () => {
    // Contract 2.6: the control keeps its place and states the reason. One that
    // vanished at the boundary would move everything beside it.
    renderAt(sourceUrl);
    expect(decrease()).toHaveAttribute('aria-disabled', 'true');
    expect(increase()).not.toHaveAttribute('aria-disabled');

    fireEvent.click(decrease());
    expect(shownPercent()).toBe(100);
    expect(announced().join(' ')).toContain('already at its minimum');

    for (let step = 0; step < 6; step += 1) fireEvent.click(increase());
    expect(shownPercent()).toBe(250);
    expect(increase()).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(increase());
    expect(shownPercent()).toBe(250);
    expect(announced().join(' ')).toContain('already at its maximum');
  });
});

describe('the preference persists, per user', () => {
  it('survives a remount, which is what a reload is here', () => {
    const first = renderAt(sourceUrl);
    fireEvent.click(increase());
    fireEvent.click(increase());
    expect(shownPercent()).toBe(150);
    first.unmount();

    renderAt(sourceUrl);
    expect(shownPercent(), 'the surface opens at the stored size').toBe(150);
  });

  it('is scoped to the user, not shared across them', () => {
    writeTextSize('us-someone-else', 250);
    renderAt(sourceUrl);

    expect(shownPercent()).toBe(100);
    expect(readTextSize('us-someone-else')).toBe(250);
  });

  it('clamps stored rubbish rather than rendering it', () => {
    // Storage is a text file a participant's browser can hand back anything
    // from, and a transcript at 4000 percent is unusable with no way out.
    writeTextSize(CURRENT_CODER_ID, 9000);
    expect(readTextSize(CURRENT_CODER_ID)).toBe(250);

    clearTextSizes();
    localStorage.setItem('qdas.textSize.v1', 'not json');
    expect(readTextSize(CURRENT_CODER_ID)).toBe(100);
  });
});

describe('sizing moves no research object, which is D-056’s claim', () => {
  it('makes the same excerpt at one size as at another', async () => {
    /*
      The claim the decision rests on, and the expensive one to discover false.
      It holds because of what was decided earlier rather than anything done
      here: D-002 rejected the line as a unit precisely because wrapping changes
      with zoom, and D-036 stores boundaries as character offsets. Text size
      moves pixels, and an offset is not a pixel.

      Sized first, then captured, then sized again — which is also the done-when
      read literally, and avoids resizing while the code panel is open. It is
      modal, so it `aria-hidden`s the page behind it and the size control is
      genuinely unreachable for as long as it stands.
    */
    renderAt(sourceUrl);
    fireEvent.click(increase());
    fireEvent.click(increase());
    expect(shownPercent()).toBe(150);

    /*
      Exact characters, captured at 150 percent, in a turn the fixture has not
      already coded. Unscoped, `[data-coded-run]` picks up the twenty seeded
      excerpts belonging to the second coder and measures those instead — which
      is how the first version of this read a whole neighbouring turn.
    */
    const turn = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-id]')).find(
      (candidate) => candidate.querySelector('[data-coded-run]') === null,
    )!;
    const segment = turn.querySelector<HTMLElement>('[data-segment-id]')!;
    const text = segment.textContent!;
    const range = document.createRange();
    range.setStart(segment.firstChild!, 6);
    range.setEnd(segment.firstChild!, 14);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    chord('excerpt.code');

    const panel = await screen.findByRole('dialog', { name: /code assignment/i });
    fireEvent.click(panel.querySelector(`[data-code-id="${fixture.codes[0].codeId}"]`)!);
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );

    const codedText = () =>
      Array.from(turn.querySelectorAll('[data-coded-run="coded"]'))
        .map((node) => node.textContent)
        .join('');

    expect(codedText(), 'exactly the characters selected').toBe(text.slice(6, 14));

    // Back down to the default: the same eight characters, still coded.
    fireEvent.click(decrease());
    fireEvent.click(decrease());
    expect(shownPercent()).toBe(100);
    expect(codedText()).toBe(text.slice(6, 14));
  });
});
