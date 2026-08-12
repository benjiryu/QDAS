import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform, resolveEscape } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { excerptSegments, excerptSize, turnOf } from '../../domain';
import type { Id, ResolvedSource, SavedExcerptSummary, TranscriptSegment } from '../../domain';
import { captureFromSelection, clearNativeSelection, resolveCapture } from './capture';
import type { Capture, CaptureTarget } from './capture';
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

/**
 * The context menu's keyboard route, per D-037.
 *
 * Not in `CHORD_COMMANDS`, because it invokes nothing: it opens a menu whose
 * two items are the two capture commands above. Contract 2.2 asks that every
 * command be keyboard-operable and every keyboard command have a visible
 * control; the strip's Code selection and Add note controls are this menu's
 * visible equivalent, which is exactly what D-037 requires of it.
 */
const MENU_COMMAND: Command = 'excerpt.menu';

export type ExcerptCommand = (typeof CHORD_COMMANDS)[number] | 'excerpt.discard';

export interface CommandState {
  available: boolean;
  /** Announced on attempt and available to a disabled control, per 2.6. */
  reason: string | null;
}

/**
 * The context menu, per section 2 and D-037.
 *
 * The capture is snapshotted when the menu opens rather than resolved when an
 * item is chosen. Opening a menu moves focus into it, and how a browser treats
 * the document selection while focus sits in a popover is not something the
 * pattern should depend on. The menu opened on a selection, so that selection
 * is what it captures.
 */
export interface ExcerptMenuState {
  isOpen: boolean;
  /** Viewport coordinates to anchor at: the pointer, or the selection. */
  x: number;
  y: number;
  close: () => void;
  /** Runs the chosen item against the snapshot taken when the menu opened. */
  choose: (target: CaptureTarget) => void;
}

export interface ExcerptSelectionApi {
  selection: ExcerptSelection;
  menu: ExcerptMenuState;
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
  /** The element containing the rendered turns, which capture reads. */
  containerRef: React.RefObject<HTMLDivElement | null>;
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
  /**
   * The capture to resume, per D-044.
   *
   * A coder who left this source mid-capture and came back gets the range they
   * had. Lazy initial state rather than an effect that restores after the first
   * render, which would paint an empty transcript first and would have to write
   * state from an effect.
   */
  initialSelection?: ExcerptSelection;
}

export function useExcerptSelection({
  resolved,
  containerRef,
  panelOpen = false,
  savedAt = [],
  onReopen,
  onCapture,
  onClosePanel,
  initialSelection = IDLE,
}: Options): ExcerptSelectionApi {
  const announcer = useAnnouncer();
  const [selection, dispatch] = useReducer(excerptReducer, initialSelection);

  /** Overlapping saved excerpts awaiting a choice. D-030 does not guess. */
  const [openChoices, setOpenChoices] = useState<SavedExcerptSummary[]>([]);

  /** The open context menu, with the selection it opened on. */
  const [menuState, setMenuState] = useState<{ x: number; y: number; capture: Capture } | null>(
    null,
  );
  /** Where focus was before the menu took it, for the return in contract 2.4. */
  const menuReturnRef = useRef<HTMLElement | null>(null);

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

      // After the code panel's dialog has finished unwinding its own focus
      // restore. The dialog puts focus back where it was before it opened; the
      // workflow says where the reader goes next, and the workflow wins.
      queueMicrotask(() => element?.focus?.());
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

  /** Everything that happens once a range has been resolved, however it was. */
  const applyCapture = useCallback(
    (capture: Capture, target: CaptureTarget) => {
      dispatch({ type: 'capture', range: capture.range, source: capture.source });

      // Section 1.2: which rule fired is stated, never implied.
      announcer.announce(
        captured(capture.source, excerptSize(resolved, capture.range), capture.speakerLabel),
      );

      // Section 6: from here the application highlight is the only selection
      // visual, and it shows exactly what will be coded.
      clearNativeSelection();
      onCapture?.(target);
    },
    [announcer, onCapture, resolved],
  );

  const runCapture = useCallback(
    (target: CaptureTarget) => {
      const capture = resolveCapture(containerRef.current, resolved);

      // Step 3 of the capture rule: nothing to capture, so say so and do
      // nothing. Reached only with focus outside the transcript.
      if (!capture) {
        announcer.announce(EXCERPT_UNAVAILABLE.nothingToCapture);
        return;
      }

      applyCapture(capture, target);
    },
    [announcer, applyCapture, containerRef, resolved],
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
          // Section 6: focus returns to the turn the capture started in, which
          // since D-038 is also what restores the reading position.
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
      runCapture,
      runOpenAt,
      savedAt,
      selection.range,
      selection.reopenedExcerptId,
    ],
  );

  /* ---------- The context menu, per section 2 and D-037 ---------- */

  const openMenuAt = useCallback(
    (capture: Capture, x: number, y: number) => {
      // Where focus was, so Escape can put it back. Contract 2.4.
      menuReturnRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMenuState({ x, y, capture });
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setMenuState(null);
    // Back where it came from. A menu that dismissed to nowhere would leave a
    // screen reader user at the top of the document.
    const target = menuReturnRef.current;
    menuReturnRef.current = null;

    // After the overlay has finished unwinding its own focus handling, which
    // otherwise lands on the positioning anchor and leaves focus on the body.
    const startSegmentId = selection.range?.startSegmentId ?? null;
    queueMicrotask(() => {
      if (target?.isConnected) target.focus?.();
      else focusTurnOf(startSegmentId);
    });
  }, [focusTurnOf, selection.range]);

  const chooseFromMenu = useCallback(
    (target: CaptureTarget) => {
      const capture = menuState?.capture;
      setMenuState(null);
      // No focus restore: capture opens the panel, which owns where focus goes.
      menuReturnRef.current = null;
      if (capture) applyCapture(capture, target);
    },
    [applyCapture, menuState],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onContextMenu(event: MouseEvent) {
      // Only over the transcript, and only with a selection the application can
      // act on. Everywhere else the browser's own menu is untouched, which is
      // the cost D-037 explicitly accepted only for this one case.
      const capture = captureFromSelection(containerRef.current, resolved);
      if (!capture) return;

      event.preventDefault();
      openMenuAt(capture, event.clientX, event.clientY);
    }

    container.addEventListener('contextmenu', onContextMenu);
    return () => container.removeEventListener('contextmenu', onContextMenu);
  }, [containerRef, openMenuAt, resolved]);

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
      // With the panel open it means close, which the panel owns; with no
      // panel there is nothing to capture out of, so it resolves to nothing.
      if (matched === 'codes.close') {
        void resolveEscape(panelOpen);
        return;
      }

      // Shift+F10 and the applications key, per D-037. Anchored on the
      // selection rather than the pointer, since there is no pointer.
      if (matched === MENU_COMMAND) {
        const capture = captureFromSelection(containerRef.current, resolved);
        // With no selection there is nothing for the menu to act on, so the
        // key keeps its usual meaning rather than opening an empty menu.
        if (!capture) return;

        // Anchored to the selection's own box where the environment can
        // measure one. Position is presentation: the menu opens either way.
        const range = document.getSelection()?.getRangeAt(0);
        const rect = range?.getBoundingClientRect?.();
        event.preventDefault();
        openMenuAt(capture, rect?.left ?? 0, rect?.bottom ?? 0);
        return;
      }

      if (!(CHORD_COMMANDS as readonly Command[]).includes(matched)) return;

      event.preventDefault();
      run(matched as ExcerptCommand);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, containerRef, openMenuAt, panelOpen, resolved, run]);

  const markSaved = useCallback(() => dispatch({ type: 'save' }), []);

  return {
    selection,
    menu: {
      isOpen: menuState !== null,
      x: menuState?.x ?? 0,
      y: menuState?.y ?? 0,
      close: closeMenu,
      choose: chooseFromMenu,
    },
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
