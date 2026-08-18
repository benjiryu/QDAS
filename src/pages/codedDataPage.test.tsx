import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AnnouncerProvider, createAnnouncer } from '../a11y';
import type { Announcer } from '../a11y';
import { bindingsFor, detectPlatform } from '../config/keybindings';
import type { Command } from '../config/keybindings';
import { clearCodingSession, writeSavedWork } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID, SECOND_CODER_ID, THIRD_CODER_ID } from '../data/seed/project';
import { clearSimulatedSession, writeSimulatedSession } from '../data/simulatedSession';
import { clearSourcePositions } from '../data/sourcePositionStore';

/**
 * The Coded data page.
 *
 * Specification: docs/pages/destinations.md section 2, decisions D-045, D-049,
 * D-030, R-4. Section 2's six acceptance criteria are named as such below.
 *
 * The one that matters most is the first: a coder mid independent coding must
 * find no trace of the second coder anywhere on this page. It is asserted
 * against every seeded name and every seeded excerpt rather than a sample,
 * because a leak that showed one row would be as contaminating as one that
 * showed them all.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const codedDataUrl = `/projects/${project.projectId}/coded-data`;

/** The second source, for the criterion that names it. */
const SECOND_SOURCE = fixture.sources[1];

let announcer: Announcer;

beforeEach(() => {
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
  announcer = createAnnouncer({ intervalMs: 5, clearGapMs: 1 });
});

afterEach(() => {
  announcer.reset();
  clearCodingSession();
  clearSimulatedSession();
  clearSourcePositions();
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

const viewLabel = () => document.querySelector('[data-view-label]')?.textContent ?? '';
const summaryText = () => document.querySelector('.coded-data__summary')?.textContent ?? '';
const region = (name: string) => document.querySelector<HTMLElement>(`[data-region="${name}"]`);
const resultRows = () => Array.from(document.querySelectorAll('[data-excerpt-id]'));

function followSidebarLink(label: string) {
  const link = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.project-nav__link'),
  ).find((candidate) => candidate.textContent === label);
  if (!link) throw new Error(`No sidebar link labelled ${label}`);
  fireEvent.click(link, { button: 0 });
}

/** Codes one excerpt on the given source as the current coder, optionally noting it. */
async function codeAnExcerpt(sourceId: string, codeIds: string[], noteText?: string) {
  renderAt(`/projects/${project.projectId}/sources/${sourceId}`);

  const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
  act(() => turn.focus());
  chord('excerpt.code');

  const panel = screen.getByRole('dialog', { name: /code assignment/i });
  for (const codeId of codeIds) {
    fireEvent.click(panel.querySelector(`[data-code-id="${codeId}"]`)!);
  }

  if (noteText !== undefined) {
    const region = panel.querySelector<HTMLElement>('[data-region="note"]')!;
    fireEvent.click(within(region).getByRole('button', { name: /add note|edit note/i }));
    fireEvent.change(within(region).getByLabelText(/note about this excerpt/i), {
      target: { value: noteText },
    });
  }

  fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
  await waitFor(() =>
    expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
  );
}

describe('acceptance 1: a coder during independent coding sees own work only', () => {
  it('names the view and shows nothing attributable to another coder', async () => {
    // The seeded scenario is exactly this case, so nothing is switched here.
    await codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId]);
    followSidebarLink('Coded data');

    expect(viewLabel()).toBe('Your coded work');

    const page = document.querySelector('main')!.textContent ?? '';

    // No other coder is named.
    for (const user of fixture.users.filter((candidate) => candidate.userId !== CURRENT_CODER_ID)) {
      expect(page, `${user.displayName} appears`).not.toContain(user.displayName);
    }

    // And none of their excerpts is listed. Every seeded excerpt belongs to the
    // second coder, so this is all twenty of them.
    const seeded = fixture.excerpts.filter((excerpt) => excerpt.coderId === SECOND_CODER_ID);
    expect(seeded.length).toBeGreaterThan(0);
    const shown = resultRows().map((row) => row.getAttribute('data-excerpt-id'));
    for (const excerpt of seeded) expect(shown).not.toContain(excerpt.excerptId);

    // The coder's own one is there.
    expect(shown).toHaveLength(1);

    // And no same-excerpt line, per D-066. Naming another coder only to say one
    // exists is the leak R-4 forbids just as much as naming them outright.
    expect(document.querySelectorAll('.coded-data__also-coded')).toHaveLength(0);
  });
});

describe('acceptance 2: the qualitative lead sees project-wide', () => {
  it('names the view, counts team-wide, and attributes every row', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Project-wide view');

    // The seeded excerpts belong to the second coder and are all here.
    const seeded = fixture.excerpts.filter((excerpt) => excerpt.coderId === SECOND_CODER_ID);
    const shown = resultRows().map((row) => row.getAttribute('data-excerpt-id'));
    for (const excerpt of seeded) expect(shown).toContain(excerpt.excerptId);

    // Attribution per row, which is only correct once R-4 has lifted.
    const second = fixture.users.find((user) => user.userId === SECOND_CODER_ID)!;
    expect(document.querySelectorAll('.coded-data__coder').length).toBe(shown.length);
    expect(document.querySelector('main')!.textContent).toContain(second.displayName);
  });

  it('counts every standing assignment on a code, not just one coder’s', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    // Worked out from the fixture rather than from the page's own arithmetic.
    const counts = new Map<string, number>();
    for (const assignment of fixture.codeAssignments) {
      counts.set(assignment.codeId, (counts.get(assignment.codeId) ?? 0) + 1);
    }
    const [codeId, expected] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const code = fixture.codes.find((candidate) => candidate.codeId === codeId)!;

    expect(
      within(region('filters')!).getByRole('radio', {
        name: new RegExp(`${code.name}, ${expected}$`),
      }),
    ).toBeInTheDocument();
  });
});

describe('the same-excerpt indicator, per D-066', () => {
  /*
    Overlap pair 6 in the fixture: the third coder's ex-4f92d7c1 takes four of
    the five sentences of the second coder's ex-5806e4b2, which is 0.8 against
    the 0.5 threshold. Pair 1 overlaps by two sentences of seven and is the
    below-threshold case beside it.
  */
  const asLead = () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);
  };
  const row = (excerptId: string) =>
    document.querySelector<HTMLElement>(`[data-excerpt-id="${excerptId}"]`)!;
  const alsoCodedIn = (excerptId: string) =>
    row(excerptId).querySelector('.coded-data__also-coded');

  it('names the other coder on both rows of the pair', () => {
    asLead();

    const second = fixture.users.find((user) => user.userId === SECOND_CODER_ID)!;
    const third = fixture.users.find((user) => user.userId === THIRD_CODER_ID)!;

    expect(alsoCodedIn('ex-5806e4b2')).toHaveTextContent(`Also coded by ${third.displayName}`);
    expect(alsoCodedIn('ex-4f92d7c1')).toHaveTextContent(`Also coded by ${second.displayName}`);
  });

  it('says nothing on a pair that overlaps below the threshold', () => {
    asLead();

    expect(alsoCodedIn('ex-9d27b014')).toBeNull();
    expect(alsoCodedIn('ex-5c1908be')).toBeNull();
  });

  it('marks exactly the rows the fixture is measured to qualify', () => {
    // An explicit list, so a fixture edit that moves a pair across the
    // threshold is reported rather than absorbed.
    asLead();

    const marked = [...document.querySelectorAll('.coded-data__also-coded')].map((line) =>
      line.closest('[data-excerpt-id]')!.getAttribute('data-excerpt-id'),
    );

    expect(marked.sort()).toEqual(
      ['ex-4b8e30da', 'ex-4f92d7c1', 'ex-5806e4b2', 'ex-77e0ac53'].sort(),
    );
  });

  it('is plain text in reading order, not a control', () => {
    /*
      D-066: text in reading order, never icon-only, no resolution affordance.
      Positioned after the row's own coder because both lines answer "who", so
      the two attribution facts are heard together.
    */
    asLead();

    const article = row('ex-5806e4b2');
    const line = alsoCodedIn('ex-5806e4b2')!;
    const meta = article.querySelector('.coded-data__meta')!;
    const codes = article.querySelector('.coded-data__codes')!;

    expect(meta.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(codes.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();

    expect(line).not.toHaveAttribute('aria-hidden');
    // The line itself is not a control and is not inside one. Counting the
    // article's controls would have said this too until D-067 put a disclosure
    // button in the row; this says what was actually meant.
    expect(line.closest('a, button')).toBeNull();
    expect(within(article).getAllByRole('link')).toHaveLength(1);
  });
});

describe('the note disclosure, per D-067', () => {
  /*
    Participants who saw "Has a note" wanted the note there rather than a page
    away. What makes it a disclosure rather than a clickable thing is the set of
    properties below, each of which D-067 names.

    Read in the project-wide view, where the seeded excerpt notes are legible:
    every one of them belongs to another coder, so the own view has none until a
    coder writes one, which the last test does.
  */
  const asLead = () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);
  };
  const noted = fixture.notes.find((note) => note.relatedExcerptId !== null)!;
  const rowOf = (excerptId: string) =>
    document.querySelector<HTMLElement>(`[data-excerpt-id="${excerptId}"]`)!;
  const toggleIn = (excerptId: string) =>
    within(rowOf(excerptId)).getByRole('button', { name: 'Note' });

  it('is a button named Note, collapsed, and stays named Note when open', () => {
    // Never a show/hide label swap: the name is constant and `aria-expanded`
    // carries the state, so a screen reader user who has learned the control
    // does not have to re-read it to find out what it now does.
    asLead();
    const toggle = toggleIn(noted.relatedExcerptId!);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggleIn(noted.relatedExcerptId!)).toHaveAttribute('aria-expanded', 'true');
    expect(within(rowOf(noted.relatedExcerptId!)).getByRole('button', { name: 'Note' })).toBe(
      toggle,
    );
  });

  it('reveals the note immediately after the button', () => {
    asLead();
    const toggle = toggleIn(noted.relatedExcerptId!);

    expect(rowOf(noted.relatedExcerptId!).querySelector('.coded-data__note-text')).toBeNull();

    fireEvent.click(toggle);

    const revealed = rowOf(noted.relatedExcerptId!).querySelector('.coded-data__note-text')!;
    expect(revealed).toHaveTextContent(noted.noteText);
    // Immediately after, in DOM and so in reading order.
    expect(toggle.nextElementSibling).toBe(revealed);
    expect(toggle).toHaveAttribute('aria-controls', revealed.id);
  });

  it('is a sibling of the row’s link and never nested inside it', () => {
    /*
      D-067's structural rule, and the reason the link is no longer wrapped in a
      paragraph. A button inside a link is invalid and unreachable, and the two
      being cousins rather than siblings would satisfy the letter of neither.
    */
    asLead();
    const row = rowOf(noted.relatedExcerptId!);
    const toggle = toggleIn(noted.relatedExcerptId!);
    const link = within(row).getByRole('link');

    expect(toggle.closest('a')).toBeNull();
    expect(toggle.parentElement).toBe(row);
    expect(link.parentElement).toBe(row);
  });

  it('leaves focus on the button across a full toggle', () => {
    // D-067: focus stays put. Nothing to send it to and nothing to send it back
    // from, which is what separates this from the code panel's disclosures.
    asLead();
    const toggle = toggleIn(noted.relatedExcerptId!);
    act(() => toggle.focus());

    fireEvent.click(toggle);
    expect(toggle).toHaveFocus();

    fireEvent.click(toggle);
    expect(toggle).toHaveFocus();
    expect(rowOf(noted.relatedExcerptId!).querySelector('.coded-data__note-text')).toBeNull();
  });

  it('announces nothing, the attribute and the text being the feedback', () => {
    asLead();
    fireEvent.click(toggleIn(noted.relatedExcerptId!));

    const revealed = rowOf(noted.relatedExcerptId!).querySelector('.coded-data__note-text')!;
    expect(revealed.closest('[aria-live]')).toBeNull();
  });

  it('expands one row without expanding another', () => {
    // Per row and per session, per D-067. Two rows with notes, one opened.
    asLead();
    const withNotes = fixture.notes
      .filter((note) => note.relatedExcerptId !== null)
      .map((note) => note.relatedExcerptId!);
    const [first, second] = withNotes;

    fireEvent.click(toggleIn(first));

    expect(rowOf(first).querySelector('.coded-data__note-text')).not.toBeNull();
    expect(rowOf(second).querySelector('.coded-data__note-text')).toBeNull();
    expect(toggleIn(second)).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders no button at all where the note has been deleted', () => {
    /*
      D-067 says no indicator renders where the viewer cannot read the note.
      That was not true of this page before Task 46: the indicator was computed
      from every note handed to it, so it outlived its own note's deletion — and
      a disclosure built on that would have opened onto deleted text.
    */
    writeSimulatedSession({ role: 'qualitativeLead' });
    writeSavedWork(project.projectId, {
      excerpts: [],
      assignments: [],
      notes: [{ ...noted, status: 'deleted' }],
      supersededIds: [],
    });
    renderAt(codedDataUrl);

    expect(
      within(rowOf(noted.relatedExcerptId!)).queryByRole('button', { name: 'Note' }),
    ).toBeNull();
  });

  it('discloses a note the coder writes in session, in their own view', () => {
    // The own view's only route to a readable note: every seeded excerpt note
    // belongs to another coder, so R-4 keeps them all off this view.
    return codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId], 'Worth a look.')
      .then(() => {
        followSidebarLink('Coded data');

        const toggle = screen.getByRole('button', { name: 'Note' });
        fireEvent.click(toggle);

        expect(toggle.nextElementSibling).toHaveTextContent('Worth a look.');
      });
  });
});

describe('acceptance 3: past independent coding, everyone sees project-wide', () => {
  it('flips a coder to the project-wide view', () => {
    writeSimulatedSession({ phase: 'review' });
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Project-wide view');
    expect(resultRows().length).toBeGreaterThan(0);
  });

  it('leaves the coder on own work at independent coding and earlier', () => {
    writeSimulatedSession({ phase: 'pilot' });
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Your coded work');
  });
});

describe('acceptance 4: a result lands focus on the turn holding its excerpt', () => {
  it('opens the second source with focus on the excerpt’s own turn', async () => {
    // Section 2 calls this the page's most important behaviour: landing at the
    // top of the transcript instead makes the page useless.
    const user = userEvent.setup();
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    const inSecond = fixture.excerpts.find(
      (excerpt) => excerpt.sourceId === SECOND_SOURCE.sourceId,
    )!;
    const row = document.querySelector(`[data-excerpt-id="${inSecond.excerptId}"]`)!;
    const link = within(row as HTMLElement).getByRole('link');
    const href = link.getAttribute('href')!;

    // The turn named in the link is the one holding the excerpt's start.
    const expectedTurn = fixture.turns.find((turn) =>
      turn.segmentIds.includes(inSecond.startSegmentId),
    )!;
    expect(href).toContain(`turn=${expectedTurn.turnId}`);

    await user.click(link);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SECOND_SOURCE.title);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-turn-id')).toBe(expectedTurn.turnId),
    );
  });
});

describe('acceptance 5: a superseded assignment is not counted', () => {
  it('drops a removed code from the filter list, keeping the one still on it', async () => {
    /*
      Two codes, then one removed. Not both: unchecking every code leaves an
      empty assignment, which D-042 closes by discarding the round rather than
      superseding anything — the guard that keeps unchecking from becoming the
      deletion route D-030 forbids. Supersession needs a save that still has
      something on it.
    */
    const removed = fixture.codes[0];
    const kept = fixture.codes[1];

    await codeAnExcerpt(fixture.sources[0].sourceId, [removed.codeId, kept.codeId]);

    followSidebarLink('Coded data');
    expect(
      within(region('filters')!).getByRole('radio', { name: new RegExp(`${removed.name}, 1$`) }),
    ).toBeInTheDocument();

    followSidebarLink(fixture.sources[0].title);
    fireEvent.click(document.querySelector('[data-coded-run]')!);
    const panel = await screen.findByRole('dialog', { name: /code assignment/i });
    fireEvent.click(panel.querySelector(`[data-code-id="${removed.codeId}"]`)!);
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );

    followSidebarLink('Coded data');

    // The superseded one is gone from the counts; the standing one is not.
    expect(
      within(region('filters')!).queryByRole('radio', { name: new RegExp(`${removed.name},`) }),
    ).toBeNull();
    expect(
      within(region('filters')!).getByRole('radio', { name: new RegExp(`${kept.name}, 1$`) }),
    ).toBeInTheDocument();
  });
});

describe('the filter list, per section 2', () => {
  it('heads the list with All codes and fuses each count into the name', async () => {
    await codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId]);
    followSidebarLink('Coded data');

    const radios = within(region('filters')!).getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName('All codes, 1');
    // The count is part of the name, not a badge beside it. The F-4 lesson.
    expect(radios[1]).toHaveAccessibleName(`${fixture.codes[0].name}, 1`);
  });

  it('marks the selection by more than colour', async () => {
    await codeAnExcerpt(fixture.sources[0].sourceId, [fixture.codes[0].codeId]);
    followSidebarLink('Coded data');

    const selected = document.querySelector('.coded-data__filter[data-selected]')!;
    expect(within(selected as HTMLElement).getByRole('radio')).toBeChecked();
  });

  it('narrows the results to the chosen code', () => {
    writeSimulatedSession({ role: 'qualitativeLead' });
    renderAt(codedDataUrl);

    const all = resultRows().length;
    const filters = within(region('filters')!).getAllByRole('radio');
    fireEvent.click(filters[1]);

    expect(resultRows().length).toBeLessThan(all);
    expect(resultRows().length).toBeGreaterThan(0);
  });
});

describe('the simulated session, per prototype-scope.md', () => {
  it('flips the view and its label when the role is switched', async () => {
    // The task's done-when. Client-side, so switching does not reload and take
    // the coder's session work with it.
    const user = userEvent.setup();
    renderAt(codedDataUrl);

    expect(viewLabel()).toBe('Your coded work');

    await user.selectOptions(screen.getByLabelText('Role'), 'qualitativeLead');
    expect(viewLabel()).toBe('Project-wide view');

    await user.selectOptions(screen.getByLabelText('Role'), 'coder');
    expect(viewLabel()).toBe('Your coded work');
  });

  it('flips the view when the phase is switched', async () => {
    const user = userEvent.setup();
    renderAt(codedDataUrl);

    await user.selectOptions(screen.getByLabelText('Project phase'), 'review');
    expect(viewLabel()).toBe('Project-wide view');
  });

  it('sits after the regions section 2 fixes in order', () => {
    renderAt(codedDataUrl);

    const scenario = region('scenario')!;
    const summary = document.querySelector('.coded-data__summary')!;
    expect(summary.compareDocumentPosition(scenario) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says it is simulated rather than presenting itself as sign-in', () => {
    renderAt(codedDataUrl);
    expect(region('scenario')!.textContent).toMatch(/simulated/i);
  });
});

describe('the count line', () => {
  it('names the view beside the count, per D-049', () => {
    renderAt(codedDataUrl);
    expect(summaryText()).toContain('Your coded work');
    expect(summaryText()).toMatch(/\d+ coded excerpts?/);
  });
});

describe('the filter list, per D-062', () => {
  /*
    A lookup surface rather than a teaching one, which is the whole reason this
    page diverges from the authored order. The codebook and the panel keep it.
  */
  const filterRows = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.coded-data__filter'));

  /** The filter names in rendered order, without "All codes" at the head. */
  const filterNames = () =>
    filterRows()
      .slice(1)
      .map((row) => row.querySelector('.coded-data__filter-name')!.textContent!);

  const showEveryCode = () => writeSimulatedSession({ role: 'qualitativeLead' });

  it('orders families alphabetically and exhausts each before the next', () => {
    showEveryCode();
    renderAt(codedDataUrl);

    const names = filterNames();
    const familyNames = fixture.codes
      .filter((code) => code.parentCodeId === null && names.includes(code.name))
      .map((code) => code.name);

    // Families in alphabetical order.
    const familyPositions = familyNames.map((name) => names.indexOf(name));
    expect([...familyPositions].sort((a, b) => a - b)).toEqual(familyPositions);
    expect([...familyNames].sort((a, b) => a.localeCompare(b))).toEqual(familyNames);

    // And a family is finished before the next begins: every descendant of a
    // family sits between it and the family after it.
    const codeById = new Map(fixture.codes.map((code) => [code.codeId, code]));
    const familyOf = (name: string): string => {
      let code = fixture.codes.find((candidate) => candidate.name === name)!;
      while (code.parentCodeId) code = codeById.get(code.parentCodeId)!;
      return code.name;
    };
    const runs = names.map(familyOf).filter((name, index, all) => name !== all[index - 1]);
    expect(new Set(runs).size, 'no family is interrupted and resumed').toBe(runs.length);
  });

  it('orders siblings alphabetically under their parent', () => {
    showEveryCode();
    renderAt(codedDataUrl);

    const names = filterNames();
    const parents = fixture.codes.filter((code) =>
      fixture.codes.some((child) => child.parentCodeId === code.codeId),
    );

    for (const parent of parents) {
      const siblings = fixture.codes
        .filter((code) => code.parentCodeId === parent.codeId && names.includes(code.name))
        .map((code) => code.name);
      if (siblings.length < 2) continue;

      const rendered = names.filter((name) => siblings.includes(name));
      expect([...rendered].sort((a, b) => a.localeCompare(b)), parent.name).toEqual(rendered);
    }
  });

  it('is not canonical order, which is the divergence D-062 makes', () => {
    /*
      Asserted against a case where the two actually differ. On a fixture where
      authored order happened to be alphabetical this test would pass while the
      page ignored the decision entirely.
    */
    showEveryCode();
    renderAt(codedDataUrl);

    const names = filterNames();
    const canonical = [...fixture.codes]
      .filter((code) => names.includes(code.name))
      .sort((a, b) => a.canonicalOrderIndex - b.canonicalOrderIndex)
      .map((code) => code.name);

    expect(canonical).not.toEqual(names);
  });

  it('carries the family hue, which is now the only visual a code name has', () => {
    showEveryCode();
    renderAt(codedDataUrl);

    /*
      Level has no visual channel any more. D-062 gave it indentation, the
      amendment replaced that with pill fill treatment, and both went when the
      pills did — so this asserts what remains and no longer asserts what does
      not. Level reaches a screen reader through the lineage description, which
      the test below covers.
    */
    for (const row of filterRows().slice(1)) {
      const name = row.querySelector<HTMLElement>('.coded-data__filter-name')!;
      const code = fixture.codes.find((candidate) => candidate.name === name.textContent)!;

      // The family's hue, the same token the rail and the panel read.
      expect(name.dataset.colorToken, code.name).toBe(code.colorToken);
      expect(row.dataset.level, 'no level attribute survives the restyle').toBeUndefined();
    }
  });

  it('keeps the accessible name pure and puts lineage in the description', () => {
    /*
      D-054 reused verbatim, per D-062. The name is what search, sorting and the
      count all operate on, and what a coder hears when choosing a filter; the
      family is context and belongs under their own verbosity setting.
    */
    showEveryCode();
    renderAt(codedDataUrl);

    // Chosen from what actually rendered: a code with no assignments has no
    // filter row, so picking one from the fixture alone finds nothing.
    // A code with a lineage, found by the description it carries rather than by
    // a level attribute the restyle removed.
    const row = filterRows()
      .slice(1)
      .find((candidate) => candidate.querySelector('input')!.hasAttribute('aria-describedby'))!;
    const name = row.querySelector('.coded-data__filter-name')!.textContent!;
    const count = row.querySelector('.coded-data__count')!.textContent;
    const child = fixture.codes.find((code) => code.name === name)!;
    const radio = row.querySelector('input')!;

    /* The whole lineage, outermost first, per D-054 — not only the immediate
       parent: a grandchild names both of its ancestors. */
    const codeById = new Map(fixture.codes.map((code) => [code.codeId, code]));
    const ancestors: string[] = [];
    for (let code = child; code.parentCodeId; ) {
      code = codeById.get(code.parentCodeId)!;
      ancestors.unshift(code.name);
    }

    // Exactly the code name and its count, and nothing else.
    expect(radio).toHaveAccessibleName(`${name}, ${count}`);
    expect(radio).toHaveAccessibleDescription(`in ${ancestors.join(', ')}`);
  });

  it('gives a child with unused ancestors its full depth and names them', () => {
    // D-062's own-view edge. No placeholder row appears for the ancestors; the
    // child simply keeps its place and says where it came from.
    renderAt(codedDataUrl);

    const rows = filterRows().slice(1);
    for (const row of rows) {
      const name = row.querySelector('.coded-data__filter-name')!.textContent!;
      const code = fixture.codes.find((candidate) => candidate.name === name)!;
      if (code.parentCodeId === null) continue;

      const parent = fixture.codes.find((c) => c.codeId === code.parentCodeId)!;
      const parentRendered = rows.some(
        (candidate) =>
          candidate.querySelector('.coded-data__filter-name')!.textContent === parent.name,
      );
      if (parentRendered) continue;

      // The ancestor has no row of its own, and the child still indents and
      // still names it.
      expect(row.dataset.level).not.toBe('0');
      const radio = row.querySelector('input')!;
      expect(radio).toHaveAccessibleDescription(new RegExp(parent.name));
    }
  });
});

describe('a provisionally coded excerpt reaches this page, per D-070', () => {
  /**
   * Proposes a code from the panel's empty search and saves it onto an excerpt.
   */
  async function codeWithAProposal(name: string) {
    renderAt(`/projects/${project.projectId}/sources/${fixture.sources[0].sourceId}`);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('excerpt.code');

    const panel = screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.change(within(panel).getByRole('searchbox', { name: 'Search codes' }), {
      target: { value: name },
    });
    fireEvent.click(within(panel).getByRole('button', { name: /propose/i }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );
  }

  it('shows the excerpt at all, rather than dropping the row', async () => {
    /*
      The failure this closes. An assignment naming a provisional resolved to
      nothing, so an excerpt coded only that way produced no codes, was filtered
      out of the results entirely, and left the count — a coder would have coded
      a passage and found the page empty.
    */
    await codeWithAProposal('Compost queue');
    followSidebarLink('Coded data');

    expect(resultRows()).toHaveLength(1);
    expect(document.querySelector('main')!.textContent).toContain('Compost queue');
  });

  it('marks it provisional in both channels', async () => {
    // D-070. The pill the eye reads and the line the ear does, rather than the
    // grey that reached neither.
    await codeWithAProposal('Compost queue');
    followSidebarLink('Coded data');

    const row = resultRows()[0];
    expect(row.querySelector('.coded-data__pill')).toHaveTextContent(
      'Compost queue (provisional)',
    );
    expect(row.querySelector('.coded-data__code-names')).toHaveTextContent(
      'Codes: Compost queue (provisional)',
    );
  });
});
