/**
 * Whether the shortcuts help is open.
 *
 * Specification: decision D-057's discoverability floor, built by Task 45 to
 * close the gate D-065 recorded.
 *
 * A module store rather than a context because of who has to read it: the code
 * panel's Escape handler, which lives in a hook the transcript workspace owns,
 * while the dialog itself is mounted in the shell so the chord works on every
 * route. A provider spanning both would have to sit above every test that
 * mounts one region on its own, and this codebase already answers that question
 * this way for the reading scale.
 *
 * What it is for is layering, and nothing else. `resolveEscape` is where the
 * meaning of Escape is decided; this only reports which layers are up.
 */

let open = false;
const listeners = new Set<() => void>();

export function subscribeToShortcutsHelp(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isShortcutsHelpOpen(): boolean {
  return open;
}

export function setShortcutsHelpOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

/** For the between-participants reset, and for test isolation. */
export function clearShortcutsHelp(): void {
  setShortcutsHelpOpen(false);
}
