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
import { clearCodingSession } from '../data/codingSessionStore';
import { writeSimulatedSession } from '../data/simulatedSession';
import { createSeedFixture } from '../data/seed';
import { clearSourcePositions } from '../data/sourcePositionStore';
import { buildCodeTree, searchCodes } from '../features/codes/codeTree';
import { FAMILY_HUE_NAMES } from '../features/codebook/familyHues';
import { searchCodebook } from '../features/codebook/searchCodebook';

/**
 * The Codebook page.
 *
 * Specification: docs/pages/destinations.md section 1, decisions D-035, D-043,
 * D-044.
 *
 * Section 1's three acceptance criteria are named as such below. The rest is
 * what the section requires of the page's structure.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const source = fixture.sources[0];
const codebookUrl = `/projects/${project.projectId}/codebook`;
const sourceUrl = `/projects/${project.projectId}/sources/${source.sourceId}`;

/**
 * A phrase in one code's full definition and in no code's name.
 *
 * The whole difference between the two searches rests on a case like this, so
 * it is asserted from the fixture rather than assumed: if a future codebook
 * edit puts this word in a name, the test says so instead of quietly passing.
 */
const DEFINITION_ONLY_PHRASE = 'infrastructure';
const PHRASE_OWNER = fixture.codes.find((code) =>
  code.fullDefinition.toLowerCase().includes(DEFINITION_ONLY_PHRASE),
)!;

/**
 * A phrase in one code's inclusion criteria and nowhere else.
 *
 * The probe for D-046 narrowing the search alongside the display. It found a
 * code before that change and must find nothing after it, because the criteria
 * are no longer on the page and a hit the coder cannot see the cause of is what
 * the rule exists to prevent.
 */
const CRITERIA_ONLY_PHRASE = 'carrying';

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

const region = (name: string) =>
  document.querySelector<HTMLElement>(`[data-region="${name}"]`);

/** Code ids in the canonical list, in the order they are rendered. */
const canonicalOrder = () =>
  Array.from(region('codebook')!.querySelectorAll('[data-code-id]')).map(
    (node) => node.getAttribute('data-code-id')!,
  );

const searchField = () => screen.getByRole('searchbox', { name: 'Search codebook' });

/**
 * Expands the note disclosure if it is collapsed, and returns the field.
 *
 * Needed on the way back as well as on the way out: the draft survives, but the
 * row comes back collapsed, which is what "Edit note" on it means.
 */
function noteField(): HTMLTextAreaElement {
  const noteRegion = document.querySelector<HTMLElement>('[data-region="note"]')!;
  const row = within(noteRegion).getByRole('button', { name: /add note|edit note/i });
  if (row.getAttribute('aria-expanded') !== 'true') fireEvent.click(row);
  return within(noteRegion).getByLabelText(/note about this excerpt/i) as HTMLTextAreaElement;
}

function followSidebarLink(label: string) {
  const link = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.project-nav__link'),
  ).find((candidate) => candidate.textContent === label);
  if (!link) throw new Error(`No sidebar link labelled ${label}`);
  fireEvent.click(link, { button: 0 });
}

describe('acceptance: the capture survives a trip here, per D-044', () => {
  it('leaves the capture, the checked codes, and the draft note as they were', async () => {
    // The journey D-035 created and D-044 protects: a coder mid-capture comes
    // here to tell two similarly named codes apart, and goes back.
    renderAt(sourceUrl);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('excerpt.code');

    const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
    const [first, second] = fixture.codes;
    fireEvent.click(panel().querySelector(`[data-code-id="${first.codeId}"]`)!);
    fireEvent.click(panel().querySelector(`[data-code-id="${second.codeId}"]`)!);

    fireEvent.change(noteField(), { target: { value: 'Check which water code this is.' } });

    const capturedBefore = Array.from(document.querySelectorAll('[data-captured]'))
      .map((element) => element.textContent ?? '')
      .join('');

    followSidebarLink('Code book');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Code book');

    followSidebarLink(source.title);
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(1),
    );

    const restored = Array.from(document.querySelectorAll('[data-captured]'))
      .map((element) => element.textContent ?? '')
      .join('');
    const checked = Array.from(panel().querySelectorAll<HTMLInputElement>('[data-code-id]'))
      .filter((box) => box.checked)
      .map((box) => box.dataset.codeId!);

    expect(restored, 'the capture').toBe(capturedBefore);
    expect(checked, 'the checked codes').toEqual([first.codeId, second.codeId]);
    expect(noteField(), 'the draft note').toHaveValue('Check which water code this is.');
  });
});

describe('acceptance: a query leaves the canonical list alone', () => {
  it('renders results above a list that is still whole and still in order', async () => {
    const user = userEvent.setup();
    renderAt(codebookUrl);

    const before = canonicalOrder();
    expect(before).toHaveLength(fixture.codes.length);

    await user.type(searchField(), 'water');

    // Results appeared.
    expect(region('search-results')).not.toBeNull();
    expect(
      within(region('search-results')!).getAllByRole('heading', { level: 3 }).length,
    ).toBeGreaterThan(0);

    // And the canonical list below is untouched: same codes, same order.
    expect(canonicalOrder()).toEqual(before);
  });

  it('keeps the canonical list even when nothing matches', async () => {
    const user = userEvent.setup();
    renderAt(codebookUrl);
    const before = canonicalOrder();

    await user.type(searchField(), 'zzzznotacode');

    expect(within(region('search-results')!).getByText(/no codes match/i)).toBeInTheDocument();
    expect(canonicalOrder()).toEqual(before);
  });

  it('puts the results region above the codebook in reading order', () => {
    renderAt(codebookUrl);
    fireEvent.change(searchField(), { target: { value: 'water' } });

    const position = region('search-results')!.compareDocumentPosition(region('codebook')!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('search reaches the whole record here, and only the name in the panel', () => {
  it('finds a code by a phrase that appears only in its definition', async () => {
    // The deliberate difference between the two surfaces, pinned from both
    // sides so neither drifts into the other. This page shows the text it
    // matched on; the panel does not, which is why the panel does not match it.
    expect(PHRASE_OWNER).toBeDefined();
    expect(
      fixture.codes.some((code) =>
        code.name.toLowerCase().includes(DEFINITION_ONLY_PHRASE),
      ),
      'the phrase must not appear in any code name, or this proves nothing',
    ).toBe(false);

    const tree = buildCodeTree(fixture.codes);
    expect(searchCodes(tree, DEFINITION_ONLY_PHRASE)).toHaveLength(0);
    expect(searchCodebook(tree, DEFINITION_ONLY_PHRASE).map((result) => result.code.codeId)).toEqual(
      [PHRASE_OWNER.codeId],
    );

    const user = userEvent.setup();
    renderAt(codebookUrl);
    await user.type(searchField(), DEFINITION_ONLY_PHRASE);

    const results = within(region('search-results')!);
    expect(results.getByRole('heading', { level: 3, name: PHRASE_OWNER.name })).toBeInTheDocument();
  });

  it('says which field it matched, so the reason is never invisible', async () => {
    const user = userEvent.setup();
    renderAt(codebookUrl);

    await user.type(searchField(), DEFINITION_ONLY_PHRASE);
    expect(within(region('search-results')!).getByText(/matched in definition/i))
      .toBeInTheDocument();
  });

  it('no longer reaches text D-046 took off the page', async () => {
    // The narrowing, pinned from the fixture. The phrase is real, it belongs to
    // a real code, and it is nowhere a coder can read it any more.
    const owner = fixture.codes.find((code) =>
      code.inclusionCriteria.toLowerCase().includes(CRITERIA_ONLY_PHRASE),
    );
    expect(owner, 'the probe phrase must exist in some code\'s criteria').toBeDefined();
    expect(
      fixture.codes.some(
        (code) =>
          code.name.toLowerCase().includes(CRITERIA_ONLY_PHRASE) ||
          code.fullDefinition.toLowerCase().includes(CRITERIA_ONLY_PHRASE),
      ),
      'and must not appear in any name or definition, or this proves nothing',
    ).toBe(false);

    expect(searchCodebook(buildCodeTree(fixture.codes), CRITERIA_ONLY_PHRASE)).toHaveLength(0);

    const user = userEvent.setup();
    renderAt(codebookUrl);
    await user.type(searchField(), CRITERIA_ONLY_PHRASE);

    expect(within(region('search-results')!).getByText(/no codes match/i)).toBeInTheDocument();
  });

  it('keeps the query for the session, across a trip away and back', async () => {
    const user = userEvent.setup();
    renderAt(codebookUrl);

    await user.type(searchField(), 'water');
    followSidebarLink('Notes');
    followSidebarLink('Code book');

    expect(searchField()).toHaveValue('water');
    expect(region('search-results')).not.toBeNull();
  });
});

describe('the record, per section 1', () => {
  const recordFor = (codeId: string) =>
    within(region('codebook')!.querySelector<HTMLElement>(`[data-code-id="${codeId}"]`)!);

  it('shows the definition inline, and nothing D-046 removed', () => {
    renderAt(codebookUrl);
    const code = PHRASE_OWNER;
    const record = recordFor(code.codeId);

    expect(record.getByText(code.fullDefinition)).toBeInTheDocument();

    /*
      Asserted as the absence of this code's own text rather than of a label:
      a record that kept rendering the criteria under a different heading would
      pass a label check and fail a reader.
    */
    for (const gone of [code.shortDefinition, code.inclusionCriteria, code.exclusionCriteria]) {
      expect(gone, 'the fixture must populate this, or the check is vacuous').not.toBe('');
      expect(record.queryByText(gone)).toBeNull();
    }
    expect(record.queryByText('Status')).toBeNull();

    // Nothing to expand: the page is long on purpose.
    expect(record.queryAllByRole('button')).toHaveLength(0);
  });

  it('states the codebook version once on the page, not on every record', () => {
    renderAt(codebookUrl);

    const occurrences = screen.getAllByText(new RegExp(fixture.codebookVersion.versionLabel));
    expect(occurrences).toHaveLength(1);
  });

  it('gives every code a unique fragment id', () => {
    renderAt(codebookUrl);

    const ids = Array.from(region('codebook')!.querySelectorAll('[data-code-id]')).map(
      (node) => node.id,
    );

    expect(ids).toHaveLength(fixture.codes.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('code-'))).toBe(true);
  });

  it('nests children inside their family card', () => {
    renderAt(codebookUrl);

    const parent = fixture.codes.find(
      (code) => code.parentCodeId === null && fixture.codes.some((child) => child.parentCodeId === code.codeId),
    )!;
    const child = fixture.codes.find((code) => code.parentCodeId === parent.codeId)!;

    const card = region('codebook')!.querySelector(`[data-family-id="${parent.codeId}"]`)!;
    expect(card.querySelector(`[data-code-id="${child.codeId}"]`)).not.toBeNull();
  });
});

describe('acceptance: heading levels match depth, per D-047', () => {
  /** A code's depth, walked from the fixture's own parent chain. */
  function depthOf(codeId: string): number {
    const byId = new Map(fixture.codes.map((code) => [code.codeId, code]));
    let depth = 0;
    let current = byId.get(codeId)!;
    while (current.parentCodeId) {
      current = byId.get(current.parentCodeId)!;
      depth += 1;
    }
    return depth;
  }

  it('renders every code name at the level its depth gives it', () => {
    // Derived rather than a fixed list of names, so a codebook that grows a
    // fourth level fails here instead of quietly rendering it wrong.
    renderAt(codebookUrl);

    const depths = new Set(fixture.codes.map((code) => depthOf(code.codeId)));
    expect(depths, 'the fixture must have more than one level').toEqual(new Set([0, 1, 2]));

    for (const code of fixture.codes) {
      const heading = region('codebook')!.querySelector(
        `[data-code-id="${code.codeId}"] h2, [data-code-id="${code.codeId}"] h3,` +
          ` [data-code-id="${code.codeId}"] h4, [data-code-id="${code.codeId}"] h5`,
      );
      expect(heading, `${code.name} has no heading`).not.toBeNull();
      expect(heading!.tagName.toLowerCase(), `${code.name} at depth ${depthOf(code.codeId)}`).toBe(
        `h${2 + depthOf(code.codeId)}`,
      );
    }
  });

  it('leaves no heading above the families to break the outline', () => {
    // Families are h2 per section 1, so a "Codebook" heading over them would
    // sit at the same level and stop the heading list reading as the hierarchy.
    renderAt(codebookUrl);

    const familyNames = fixture.codes
      .filter((code) => code.parentCodeId === null)
      .map((code) => code.name);
    const h2s = within(region('codebook')!)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(h2s).toEqual(familyNames);
  });
});

describe('acceptance: the family colour is a value, not a control', () => {
  it('reads as a labelled static value on every card', () => {
    renderAt(codebookUrl);

    const cards = region('codebook')!.querySelectorAll('[data-family-id]');
    expect(cards).toHaveLength(6);

    for (const card of cards) {
      const family = fixture.codes.find(
        (code) => code.codeId === card.getAttribute('data-family-id'),
      )!;
      const value = card.querySelector('.codebook__color')!;

      expect(value, `${family.name} has no colour value`).not.toBeNull();
      expect(value.textContent).toContain('Color:');
      expect(value.textContent).toContain(FAMILY_HUE_NAMES[family.colorToken]);
    }
  });

  it('offers nothing operable in a card, per the frame override', () => {
    // The frame draws a combobox. D-047 renders a value instead, because a
    // control that looks operable and refuses is worse over a screen reader
    // than no control at all.
    renderAt(codebookUrl);
    const cards = within(region('codebook')!);

    for (const role of ['combobox', 'button', 'listbox', 'textbox'] as const) {
      expect(cards.queryAllByRole(role), `a ${role} appeared in the codebook`).toHaveLength(0);
    }
  });

  it('names the hue that is drawn, not the token word', () => {
    // `code-color-moss` renders red. Naming it "Moss" would mislead exactly the
    // reader this text exists for, since it is their only colour channel.
    renderAt(codebookUrl);

    const moss = fixture.codes.find(
      (code) => code.parentCodeId === null && code.colorToken === 'code-color-moss',
    );
    expect(moss, 'the fixture must still use this token on a family').toBeDefined();

    const card = region('codebook')!.querySelector(`[data-family-id="${moss!.codeId}"]`)!;
    expect(card.querySelector('.codebook__color')!.textContent).toContain('Red');
    expect(card.querySelector('.codebook__color')!.textContent).not.toContain('Moss');
  });
});

describe('provisional codes, per section 1', () => {
  it('has no section at all when the coder has proposed nothing', () => {
    renderAt(codebookUrl);
    expect(region('provisional')).toBeNull();
  });

  it('lists one created in the panel, outside the canonical list, after it', async () => {
    // Created, checked, and saved onto an excerpt. The save is the moment this
    // used to be lost: the panel's draft is cleared and, before provisional
    // codes moved to project scope, the record went with it.
    renderAt(sourceUrl);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('excerpt.code');

    // From the empty search, which since D-070 is the only route to a proposal.
    const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.change(within(panel()).getByRole('searchbox', { name: 'Search codes' }), {
      target: { value: 'Compost queue' },
    });
    fireEvent.click(within(panel()).getByRole('button', { name: /propose/i }));

    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );

    followSidebarLink('Code book');

    const section = region('provisional')!;
    expect(section).not.toBeNull();
    expect(within(section).getByRole('heading', { level: 3, name: 'Compost queue' }))
      .toBeInTheDocument();

    // Never interleaved: absent from the canonical list, and after it.
    expect(within(region('codebook')!).queryByText('Compost queue')).toBeNull();
    expect(
      region('codebook')!.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('the code editor, per D-070', () => {
  /*
    The codebook becomes editable, keyboard-first, where every commercial tool
    edits hierarchy by dragging. Two things are load-bearing here: the gate,
    which makes mid-round vocabulary drift structurally impossible rather than
    discouraged; and the close model, the one recorded exception to D-042 —
    explicit Save writes, every other exit discards, because a half-defined code
    is nothing.
  */
  const asLead = (phase: 'setup' | 'review' | 'recoding' = 'setup') => {
    writeSimulatedSession({ role: 'qualitativeLead', phase });
    renderAt(codebookUrl);
  };

  const createButton = () => screen.queryByRole('button', { name: 'Create new code' });
  const editorPanel = () => screen.queryByRole('dialog', { name: /new code|accept code/i });
  const nameField = () => screen.getByLabelText('Code name');
  const saveButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' });

  /** Fills the editor for a new family and saves it. */
  function createFamily(name: string) {
    fireEvent.change(nameField(), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Definition'), { target: { value: 'A definition.' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'code-color-violet' } });
    fireEvent.click(saveButton());
  }

  describe('the gate', () => {
    it('offers nothing to a coder mid independent coding', () => {
      // The seeded scenario, so this is what a participant meets by default.
      renderAt(codebookUrl);
      expect(createButton()).toBeNull();
    });

    it('offers nothing to the lead while a round could be open', () => {
      /*
        The structural half: a codebook that cannot change while a round is open
        means the round references one stable version throughout.
      */
      writeSimulatedSession({ role: 'qualitativeLead', phase: 'independentCoding' });
      renderAt(codebookUrl);

      expect(createButton()).toBeNull();
    });

    it('offers Create to the lead in a phase with no round open', () => {
      asLead();
      expect(createButton()).toBeInTheDocument();
    });
  });

  describe('creating a code', () => {
    it('opens the editor with focus in the name field', async () => {
      asLead();
      fireEvent.click(createButton()!);

      await waitFor(() => expect(editorPanel()).toBeInTheDocument());
      await waitFor(() => expect(nameField()).toHaveFocus());
    });

    it('writes the code on Save, and it joins the codebook', async () => {
      asLead();
      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());

      createFamily('Compost queue');

      await waitFor(() => expect(editorPanel()).toBeNull());
      expect(within(region('codebook')!).getByText('Compost queue')).toBeInTheDocument();
    });

    it('renders a new child inside its family, after the siblings it joins', async () => {
      /*
        The visible half of D-070's "append after their siblings". Where the
        code sits in the stored canonical order is the domain's test, and only
        that one bites: the cards are built from the tree and each sibling list
        is sorted independently, so a child renders in its family whatever
        global index it carries. What this checks is the part a reader sees.
      */
      asLead();
      const family = fixture.codes.find((code) => code.parentCodeId === null)!;

      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());
      fireEvent.change(nameField(), { target: { value: 'Compost queue' } });
      fireEvent.change(screen.getByLabelText('Parent code'), { target: { value: family.codeId } });
      fireEvent.click(saveButton());

      await waitFor(() => expect(editorPanel()).toBeNull());

      // Positions in the rendered canonical list, which is what a reader scans.
      const records = Array.from(region('codebook')!.querySelectorAll('[data-code-id]'));
      const positionOf = (codeId: string) =>
        records.findIndex((node) => node.getAttribute('data-code-id') === codeId);
      const added = records.findIndex((node) => node.textContent?.includes('Compost queue'));

      expect(added).toBeGreaterThan(positionOf(family.codeId));
      // Inside that family's card, not merely somewhere below its heading.
      const card = records[added].closest('[data-family-id]');
      expect(card).toBe(records[positionOf(family.codeId)].closest('[data-family-id]'));

      // And last among the siblings it joined, which is what "append" means.
      const siblings = fixture.codes.filter((code) => code.parentCodeId === family.codeId);
      for (const sibling of siblings) {
        expect(added).toBeGreaterThan(positionOf(sibling.codeId));
      }
    });

    it('offers only families and their children as a parent', () => {
      /*
        How D-070 caps depth at grandchild: a control that cannot express the
        mistake, rather than one that reports it afterwards.
      */
      asLead();
      fireEvent.click(createButton()!);

      const options = Array.from(
        screen.getByLabelText('Parent code').querySelectorAll('option'),
      ).map((option) => option.getAttribute('value'));

      const tree = buildCodeTree([...fixture.codes]);
      const grandchild = fixture.codes.find((code) => {
        const parent = fixture.codes.find((candidate) => candidate.codeId === code.parentCodeId);
        return parent?.parentCodeId != null;
      })!;

      expect(tree.length).toBeGreaterThan(0);
      expect(options).not.toContain(grandchild.codeId);
    });

    it('asks for a colour only where there is no parent to inherit one from', () => {
      asLead();
      fireEvent.click(createButton()!);
      expect(screen.getByLabelText('Colour')).toBeInTheDocument();

      const family = fixture.codes.find((code) => code.parentCodeId === null)!;
      fireEvent.change(screen.getByLabelText('Parent code'), { target: { value: family.codeId } });

      expect(screen.queryByLabelText('Colour')).toBeNull();
    });
  });

  describe('the close model, a recorded exception to D-042', () => {
    it('discards on Escape and creates nothing', async () => {
      /*
        The inversion. Everywhere else in this build leaving keeps your work; a
        half-defined code is not work, it is a fragment that would then appear in
        every coder's panel.
      */
      asLead();
      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());
      fireEvent.change(nameField(), { target: { value: 'Compost queue' } });

      act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

      await waitFor(() => expect(editorPanel()).toBeNull());
      expect(within(region('codebook')!).queryByText('Compost queue')).toBeNull();
    });

    it('discards on the close control, which says Discard rather than Close', async () => {
      asLead();
      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());
      fireEvent.change(nameField(), { target: { value: 'Compost queue' } });

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));

      await waitFor(() => expect(editorPanel()).toBeNull());
      expect(within(region('codebook')!).queryByText('Compost queue')).toBeNull();
    });

    it('returns focus to the control that opened it', async () => {
      asLead();
      const invoker = createButton()!;
      act(() => invoker.focus());
      fireEvent.click(invoker);
      await waitFor(() => expect(nameField()).toHaveFocus());

      act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

      await waitFor(() => expect(createButton()).toHaveFocus());
    });
  });

  describe('validation blocks Save and never blocks closing', () => {
    it('keeps the panel open on an empty name and says why', async () => {
      asLead();
      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());

      fireEvent.click(saveButton());

      expect(editorPanel()).toBeInTheDocument();
      expect(screen.getByText(/A code needs a name/)).toBeInTheDocument();
      await waitFor(() => expect(nameField()).toHaveFocus());
    });

    it('refuses a name another code already has, whatever its case', async () => {
      asLead();
      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());

      fireEvent.change(nameField(), { target: { value: fixture.codes[0].name.toUpperCase() } });
      fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'code-color-violet' } });
      fireEvent.click(saveButton());

      expect(editorPanel()).toBeInTheDocument();
      expect(screen.getByText(/Names are unique across the codebook/)).toBeInTheDocument();
    });

    it('marks Save unavailable without disabling it, so pressing it explains', () => {
      // The treatment Save & Close already uses: a disabled control with no
      // explanation is a dead end, per contract 2.6.
      asLead();
      fireEvent.click(createButton()!);

      const save = saveButton();
      expect(save).toHaveAttribute('aria-disabled', 'true');
      expect(save).not.toBeDisabled();
    });

    it('still closes on Escape with the form invalid', async () => {
      // "Validation blocks save, never close": nobody is stranded in a panel
      // they opened by mistake, which is the half of D-042 that survives here.
      asLead();
      fireEvent.click(createButton()!);
      await waitFor(() => expect(nameField()).toHaveFocus());
      fireEvent.click(saveButton());

      act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

      await waitFor(() => expect(editorPanel()).toBeNull());
    });
  });
});

describe('accepting a provisional code, per D-070', () => {
  /**
   * Proposes a code in the coding panel and saves it onto an excerpt, which is
   * the only route a provisional exists by.
   */
  async function proposeAndCode(name: string) {
    renderAt(sourceUrl);

    const turn = document.querySelector<HTMLElement>('[data-turn-id]')!;
    act(() => turn.focus());
    chord('excerpt.code');

    const panel = () => screen.getByRole('dialog', { name: /code assignment/i });
    fireEvent.change(within(panel()).getByRole('searchbox', { name: 'Search codes' }), {
      target: { value: name },
    });
    fireEvent.click(within(panel()).getByRole('button', { name: /propose/i }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save & Close' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog', { name: /code assignment/i })).toHaveLength(0),
    );
  }

  it('offers no Accept outside the gate', async () => {
    await proposeAndCode('Compost queue');
    followSidebarLink('Code book');

    expect(within(region('provisional')!).queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('moves the code into the hierarchy, keeping its identity', async () => {
    /*
      The reason Accept costs nothing: the provisional's assignments already
      name this `codeId`, so placing it carries them without touching one
      assignment record. That is what "assignments following automatically"
      means in D-070.
    */
    await proposeAndCode('Compost queue');

    writeSimulatedSession({ role: 'qualitativeLead', phase: 'review' });
    followSidebarLink('Code book');

    const provisionalRecord = region('provisional')!.querySelector('[data-code-id]')!;
    const codeId = provisionalRecord.getAttribute('data-code-id');

    fireEvent.click(within(region('provisional')!).getByRole('button', { name: /accept/i }));
    await waitFor(() => expect(screen.getByLabelText('Code name')).toHaveFocus());

    // Prefilled, and placed: choosing a parent is how it enters the hierarchy.
    expect(screen.getByLabelText('Code name')).toHaveValue('Compost queue');
    const family = fixture.codes.find((code) => code.parentCodeId === null)!;
    fireEvent.change(screen.getByLabelText('Parent code'), { target: { value: family.codeId } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /accept code/i })).toBeNull(),
    );

    const canonical = region('codebook')!;
    expect(canonical.querySelector(`[data-code-id="${codeId}"]`)).not.toBeNull();
    expect(within(canonical).getByText('Compost queue')).toBeInTheDocument();

    /*
      And it left. The proposal store is append-only by design, so accepting
      writes an approved copy under the same identifier and the original stays
      behind it — without a filter the code would sit in the canonical list and
      in the provisional section at once. Task 49 tested that it arrived here
      and never that it left.
    */
    expect(region('provisional')).toBeNull();
  });

  it('marks a provisional record in words, not by its grey alone', async () => {
    /*
      D-070: marked in both channels wherever they render. The stylesheet has
      carried the comment "a proposed code is marked in words, never by colour
      alone" since the grey was written; the words did not exist.

      After the heading rather than inside it, so the code's identity — which
      its fragment id and a heading jump both rest on — does not move.
    */
    await proposeAndCode('Compost queue');
    followSidebarLink('Code book');

    const record = region('provisional')!.querySelector('[data-code-id]')!;
    expect(within(record as HTMLElement).getByText('Provisional')).toBeInTheDocument();
    expect(
      within(record as HTMLElement).getByRole('heading', { name: 'Compost queue' }),
    ).toBeInTheDocument();
  });

  it('names each Accept by its code, so a list of them is not one word repeated', async () => {
    await proposeAndCode('Compost queue');
    writeSimulatedSession({ role: 'qualitativeLead', phase: 'review' });
    followSidebarLink('Code book');

    expect(
      within(region('provisional')!).getByRole('button', { name: 'Accept, Compost queue' }),
    ).toBeInTheDocument();
  });
});
