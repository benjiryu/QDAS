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

  it('is neither a link nor a button, and carries no tabindex', () => {
    renderAt(`/projects/${project.projectId}`);

    const label = groupLabel();
    expect(label.tagName.toLowerCase()).toBe('span');
    expect(label).not.toHaveAttribute('tabindex');
    expect(label.closest('a, button')).toBeNull();
  });

  it('is never a tab stop, however far you tab', async () => {
    // The task's done-when. Walked rather than reasoned about: tab through the
    // whole sidebar and check where focus actually lands.
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    const links = sidebar().getAllByRole('link');
    const visited: Element[] = [];

    // Enough tabs to cross the sidebar twice over.
    for (let index = 0; index < links.length + 6; index += 1) {
      await user.tab();
      if (document.activeElement) visited.push(document.activeElement);
    }

    expect(visited).not.toContain(groupLabel());
    // And the links themselves were reachable, so this did not pass by never
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

    expect(sidebar().getAllByRole('link').map((link) => link.textContent)).toEqual([
      ...sources.map((source) => source.title),
      'Code book',
      'Coded data',
      'Notes',
    ]);

    // The label precedes them all, which is what makes the group read as one.
    const first = sidebar().getAllByRole('link')[0];
    expect(groupLabel().compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)
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
