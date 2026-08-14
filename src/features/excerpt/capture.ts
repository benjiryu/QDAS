/**
 * The capture rule.
 *
 * Specification: docs/patterns/excerpt-selection.md section 1.1, decision D-036.
 *
 * One rule, three steps, resolved at the moment a command fires. There is no
 * standing listener and no adopted-selection state: v0.1 had those, and D-036
 * removed them along with the boundary machinery they fed.
 *
 * The honesty requirement lives here. NVDA and JAWS surface a browse-mode
 * selection to the DOM inconsistently, so the fallback fires often for exactly
 * the users least able to notice it fired. Which rule ran is reported to the
 * caller so the announcement can say so; a caller that dropped `source` would
 * let a coder believe their selection was captured when it was not.
 */

import { requireTurnOf, wholeSegments } from '../../domain';
import type { CapturedRange, Id, ResolvedSource } from '../../domain';

export type CaptureSource = 'selection' | 'turn';

/** Which panel field the capture command sends focus to. Section 4. */
export type CaptureTarget = 'search' | 'note';

export interface Capture {
  range: CapturedRange;
  /** Which step of the rule produced this range. Never inferred by the caller. */
  source: CaptureSource;
  /** Speaker at the start of the range, for the announcement. */
  speakerLabel: string | null;
}

/**
 * How many characters into a segment a selection boundary falls.
 *
 * Measured with a range rather than read off the node, because a segment that
 * is already highlighted has its text split across several nodes, and an offset
 * into the third of them is not an offset into the sentence.
 */
function offsetWithin(
  element: HTMLElement,
  node: Node,
  offset: number,
  fallback: number,
): number {
  // The boundary sits outside this segment: the selection ran past it, so the
  // segment is covered from whichever edge the caller names.
  if (!element.contains(node)) return fallback;

  const measure = element.ownerDocument.createRange();
  measure.selectNodeContents(element);
  try {
    measure.setEnd(node, offset);
  } catch {
    return fallback;
  }
  return measure.toString().length;
}

/** Segment elements the DOM range touches, in document order. */
function touchedSegments(container: HTMLElement, domRange: Range): HTMLElement[] {
  const ancestor = domRange.commonAncestorContainer;
  const ancestorElement =
    ancestor instanceof Element ? ancestor : (ancestor.parentElement ?? container);
  // Clamped to transcript content: a selection reaching outside still captures
  // only the transcript's sentences.
  const scope = container.contains(ancestorElement) ? ancestorElement : container;

  const candidates = scope.matches?.('[data-segment-id]')
    ? [scope as HTMLElement]
    : Array.from(scope.querySelectorAll<HTMLElement>('[data-segment-id]'));

  return candidates.filter((element) => {
    const elementRange = element.ownerDocument.createRange();
    const text = element.firstChild;
    if (text && text.nodeType === Node.TEXT_NODE) {
      elementRange.setStart(text, 0);
      elementRange.setEnd(text, (text as Text).length);
    } else {
      elementRange.selectNodeContents(element);
    }

    // Interval overlap. A DOM Range is normalised start-before-end whichever
    // way the drag went, so backward selection needs no special handling.
    return (
      domRange.compareBoundaryPoints(Range.END_TO_START, elementRange) < 0 &&
      domRange.compareBoundaryPoints(Range.START_TO_END, elementRange) > 0
    );
  });
}

/**
 * Step 1 on its own: an observable, non-collapsed selection intersecting the
 * transcript.
 *
 * Exported because the context menu in section 2 opens only when this step
 * would resolve. Asking the same function is what keeps "the menu appears" and
 * "the menu captures" from drifting apart.
 */
export function captureFromSelection(
  container: HTMLElement | null,
  resolved: ResolvedSource,
): Capture | null {
  if (!container || typeof document === 'undefined') return null;

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const domRange = selection.getRangeAt(0);
  const elements = touchedSegments(container, domRange);
  if (elements.length === 0) return null;

  const inOrder = elements
    .map((element) => ({ element, id: element.dataset.segmentId }))
    .filter((entry): entry is { element: HTMLElement; id: Id } => entry.id !== undefined)
    .map((entry) => ({ ...entry, position: resolved.segments.findIndex((s) => s.segmentId === entry.id) }))
    .filter((entry) => entry.position >= 0)
    .sort((a, b) => a.position - b.position);

  if (inOrder.length === 0) return null;

  const first = inOrder[0];
  const last = inOrder[inOrder.length - 1];
  const lastText = resolved.segments[last.position].text;

  // Exact to the character. Nothing snaps outward to a sentence: section 5.
  const range: CapturedRange = {
    startSegmentId: first.id,
    endSegmentId: last.id,
    startOffset: offsetWithin(first.element, domRange.startContainer, domRange.startOffset, 0),
    endOffset: offsetWithin(last.element, domRange.endContainer, domRange.endOffset, lastText.length),
  };

  return {
    range,
    source: 'selection',
    speakerLabel: requireTurnOf(resolved, first.id).speaker?.label ?? null,
  };
}

/**
 * Step 2: the focused speaker turn, captured whole.
 *
 * Turns are focusable per D-002, and since D-038 focus is the only position the
 * application knows, so this reads exactly as section 1.1 writes it. The
 * active-segment fallback this carried in v0.2's first pass went with the
 * navigation layer that made it necessary.
 */
function fromFocusedTurn(container: HTMLElement, resolved: ResolvedSource): Capture | null {
  const active = document.activeElement;
  const focusedElement =
    active instanceof Element ? active.closest<HTMLElement>('[data-turn-id]') : null;
  const focusedId =
    focusedElement && container.contains(focusedElement) ? focusedElement.dataset.turnId : null;

  const turn = focusedId
    ? resolved.turns.find((candidate) => candidate.turn.turnId === focusedId)
    : null;

  if (!turn || turn.segments.length === 0) return null;

  const range = wholeSegments(
    resolved,
    turn.segments[0].segmentId,
    turn.segments[turn.segments.length - 1].segmentId,
  );
  if (!range) return null;

  return { range, source: 'turn', speakerLabel: turn.speaker?.label ?? null };
}

/**
 * Resolves what to capture, per section 1.1.
 *
 * Returns null for step 3: focus outside the transcript with no selection,
 * where there is nothing to capture and the command says so.
 */
export function resolveCapture(
  container: HTMLElement | null,
  resolved: ResolvedSource,
): Capture | null {
  if (!container || typeof document === 'undefined') return null;
  return captureFromSelection(container, resolved) ?? fromFocusedTurn(container, resolved);
}

/**
 * Drops the native selection once its range has been captured.
 *
 * From that moment the application highlight is the only selection visual, and
 * it shows exactly what will be coded. Section 6.
 */
export function clearNativeSelection(): void {
  if (typeof document === 'undefined') return;
  document.getSelection()?.removeAllRanges();
}

/**
 * Puts the native selection back over a captured range.
 *
 * The dismissal half of the menu's preview. Painting the preview re-renders the
 * turn — a plain sentence becomes several runs — which replaces the text nodes
 * the browser's selection pointed into and collapses it. That is the right
 * trade while the menu is open, since the application highlight is then the
 * only selection visual and it survives focus moving into the menu. It is the
 * wrong outcome on dismissal: a coder who changed their mind about the menu did
 * not change their mind about the passage, and making them drag it again is a
 * cost the fix has no business imposing.
 *
 * Rebuilt from the stored range rather than held as a DOM Range, because a
 * cloned Range still points at the text nodes the re-render threw away.
 */
export function restoreNativeSelection(
  container: HTMLElement | null,
  range: CapturedRange,
): void {
  if (typeof document === 'undefined' || !container) return;

  const start = positionIn(container, range.startSegmentId, range.startOffset);
  const end = positionIn(container, range.endSegmentId, range.endOffset);
  if (!start || !end) return;

  const domRange = document.createRange();
  try {
    domRange.setStart(start.node, start.offset);
    domRange.setEnd(end.node, end.offset);
  } catch {
    // A range the DOM will not accept is not worth restoring over.
    return;
  }

  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(domRange);
}

/**
 * A character offset into a sentence, as a DOM position.
 *
 * The inverse of `offsetWithin`, and it walks the text nodes rather than
 * assuming one: a sentence carrying coded runs is already several.
 */
function positionIn(
  container: HTMLElement,
  segmentId: Id,
  offset: number,
): { node: Node; offset: number } | null {
  const element = container.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`);
  if (!element) return null;

  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let last: Text | null = null;

  let node = walker.nextNode() as Text | null;
  while (node) {
    if (remaining <= node.length) return { node, offset: remaining };
    remaining -= node.length;
    last = node;
    node = walker.nextNode() as Text | null;
  }

  // Past the end, which a clamped offset should not be. The last character is
  // closer to the truth than giving up.
  return last ? { node: last, offset: last.length } : null;
}
