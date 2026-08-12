/**
 * Who the participant is, and where the project has got to.
 *
 * Specification: docs/prototype-scope.md — "Authentication. A role and user
 * switcher stands in" — and decision D-049, which resolves the Coded data view
 * from these two values.
 *
 * The stand-in, not a login. Nothing here checks a credential, and nothing
 * grants access: it records which scenario the session is running so the
 * surfaces that vary by role and phase can vary. prototype-scope.md puts
 * authentication on the simulated list and role-based visibility on the real
 * one, and this is the seam between them.
 *
 * In memory, like `codingSessionStore` and for the same reason: a reload
 * returns the prototype to the seeded scenario, which is what a facilitator
 * resetting between participants wants. Held here rather than in the URL so
 * that changing it mid-session does not reload the page and take the coder's
 * work with it, which is what D-044 exists to prevent.
 */

import type { ProjectPhase, UserRole } from '../domain';

export interface SimulatedSession {
  role: UserRole;
  phase: ProjectPhase;
}

/**
 * The seeded scenario: a coder, mid independent coding.
 *
 * The case D-010 and A-1 answered and the one most sessions run, so it is what
 * the prototype starts in rather than something a facilitator has to select.
 */
const SEEDED: SimulatedSession = { role: 'coder', phase: 'independentCoding' };

let current: SimulatedSession = SEEDED;

export function readSimulatedSession(): SimulatedSession {
  return current;
}

export function writeSimulatedSession(next: Partial<SimulatedSession>): void {
  current = { ...current, ...next };
}

/** For the between-participants reset, and for test setup. */
export function clearSimulatedSession(): void {
  current = SEEDED;
}
