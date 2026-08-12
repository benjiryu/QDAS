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
 * A coded run wears its code family's colour.
 *
 * The rail already shows the family per D-041; the highlight now agrees with
 * it, so a reader scanning the transcript sees what kind of passage this is
 * rather than only that it is coded at all.
 *
 * Where a run's codes come from more than one family there is no single hue to
 * show. It carries no token, and the stylesheet washes it grey by falling back
 * rather than by a second rule — which is why these tests assert the attribute
 * rather than a colour: jsdom drops every declaration carrying `var()`, so the
 * colour itself is measured in the browser instead.
 */

const fixture = createSeedFixture();
const resolved = resolveSource({
  source: fixture.sources[0],
  segments: fixture.segments,
  turns: fixture.turns,
  speakers: fixture.speakers,
});

/** One code from each of two different families, taken from the fixture. */
const MOSS = fixture.codes.find((code) => code.name === 'Motivation and meaning')!;
const CLAY = fixture.codes.find((code) => code.name === 'Barriers to participation')!;

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

/**
 * Codes a fresh excerpt on the first turn with the codes given.
 *
 * Through the panel rather than by seeding assignments, because the case that
 * matters — two families on one excerpt — is one a coder produces by checking
 * two boxes, and nothing else in the fixture produces it.
 */
async function codeFirstTurnWith(codeIds: string[]) {
  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');

  for (const codeId of codeIds) {
    fireEvent.click(panel().querySelector(`[data-code-id="${codeId}"]`)!);
  }
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() =>
    expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
  );
}

/** The colour tokens on the coded runs, in document order. */
const codedRunTokens = () =>
  Array.from(document.querySelectorAll('[data-coded-run]')).map((run) =>
    run.getAttribute('data-color-token'),
  );

describe('a run coded from one family', () => {
  it('carries that family’s token, the same one its rail pill carries', async () => {
    renderWorkspace();
    await codeFirstTurnWith([MOSS.codeId]);

    const tokens = codedRunTokens();
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) expect(token).toBe(MOSS.colorToken);

    // The rail says the same thing, which is the point of using its attribute.
    const pill = document.querySelector('.transcript-turn__pill')!;
    expect(pill.getAttribute('data-color-token')).toBe(MOSS.colorToken);
  });

  it('carries it for two codes from the same family too', async () => {
    const sibling = fixture.codes.find(
      (code) => code.colorToken === MOSS.colorToken && code.codeId !== MOSS.codeId,
    )!;

    renderWorkspace();
    await codeFirstTurnWith([MOSS.codeId, sibling.codeId]);

    for (const token of codedRunTokens()) expect(token).toBe(MOSS.colorToken);
  });
});

describe('a run coded across families', () => {
  it('carries no token, so the wash falls back to grey', async () => {
    expect(MOSS.colorToken).not.toBe(CLAY.colorToken);

    renderWorkspace();
    await codeFirstTurnWith([MOSS.codeId, CLAY.codeId]);

    const tokens = codedRunTokens();
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) expect(token).toBeNull();
  });
});

describe('the state stays off colour alone', () => {
  it('marks a coded run whatever its family, so the shape channel is intact', async () => {
    // Contract 2.5 and transcript-segment.md section 7: the underline is what
    // survives greyscale. The family hue is a second, redundant channel.
    renderWorkspace();
    await codeFirstTurnWith([MOSS.codeId]);

    const runs = Array.from(document.querySelectorAll('[data-coded-run]'));
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(['coded', 'coded-multiple']).toContain(run.getAttribute('data-coded-run'));
    }
  });
});
