import { createContext, useContext } from 'react';
import type { Announcer } from './announcer';

/**
 * No default value. A missing provider means the live regions are not mounted,
 * so announcements would queue and never be spoken — silence, which is the
 * failure mode section 2.3 is written to prevent. Fail loudly instead.
 */
export const AnnouncerContext = createContext<Announcer | null>(null);

export function useAnnouncer(): Announcer {
  const announcer = useContext(AnnouncerContext);
  if (!announcer) {
    throw new Error(
      'useAnnouncer must be used inside <AnnouncerProvider>. The live regions are ' +
        'mounted by the provider at the app root.',
    );
  }
  return announcer;
}
