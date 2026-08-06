import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { announcer as defaultAnnouncer } from './announcer';
import type { Announcer } from './announcer';
import { AnnouncerContext } from './announcerContext';
import './liveRegions.css';

/**
 * Mounts the application's two live regions, once, at the app root.
 *
 * Specification: docs/accessibility-contract.md section 2.3.
 *
 * The region nodes carry no text of their own. The announcer writes them; this
 * component only puts them in the document and hands over the nodes.
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
    </AnnouncerContext.Provider>
  );
}
