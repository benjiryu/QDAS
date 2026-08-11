import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform, resolveEscape } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { excerptSegments, excerptSize, turnOf } from '../../domain';
import type { Id, ResolvedSource, SavedExcerptSummary, TranscriptSegment } from '../../domain';
import { clearNativeSelection, resolveCapture } from './capture';
import type { CaptureTarget } from './capture';
import { captured, discarded, EXCERPT_UNAVAILABLE } from './excerptAnnouncements';
import { excerptReducer, IDLE } from './excerptMachine';
import type { ExcerptSelection } from './excerptMachine';

/**
 * Excerpt capture: the state machine wired to the capture rule, the
 * announcement service, and focus.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 1, 3, 4, 6, and
 * decision D-036.
 *
 * The range lives here rather than in the browser's text selection, per D-001:
 * it has to survive focus moving away, persist across views, and be comparable
 * against another coder's differently bounded range, and a native selection can
 * do none of those. What changed in v0.2 is only where the range comes from —
 * the browser now supplies it, exactly as dragged, instead of the user building
 * it a boundary at a time.
 */

/** Section 4. Each carries a chord and a visible strip control. */
const CHORD_COMMANDS = ['excerpt.code', 'excerpt.note', 'excerpt.open'] as const satisfies
  readonly Command[];

export type ExcerptCommand = (typeof CHORD_COMMANDS)[number] | 'excerpt.discard';

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
  segmentsInRange: Set<Id>;
  startSegmentId: Id | null;
  endSegmentId: Id | null;
  /** Characters into the first and last segment, so the highlight is exact. */
  startOffset: number | null;
  endOffset: number | null;
  /**
   * Saved excerpts the active segment falls inside, offered for choice when
   * there is more than one. Empty when there is nothing to choose. D-030.
   */
  openChoices: SavedExcerptSummary[];
  chooseSavedExcerpt: (excerptId: Id) => void;
  dismissChoices: () => void;
  /** Opens one, or offers a choice among several. Used by the command and by a click. */
  runOpenAt: (summaries: SavedExcerptSummary[]) => void;
}

interface Options {
  resolved: ResolvedSource;
  /** The reading position, which the turn fallback falls back to. Section 1.1. */
  activeSegmentId?: Id | null;
  /** The element containing the rendered turns, which capture reads. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Capture and discard set the active segment, per transcript-segment 2.1. */
  onSetActiveSegment?: (segmentId: Id) => void;
  /** Escape belongs to the code panel while it is open, per section 4. */
  panelOpen?: boolean;
  /** Saved excerpts covering the active segment, for `excerpt.open`. D-030. */
  savedAt?: SavedExcerptSummary[];
  /** Opens the panel pre-populated with a saved excerpt's codes. */
  onReopen?: (summary: SavedExcerptSummary) => void;
  /** Capture opens code selection, focused per the command. Section 4. */
  onCapture?: (target: CaptureTarget) => void;
  /** Discard closes the panel; pending codes go with it. */
  onClosePanel?: () => void;
}

export function useExcerptSelection({
  resolved,
  activeSegmentId = null,
  containerRef,
  onSetActiveSegment,
  panelOpen = false,
  savedAt = [],
  onReopen,
  onCapture,
  onClosePanel,
}: Options): ExcerptSelectionApi {
  const announcer = useAnnouncer();
  const [selection, dispatch] = useReducer(excerptReducer, IDLE);

  /** Overlapping saved excerpts awaiting a choice. D-030 does not guess. */
  const [openChoices, setOpenChoices] = useState<SavedExcerptSummary[]>([]);

  /* ---------- Derived view of the range ---------- */

  const rangeSegments = useMemo(
    (): TranscriptSegment[] => (selection.range ? excerptSegments(resolved, selection.range) : []),
    [resolved, selection.range],
  );

  const segmentsInRange = useMemo(
    () => new Set(rangeSegments.map((segment) => segment.segmentId)),
    [rangeSegments],
  );

  /* ---------- Availability ---------- */

  const availability = useMemo((): Record<ExcerptCommand, CommandState> => {
    const state = selection.state;
    const captureable = state !== 'confirmed';

    const gate = (allowed: boolean, reason: string): CommandState =>
      allowed ? { available: true, reason: null } : { available: false, reason };

    // Section 4 lists both capture commands as always available: the capture
    // rule always resolves to something or says why it did not, so there is no
    // position to check first. The one gate is a capture already in progress.
    return {
      'excerpt.code': gate(captureable, EXCERPT_UNAVAILABLE.alreadyCapturing),
      'excerpt.note': gate(captureable, EXCERPT_UNAVAILABLE.alreadyCapturing),
      'excerpt.open': gate(
        captureable && savedAt.length > 0,
        captureable ? EXCERPT_UNAVAILABLE.noSavedExcerptHere : EXCERPT_UNAVAILABLE.alreadyCapturing,
      ),
      'excerpt.discard': gate(state === 'confirmed', EXCERPT_UNAVAILABLE.nothingToCapture),
    };
  }, [savedAt.length, selection.state]);

  /* ---------- Focus helpers ---------- */

  const focusTurnOf = useCallback(
    (segmentId: Id | null) => {
      if (!segmentId) return;
      const turn = turnOf(resolved, segmentId);
      const element = containerRef.current?.querySelector<HTMLElement>(
        `[data-turn-id="${turn?.turn.turnId}"]`,
      );
      element?.focus?.();
    },
    [containerRef, resolved],
  );

  /* ---------- Reopening a saved excerpt, per D-030 ---------- */

  const reopen = useCallback(
    (summary: SavedExcerptSummary) => {
      setOpenChoices([]);
      dispatch({ type: 'reopen', range: summary.range, excerptId: summary.excerptId });
      onReopen?.(summary);
    },
    [onReopen],
  );

  const runOpenAt = useCallback(
    (summaries: SavedExcerptSummary[]) => {
      if (summaries.length === 0) return;
      if (summaries.length === 1) {
        reopen(summaries[0]);
        return;
      }
      setOpenChoices(summaries);
      announcer.announce(
        `${summaries.length} saved excerpts cover this sentence. Choose which one to open.`,
      );
    },
    [announcer, reopen],
  );

  const chooseSavedExcerpt = useCallback(
    (excerptId: Id) => {
      const summary = openChoices.find((choice) => choice.excerptId === excerptId);
      if (summary) reopen(summary);
    },
    [openChoices, reopen],
  );

  const dismissChoices = useCallback(() => {
    setOpenChoices([]);
    announcer.announce('No excerpt opened.');
  }, [announcer]);

  /* ---------- Commands ---------- */

  const runCapture = useCallback(
    (target: CaptureTarget) => {
      const capture = resolveCapture(containerRef.current, resolved, activeSegmentId);

      // Step 3 of the capture rule: nothing to capture, so say so and do
      // nothing. Reached only with focus outside the transcript.
      if (!capture) {
        announcer.announce(EXCERPT_UNAVAILABLE.nothingToCapture);
        return;
      }

      dispatch({ type: 'capture', range: capture.range, source: capture.source });

      // Section 1.2: which rule fired is stated, never implied.
      announcer.announce(
        captured(capture.source, excerptSize(resolved, capture.range), capture.speakerLabel),
      );

      // Section 6: from here the application highlight is the only selection
      // visual, and it shows exactly what will be coded.
      clearNativeSelection();
      onSetActiveSegment?.(capture.range.startSegmentId);
      onCapture?.(target);
    },
    [activeSegmentId, announcer, containerRef, onCapture, onSetActiveSegment, resolved],
  );

  const run = useCallback(
    (command: ExcerptCommand) => {
      const status = availability[command];
      if (!status.available) {
        announcer.announce(status.reason ?? EXCERPT_UNAVAILABLE.nothingToCapture);
        return;
      }

      switch (command) {
        case 'excerpt.code':
          return runCapture('search');

        case 'excerpt.note':
          return runCapture('note');

        case 'excerpt.open':
          // One opens; two or more, the `coded-multiple` case, are presented
          // for choice. Guessing would silently edit the wrong excerpt. D-030.
          return runOpenAt(savedAt);

        case 'excerpt.discard': {
          const origin = selection.range?.startSegmentId ?? null;
          const reopened = selection.reopenedExcerptId !== null;
          dispatch({ type: 'discard' });
          onClosePanel?.();
          announcer.announce(discarded(reopened));
          if (origin) onSetActiveSegment?.(origin);
          // Section 6: focus returns to the turn the capture started in.
          focusTurnOf(origin);
          return;
        }
      }
    },
    [
      announcer,
      availability,
      focusTurnOf,
      onClosePanel,
      onSetActiveSegment,
      runCapture,
      runOpenAt,
      savedAt,
      selection.range,
      selection.reopenedExcerptId,
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
      // With the panel open it means cancel, which the panel owns; with no
      // panel there is nothing to capture out of, so it resolves to nothing.
      if (matched === 'codes.cancel') {
        void resolveEscape(panelOpen);
        return;
      }

      if (!(CHORD_COMMANDS as readonly Command[]).includes(matched)) return;

      event.preventDefault();
      run(matched as ExcerptCommand);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, panelOpen, run]);

  const markSaved = useCallback(() => dispatch({ type: 'save' }), []);

  return {
    selection,
    markSaved,
    run,
    availability,
    segmentsInRange,
    startSegmentId: selection.range?.startSegmentId ?? null,
    endSegmentId: selection.range?.endSegmentId ?? null,
    startOffset: selection.range?.startOffset ?? null,
    endOffset: selection.range?.endOffset ?? null,
    openChoices,
    chooseSavedExcerpt,
    dismissChoices,
    runOpenAt,
  };
}
