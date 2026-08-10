/**
 * Reading a native browser selection as a range of sentences.
 *
 * Specification: docs/patterns/excerpt-selection.md section 4.0, decision D-034.
 *
 * Native selection is an entry route into the application-owned range, never a
 * replacement for it. D-001 still holds: the range the application keeps is the
 * one that survives focus moving away and can be compared against another
 * coder's. This module only reads what the user dragged and hands back segment
 * identifiers.
 *
 * Adoption is opportunistic. In browse mode a screen reader's selection lives
 * in its virtual buffer and never reaches the DOM, so this returns null and
 * every control behaves exactly as it does without a selection. Nothing here
 * may become load-bearing.
 *
 * Nothing in this module calls `preventDefault` or touches `user-select`:
 * native selection keeps working natively right up to the moment of adoption.
 */

import { positionOf } from '../../domain';
import type { ExcerptRange, Id, ResolvedSource } from '../../domain';

export interface AdoptableSelection {
  /** Every sentence the selection touched, snapped outward to whole sentences. */
  range: ExcerptRange;
  /** True when the selection began partway through its first sentence. */
  extendedStart: boolean;
  /** True when the selection ended partway through its last sentence. */
  extendedEnd: boolean;
  segmentCount: number;
}

/**
 * A range over a sentence's text, expressed in text offsets.
 *
 * `selectNodeContents` would anchor at the element's child positions, and a
 * drag anchors inside the text node. Comparing the two puts a selection that
 * covers a sentence exactly one position "after" its start, which reports a
 * boundary extension that never happened.
 */
function contentsRange(element: HTMLElement): Range {
  const range = element.ownerDocument.createRange();
  const first = element.firstChild;
  const last = element.lastChild;

  if (first?.nodeType === Node.TEXT_NODE && last?.nodeType === Node.TEXT_NODE) {
    range.setStart(first, 0);
    range.setEnd(last, (last as Text).length);
  } else {
    range.selectNodeContents(element);
  }
  return range;
}

/**
 * Segment elements the range touches.
 *
 * Scoped to the range's common ancestor when that sits inside the transcript,
 * which is usually a single turn, and to the whole transcript otherwise. A
 * selection reaching outside the transcript therefore clamps to the transcript's
 * sentences rather than being discarded, per section 4.0.
 */
function touchedSegmentElements(container: HTMLElement, domRange: Range): HTMLElement[] {
  const ancestor = domRange.commonAncestorContainer;
  const ancestorElement =
    ancestor instanceof Element ? ancestor : (ancestor.parentElement ?? container);
  const scope = container.contains(ancestorElement) ? ancestorElement : container;

  const candidates = scope.matches?.('[data-segment-id]')
    ? [scope as HTMLElement]
    : Array.from(scope.querySelectorAll<HTMLElement>('[data-segment-id]'));

  return candidates.filter((element) => {
    const elementRange = contentsRange(element);

    // Interval overlap: the selection starts before this sentence ends, and
    // ends after this sentence starts. A DOM Range is always normalised with
    // start before end in document order, whichever way the user dragged, so
    // no anchor and focus ordering is needed here.
    const startsBeforeEnd = domRange.compareBoundaryPoints(Range.END_TO_START, elementRange) < 0;
    const endsAfterStart = domRange.compareBoundaryPoints(Range.START_TO_END, elementRange) > 0;
    return startsBeforeEnd && endsAfterStart;
  });
}

/**
 * The current document selection as an adoptable range, or null.
 *
 * Null covers every case where adoption must not happen: no selection, a
 * collapsed one (clicking already sets the active segment), a selection that
 * touches no transcript sentence, and a selection the application cannot see.
 */
export function readAdoptableSelection(
  container: HTMLElement | null,
  resolved: ResolvedSource,
): AdoptableSelection | null {
  if (!container || typeof document === 'undefined') return null;

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const domRange = selection.getRangeAt(0);
  const elements = touchedSegmentElements(container, domRange);
  if (elements.length === 0) return null;

  const ids = elements
    .map((element) => element.dataset.segmentId)
    .filter((id): id is Id => id !== undefined)
    .filter((id) => positionOf(resolved, id) !== null)
    .sort((a, b) => (positionOf(resolved, a) ?? 0) - (positionOf(resolved, b) ?? 0));

  if (ids.length === 0) return null;

  const first = elements.find((element) => element.dataset.segmentId === ids[0])!;
  const last = elements.find((element) => element.dataset.segmentId === ids[ids.length - 1])!;

  const firstRange = contentsRange(first);
  const lastRange = contentsRange(last);

  // Snapping never shrinks: the range is every sentence touched, expanded
  // outward. These flags only report whether that expansion happened, so the
  // announcement can name it.
  const extendedStart = domRange.compareBoundaryPoints(Range.START_TO_START, firstRange) > 0;
  const extendedEnd = domRange.compareBoundaryPoints(Range.END_TO_END, lastRange) < 0;

  return {
    range: { startSegmentId: ids[0], endSegmentId: ids[ids.length - 1] },
    extendedStart,
    extendedEnd,
    segmentCount: ids.length,
  };
}

/**
 * True when the selection collapsed inside the transcript itself.
 *
 * This distinguishes the user changing their mind from the browser tidying up.
 * Pressing any control clears the document selection on `mousedown`, and the
 * `selectionchange` that follows is queued, so it lands before the control's
 * click handler runs whenever a real hand is doing the pressing. Treating that
 * as "the user deselected" throws away the drag a moment before it is adopted.
 *
 * A collapse whose anchor is inside the transcript is a click or a fresh drag
 * there, and does mean the previous selection is finished with. A collapse
 * anywhere else, or a selection removed entirely, is not the user's doing.
 */
export function selectionCollapsedInside(container: HTMLElement | null): boolean {
  if (!container || typeof document === 'undefined') return false;

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;

  const anchor = selection.anchorNode;
  const element = anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
  return element !== null && container.contains(element);
}

/**
 * Drops the native selection once its range has been adopted.
 *
 * From that moment the application's own indicator is the only visible
 * selection. Two selection visuals at once is the parallel-concept confusion
 * D-034 exists to avoid.
 */
export function clearNativeSelection(): void {
  if (typeof document === 'undefined') return;
  document.getSelection()?.removeAllRanges();
}

/** True when the two ranges cover the same sentences. */
export function sameRange(a: ExcerptRange | null, b: ExcerptRange | null): boolean {
  if (!a || !b) return a === b;
  return a.startSegmentId === b.startSegmentId && a.endSegmentId === b.endSegmentId;
}
