/**
 * The excerpt selection state machine.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 2 and 3.
 *
 * Pure. No React, no DOM, no announcements, no focus. Every transition in the
 * table in section 3 is here and nothing else is, so a transition that the
 * specification does not name cannot happen by accident somewhere in a
 * component.
 *
 * There is no `cancelled` state: cancelling returns to `idle` and creates no
 * record, so a terminal state would never be observable. `saved` exists in the
 * type because the domain model has it, and the transition into it belongs to
 * code selection, which is a later task.
 */

import type { ExcerptRange } from '../../domain';
import type { ExcerptSelectionState, Id } from '../../domain';

export interface ExcerptSelection {
  state: ExcerptSelectionState;
  /** Null only in `idle`. */
  range: ExcerptRange | null;
  /**
   * The segment the excerpt began at. Both discard paths return focus to its
   * turn, per sections 3 and 6.
   */
  originSegmentId: Id | null;
  /**
   * The range as it stood at origin, which revert returns to.
   *
   * A range rather than a single segment because D-034 generalises `anchored`
   * to mean the range sits at its origin, whether that origin is the active
   * segment or an adopted native selection. Reverting an adopted excerpt to one
   * sentence would silently discard most of what the user dragged.
   */
  originRange: ExcerptRange | null;
}

export const IDLE: ExcerptSelection = {
  state: 'idle',
  range: null,
  originSegmentId: null,
  originRange: null,
};

export type ExcerptEvent =
  | { type: 'begin'; range: ExcerptRange; originSegmentId: Id }
  | { type: 'boundaryChange'; range: ExcerptRange }
  | { type: 'revert' }
  | { type: 'confirm' }
  | { type: 'save' }
  | { type: 'discard' };

/** States in which the range exists and its boundaries can be adjusted. */
const ADJUSTABLE: ExcerptSelectionState[] = ['anchored', 'adjusting', 'confirmed'];

export function canAdjust(state: ExcerptSelectionState): boolean {
  return ADJUSTABLE.includes(state);
}

/**
 * Applies an event, or returns the current selection unchanged when the
 * specification does not define that transition.
 *
 * Returning the same object for a no-op lets a caller tell "nothing happened"
 * from "something happened" by identity, which is what decides whether there is
 * anything to announce.
 */
export function excerptReducer(
  current: ExcerptSelection,
  event: ExcerptEvent,
): ExcerptSelection {
  switch (event.type) {
    case 'begin':
      // From idle, and from saved: the previous excerpt is a stored record
      // rather than something in progress, so beginning the next one discards
      // nothing. Section 3 gives no transition out of `saved`, and without this
      // the workflow ends after a single excerpt. Flagged in the task report.
      if (current.state !== 'idle' && current.state !== 'saved') return current;
      return {
        state: 'anchored',
        range: event.range,
        originSegmentId: event.originSegmentId,
        originRange: event.range,
      };

    case 'boundaryChange':
      // From `confirmed` too: the range reopens for editing rather than being
      // locked. That is the recovery path, and the most common reason to back
      // out of code selection is realising the boundaries are wrong.
      if (!canAdjust(current.state)) return current;
      return { ...current, state: 'adjusting', range: event.range };

    case 'revert':
      // Only from `adjusting`, which is why `anchored` and `adjusting` are
      // separate states at all: the revert control exists only once something
      // has moved. The range returns to its origin, whatever that origin was.
      if (current.state !== 'adjusting' || !current.originRange) return current;
      return { ...current, state: 'anchored', range: current.originRange };

    case 'confirm':
      if (current.state !== 'anchored' && current.state !== 'adjusting') return current;
      return { ...current, state: 'confirmed' };

    case 'save':
      // Section 3: confirmed, save with at least one code, saved. The range
      // moves into the stored record, so the live selection is cleared and the
      // transcript shows it as coded from that record instead.
      if (current.state !== 'confirmed') return current;
      return { state: 'saved', range: null, originSegmentId: null, originRange: null };

    case 'discard':
      // From every live state, including `confirmed`. Cancelling creates no
      // record, so this returns to idle and drops the range entirely.
      if (current.state === 'idle') return current;
      return IDLE;
  }
}
