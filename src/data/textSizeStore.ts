/**
 * The transcript text size, per user, across sessions.
 *
 * Specification: decision D-056.
 *
 * A reading preference rather than session state, which is what puts it in
 * `localStorage` beside the source position rather than in the in-memory stores
 * a reload is meant to clear. A magnification participant who set the
 * transcript to 200 percent should not have to set it again because the page
 * reloaded.
 *
 * Storage is local to the browser and is not a simulation of a server. A reset
 * between participants must call `clearTextSizes`: seed-data.md section 5 asks
 * for one command that returns the application to a known state, and a text
 * size left at 250 percent is exactly the kind of thing the next participant
 * should not inherit.
 */

import type { Id } from '../domain';

const STORAGE_KEY = 'qdas.textSize.v1';

/**
 * The range and the step, per D-056.
 *
 * D-056 gives the bounds and not the increment. 25 makes either end reachable
 * in three presses; 10 would take fifteen, which is a lot of pressing for a
 * preference somebody sets once.
 */
export const TEXT_SIZE_MIN = 100;
export const TEXT_SIZE_MAX = 250;
export const TEXT_SIZE_STEP = 25;
export const TEXT_SIZE_DEFAULT = TEXT_SIZE_MIN;

type StoredSizes = Record<string, number>;

/**
 * Subscribers, so every reader of the preference sees one value.
 *
 * D-061 makes this one preference for the whole application: the control sits
 * in the transcript header and the surfaces obeying it include pages with no
 * transcript. A module store rather than a context because that is what the
 * rest of this codebase's shared session state is, and because it lets a
 * component read the preference wherever it renders without a provider above
 * it — which the tests that mount one region on its own rely on.
 */
const listeners = new Set<() => void>();

export function subscribeToTextSize(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Storage can be unavailable or full. Losing a preference is never fatal. */
function readAll(): StoredSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSizes) : {};
  } catch {
    return {};
  }
}

function writeAll(sizes: StoredSizes): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Ignored. A preference that cannot be saved is a lost convenience, not a
    // lost piece of a participant's work.
  }
}

/** Clamped to the range and onto a step, so stored rubbish cannot reach the UI. */
export function clampTextSize(percent: number): number {
  if (!Number.isFinite(percent)) return TEXT_SIZE_DEFAULT;
  const stepped = Math.round(percent / TEXT_SIZE_STEP) * TEXT_SIZE_STEP;
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, stepped));
}

export function readTextSize(userId: Id): number {
  const stored = readAll()[userId];
  return stored === undefined ? TEXT_SIZE_DEFAULT : clampTextSize(stored);
}

export function writeTextSize(userId: Id, percent: number): void {
  const sizes = readAll();
  sizes[userId] = clampTextSize(percent);
  writeAll(sizes);
  for (const listener of listeners) listener();
}

/** For the between-participants reset. */
export function clearTextSizes(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See writeAll.
  }
  for (const listener of listeners) listener();
}
