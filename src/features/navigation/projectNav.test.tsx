import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import { createSeedFixture } from '../../data/seed';
import { readSavedWork, writeSavedWork } from '../../data/codingSessionStore';
import { readSimulatedSession, writeSimulatedSession } from '../../data/simulatedSession';
import { CURRENT_CODER_ID } from '../../data/seed/project';
import { assignedSources } from './assignedSources';

/**
 * The project sidebar's structure.
 *
 * Specification: the Sidebar rule in docs/pages/destinations.md shared rules,
 * decision D-043.
 *
 * The rule this file exists for: "Project 1 Files" names the source list rather
 * than being a fifth place to go. A link or a button there would put a stop in
 * the tab order that leads nowhere, and a screen reader user would hear a
 * destination that is not one.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const sources = assignedSources(
  fixture.sources,
  fixture.workAssignments,
  CURRENT_CODER_ID,
  project.activeCodingRoundId,
);

/** Held, so a test can read what was spoken. */
let announcer = createAnnouncer();

beforeEach(() => {
  announcer = createAnnouncer();
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

const sidebar = () => within(screen.getByRole('navigation', { name: 'Project' }));
const groupLabel = () => document.querySelector<HTMLElement>('.project-nav__group-label')!;

describe('the files group label', () => {
  it('names the source list, computed rather than merely referenced', () => {
    // Asked for as the list's accessible name, so a broken `aria-labelledby`
    // reference fails here instead of passing an attribute check.
    renderAt(`/projects/${project.projectId}`);

    const list = sidebar().getByRole('list', { name: 'Project 1 Files' });
    for (const source of sources) {
      expect(within(list).getByRole('link', { name: source.title })).toBeInTheDocument();
    }
  });

  it('is a link to the Project overview page, and still names the list', () => {
    /*
      Reversed by D-059, and the reversal is the task. This asserted that the
      label was a span with no tabindex, on the argument that a control there
      would be a tab stop leading nowhere. The Project overview page is where it
      leads now, so the argument no longer applies — but the second half of the
      old rule does, and is asserted alongside it: one element, both jobs.
    */
    renderAt(`/projects/${project.projectId}`);

    const label = groupLabel();
    expect(label.tagName.toLowerCase()).toBe('a');
    expect(label).toHaveAttribute('href', `/projects/${project.projectId}`);
    expect(label).not.toHaveAttribute('tabindex');

    const list = sidebar().getByRole('list', { name: 'Project 1 Files' });
    expect(list.getAttribute('aria-labelledby')).toBe(label.id);
  });

  it('reports itself current only on the overview route', () => {
    /*
      The project route is a prefix of every other route in this sidebar, so
      without `end` this would claim to be the current page from the transcript,
      the Codebook and everywhere else — four items carrying `aria-current` at
      once, which is worse than none carrying it.
    */
    const { unmount } = renderAt(`/projects/${project.projectId}`);
    expect(groupLabel()).toHaveAttribute('aria-current', 'page');
    unmount();

    renderAt(`/projects/${project.projectId}/codebook`);
    expect(groupLabel()).not.toHaveAttribute('aria-current');
  });

  it('is one tab stop among the links, reached by tabbing', async () => {
    // Walked rather than reasoned about, as before: tab through the whole
    // sidebar and check where focus actually lands. What changed is the
    // expectation — D-059 made this a destination, so it is reachable.
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    const links = sidebar().getAllByRole('link');
    const visited: Element[] = [];

    // Enough tabs to cross the sidebar twice over.
    for (let index = 0; index < links.length + 6; index += 1) {
      await user.tab();
      if (document.activeElement) visited.push(document.activeElement);
    }

    expect(visited).toContain(groupLabel());
    // And it is one stop rather than two: the element that names the list is
    // the same element that links to the page, per D-059.
    expect(visited.filter((element) => element === groupLabel())).toHaveLength(1);
    // The other links were reachable too, so this did not pass by never
    // arriving in the sidebar at all.
    expect(visited.some((element) => links.includes(element as HTMLElement))).toBe(true);
  });
});

describe('the current markers', () => {
  it('marks the open source and the open destination at the same time', () => {
    // Both, on one route: a coder reading a source has a current file and,
    // once they leave for a destination, a current destination. The rule asks
    // for each to carry `aria-current="page"` with its own indicator.
    renderAt(`/projects/${project.projectId}/sources/${sources[0].sourceId}`);

    const current = sidebar()
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(sources[0].title);
    expect(current[0]).toHaveClass('project-nav__source');
  });

  it('marks a destination, and the source it came from stays unmarked', () => {
    renderAt(`/projects/${project.projectId}/codebook`);

    const current = sidebar()
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Code book');
    expect(current[0]).toHaveClass('project-nav__destination');
  });
});

describe('the content order the rule fixes', () => {
  it('puts the files group first, then the three destinations', () => {
    renderAt(`/projects/${project.projectId}`);

    // The files link heads the list since D-059, where it was a label the link
    // roll-call did not see.
    expect(sidebar().getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Project 1 Files',
      ...sources.map((source) => source.title),
      'Code book',
      'Coded data',
      'Notes',
    ]);

    // The label precedes them all, which is what makes the group read as one.
    const sourceLink = sidebar().getByRole('link', { name: sources[0].title });
    expect(groupLabel().compareDocumentPosition(sourceLink) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('nests the sources inside the group, not beside it', () => {
    renderAt(`/projects/${project.projectId}`);

    const group = document.querySelector('.project-nav__group')!;
    for (const source of sources) {
      expect(within(group as HTMLElement).getByRole('link', { name: source.title }))
        .toBeInTheDocument();
    }
    // And the destinations are outside it.
    expect(within(group as HTMLElement).queryByRole('link', { name: 'Code book' })).toBeNull();
  });

  it('offers no Themes destination, per D-017', () => {
    renderAt(`/projects/${project.projectId}`);
    expect(sidebar().queryByRole('link', { name: /themes/i })).toBeNull();
  });
});

describe('the role switcher, per D-071', () => {
  const block = () => document.querySelector<HTMLElement>('.project-nav__user');
  const roleSelect = () => screen.getByLabelText('Role') as HTMLSelectElement;

  it('offers the seeded titles rather than strings written here', () => {
    /*
      D-071 makes the select's value the displayed title, so the options are the
      seeded records' own — compared against the fixture, so hardcoding the same
      words in the component would still fail the moment the seed changed.

      This replaces the D-059 addendum's static-text assertion. The block was a
      paragraph and is a control now; the reversal is D-071's and is asserted
      rather than deleted.
    */
    renderAt(`/projects/${project.projectId}`);

    const coder = fixture.users.find((user) => user.role === 'coder')!;
    const lead = fixture.users.find((user) => user.role === 'qualitativeLead')!;
    expect(coder.title).toBeTruthy();

    const options = Array.from(roleSelect().options).map((option) => option.textContent);
    expect(options).toEqual([coder.title, lead.title]);
  });

  it('offers two roles and not the third', () => {
    // Reviewer stays unoffered per D-071, and left the prototype-support
    // surface with it, so no control can name a state another cannot show.
    renderAt(`/projects/${project.projectId}`);

    const values = Array.from(roleSelect().options).map((option) => option.value);
    expect(values).toEqual(['coder', 'qualitativeLead']);
  });

  it('is a labelled control, and the label is visible', () => {
    // D-051 wants a label associated and present. A facilitator's control that
    // hides what it does is the wrong thing to be subtle about.
    renderAt(`/projects/${project.projectId}`);

    const label = block()!.querySelector('label')!;
    expect(label).toHaveTextContent('Role');
    expect(label).not.toHaveClass('visually-hidden');
    expect(label.getAttribute('for')).toBe(roleSelect().id);
  });

  it('announces the change once and leaves focus alone', () => {
    /*
      D-071: role change announces discretely and focus stays on the select.
      Once per change — announced from the handler rather than an effect, which
      would speak again on every re-render the store caused.
    */
    renderAt(`/projects/${project.projectId}`);
    const select = roleSelect();
    act(() => select.focus());

    fireEvent.change(select, { target: { value: 'qualitativeLead' } });

    const lead = fixture.users.find((user) => user.role === 'qualitativeLead')!;
    const spoken = announcer.getHistory().filter((entry) => entry.message.startsWith('Role:'));
    expect(spoken).toHaveLength(1);
    expect(spoken[0].message).toBe(`Role: ${lead.title}`);
    expect(select).toHaveFocus();
  });

  it('says nothing when the role does not change', () => {
    renderAt(`/projects/${project.projectId}`);

    fireEvent.change(roleSelect(), { target: { value: 'coder' } });

    expect(announcer.getHistory().filter((entry) => entry.message.startsWith('Role:'))).toEqual([]);
  });

  it('reveals a gated control elsewhere without taking focus, and hides it again', async () => {
    /*
      Task 51's own acceptance, and the reason the store had to become
      subscribable. Until D-071 the only role control lived on another route, so
      switching always meant a remount and a fresh read; from a control mounted
      beside every page, a reader holding a snapshot would simply not learn.

      And the half that is easy to lose: controls appearing and vanishing
      elsewhere never take focus. The facilitator is standing on the select, and
      that is where they stay.
    */
    renderAt(`/projects/${project.projectId}/codebook`);
    writeSimulatedSession({ phase: 'setup' });

    const select = roleSelect();
    act(() => select.focus());
    expect(screen.queryByRole('button', { name: 'Create new code' })).toBeNull();

    fireEvent.change(select, { target: { value: 'qualitativeLead' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create new code' })).toBeInTheDocument(),
    );
    expect(select).toHaveFocus();

    fireEvent.change(select, { target: { value: 'coder' } });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Create new code' })).toBeNull(),
    );
    expect(select).toHaveFocus();
  });

  it('is there with no project in context, since the landmark is', () => {
    // Contract 2.1 makes the second navigation part of the structure every
    // route shares, and this belongs to the person rather than the project.
    renderAt('/projects');

    expect(block()).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Project' }).contains(block())).toBe(true);
  });

  it('precedes the project files group', () => {
    renderAt(`/projects/${project.projectId}`);

    const label = document.querySelector('.project-nav__group-label')!;
    expect(block()!.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the session controls, per D-072', () => {
  /*
    The prototype-support surface several decisions referenced before one
    existed. What makes it a surface rather than a control: it is last, it is
    shut until asked for, and it says what it is.
  */
  const toggle = () => screen.getByRole('button', { name: 'Session controls' });
  const open = () => fireEvent.click(toggle());

  it('is collapsed until asked for, and says it is scaffolding when opened', () => {
    renderAt(`/projects/${project.projectId}`);

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Project phase')).toBeNull();

    open();

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Project phase')).toBeInTheDocument();
    expect(document.querySelector('.project-nav__session')!.textContent).toMatch(
      /prototype scaffolding/i,
    );
  });

  it('is the last thing in the landmark', () => {
    // D-072 puts it at the very end of the sidebar's reading order: a
    // facilitator's tooling after everything a participant needs.
    renderAt(`/projects/${project.projectId}`);

    const block = document.querySelector('.project-nav__session')!;
    const destinations = document.querySelector('.project-nav__list')!;

    expect(
      destinations.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is there with no project in context, since the session is not the project’s', () => {
    renderAt('/projects');

    expect(toggle()).toBeInTheDocument();
  });

  it('leaves focus on the button across the toggle', () => {
    // D-067's case: what opens is a group of controls, so there is no one field
    // to send focus to and nothing to send it back from.
    renderAt(`/projects/${project.projectId}`);
    act(() => toggle().focus());

    open();
    expect(toggle()).toHaveFocus();

    fireEvent.click(toggle());
    expect(toggle()).toHaveFocus();
  });

  it('announces a phase change once, and leaves focus on the select', () => {
    renderAt(`/projects/${project.projectId}`);
    open();

    const select = screen.getByLabelText('Project phase');
    act(() => select.focus());
    fireEvent.change(select, { target: { value: 'review' } });

    const spoken = announcer
      .getHistory()
      .filter((entry) => entry.message.startsWith('Project phase:'));
    expect(spoken).toHaveLength(1);
    expect(spoken[0].message).toBe('Project phase: Review');
    expect(select).toHaveFocus();
  });

  it('reveals Create new code on the Codebook page for a lead in a non-coding phase', async () => {
    /*
      Task 52's own acceptance, and the thing D-072 says was unreachable. It was
      reachable — from the Coded data page — but only from there; the point of
      the move is that a facilitator sets it from wherever they are standing.
    */
    renderAt(`/projects/${project.projectId}/codebook`);
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'qualitativeLead' } });
    open();

    expect(screen.queryByRole('button', { name: 'Create new code' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Project phase'), { target: { value: 'review' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create new code' })).toBeInTheDocument(),
    );
  });
});

describe('the between-participants reset, per D-072', () => {
  const openControls = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Session controls' }));
  };
  const resetTrigger = () => screen.getByRole('button', { name: 'Reset for next participant' });

  it('asks first, assertively, and resets nothing until confirmed', () => {
    /*
      The second of the two events contract 2.3 lets interrupt. It destroys the
      work a participant did, which is what D-070's delete confirmation was
      built for and what this borrows.
    */
    renderAt(`/projects/${project.projectId}`);
    openControls();
    writeSimulatedSession({ role: 'qualitativeLead' });

    fireEvent.click(resetTrigger());

    expect(document.querySelector('[data-confirm="reset"]')).toBeInTheDocument();
    const armed = announcer.getHistory().find((entry) => /reset the session/i.test(entry.message))!;
    expect(armed.politeness).toBe('assertive');
    expect(armed.reason).toBe('destructiveConfirmation');
    expect(armed.message).toMatch(/nothing is reset until you confirm/i);

    // And nothing has happened yet.
    expect(readSimulatedSession().role).toBe('qualitativeLead');
  });

  it('returns focus to the trigger when kept, which the pattern it copies does not', () => {
    /*
      The code panel's delete confirmation leaves focus on the body when its
      buttons vanish. That is a gap rather than a precedent; contract 2.4 says a
      temporary view returns focus where it came from.
    */
    renderAt(`/projects/${project.projectId}`);
    openControls();
    act(() => resetTrigger().focus());
    fireEvent.click(resetTrigger());

    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    return waitFor(() => {
      expect(resetTrigger()).toHaveFocus();
      expect(announcer.getHistory().some((entry) => entry.message === 'Nothing was reset.')).toBe(
        true,
      );
    });
  });

  it('clears the coding work as well as the scenario, which is what the confirmation promises', () => {
    /*
      D-072 names only `clearSimulatedSession`, which discards role and phase
      and no coding work at all — a confirmation guarding that alone would warn
      about a loss that does not happen. Every store documenting itself as part
      of this reset is cleared.
    */
    writeSavedWork(project.projectId, {
      excerpts: [fixture.excerpts[0]],
      assignments: [fixture.codeAssignments[0]],
      notes: [],
      supersededIds: [],
    });
    writeSimulatedSession({ role: 'qualitativeLead', phase: 'review' });

    renderAt(`/projects/${project.projectId}`);
    openControls();
    fireEvent.click(resetTrigger());
    fireEvent.click(screen.getByRole('button', { name: 'Reset it' }));

    expect(readSimulatedSession()).toEqual({ role: 'coder', phase: 'independentCoding' });
    expect(readSavedWork(project.projectId).excerpts).toEqual([]);
  });
});
