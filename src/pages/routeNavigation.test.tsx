import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { AnnouncerProvider, createAnnouncer } from '../a11y';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID } from '../data/seed/project';

/**
 * Task 5a: the minimal route into a source.
 *
 * Steps 1 and 2 of the completion criteria in prototype-scope.md are entering
 * the application, identifying assigned work, and opening a transcript. The
 * test that matters is that all of it is reachable without an address bar.
 */

const fixture = createSeedFixture();
const project = fixture.project;
const assignedSourceIds = fixture.workAssignments
  .filter(
    (assignment) =>
      assignment.userId === CURRENT_CODER_ID &&
      assignment.codingRoundId === project.activeCodingRoundId,
  )
  .map((assignment) => assignment.sourceId);

/**
 * Queries scoped to the page body.
 *
 * Since D-043 the sidebar lists the same sources the project page does, so an
 * unscoped `getByRole('link', ...)` finds each title twice. These tests are
 * about the route content, so they ask `main`; the sidebar has its own tests.
 */
const inMain = () => within(document.querySelector('main')!);

function renderAt(path: string) {
  return render(
    <AnnouncerProvider announcer={createAnnouncer()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

describe('reaching a source by following links alone', () => {
  it('goes from the projects route to a transcript', async () => {
    const user = userEvent.setup();
    renderAt('/projects');

    await user.click(inMain().getByRole('link', { name: project.name }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(project.name);

    const source = fixture.sources.find((candidate) => candidate.sourceId === assignedSourceIds[0])!;
    await user.click(inMain().getByRole('link', { name: source.title }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(source.title);
    expect(screen.getByRole('region', { name: 'Transcript' })).toBeInTheDocument();
  });

  it('reaches every source assigned to this coder', async () => {
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    for (const sourceId of assignedSourceIds) {
      const source = fixture.sources.find((candidate) => candidate.sourceId === sourceId)!;
      expect(inMain().getByRole('link', { name: source.title })).toBeInTheDocument();
    }

    const last = fixture.sources.find(
      (candidate) => candidate.sourceId === assignedSourceIds[assignedSourceIds.length - 1],
    )!;
    await user.click(inMain().getByRole('link', { name: last.title }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(last.title);
  });

  it('reaches a source by keyboard alone', async () => {
    const user = userEvent.setup();
    renderAt('/projects');

    // Tab past the skip link, the product name, and the Projects nav link.
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: project.name })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(project.name);
  });
});

describe('the projects route', () => {
  it('lists each project as a link to its route', () => {
    renderAt('/projects');

    const link = screen.getByRole('link', { name: project.name });
    expect(link).toHaveAttribute('href', `/projects/${project.projectId}`);
  });
});

describe('the project route', () => {
  it('names the project in its h1', () => {
    renderAt(`/projects/${project.projectId}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(project.name);
  });

  it('summarises the project in one plain-text line', () => {
    /*
      Rewritten for D-059 and section 0, which fix the page's regions as heading
      and summary, then the source list. The coding round and role lines this
      asserted are not among them: the round is implicit in the phase, and the
      role belongs to the simulated session control on the Coded data page.

      One line rather than three, and it doubles as the orientation a screen
      reader hears on arrival.
    */
    renderAt(`/projects/${project.projectId}`);

    const summary = screen.getByText(/Independent coding\./);
    expect(summary).toHaveTextContent(`${assignedSourceIds.length} sources`);
    expect(summary).toHaveTextContent(fixture.codebookVersion.versionLabel);
  });

  it('lists each source as its title alone', () => {
    /*
      Section 0 asks for "the source title" and nothing else. The kind and
      sentence count this used to assert were the functional route's, and they
      put two facts beside every link that the summary line above already
      covers at the level a reader orienting actually needs.
    */
    renderAt(`/projects/${project.projectId}`);

    const source = fixture.sources.find((candidate) => candidate.sourceId === assignedSourceIds[0])!;
    const item = inMain().getByRole('link', { name: source.title }).closest('li')!;

    expect(item.textContent?.trim()).toBe(source.title);
  });

  it('opens from the sidebar files link, with focus on the h1', async () => {
    /*
      Section 0's first criterion, and both halves of it: the link goes here and
      lands focus on the heading, and the sidebar's nested source list is still
      named by that same element. One element, both jobs — which is what D-059
      asks for and the thing most likely to be lost by making a label a link.
    */
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}/codebook`);

    const sidebar = within(screen.getByRole('navigation', { name: 'Project' }));
    await user.click(sidebar.getByRole('link', { name: 'Project 1 Files' }));

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(project.name);
    expect(heading).toHaveFocus();

    expect(sidebar.getByRole('list', { name: 'Project 1 Files' })).toBeInTheDocument();
  });

  it('opens a source with its own entry focus from here', async () => {
    // Section 0's second criterion. The same landing every other route into a
    // source uses, so the overview is not a special case.
    const user = userEvent.setup();
    renderAt(`/projects/${project.projectId}`);

    const source = fixture.sources.find((candidate) => candidate.sourceId === assignedSourceIds[0])!;
    await user.click(inMain().getByRole('link', { name: source.title }));

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(source.title);
    expect(heading).toHaveFocus();
  });

  it('lists no other coder\'s work, per R-4', () => {
    renderAt(`/projects/${project.projectId}`);

    const otherCoders = fixture.users.filter((user) => user.userId !== CURRENT_CODER_ID);
    for (const other of otherCoders) {
      expect(screen.queryByText(new RegExp(other.displayName))).toBeNull();
    }
  });

  it('shows no coding counts, per D-010', () => {
    const { container } = renderAt(`/projects/${project.projectId}`);

    const text = container.querySelector('main')?.textContent ?? '';

    // No frequency of coding, and no progress summary, which task 5a also
    // excludes. Source size is the only quantity this route reports.
    expect(text).not.toMatch(/\d+\s*(codes?|coded|excerpts?|assignments?)/i);
    expect(text).not.toMatch(/\d+\s*%|complete|in progress|not started/i);
  });

  it('reports an unknown project instead of rendering an empty page', () => {
    renderAt('/projects/not-a-project');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Project not found');
    expect(screen.getByRole('link', { name: /back to projects/i })).toBeInTheDocument();
  });
});

describe('focus on route entry', () => {
  it('moves focus to the heading of the route just opened', async () => {
    const user = userEvent.setup();
    renderAt('/projects');

    await user.click(screen.getByRole('link', { name: project.name }));

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('does not move focus on first render, per contract 2.4', () => {
    renderAt(`/projects/${project.projectId}`);

    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('keeps a single h1 per route as focus moves through the application', async () => {
    const user = userEvent.setup();
    renderAt('/projects');

    await user.click(inMain().getByRole('link', { name: project.name }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const source = fixture.sources.find((candidate) => candidate.sourceId === assignedSourceIds[0])!;
    await user.click(inMain().getByRole('link', { name: source.title }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});
