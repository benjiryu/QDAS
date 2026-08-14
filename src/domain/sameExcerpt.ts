/**
 * When two coders have coded the same excerpt.
 *
 * Specification: decision D-066, and R-1, which resolved the comparison unit
 * for overlap to the sentence.
 *
 * Pure, and deliberately small. What lives here is the arithmetic: which
 * sentences a range touches, how much two sets share, and whether that is
 * enough. Everything about how the answer is worded — whose name, in what
 * order, on which surface — belongs to the view that renders it.
 *
 * D-036 keeps character boundaries exactly as they were stored. Nothing here
 * alters a range; comparison happens at sentence granularity above storage that
 * stays precise, which is the whole shape R-1 and D-036 agreed on.
 */

import { excerptSegments, rangeOf } from './excerpt';
import type { ResolvedSource } from './source';
import type { Excerpt, Id } from './types';

/**
 * The threshold, per D-066: sentence sets overlapping at Jaccard 0.5 or above.
 *
 * Provisional and tuned by session evidence, which is why it is a named
 * constant in the domain layer and never a number in a component. If
 * participants find the poke appearing where they would not call it the same
 * passage, or missing where they would, this is the one value that moves.
 */
export const SAME_EXCERPT_JACCARD = 0.5;

/**
 * The sentences a range touches, as identifiers.
 *
 * `excerptSegments` is what "touches" means everywhere else in the build: it is
 * what `excerptSize.sentenceCount` counts, and so what a coder is told at
 * capture. A boundary sentence the offsets cover zero characters of is included
 * here for that reason, even though `excerptText` drops it — the comparison
 * uses the same set the coder was told about rather than introducing a second
 * number for one range.
 */
export function sentenceSet(resolved: ResolvedSource, excerpt: Excerpt): Set<Id> {
  return new Set(
    excerptSegments(resolved, rangeOf(excerpt)).map((segment) => segment.segmentId),
  );
}

/**
 * The sentences both touch, over the sentences either touches. D-066.
 *
 * Two empty sets are 0 rather than NaN. A range always touches at least one
 * sentence, so this is defensive rather than a case anything reaches, and 0 is
 * the answer that keeps a caller from reporting an overlap it did not measure.
 */
export function jaccard(a: ReadonlySet<Id>, b: ReadonlySet<Id>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** At or above the threshold, per D-066's "0.5 or above". */
export function isSameExcerpt(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  return jaccard(a, b) >= SAME_EXCERPT_JACCARD;
}

/**
 * Which other coders have coded the same excerpt as this one.
 *
 * Same source and a different coder, both as rules rather than as consequences.
 * Segment identifiers are unique across sources, so a cross-source pair would
 * score zero anyway — but a comparison that only works because identifiers
 * happen not to collide is one rename away from being wrong.
 *
 * Identifiers, in candidate order, each once. Turning them into names and
 * deciding what order to read them in is the caller's, since that is wording.
 */
export function sameExcerptCoderIds(
  resolved: ResolvedSource,
  excerpt: Excerpt,
  candidates: readonly Excerpt[],
): Id[] {
  const own = sentenceSet(resolved, excerpt);
  const found: Id[] = [];

  for (const candidate of candidates) {
    if (candidate.sourceId !== excerpt.sourceId) continue;
    if (candidate.coderId === excerpt.coderId) continue;
    if (found.includes(candidate.coderId)) continue;
    if (isSameExcerpt(own, sentenceSet(resolved, candidate))) found.push(candidate.coderId);
  }

  return found;
}
