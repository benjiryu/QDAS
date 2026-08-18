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
 *
 * Subscribable since D-071 put a role select in the sidebar. Until then the one
 * role control lived on a page, so changing it always meant a remount and a
 * fresh read; from a control that is mounted on every route, a reader holding a
 * snapshot would simply not learn. The argument the reading scale already makes
 * for the same shape: held in component state the surfaces would drift,
 * subscribed they cannot.
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
const listeners = new Set<() => void>();

export function subscribeToSimulatedSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The current scenario.
 *
 * Returns the same object between writes, deliberately: `useSyncExternalStore`
 * compares snapshots by identity, and a fresh object per call would re-render
 * forever.
 */
export function readSimulatedSession(): SimulatedSession {
  return current;
}

/**
 * Sets what the caller names and leaves the rest.
 *
 * The partial signature is the one sixteen tests write through; what changed is
 * that subscribers hear about it. Guarded, so re-selecting the role a session
 * already has notifies nobody and leaves the snapshot's identity alone.
 */
export function writeSimulatedSession(next: Partial<SimulatedSession>): void {
  const merged = { ...current, ...next };
  if (merged.role === current.role && merged.phase === current.phase) return;
  current = merged;
  notify();
}

/** For the between-participants reset, and for test setup. */
export function clearSimulatedSession(): void {
  if (current.role === SEEDED.role && current.phase === SEEDED.phase) return;
  current = SEEDED;
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}
