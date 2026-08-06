/**
 * Where a coder was in a source, per user, per source.
 *
 * Specification: docs/patterns/transcript-segment.md sections 2.1 and 8.
 *
 * Section 8 scopes `activeSegmentId` to "per user, per source, across
 * sessions", so it outlives a reload. That is narrower than it sounds: the
 * excerpt range explicitly does not survive a reload (excerpt-selection.md
 * section 9), and nothing else here is persisted.
 *
 * Storage is local to the browser and is not a simulation of a server. A reset
 * between participants must call `clearSourcePositions`; seed-data.md section 5
 * requires one command that returns the application to a known state, and this
 * is one of the things that command has to clear.
 */

import type { Id, SourcePosition } from '../domain';

const STORAGE_KEY = 'qdas.sourcePositions.v1';

type StoredPositions = Record<string, SourcePosition>;

function keyFor(userId: Id, sourceId: Id): string {
  return `${userId}|${sourceId}`;
}

/** Storage can be unavailable or full. Losing a position is never fatal. */
function readAll(): StoredPositions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPositions) : {};
  } catch {
    return {};
  }
}

function writeAll(positions: StoredPositions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Ignored. A position that cannot be saved is a lost convenience, not a
    // lost piece of a participant's work.
  }
}

export function readSourcePosition(userId: Id, sourceId: Id): SourcePosition | null {
  return readAll()[keyFor(userId, sourceId)] ?? null;
}

export function writeSourcePosition(
  userId: Id,
  sourceId: Id,
  activeSegmentId: Id,
  updatedAt: string,
): void {
  const positions = readAll();
  positions[keyFor(userId, sourceId)] = { userId, sourceId, activeSegmentId, updatedAt };
  writeAll(positions);
}

export function clearSourcePosition(userId: Id, sourceId: Id): void {
  const positions = readAll();
  delete positions[keyFor(userId, sourceId)];
  writeAll(positions);
}

/** For the between-participants reset. */
export function clearSourcePositions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See writeAll.
  }
}
