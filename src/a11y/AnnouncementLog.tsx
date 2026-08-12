import { useCallback, useEffect, useRef, useState } from 'react';
import type { Announcement, Announcer } from './announcer';

/**
 * Development-only view of everything passed to the announcement service.
 *
 * Specification: docs/testing/manual-testing.md section 4.
 *
 * Dropped and clobbered announcements are the failure most likely to end a
 * participant session, and the symptom is silence, which is nearly impossible
 * to notice while also driving the interface. This panel turns that into
 * something a reviewer can read at a glance.
 *
 * Three constraints from the specification shape the markup:
 *
 * 1. It must not render in a production build. The render site in
 *    AnnouncerProvider is behind `import.meta.env.DEV`, so the whole component
 *    drops out of the bundle.
 * 2. It must not sit inside any landmark. It is rendered as a sibling of the
 *    application, not inside main, header, or either navigation.
 * 3. It must not be announced by a screen reader itself. The panel is
 *    `aria-hidden`, and so it must contain nothing focusable: a focusable
 *    element inside an `aria-hidden` subtree is a defect in its own right, and
 *    a visible tab stop here would corrupt the tab order under test. Its
 *    controls therefore carry `tabindex="-1"` and are pointer-operated.
 *
 * Point 3 is the trade. This panel is an instrument for a sighted reviewer
 * watching announcements go past; it is deliberately not part of the interface
 * being evaluated, and it must not add a single thing to the accessibility tree
 * that a participant would meet.
 */

/** Last 50 entries, per section 4. Matches the service's own history cap. */
export const ANNOUNCEMENT_LOG_LIMIT = 50;

/**
 * Styles live here rather than in a stylesheet beside this file.
 *
 * An imported stylesheet is collected into the production CSS bundle even when
 * the component that imports it has been eliminated from the JavaScript, so a
 * separate file would leave the panel's styling in a build that can never
 * render it. Held as a string, the styles are dropped with the component.
 *
 * Collapsible, because a fixed panel that could not be put away would sit on
 * top of the interface during the 400% reflow check.
 */
const STYLES = `
.announcement-log {
  position: fixed;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 1000;
  max-width: min(28rem, calc(100vw - 1rem));
  font: 12px/1.4 ui-monospace, Consolas, monospace;
  /* Tokens, like everything else. The neutral ramp keeps it reading as a debug
     overlay rather than part of the application. */
  color: var(--color-white);
  background: var(--color-grey-750);
  border: 1px solid var(--color-grey-300);
  border-radius: var(--radius-small);
}
.announcement-log summary {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-weight: var(--font-weight-bold);
}
.announcement-log__list {
  max-height: 30vh;
  overflow-y: auto;
  margin: 0;
  padding: 0 0.5rem;
  list-style: none;
  border-top: 1px solid var(--color-grey-300);
}
.announcement-log__entry {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 0.5rem;
  padding: 0.2rem 0;
  border-bottom: 1px solid var(--color-grey-500);
}
.announcement-log__time { color: var(--color-grey-300); }
.announcement-log__politeness { color: var(--color-blue-10); }
.announcement-log__entry--assertive .announcement-log__politeness { color: var(--color-warning); }
.announcement-log__message { overflow-wrap: anywhere; }
.announcement-log__empty { padding: 0.4rem 0; color: var(--color-grey-300); }
.announcement-log__clear { margin: 0.4rem 0.5rem; font: inherit; cursor: pointer; }
`;

function clockTime(timestamp: number): string {
  const at = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}.${pad(
    at.getMilliseconds(),
    3,
  )}`;
}

export function AnnouncementLog({ announcer }: { announcer: Announcer }) {
  // Seeded from history at mount, so anything announced during start up still
  // appears, then kept current by subscription.
  const [entries, setEntries] = useState<Announcement[]>(() =>
    announcer.getHistory().slice(-ANNOUNCEMENT_LOG_LIMIT),
  );
  const listRef = useRef<HTMLOListElement>(null);

  const append = useCallback((announcement: Announcement) => {
    setEntries((current) => [...current, announcement].slice(-ANNOUNCEMENT_LOG_LIMIT));
  }, []);

  useEffect(() => announcer.subscribe(append), [announcer, append]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries]);

  return (
    <div className="announcement-log" aria-hidden="true" data-testid="announcement-log">
      <style>{STYLES}</style>
      <details open>
        <summary tabIndex={-1}>Announcement log ({entries.length})</summary>

        <ol className="announcement-log__list" ref={listRef} data-testid="announcement-log-list">
          {entries.length === 0 ? (
            <li className="announcement-log__empty">Nothing announced yet.</li>
          ) : (
            entries.map((entry) => (
              <li
                key={entry.sequence}
                className={`announcement-log__entry announcement-log__entry--${entry.politeness}`}
              >
                <span className="announcement-log__time">{clockTime(entry.timestamp)}</span>
                {/* Politeness is spelled out, not signalled by the accent colour alone. */}
                <span className="announcement-log__politeness">
                  {entry.politeness}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </span>
                <span className="announcement-log__message">{entry.message}</span>
              </li>
            ))
          )}
        </ol>

        {/*
          Clears this view only. It must not call announcer.reset(), which would
          discard the service's history and break repeat-on-request: a debugging
          view may not change what the application does.
        */}
        <button
          type="button"
          tabIndex={-1}
          className="announcement-log__clear"
          onClick={() => setEntries([])}
        >
          Clear
        </button>
      </details>
    </div>
  );
}
