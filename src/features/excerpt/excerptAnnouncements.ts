/**
 * What excerpt selection says.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 5 and 5.1.
 *
 * Section 5 fixes the information content and leaves the phrasing open, and
 * calls the phrasing itself a candidate for testing. So the order here is not
 * negotiable — what entered or left the range, then the new size — and the
 * words are.
 *
 * Every string goes through the shared announcement service. Nothing in this
 * feature writes to a live region.
 */

import type { BoundaryChangeAnnouncement } from '../../config/flags';
import { describeExcerptSize, truncateWords } from '../../domain';
import type { ExcerptDelta, ExcerptSize, TranscriptSegment } from '../../domain';
import { formatTimestamp } from '../transcript/formatTimestamp';

/**
 * The automatic announcement after a boundary change.
 *
 * All three values of `boundaryChangeAnnouncement` are built here rather than
 * only the default, because the flag exists so the three can be compared in a
 * session rather than argued about in advance.
 */
export function boundaryChanged(
  delta: ExcerptDelta,
  size: ExcerptSize,
  fullText: string,
  mode: BoundaryChangeAnnouncement,
  truncationWords: number,
): string {
  const sizeText = `Excerpt is now ${describeExcerptSize(size)}.`;

  if (mode === 'sizeOnly') return sizeText;

  if (mode === 'fullRange') {
    const { text, truncated } = truncateWords(fullText, truncationWords);
    return `${text}${truncated ? ', and more' : ''}. ${sizeText}`;
  }

  const changed = delta.added.length > 0 ? delta.addedText : delta.removedText;
  const verb = delta.added.length > 0 ? 'Added' : 'Removed';
  const { text, truncated } = truncateWords(changed, truncationWords);

  // The delta first: after expanding backward, what the user most needs is to
  // hear what they just picked up.
  return `${verb}: ${text}${truncated ? ', and more' : ''}. ${sizeText}`;
}

export function begun(startText: string, size: ExcerptSize): string {
  // Section 3: announce the start sentence. Transcript-segment section 10 also
  // requires the application to confirm which sentence it began from.
  return `Excerpt started at: ${startText} ${describeExcerptSize(size)}.`;
}

/**
 * Adopting a native selection, per section 4.0 and D-034.
 *
 * Names the adopted size, and states that boundaries were extended to whole
 * sentences when they were, so a user who dragged across part of a sentence
 * hears that the sentence came in whole rather than discovering it later.
 */
export function adopted(size: ExcerptSize, extended: boolean): string {
  const snap = extended ? ' Boundaries extended to whole sentences.' : '';
  return `Excerpt started from your selection. ${describeExcerptSize(size)}.${snap}`;
}

/** Adopt and confirm in one action: the pointer route into the code panel. */
export function adoptedAndConfirmed(size: ExcerptSize, extended: boolean): string {
  const snap = extended ? ' Boundaries extended to whole sentences.' : '';
  return `Excerpt confirmed from your selection. ${describeExcerptSize(size)}.${snap}`;
}

export function reverted(startText: string, size: ExcerptSize): string {
  return `Reverted to where the excerpt began: ${startText} ${describeExcerptSize(size)}.`;
}

export function confirmed(size: ExcerptSize): string {
  // The code panel announces itself as it opens, per code-selection section 10.
  return `Excerpt confirmed. ${describeExcerptSize(size)}.`;
}

export function discarded(): string {
  return 'Excerpt discarded. Nothing was recorded.';
}

/** Size first, so a listener can decide whether to sit through a long range. */
export function readExcerpt(size: ExcerptSize, text: string): string {
  return `${describeExcerptSize(size)}. ${text}`;
}

export function contextSentence(direction: 'before' | 'after', segment: TranscriptSegment): string {
  return `${direction === 'before' ? 'Before' : 'After'}: ${segment.text}`;
}

export function speakersText(startLabel: string | null, endLabel: string | null): string {
  if (startLabel && endLabel && startLabel === endLabel) return `Speaker: ${startLabel}.`;
  return `Starts with ${startLabel ?? 'an unknown speaker'}. Ends with ${
    endLabel ?? 'an unknown speaker'
  }.`;
}

export function timestampsText(startMs: number | null, endMs: number | null): string {
  if (startMs === null && endMs === null) return 'This excerpt has no timestamps.';
  return `Starts at ${startMs === null ? 'an unknown time' : formatTimestamp(startMs)}. Ends at ${
    endMs === null ? 'an unknown time' : formatTimestamp(endMs)
  }.`;
}

/**
 * Why a command did nothing. Section 4 requires the reason to be announced on
 * attempt when a boundary cannot move, and contract 2.6 requires an unavailable
 * control to explain itself rather than being a dead end.
 */
export const EXCERPT_UNAVAILABLE: Record<string, string> = {
  atSourceStart: 'The excerpt already starts at the first sentence of the source.',
  atSourceEnd: 'The excerpt already ends at the last sentence of the source.',
  wouldCrossEnd: 'The start cannot move past the end of the excerpt.',
  wouldCrossStart: 'The end cannot move past the start of the excerpt.',
  inFirstTurn: 'The excerpt already starts in the first speaker turn.',
  inLastTurn: 'The excerpt already ends in the last speaker turn.',
  invalidRange: 'That excerpt range is not valid.',
  noExcerpt: 'No excerpt in progress.',
  noPosition:
    'No position is set, so there is nowhere to begin an excerpt. Move to a sentence first.',
  alreadyStarted: 'An excerpt is already in progress.',
  notAdjusted: 'The excerpt has not been adjusted, so there is nothing to revert.',
  alreadyConfirmed: 'The excerpt is already confirmed.',
  noSavedExcerptHere: 'This sentence is not inside a saved excerpt.',
  reopenedIsLocked:
    'This excerpt was reopened to change its codes. Its boundaries cannot be moved.',
};
