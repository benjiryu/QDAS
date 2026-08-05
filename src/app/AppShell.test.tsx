import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { MAIN_CONTENT_ID } from './AppShell';

/**
 * Landmark and heading structure per docs/accessibility-contract.md section 2.1,
 * and the pre-session smoke test item 2 in section 4.
 *
 * These assertions are the contract, not a snapshot of the current markup. A
 * failure here means a route stopped meeting the structural floor.
 */

const routes = [
  { path: '/projects', heading: 'Projects' },
  { path: '/projects/p-1', heading: 'Project p-1' },
  { path: '/projects/p-1/sources/s-1', heading: 'Source s-1' },
] as const;

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Elements a keyboard user can reach, in DOM order. */
function tabbableElements(root: HTMLElement): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  );
  return Array.from(candidates).filter(
    (element) => (element.getAttribute('tabindex') ?? '0') !== '-1',
  );
}

describe.each(routes)('$path', ({ path, heading }) => {
  it('has one banner', () => {
    renderRoute(path);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  it('has an application-level and a project-level navigation, both labeled', () => {
    renderRoute(path);

    const navigations = screen.getAllByRole('navigation');
    expect(navigations).toHaveLength(2);

    expect(screen.getByRole('navigation', { name: 'Application' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Project' })).toBeInTheDocument();
  });

  it('has one main', () => {
    renderRoute(path);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('has exactly one h1, naming the page, inside main', () => {
    renderRoute(path);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(heading);
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBe(
      headings[0],
    );
  });

  it('does not skip heading levels', () => {
    renderRoute(path);

    const levels = screen
      .queryAllByRole('heading')
      .map((element) => Number(element.tagName.slice(1)));

    let previous = 0;
    for (const level of levels) {
      if (previous !== 0) expect(level).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
  });

  it('puts a skip link to main content first in tab order', () => {
    const { container } = renderRoute(path);

    const first = tabbableElements(container)[0];
    expect(first).toBeDefined();
    expect(first.tagName).toBe('A');
    expect(first).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
    expect(first).toHaveTextContent(/skip to main content/i);
    expect(screen.getByRole('main')).toHaveAttribute('id', MAIN_CONTENT_ID);
  });

  it('uses no positive tabindex and no role="application"', () => {
    const { container } = renderRoute(path);

    for (const element of container.querySelectorAll('[tabindex]')) {
      expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
    expect(container.querySelector('[role="application"]')).toBeNull();
  });
});

describe('route entry', () => {
  it('sends the application root to the projects route', () => {
    renderRoute('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Projects');
  });

  it('keeps one h1 on an unmatched URL', () => {
    renderRoute('/nothing-here');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
