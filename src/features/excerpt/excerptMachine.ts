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
   * The segment the excerpt began at. Revert returns the range here and both
   * discard paths return focus to its turn, per sections 3 and 6.
   */
  originSegmentId: Id | null;
}

export const IDLE: ExcerptSelection = { state: 'idle', range: null, originSegmentId: null };

export type ExcerptEvent =
  | { type: 'begin'; range: ExcerptRange; originSegmentId: Id }
  | { type: 'boundaryChange'; range: ExcerptRange }
  | { type: 'revert'; range: ExcerptRange }
  | { type: 'confirm' }
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
      // Only from idle. Beginning again over a live excerpt would silently
      // discard a range the user has not finished with.
      if (current.state !== 'idle') return current;
      return {
        state: 'anchored',
        range: event.range,
        originSegmentId: event.originSegmentId,
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
      // has moved.
      if (current.state !== 'adjusting') return current;
      return { ...current, state: 'anchored', range: event.range };

    case 'confirm':
      if (current.state !== 'anchored' && current.state !== 'adjusting') return current;
      return { ...current, state: 'confirmed' };

    case 'discard':
      // From every live state, including `confirmed`. Cancelling creates no
      // record, so this returns to idle and drops the range entirely.
      if (current.state === 'idle') return current;
      return IDLE;
  }
}
