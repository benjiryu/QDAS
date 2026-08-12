import type { TurnCoding } from '../../domain';

/**
 * The turn's compact accessible description, per D-041.
 *
 * "N excerpts, M codes", plus "note" when one of those excerpts carries one.
 * Announced once when the turn takes focus and silent during continuous
 * reading, which is what lets the code rail stay out of the accessibility tree.
 *
 * It is the programmatic twin of the glance, not a recitation of it: **no code
 * names appear here.** Detail stays on request through `excerpt.open`, which is
 * the third tier of glance, brief, detail.
 *
 * Null for a turn with nothing on it, so the turn carries no description at all
 * rather than an empty one.
 */
export function turnDescription(coding: TurnCoding): string | null {
  if (coding.excerptCount === 0) return null;

  const excerpts = `${coding.excerptCount} ${coding.excerptCount === 1 ? 'excerpt' : 'excerpts'}`;
  const codes = `${coding.codeIds.length} ${coding.codeIds.length === 1 ? 'code' : 'codes'}`;

  return coding.hasNote ? `${excerpts}, ${codes}, note` : `${excerpts}, ${codes}`;
}
