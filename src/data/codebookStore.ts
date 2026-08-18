import type { Code, Id } from '../domain';

/**
 * Codebook edits made this session.
 *
 * Specification: decision D-070.
 *
 * The fixture is a starting state rather than someone else's work, and it is a
 * module constant, so this is the only place a change to it can be written. The
 * shape is `mergeSessionNotes`': records here shadow seeded ones by identifier
 * and the rest append, which is what lets an edit and a creation be one thing.
 *
 * Also holds whether anything has changed since the last phase boundary. D-070
 * bumps the codebook version at that boundary and only when edits occurred, so
 * something has to remember that they did.
 */

interface CodebookEdits {
  /** Created codes and edited copies of seeded ones, by `codeId`. */
  codes: Code[];
  /** True once something has been written and not yet carried past a boundary. */
  dirty: boolean;
  /** Null until a bump, after which it replaces the seeded label. */
  versionLabel: string | null;
}

const EMPTY: CodebookEdits = { codes: [], dirty: false, versionLabel: null };

const edits = new Map<string, CodebookEdits>();

export function readCodebookEdits(projectId: Id): CodebookEdits {
  return edits.get(projectId) ?? EMPTY;
}

/**
 * Records a created or edited code, replacing any earlier version of it.
 *
 * Marks the codebook dirty, which is what the next phase boundary reads.
 */
export function writeCode(projectId: Id, code: Code): void {
  const current = readCodebookEdits(projectId);
  edits.set(projectId, {
    ...current,
    codes: [...current.codes.filter((candidate) => candidate.codeId !== code.codeId), code],
    dirty: true,
  });
}

/**
 * The version label to show, bumped if edits are outstanding.
 *
 * Called when the phase changes. D-070 puts the bump at the boundary rather
 * than at the edit so that a version covers a body of work rather than a
 * keystroke, and so a round never sees its codebook's label move under it.
 */
export function bumpVersionIfEdited(projectId: Id, seededLabel: string): void {
  const current = readCodebookEdits(projectId);
  if (!current.dirty) return;

  const previous = current.versionLabel ?? seededLabel;
  edits.set(projectId, { ...current, dirty: false, versionLabel: nextLabel(previous) });
}

/**
 * The next label from the last one.
 *
 * Reads the first number it finds and adds one to its minor part, so
 * "v1.0, frozen for round 1" becomes "v1.1". Full version machinery stays
 * simulated per prototype-scope; what a participant needs to see is that the
 * codebook they are reading is not the one the last round used.
 */
function nextLabel(previous: string): string {
  const match = /v(\d+)\.(\d+)/.exec(previous);
  if (!match) return `${previous} (revised)`;
  return `v${match[1]}.${Number(match[2]) + 1}`;
}

/**
 * Seeded codes with this session's edits laid over them.
 *
 * Every surface that renders codes calls this. A code created on the Codebook
 * page and missing from the coding panel would be worse than one that was never
 * created: the coder would be told a vocabulary exists and then not find it.
 */
export function mergeSessionCodes(seeded: readonly Code[], session: readonly Code[]): Code[] {
  const shadowed = new Map(session.map((code) => [code.codeId, code]));
  const merged = seeded.map((code) => shadowed.get(code.codeId) ?? code);
  const seededIds = new Set(seeded.map((code) => code.codeId));
  return [...merged, ...session.filter((code) => !seededIds.has(code.codeId))];
}

/** For the between-participants reset, and for test isolation. */
export function clearCodebookEdits(): void {
  edits.clear();
}
