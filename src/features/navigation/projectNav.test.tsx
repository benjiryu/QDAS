import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { AnnouncerProvider, createAnnouncer } from '../../a11y';
import { createSeedFixture } from '../../data/seed';
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

function renderAt(path: string) {
  return render(
    <AnnouncerProvider announcer={createAnnouncer()}>
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

describe('the user title block, per the D-059 addendum', () => {
  const block = () => document.querySelector<HTMLElement>('.project-nav__user');

  it('reads the seeded user record rather than a string written here', () => {
    /*
      The addendum's own condition: "the string comes from the seed user record,
      never hardcoded in the component." Compared against the fixture, so
      hardcoding the same words in the component would still fail the moment the
      seed changed — which is the property being protected.
    */
    renderAt(`/projects/${project.projectId}`);

    const seeded = fixture.users.find((user) => user.userId === CURRENT_CODER_ID)!;
    expect(seeded.title).toBeTruthy();
    expect(block()?.textContent).toBe(seeded.title);
  });

  it('is neither a link nor a heading nor a tab stop', async () => {
    // Static text, per the addendum. The reasoning D-043 gave the files label
    // before D-059 made that one a destination: a stop that leads nowhere is
    // worse than no stop, in the tab order or in the heading outline.
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    const text = block()!;
    expect(text.tagName.toLowerCase()).toBe('p');
    expect(text.closest('a, button')).toBeNull();
    expect(text).not.toHaveAttribute('tabindex');
    expect(
      screen.queryByRole('heading', { name: text.textContent ?? '' }),
      'and it opens no section',
    ).toBeNull();

    const sidebar = screen.getByRole('navigation', { name: 'Project' });
    const stops = within(sidebar).getAllByRole('link').length;
    for (let index = 0; index < stops + 3; index += 1) {
      await user.tab();
      expect(document.activeElement).not.toBe(text);
    }
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
