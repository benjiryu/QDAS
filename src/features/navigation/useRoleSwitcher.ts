import { useCallback, useSyncExternalStore } from 'react';
import { useAnnouncer } from '../../a11y';
import {
  readSimulatedSession,
  subscribeToSimulatedSession,
  writeSimulatedSession,
} from '../../data/simulatedSession';
import { createSeedFixture } from '../../data/seed';
import type { UserRole } from '../../domain';

/**
 * The sidebar's role switcher: the one role state, and what it says when it
 * changes.
 *
 * Specification: decision D-071.
 *
 * Subscribed rather than snapshotted. This control is mounted on every route
 * and the surfaces that obey it are elsewhere — the Codebook page's Create new
 * code button, the Coded data page's view — so a reader holding its own copy
 * would simply not learn that the facilitator had switched.
 *
 * Scaffolding in product chrome, which D-071 records as the inverse of the
 * D-056 addendum's rule and allows because role switching is a facilitator's
 * session tool. A real deployment takes the role from authentication and this
 * block returns to the static text the D-059 addendum specified.
 */

export interface RoleSwitcherApi {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

export function useRoleSwitcher(): RoleSwitcherApi {
  const announcer = useAnnouncer();
  const session = useSyncExternalStore(
    subscribeToSimulatedSession,
    readSimulatedSession,
    readSimulatedSession,
  );

  const setRole = useCallback(
    (role: UserRole) => {
      if (role === readSimulatedSession().role) return;
      writeSimulatedSession({ role });

      /*
        Discrete, per D-050, and from the handler rather than an effect: an
        effect would speak again on any re-render the store caused, and D-071
        asks for one announcement per change.

        Nothing here touches focus. Controls appearing and vanishing elsewhere —
        the codebook's Create button, the Accept controls — are re-renders, not
        focus moves, which is what D-071 means by never taking focus.
      */
      announcer.announce(`Role: ${titleForRole(role)}`);
    },
    [announcer],
  );

  return { role: session.role, setRole };
}

/**
 * The roles this control offers, and what each is called.
 *
 * Read from the seeded users rather than written here: "AFB Researcher" and
 * "Qualitative Lead" are those records' `title` fields, and D-071 makes the
 * select's value the displayed title. The block this replaces already read the
 * seed for exactly that.
 *
 * Two, in the order a session meets them. Reviewer is unoffered per D-071 and
 * left the support surface with it, so no control can name a state another
 * cannot show.
 */
export const SWITCHABLE_ROLES: readonly { role: UserRole; title: string }[] = (() => {
  const users = createSeedFixture().users;
  const titleOf = (role: UserRole) => users.find((user) => user.role === role)?.title ?? role;
  return [
    { role: 'coder' as UserRole, title: titleOf('coder') },
    { role: 'qualitativeLead' as UserRole, title: titleOf('qualitativeLead') },
  ];
})();

/** What the change says, in the same words the option shows. */
function titleForRole(role: UserRole): string {
  return SWITCHABLE_ROLES.find((entry) => entry.role === role)?.title ?? role;
}
