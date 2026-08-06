import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AnnouncerProvider } from './AnnouncerProvider';
import { createAnnouncer } from './announcer';
import type { Announcer } from './announcer';
import { useAnnouncer } from './announcerContext';

/**
 * Specification: docs/accessibility-contract.md section 2.3.
 *
 * "Exactly two live regions for the whole application" is a property of the
 * rendered document, not of this component, so the count is asserted against
 * the document with the real application inside it.
 */

const CLEAR_GAP_MS = 10;

let announcer: Announcer;

beforeEach(() => {
  vi.useFakeTimers();
  announcer = createAnnouncer({ intervalMs: 100, clearGapMs: CLEAR_GAP_MS });
});

afterEach(() => {
  announcer.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function liveRegions(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[aria-live]'));
}

describe('AnnouncerProvider', () => {
  it('mounts exactly two live regions, one polite and one assertive', () => {
    render(
      <AnnouncerProvider announcer={announcer}>
        <p>content</p>
      </AnnouncerProvider>,
    );

    const regions = liveRegions();
    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.getAttribute('aria-live')).sort()).toEqual([
      'assertive',
      'polite',
    ]);
    for (const region of regions) {
      expect(region).toHaveAttribute('aria-atomic', 'true');
      expect(region).toHaveTextContent('');
    }
  });

  it('adds no further live regions once the application is inside it', () => {
    render(
      <AnnouncerProvider announcer={announcer}>
        <MemoryRouter initialEntries={['/projects/p-1/sources/s-1']}>
          <App />
        </MemoryRouter>
      </AnnouncerProvider>,
    );

    expect(liveRegions()).toHaveLength(2);
  });

  it('keeps the regions out of every landmark', () => {
    render(
      <AnnouncerProvider announcer={announcer}>
        <MemoryRouter initialEntries={['/projects']}>
          <App />
        </MemoryRouter>
      </AnnouncerProvider>,
    );

    for (const region of liveRegions()) {
      expect(region.closest('main, header, nav, [role="region"]')).toBeNull();
    }
  });

  it('routes a component announcement to the polite region', () => {
    function Coder() {
      const service = useAnnouncer();
      return (
        <button type="button" onClick={() => service.announce('Excerpt is now four sentences.')}>
          Expand
        </button>
      );
    }

    render(
      <AnnouncerProvider announcer={announcer}>
        <Coder />
      </AnnouncerProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    vi.advanceTimersByTime(CLEAR_GAP_MS);

    expect(screen.getByTestId('live-region-polite')).toHaveTextContent(
      'Excerpt is now four sentences.',
    );
    expect(screen.getByTestId('live-region-assertive')).toHaveTextContent('');
  });

  it('reports a second provider rather than silently doubling the regions', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AnnouncerProvider announcer={announcer}>
        <AnnouncerProvider announcer={createAnnouncer()}>
          <p>content</p>
        </AnnouncerProvider>
      </AnnouncerProvider>,
    );

    expect(error).toHaveBeenCalledWith(expect.stringContaining('mounted more than once'));
  });

  it('fails loudly when a component calls the service with no provider above it', () => {
    function Orphan() {
      useAnnouncer();
      return null;
    }

    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/must be used inside <AnnouncerProvider>/);
  });
});
