import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform, resolveEscape } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { excerptSegments, excerptSize, turnOf } from '../../domain';
import type {
  CapturedRange,
  Id,
  ResolvedSource,
  SavedExcerptSummary,
  TranscriptSegment,
} from '../../domain';
import {
  captureFromSelection,
  clearNativeSelection,
  resolveCapture,
  restoreNativeSelection,
} from './capture';
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
const CHORD_COMMANDS = [
  'excerpt.code',
  'excerpt.note',
  'excerpt.open',
  'note.open',
] as const satisfies readonly Command[];

/**
 * The context menu's keyboard route, per D-037.
 *
 * Not in `CHORD_COMMANDS`, because it invokes nothing: it opens a menu whose
 * two items are the two capture commands above. Contract 2.2 asks that every
 * command be keyboard-operable and every keyboard command have a visible
 * control; the strip's Assign code and Add note controls are this menu's
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

/**
 * What choosing from the chooser will do, per D-055.
 *
 * The disambiguation is the same question either way — which of these overlapping
 * excerpts do you mean — so it is the same list, the same focus rules, and one
 * set of wording that follows the intent. A second chooser beside the first
 * would be a second thing to keep in step for no difference the coder can see.
 */
export type ChoiceIntent =
  /** Reopen for coding, whatever the excerpt carries. `excerpt.open`. */
  | 'code'
  /** Open the note, including on an excerpt that also has codes. `note.open`. */
  | 'note'
  /**
   * Ask each excerpt what it is. The pointer route.
   *
   * Per excerpt rather than per invocation, which is the grain the question
   * actually has: a sentence can be covered by one coded excerpt and one
   * carrying only a note, and the right destination differs by row. Deciding
   * once when the chooser opens would have to guess for half the list.
   *
   * Clicking is "open what is here", so it answers with whatever is here. The
   * two chords say what they want and get it: `excerpt.open` reopens for
   * coding, `note.open` reaches the note.
   */
  | 'auto';

/**
 * Whether this excerpt is a note and nothing else.
 *
 * An excerpt persists with at least one code assignment or a note, per D-055,
 * so this is the one that has no coding to reopen — sending it to the code
 * panel shows an empty codebook with the note hidden in a disclosure, which is
 * the cost D-055 exists to remove.
 */
export function isNoteOnly(summary: SavedExcerptSummary): boolean {
  return summary.codeIds.length === 0 && summary.noteId !== null;
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
  /** Which command is waiting on the choice. D-055. */
  choiceIntent: ChoiceIntent;
  chooseSavedExcerpt: (excerptId: Id) => void;
  dismissChoices: () => void;
  /** Opens one for coding, or offers a choice among several. `excerpt.open`. */
  runOpenAt: (summaries: SavedExcerptSummary[]) => void;
  /** The click route: each excerpt opens wherever what it carries belongs. */
  runOpenByContentAt: (summaries: SavedExcerptSummary[]) => void;
  /** The same, into the note panel. Used by `note.open` and by the rail icon. */
  runNoteAt: (summaries: SavedExcerptSummary[]) => void;
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
  /** Opens the isolated note panel on a saved excerpt's note. D-055. */
  onOpenNote?: (summary: SavedExcerptSummary) => void;
  /**
   * Excerpts the focused turn intersects that carry a note, for `note.open`.
   * A subset of `savedAt`: an excerpt can be saved here and have no note.
   */
  notedAt?: SavedExcerptSummary[];
  /**
   * True while the code panel is open, so `excerpt.note` can focus its note
   * region instead of refusing, per D-055.
   */
  codePanelOpen?: boolean;
  /** Focuses the code panel's note region, for exactly that case. */
  onFocusPanelNote?: () => void;
  /**
   * Capture opens code selection, or the note panel, per the command and
   * D-055. The range comes with it: the reducer's dispatch is not readable
   * until the next render, and the caller needs it now to name the excerpt.
   */
  onCapture?: (target: CaptureTarget, range: CapturedRange) => void;
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
  notedAt = [],
  onReopen,
  onOpenNote,
  onCapture,
  onClosePanel,
  codePanelOpen = false,
  onFocusPanelNote,
  initialSelection = IDLE,
}: Options): ExcerptSelectionApi {
  const announcer = useAnnouncer();
  const [selection, dispatch] = useReducer(excerptReducer, initialSelection);

  /** Overlapping saved excerpts awaiting a choice. D-030 does not guess. */
  const [openChoices, setOpenChoices] = useState<SavedExcerptSummary[]>([]);
  /** Which command is waiting on that choice, so the list knows what it does. */
  const [choiceIntent, setChoiceIntent] = useState<ChoiceIntent>('code');

  /** The open context menu, with the selection it opened on. */
  const [menuState, setMenuState] = useState<{ x: number; y: number; capture: Capture } | null>(
    null,
  );
  /** Where focus was before the menu took it, for the return in contract 2.4. */
  const menuReturnRef = useRef<HTMLElement | null>(null);

  /* ---------- Derived view of the range ---------- */

  /**
   * The range the transcript paints.
   *
   * The menu's snapshot while the menu is open, and the captured range
   * otherwise.
   *
   * Between the right-click and choosing an item, the only thing marking the
   * passage used to be the browser's own selection — and the menu opens with
   * `autoFocus`, taking focus out of the transcript, after which how a browser
   * paints an unfocused selection is its business rather than ours. That is why
   * the highlight vanished in some scenarios and not others. Section 6 says the
   * application highlight is the only selection visual from capture onward;
   * this window sat just before it and was left resting on the one thing that
   * rule exists to stop relying on.
   *
   * Painting is all this does. The machine does not advance, because a menu can
   * still be dismissed and a dismissed menu captures nothing — so the state
   * stays `idle`, the panel stays shut, and the confirmed-capture fill, which
   * is keyed on `[data-excerpt-state='confirmed']`, stays off. The preview is
   * the lighter band with its boundary bars, which is honest: it shows what the
   * menu would act on rather than what has been captured.
   */
  const displayedRange = menuState?.capture.range ?? selection.range;

  const rangeSegments = useMemo(
    (): TranscriptSegment[] => (displayedRange ? excerptSegments(resolved, displayedRange) : []),
    [displayedRange, resolved],
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
      /*
        Available while the code panel is open, per D-055, where every other
        capture command is not: there it takes no new capture and focuses that
        panel's note region instead. Without this the chord refused with
        "already capturing" at exactly the moment a coder had the excerpt in
        front of them and wanted to write about it.
      */
      'excerpt.note': gate(
        captureable || codePanelOpen,
        EXCERPT_UNAVAILABLE.alreadyCapturing,
      ),
      'excerpt.open': gate(
        captureable && savedAt.length > 0,
        captureable ? EXCERPT_UNAVAILABLE.noSavedExcerptHere : EXCERPT_UNAVAILABLE.alreadyCapturing,
      ),
      'note.open': gate(
        captureable && notedAt.length > 0,
        captureable ? EXCERPT_UNAVAILABLE.noNoteHere : EXCERPT_UNAVAILABLE.alreadyCapturing,
      ),
      'excerpt.discard': gate(state === 'confirmed', EXCERPT_UNAVAILABLE.nothingToCapture),
    };
  }, [codePanelOpen, notedAt.length, savedAt.length, selection.state]);

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

  /**
   * Opens a saved excerpt's note in the isolated panel, per D-055.
   *
   * The range is not captured and the machine does not move: this edits a note
   * on an excerpt that already exists, and putting the selection into
   * `confirmed` would draw a capture highlight over saved work and make the
   * excerpt commands refuse.
   */
  const openNote = useCallback(
    (summary: SavedExcerptSummary) => {
      setOpenChoices([]);
      onOpenNote?.(summary);
    },
    [onOpenNote],
  );

  /**
   * Reopens for coding, whatever the excerpt carries.
   *
   * Deliberately not routed by content, where the click below is. This command
   * means "reopen this to code it", and it is the only way a passage noted
   * before it was coded can gain codes later — the round trip D-055's
   * codes-win-over-a-note precedence depends on. Routing it to the note panel
   * would close that path, since re-capturing the same range makes a second
   * excerpt rather than editing the first.
   */
  const runOpenAt = useCallback(
    (summaries: SavedExcerptSummary[]) => {
      if (summaries.length === 0) return;
      setChoiceIntent('code');
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

  /**
   * The click route, per excerpt-selection.md section 3: open what is here.
   *
   * An excerpt carrying only a note opens the note panel, because sending it to
   * code selection shows an empty codebook with the note hidden in a
   * disclosure — the cost D-055 exists to remove.
   */
  const runOpenByContentAt = useCallback(
    (summaries: SavedExcerptSummary[]) => {
      if (summaries.length === 0) return;
      setChoiceIntent('auto');
      if (summaries.length === 1) {
        if (isNoteOnly(summaries[0])) openNote(summaries[0]);
        else reopen(summaries[0]);
        return;
      }
      setOpenChoices(summaries);
      announcer.announce(
        `${summaries.length} saved excerpts cover this sentence. Choose which one to open.`,
      );
    },
    [announcer, openNote, reopen],
  );

  /** The same shape for notes, per D-055: one opens, several are offered. */
  const runNoteAt = useCallback(
    (summaries: SavedExcerptSummary[]) => {
      if (summaries.length === 0) return;
      setChoiceIntent('note');
      if (summaries.length === 1) {
        openNote(summaries[0]);
        return;
      }
      setOpenChoices(summaries);
      announcer.announce(
        `${summaries.length} notes on this speaker turn. Choose which one to open.`,
      );
    },
    [announcer, openNote],
  );

  const chooseSavedExcerpt = useCallback(
    (excerptId: Id) => {
      const summary = openChoices.find((choice) => choice.excerptId === excerptId);
      if (!summary) return;

      /*
        `note` means the note whatever the excerpt carries, which is what makes
        `note.open` reach the note on a coded excerpt. `auto` asks the excerpt,
        so one chooser can hold a coded excerpt and a note-only one and send
        each where it belongs.
      */
      if (choiceIntent === 'note' || (choiceIntent === 'auto' && isNoteOnly(summary))) {
        openNote(summary);
        return;
      }
      reopen(summary);
    },
    [choiceIntent, openChoices, openNote, reopen],
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
      onCapture?.(target, capture.range);
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
          /*
            With the code panel already open this is not a capture at all: the
            excerpt is in front of the coder and the note region is where they
            are going. D-055.
          */
          if (codePanelOpen) {
            onFocusPanelNote?.();
            return;
          }
          return runCapture('note');

        case 'excerpt.open':
          // One opens; two or more, the `coded-multiple` case, are presented
          // for choice. Guessing would silently edit the wrong excerpt. D-030.
          return runOpenAt(savedAt);

        case 'note.open':
          return runNoteAt(notedAt);

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
      codePanelOpen,
      focusTurnOf,
      notedAt,
      onClosePanel,
      onFocusPanelNote,
      runCapture,
      runNoteAt,
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
    /* Read before the state change, which is what removes it. */
    const dismissedRange = menuState?.capture.range ?? null;
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

      /*
        And the passage goes back under the browser's own selection.

        Dismissing captured nothing, so the preview goes — but painting it
        re-rendered the turn and collapsed the drag on the way in. Restoring
        after that render leaves the coder exactly where they were rather than
        making them select the passage a second time.
      */
      if (dismissedRange) restoreNativeSelection(containerRef.current, dismissedRange);
    });
  }, [containerRef, focusTurnOf, menuState, selection.range]);

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
    startSegmentId: displayedRange?.startSegmentId ?? null,
    endSegmentId: displayedRange?.endSegmentId ?? null,
    startOffset: displayedRange?.startOffset ?? null,
    endOffset: displayedRange?.endOffset ?? null,
    openChoices,
    choiceIntent,
    chooseSavedExcerpt,
    dismissChoices,
    runOpenAt,
    runOpenByContentAt,
    runNoteAt,
  };
}
