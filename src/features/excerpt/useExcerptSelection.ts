import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import type { PrototypeFlags } from '../../config/flags';
import {
  bindingsFor,
  commandFor,
  detectPlatform,
  resolveEscape,
} from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import {
  contextAfter,
  contextBefore,
  contractEnd,
  contractStart,
  createExcerptAt,
  excerptAvailability,
  excerptDelta,
  excerptSegments,
  excerptSize,
  excerptText,
  expandEnd,
  expandEndByTurn,
  expandStart,
  expandStartByTurn,
  requireTurnOf,
  segmentById,
  turnOf,
} from '../../domain';
import type { ExcerptRange, Id, ResolvedSource, TranscriptSegment } from '../../domain';
import {
  adopted,
  adoptedAndConfirmed,
  begun,
  boundaryChanged,
  confirmed,
  contextSentence,
  discarded,
  EXCERPT_UNAVAILABLE,
  readExcerpt,
  reverted,
  speakersText,
  timestampsText,
} from './excerptAnnouncements';
import { canAdjust, excerptReducer, IDLE } from './excerptMachine';
import type { ExcerptSelection } from './excerptMachine';
import type { NativeSelectionApi } from './useNativeSelection';

/**
 * Excerpt selection: the state machine wired to boundary operations, the
 * announcement service, and focus.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 3, 4, 4.1, 5, 6.
 *
 * The range lives here rather than in the browser's text selection, per D-001:
 * it has to survive focus moving away, persist across views, and be comparable
 * against another coder's differently bounded range, and native selection can
 * do none of those.
 */

/** The thirteen commands in section 4, all of which carry a chord. */
const CHORD_COMMANDS = [
  'excerpt.begin',
  'excerpt.start.expand',
  'excerpt.start.contract',
  'excerpt.end.expand',
  'excerpt.end.contract',
  'excerpt.start.expandTurn',
  'excerpt.end.expandTurn',
  'excerpt.read',
  'excerpt.contextBefore',
  'excerpt.contextAfter',
  'excerpt.revert',
  'excerpt.confirm',
  'excerpt.discard',
] as const satisfies readonly Command[];

/**
 * Section 5 also makes speakers and timestamps available on request, without
 * giving them commands in section 4. They are controls with no chord: the
 * contract requires every command to have a control, not the reverse. If they
 * should be reachable by chord, keybindings.ts has to define them first.
 */
export type ExcerptCommand =
  | (typeof CHORD_COMMANDS)[number]
  | 'excerpt.speakers'
  | 'excerpt.timestamps';

export interface CommandState {
  available: boolean;
  /** Announced on attempt and available to a disabled control, per 2.6. */
  reason: string | null;
}

export interface ExcerptSelectionApi {
  selection: ExcerptSelection;
  /** Records the save transition once the records exist. Section 3. */
  markSaved: () => void;
  run: (command: ExcerptCommand) => void;
  availability: Record<ExcerptCommand, CommandState>;
  /** Focus lands here when an excerpt begins, per section 6. */
  firstControlRef: React.RefObject<HTMLButtonElement | null>;
  segmentsInRange: Set<Id>;
  startSegmentId: Id | null;
  endSegmentId: Id | null;
}

interface Options {
  resolved: ResolvedSource;
  activeSegmentId: Id | null;
  flags: PrototypeFlags;
  /** The element containing the rendered turns, for focus and scrolling. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Confirming or cancelling sets the active segment, per transcript-segment 2.1. */
  onSetActiveSegment?: (segmentId: Id) => void;
  /** Escape belongs to the code panel while it is open, per section 4.1. */
  panelOpen?: boolean;
  /** Confirm opens code selection, per section 3 and code-selection section 9. */
  onConfirm?: () => void;
  /**
   * A boundary command from `confirmed` closes the panel, and so does discard.
   * Pending codes are held by the panel, per code-selection section 8.
   */
  onClosePanel?: () => void;
  /**
   * The current native selection, when the application can observe one.
   * Adoption is opportunistic: with none, every control behaves per D-029.
   */
  nativeSelection?: NativeSelectionApi;
}

export function useExcerptSelection({
  resolved,
  activeSegmentId,
  flags,
  containerRef,
  onSetActiveSegment,
  panelOpen = false,
  onConfirm,
  onClosePanel,
  nativeSelection,
}: Options): ExcerptSelectionApi {
  const announcer = useAnnouncer();
  const [selection, dispatch] = useReducer(excerptReducer, IDLE);
  const adoptable = nativeSelection?.adoptable ?? null;
  const firstControlRef = useRef<HTMLButtonElement | null>(null);

  /** Which turn holds focus, so `excerpt.begin` can start from it. */
  const [focusedTurnId, setFocusedTurnId] = useState<Id | null>(null);

  /**
   * How far out the context walk has gone in each direction. Section 5 offers
   * context "one sentence at a time", which is read here as walking outward on
   * repeated invocation rather than repeating the same sentence. Reset whenever
   * the range changes, so context is always relative to the current boundaries.
   */
  const contextCursor = useRef({ before: 0, after: 0 });

  useEffect(() => {
    contextCursor.current = { before: 0, after: 0 };
  }, [selection.range]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      const turn = target instanceof Element ? target.closest('[data-turn-id]') : null;
      setFocusedTurnId(turn?.getAttribute('data-turn-id') ?? null);
    };

    container.addEventListener('focusin', onFocusIn);
    return () => container.removeEventListener('focusin', onFocusIn);
  }, [containerRef]);

  /* ---------- Derived view of the range ---------- */

  const rangeSegments = useMemo(
    (): TranscriptSegment[] =>
      selection.range ? excerptSegments(resolved, selection.range) : [],
    [resolved, selection.range],
  );

  const segmentsInRange = useMemo(
    () => new Set(rangeSegments.map((segment) => segment.segmentId)),
    [rangeSegments],
  );

  /* ---------- Availability ---------- */

  const availability = useMemo((): Record<ExcerptCommand, CommandState> => {
    const state = selection.state;
    const live = canAdjust(state);
    const boundaries = selection.range
      ? excerptAvailability(resolved, selection.range)
      : null;

    const gate = (allowed: boolean, reason: string): CommandState =>
      allowed ? { available: true, reason: null } : { available: false, reason };

    const boundary = (command: keyof NonNullable<typeof boundaries>): CommandState => {
      if (!live || !boundaries) return gate(false, EXCERPT_UNAVAILABLE.noExcerpt);
      const entry = boundaries[command];
      return entry.available
        ? { available: true, reason: null }
        : { available: false, reason: EXCERPT_UNAVAILABLE[entry.reason ?? 'invalidRange'] };
    };

    return {
      // A selection is a third way in, alongside the active segment and a
      // focused turn. D-034, section 4.0.
      'excerpt.begin': gate(
        (state === 'idle' || state === 'saved') &&
          (activeSegmentId !== null || focusedTurnId !== null || adoptable !== null),
        state === 'idle' || state === 'saved'
          ? EXCERPT_UNAVAILABLE.noPosition
          : EXCERPT_UNAVAILABLE.alreadyStarted,
      ),
      'excerpt.start.expand': boundary('excerpt.start.expand'),
      'excerpt.start.contract': boundary('excerpt.start.contract'),
      'excerpt.end.expand': boundary('excerpt.end.expand'),
      'excerpt.end.contract': boundary('excerpt.end.contract'),
      'excerpt.start.expandTurn': boundary('excerpt.start.expandTurn'),
      'excerpt.end.expandTurn': boundary('excerpt.end.expandTurn'),
      'excerpt.contextBefore': boundary('excerpt.contextBefore'),
      'excerpt.contextAfter': boundary('excerpt.contextAfter'),
      'excerpt.read': gate(live, EXCERPT_UNAVAILABLE.noExcerpt),
      'excerpt.speakers': gate(live, EXCERPT_UNAVAILABLE.noExcerpt),
      'excerpt.timestamps': gate(live, EXCERPT_UNAVAILABLE.noExcerpt),
      'excerpt.revert': gate(state === 'adjusting', EXCERPT_UNAVAILABLE.notAdjusted),
      // Enabled in `idle` when a selection exists, with adoption as its action:
      // one click from drag to codebook. Otherwise its disabled reason stands.
      'excerpt.confirm': gate(
        state === 'anchored' || state === 'adjusting' || (state === 'idle' && adoptable !== null),
        state === 'confirmed'
          ? EXCERPT_UNAVAILABLE.alreadyConfirmed
          : EXCERPT_UNAVAILABLE.noExcerpt,
      ),
      'excerpt.discard': gate(live, EXCERPT_UNAVAILABLE.noExcerpt),
    };
  }, [activeSegmentId, adoptable, focusedTurnId, resolved, selection.range, selection.state]);

  /* ---------- Focus and scrolling helpers ---------- */

  const focusOriginTurn = useCallback(
    (originSegmentId: Id | null) => {
      if (!originSegmentId) return;
      const turn = turnOf(resolved, originSegmentId);
      const element = containerRef.current?.querySelector<HTMLElement>(
        `[data-turn-id="${turn?.turn.turnId}"]`,
      );
      element?.focus?.();
    },
    [containerRef, resolved],
  );

  const scrollBoundaryIntoView = useCallback(
    (segmentId: Id) => {
      // Only the boundary that moved. Section 7: the other boundary does not
      // move, and the scroll does not reset to the top of the range.
      const element = containerRef.current?.querySelector<HTMLElement>(
        `[data-segment-id="${segmentId}"]`,
      );
      element?.scrollIntoView?.({ block: 'nearest' });
    },
    [containerRef],
  );

  /* ---------- Boundary changes ---------- */

  const applyBoundaryChange = useCallback(
    (next: ExcerptRange | null, reason: string) => {
      const current = selection.range;
      if (!current) {
        announcer.announce(EXCERPT_UNAVAILABLE.noExcerpt);
        return;
      }
      if (!next) {
        // Unavailable rather than silently clamped, and it says why.
        announcer.announce(reason);
        return;
      }

      const delta = excerptDelta(resolved, current, next);
      const wasConfirmed = selection.state === 'confirmed';
      dispatch({ type: 'boundaryChange', range: next });

      // Section 4: invoking a boundary command from `confirmed` reopens the
      // excerpt for editing and closes code selection, holding pending codes.
      if (wasConfirmed) onClosePanel?.();

      announcer.announce(
        boundaryChanged(
          delta,
          excerptSize(resolved, next),
          excerptText(resolved, next),
          flags.boundaryChangeAnnouncement,
          flags.deltaTruncationWords,
        ),
      );

      const movedBoundary =
        next.startSegmentId !== current.startSegmentId ? next.startSegmentId : next.endSegmentId;
      scrollBoundaryIntoView(movedBoundary);
    },
    [announcer, flags, onClosePanel, resolved, scrollBoundaryIntoView, selection.range, selection.state],
  );

  /* ---------- Commands ---------- */

  const run = useCallback(
    (command: ExcerptCommand) => {
      const { state, range, originSegmentId } = selection;
      const status = availability[command];

      if (!status.available) {
        announcer.announce(status.reason ?? EXCERPT_UNAVAILABLE.noExcerpt);
        return;
      }

      switch (command) {
        case 'excerpt.begin': {
          // A selection the application can see is adopted whole, snapped
          // outward to sentence boundaries, and becomes the origin.
          if (adoptable) {
            dispatch({
              type: 'begin',
              range: adoptable.range,
              originSegmentId: adoptable.range.startSegmentId,
            });
            announcer.announce(
              adopted(
                excerptSize(resolved, adoptable.range),
                adoptable.extendedStart || adoptable.extendedEnd,
              ),
            );
            nativeSelection?.clear();
            firstControlRef.current?.focus?.();
            return;
          }

          // From the active segment, or from the last sentence of the turn
          // holding focus: a user who has just read a turn straight through is
          // at its end. transcript-segment.md section 2.3.
          let origin = activeSegmentId;
          if (!origin && focusedTurnId) {
            const turn = resolved.turns.find((candidate) => candidate.turn.turnId === focusedTurnId);
            origin = turn?.segments[turn.segments.length - 1]?.segmentId ?? null;
          }
          if (!origin) {
            announcer.announce(EXCERPT_UNAVAILABLE.noPosition);
            return;
          }

          const initial = createExcerptAt(resolved, origin, flags.excerptInitialRange);
          if (!initial) return;

          dispatch({ type: 'begin', range: initial, originSegmentId: origin });
          announcer.announce(
            begun(segmentById(resolved, initial.startSegmentId)!.text, excerptSize(resolved, initial)),
          );
          // Section 6: focus goes to the excerpt toolbar, first control.
          firstControlRef.current?.focus?.();
          return;
        }

        case 'excerpt.start.expand':
          return applyBoundaryChange(expandStart(resolved, range!), status.reason ?? '');
        case 'excerpt.start.contract':
          return applyBoundaryChange(contractStart(resolved, range!), status.reason ?? '');
        case 'excerpt.end.expand':
          return applyBoundaryChange(expandEnd(resolved, range!), status.reason ?? '');
        case 'excerpt.end.contract':
          return applyBoundaryChange(contractEnd(resolved, range!), status.reason ?? '');
        case 'excerpt.start.expandTurn':
          return applyBoundaryChange(expandStartByTurn(resolved, range!), status.reason ?? '');
        case 'excerpt.end.expandTurn':
          return applyBoundaryChange(expandEndByTurn(resolved, range!), status.reason ?? '');

        case 'excerpt.read':
          announcer.announce(
            readExcerpt(excerptSize(resolved, range!), excerptText(resolved, range!)),
          );
          return;

        case 'excerpt.speakers': {
          const segments = excerptSegments(resolved, range!);
          announcer.announce(
            speakersText(
              requireTurnOf(resolved, segments[0].segmentId).speaker?.label ?? null,
              requireTurnOf(resolved, segments[segments.length - 1].segmentId).speaker?.label ??
                null,
            ),
          );
          return;
        }

        case 'excerpt.timestamps': {
          const segments = excerptSegments(resolved, range!);
          announcer.announce(
            timestampsText(segments[0].startTimeMs, segments[segments.length - 1].endTimeMs),
          );
          return;
        }

        case 'excerpt.contextBefore':
        case 'excerpt.contextAfter': {
          // Reading context never changes the range and never moves focus. If it
          // did, the user would lose their place in the adjustment sequence
          // every time they checked whether to expand further.
          const before = command === 'excerpt.contextBefore';
          const cursor = contextCursor.current;
          const depth = (before ? cursor.before : cursor.after) + 1;
          const sentences = before
            ? contextBefore(resolved, range!, depth)
            : contextAfter(resolved, range!, depth);

          const sentence = before ? sentences[0] : sentences[sentences.length - 1];
          if (!sentence || sentences.length < depth) {
            announcer.announce(
              before ? EXCERPT_UNAVAILABLE.atSourceStart : EXCERPT_UNAVAILABLE.atSourceEnd,
            );
            return;
          }

          if (before) cursor.before = depth;
          else cursor.after = depth;
          announcer.announce(contextSentence(before ? 'before' : 'after', sentence));
          return;
        }

        case 'excerpt.revert': {
          // Back to the range as it stood at origin, which for an adopted
          // selection is everything the user dragged.
          const origin = selection.originRange;
          if (!origin) return;
          dispatch({ type: 'revert' });
          announcer.announce(
            reverted(
              segmentById(resolved, origin.startSegmentId)!.text,
              excerptSize(resolved, origin),
            ),
          );
          return;
        }

        case 'excerpt.confirm': {
          if ((state === 'idle' || state === 'saved') && adoptable) {
            // Adopt, snap, confirm, open the panel: one action, which is the
            // mouse user's expectation. D-034.
            dispatch({
              type: 'begin',
              range: adoptable.range,
              originSegmentId: adoptable.range.startSegmentId,
            });
            dispatch({ type: 'confirm' });
            announcer.announce(
              adoptedAndConfirmed(
                excerptSize(resolved, adoptable.range),
                adoptable.extendedStart || adoptable.extendedEnd,
              ),
            );
            nativeSelection?.clear();
            onSetActiveSegment?.(adoptable.range.startSegmentId);
            onConfirm?.();
            return;
          }

          dispatch({ type: 'confirm' });
          announcer.announce(confirmed(excerptSize(resolved, range!)));
          onSetActiveSegment?.(range!.startSegmentId);
          // Section 6 sends focus to the code panel's search field; the panel
          // owns that move, and this opens it.
          onConfirm?.();
          return;
        }

        case 'excerpt.discard': {
          const origin = originSegmentId;
          dispatch({ type: 'discard' });
          onClosePanel?.();
          announcer.announce(discarded());
          if (origin) onSetActiveSegment?.(origin);
          // Section 6: focus returns to the origin segment's turn container,
          // from `anchored`, `adjusting`, and `confirmed` alike.
          focusOriginTurn(origin);
          return;
        }
      }

      // Exhaustive above; `state` is read only for the guards.
      void state;
    },
    [
      activeSegmentId,
      adoptable,
      announcer,
      applyBoundaryChange,
      availability,
      flags.excerptInitialRange,
      focusOriginTurn,
      focusedTurnId,
      nativeSelection,
      onClosePanel,
      onConfirm,
      onSetActiveSegment,
      resolved,
      selection,
    ],
  );

  /* ---------- Chords ---------- */

  const bindings = useMemo(() => bindingsFor(detectPlatform()), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      const matched = commandFor(event, bindings);
      if (!matched) return;

      // Escape is the one chord whose meaning depends on context, so the
      // resolution lives in the binding module rather than in a branch here.
      // With the panel open it means cancel, which the panel owns.
      const command = matched === 'codes.cancel' ? resolveEscape(panelOpen) : matched;

      if (!(CHORD_COMMANDS as readonly Command[]).includes(command)) return;

      // Section 4.1: Escape discards only in anchored and adjusting. In
      // confirmed it belongs to the panel, and discarding a confirmed excerpt
      // takes the explicit control.
      if (matched === 'codes.cancel' && selection.state !== 'anchored' && selection.state !== 'adjusting') {
        return;
      }

      event.preventDefault();
      run(command as ExcerptCommand);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, panelOpen, run, selection.state]);

  const markSaved = useCallback(() => dispatch({ type: 'save' }), []);

  return {
    selection,
    markSaved,
    run,
    availability,
    firstControlRef,
    segmentsInRange,
    startSegmentId: selection.range?.startSegmentId ?? null,
    endSegmentId: selection.range?.endSegmentId ?? null,
  };
}
