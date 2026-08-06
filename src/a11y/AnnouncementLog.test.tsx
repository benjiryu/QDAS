import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ANNOUNCEMENT_LOG_LIMIT, AnnouncementLog } from './AnnouncementLog';
import { AnnouncerProvider } from './AnnouncerProvider';
import { createAnnouncer } from './announcer';
import type { Announcer } from './announcer';

/**
 * Specification: docs/testing/manual-testing.md section 4.
 *
 * The panel exists to make dropped announcements visible, so the assertions
 * that matter are that nothing is lost from the list and that the panel adds
 * nothing to the accessibility tree of the interface under test.
 */

let announcer: Announcer;

beforeEach(() => {
  announcer = createAnnouncer({ intervalMs: 50, clearGapMs: 5 });
});

afterEach(() => {
  announcer.reset();
  vi.restoreAllMocks();
});

function entries(): HTMLElement[] {
  const list = screen.getByTestId('announcement-log-list');
  return within(list).queryAllByRole('listitem', { hidden: true });
}

describe('contents', () => {
  it('lists every message in order, with its politeness', () => {
    render(<AnnouncementLog announcer={announcer} />);

    act(() => {
      announcer.announce('first');
      announcer.announce('second');
      announcer.announce('Save failed. Nothing was lost.', 'assertive', 'saveFailure');
    });

    const text = entries().map((entry) => entry.textContent ?? '');
    expect(text).toHaveLength(3);
    expect(text[0]).toContain('first');
    expect(text[0]).toContain('polite');
    expect(text[1]).toContain('second');
    expect(text[2]).toContain('Save failed. Nothing was lost.');
    expect(text[2]).toContain('assertive');
    expect(text[2]).toContain('saveFailure');
  });

  it('stamps each entry with a time', () => {
    render(<AnnouncementLog announcer={announcer} />);
    act(() => announcer.announce('timed'));

    expect(entries()[0].textContent).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it('shows messages announced before it mounted', () => {
    announcer.announce('announced during start up');
    render(<AnnouncementLog announcer={announcer} />);

    expect(entries()[0].textContent).toContain('announced during start up');
  });

  it('says so when nothing has been announced', () => {
    render(<AnnouncementLog announcer={announcer} />);

    expect(entries()).toHaveLength(1);
    expect(entries()[0].textContent).toContain('Nothing announced yet');
  });

  it('keeps the last 50 entries and drops the oldest', () => {
    render(<AnnouncementLog announcer={announcer} />);

    act(() => {
      for (let index = 0; index < ANNOUNCEMENT_LOG_LIMIT + 10; index += 1) {
        announcer.announce(`message ${index}`);
      }
    });

    const text = entries().map((entry) => entry.textContent ?? '');
    expect(text).toHaveLength(ANNOUNCEMENT_LOG_LIMIT);
    expect(text[0]).toContain('message 10');
    expect(text[text.length - 1]).toContain(`message ${ANNOUNCEMENT_LOG_LIMIT + 9}`);
  });

  it('records rapid successive announcements without dropping any', () => {
    // The failure this panel exists to make visible.
    render(<AnnouncementLog announcer={announcer} />);

    act(() => {
      for (const message of ['one', 'two', 'three', 'four', 'five']) {
        announcer.announce(message);
      }
    });

    expect(entries().map((entry) => entry.textContent)).toHaveLength(5);
  });

  it('stops listening once unmounted', () => {
    const { unmount } = render(<AnnouncementLog announcer={announcer} />);
    unmount();

    expect(() => announcer.announce('after unmount')).not.toThrow();
  });
});

describe('clear control', () => {
  it('empties the view', () => {
    render(<AnnouncementLog announcer={announcer} />);
    act(() => announcer.announce('something'));
    expect(entries()[0].textContent).toContain('something');

    fireEvent.click(screen.getByText('Clear'));

    expect(entries()).toHaveLength(1);
    expect(entries()[0].textContent).toContain('Nothing announced yet');
  });

  it('does not touch the service, so repeat on request still works', () => {
    // A debugging view may not change what the application does.
    render(<AnnouncementLog announcer={announcer} />);
    act(() => announcer.announce('the message a user missed'));

    fireEvent.click(screen.getByText('Clear'));

    expect(announcer.getLast()?.message).toBe('the message a user missed');
    expect(announcer.repeatLast()?.message).toBe('the message a user missed');
  });
});

describe('it stays out of the interface under test', () => {
  it('is hidden from assistive technology', () => {
    render(<AnnouncementLog announcer={announcer} />);

    expect(screen.getByTestId('announcement-log')).toHaveAttribute('aria-hidden', 'true');
  });

  it('adds no tab stop, because a focusable node under aria-hidden is a defect', () => {
    const { container } = render(<AnnouncementLog announcer={announcer} />);

    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, summary, [tabindex]',
    );
    expect(focusable.length).toBeGreaterThan(0);
    for (const element of focusable) {
      expect(element.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('creates no live region of its own', () => {
    const { container } = render(<AnnouncementLog announcer={announcer} />);

    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
  });

  it('sits outside every landmark when mounted with the application', () => {
    render(
      <AnnouncerProvider announcer={announcer}>
        <MemoryRouter initialEntries={['/projects/p-1/sources/s-1']}>
          <App />
        </MemoryRouter>
      </AnnouncerProvider>,
    );

    const log = screen.getByTestId('announcement-log');
    expect(log.closest('main, header, nav, [role="region"]')).toBeNull();
  });

  it('leaves the shell landmark and heading structure unchanged', () => {
    render(
      <AnnouncerProvider announcer={announcer}>
        <MemoryRouter initialEntries={['/projects']}>
          <App />
        </MemoryRouter>
      </AnnouncerProvider>,
    );

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(2);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('puts the skip link first in tab order still', () => {
    const { container } = render(
      <AnnouncerProvider announcer={announcer}>
        <MemoryRouter initialEntries={['/projects']}>
          <App />
        </MemoryRouter>
      </AnnouncerProvider>,
    );

    const tabbable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [tabindex]',
      ),
    ).filter((element) => (element.getAttribute('tabindex') ?? '0') !== '-1');

    expect(tabbable[0]).toHaveTextContent(/skip to main content/i);
  });
});
