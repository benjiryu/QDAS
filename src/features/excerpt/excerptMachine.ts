/**
 * The excerpt capture state machine.
 *
 * Specification: docs/patterns/excerpt-selection.md section 3, decision D-036.
 *
 * Pure. Three states, four transitions, and nothing else. v0.1's `anchored` and
 * `adjusting` are gone with the boundary commands that justified them: there is
 * no adjustment phase, and fixing a wrong range means cancelling and
 * reselecting. That machine is preserved at tag `v0.1`.
 */

import type { CapturedRange, ExcerptSelectionState, Id } from '../../domain';
import type { CaptureSource } from './capture';

export interface ExcerptSelection {
  state: ExcerptSelectionState;
  /** Null in `idle` and after a save. Exact to the character while captured. */
  range: CapturedRange | null;
  /** Which rule produced the range, so a caller never has to guess. */
  source: CaptureSource | null;
  /**
   * The saved excerpt this reopened, per D-030. Non-null means the range is
   * locked and save writes the difference rather than a new set.
   */
  reopenedExcerptId: Id | null;
}

export const IDLE: ExcerptSelection = {
  state: 'idle',
  range: null,
  source: null,
  reopenedExcerptId: null,
};

export type ExcerptEvent =
  | { type: 'capture'; range: CapturedRange; source: CaptureSource }
  | { type: 'reopen'; range: CapturedRange; excerptId: Id }
  | { type: 'save' }
  | { type: 'discard' };

export function excerptReducer(
  current: ExcerptSelection,
  event: ExcerptEvent,
): ExcerptSelection {
  switch (event.type) {
    case 'capture':
      // Straight to `confirmed`: capture opens the panel, and there is no
      // phase in between. Capturing again replaces the range, which is what
      // cancel-and-reselect looks like when the panel is not open.
      if (current.state === 'confirmed') return current;
      return {
        state: 'confirmed',
        range: event.range,
        source: event.source,
        reopenedExcerptId: null,
      };

    case 'reopen':
      // D-030: the range is locked and the assignments are preloaded.
      if (current.state === 'confirmed') return current;
      return {
        state: 'confirmed',
        range: event.range,
        source: null,
        reopenedExcerptId: event.excerptId,
      };

    case 'save':
      if (current.state !== 'confirmed') return current;
      return { state: 'saved', range: null, source: null, reopenedExcerptId: null };

    case 'discard':
      // Cancelling the panel discards the capture and creates nothing.
      if (current.state === 'idle') return current;
      return IDLE;
  }
}
