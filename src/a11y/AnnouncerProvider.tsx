import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { AnnouncementLog } from './AnnouncementLog';
import { announcer as defaultAnnouncer } from './announcer';
import type { Announcer } from './announcer';
import { AnnouncerContext } from './announcerContext';
import './liveRegions.css';

/**
 * Mounts the application's two live regions, once, beside the app root.
 *
 * Specification: docs/accessibility-contract.md section 2.3.
 *
 * The region nodes carry no text of their own. The announcer writes them; this
 * component only puts them in the document and hands over the nodes.
 *
 * They are portalled to their own element under `body`, tagged
 * `data-live-announcer`, rather than rendered inside the application. A modal
 * dialog hides everything outside itself from assistive technology, and the
 * code panel is the noisiest surface in the application: every check, every
 * count, and the assertive save failure. Rendered inside the app root they
 * would be hidden along with it, and the failure would be silent. That
 * attribute is the one react-aria's own `ariaHideOutside` skips.
 *
 * Still exactly two regions, still owned by the announcer. Only their place in
 * the document changed.
 */

let mountedProviders = 0;

interface AnnouncerProviderProps {
  children: ReactNode;
  /** Tests pass their own. Application code uses the shared instance. */
  announcer?: Announcer;
}

export function AnnouncerProvider({
  children,
  announcer = defaultAnnouncer,
}: AnnouncerProviderProps) {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);
  /** State rather than a ref: the element is made once and read during render. */
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('div');
    element.setAttribute('data-live-announcer', 'true');
    return element;
  });

  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host);
    return () => host.remove();
  }, [host]);

  useEffect(() => {
    announcer.attachRegion('polite', politeRef.current);
    announcer.attachRegion('assertive', assertiveRef.current);

    mountedProviders += 1;
    if (mountedProviders > 1 && import.meta.env.DEV) {
      console.error(
        'AnnouncerProvider is mounted more than once. The application has exactly two ' +
          'live regions (accessibility contract 2.3); a second provider adds two more ' +
          'and announcements will be duplicated or lost.',
      );
    }

    return () => {
      mountedProviders -= 1;
      announcer.attachRegion('polite', null);
      announcer.attachRegion('assertive', null);
    };
  }, [announcer]);

  return (
    <AnnouncerContext.Provider value={announcer}>
      {children}
      {/*
        aria-live only, without role="status" or role="alert". The role and the
        attribute map to the same thing, and carrying both has been observed to
        produce doubled announcements in some screen reader and browser pairings.

        aria-atomic="true" so the message is read whole rather than as a diff
        against what was there before.
      */}
      {host
        ? createPortal(
            <>
              <div
                ref={politeRef}
                className="live-region"
                aria-live="polite"
                aria-atomic="true"
                data-testid="live-region-polite"
              />
              <div
                ref={assertiveRef}
                className="live-region"
                aria-live="assertive"
                aria-atomic="true"
                data-testid="live-region-assertive"
              />
            </>,
            host,
          )
        : null}

      {/*
        Development only, per docs/testing/manual-testing.md section 4. Vite
        replaces this condition with false when building for production, so the
        panel and its stylesheet leave the bundle entirely. Rendered here, and
        not inside the application, so it sits outside every landmark.
      */}
      {import.meta.env.DEV ? <AnnouncementLog announcer={announcer} /> : null}
    </AnnouncerContext.Provider>
  );
}
