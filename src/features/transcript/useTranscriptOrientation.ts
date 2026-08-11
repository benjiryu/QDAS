import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import type { PrototypeFlags } from '../../config/flags';
import { readSourcePosition, writeSourcePosition } from '../../data/sourcePositionStore';
import { positionOf, positionReport, turnOf } from '../../domain';
import type { Id, ResolvedSource } from '../../domain';
import {
  enteredSource,
  positionReportText,
  speakerText,
  timestampText,
  UNAVAILABLE_TEXT,
} from './announcements';
import { positionFields } from './positionText';

/**
 * Orientation: which turn the reader is on, and the three commands that answer
 * for it.
 *
 * Specification: docs/patterns/transcript-segment.md section 5 and its v0.2
 * banner, decision D-038.
 *
 * The navigation layer this hook used to be is gone. Movement belongs to the
 * browser and the screen reader — Tab and Shift+Tab between turns, browse-mode
 * reading, scrolling — and the application no longer offers a second way to do
 * what the user's own software already does.
 *
 * What replaces `activeSegmentId` is DOM focus. That is a real narrowing, and
 * D-038 states what it leans on: screen readers generally sync focus when
 * browse-mode navigation lands on a focusable element, but behaviour varies, so
 * the pre-session smoke test has to confirm it. If it does not hold for a
 * participant, their recourse is Tab.
 *
 * Two rules from the old hook survive, and each is still a thing not done:
 *
 * - Scroll never sets the position. There is no scroll listener here.
 * - The browse cursor never sets it either, except where the screen reader
 *   moves focus with it, which is exactly the enhancement above.
 */

/** Commands this hook owns. Anything else is left for its own pattern. */
const HANDLED = [
  'segment.speaker',
  'segment.timestamp',
  'position.report',
] as const satisfies readonly Command[];

export type OrientationCommand = (typeof HANDLED)[number];

export interface TranscriptOrientation {
  /** The turn holding focus, which is the only position the application knows. */
  focusedTurnId: Id | null;
  run: (command: OrientationCommand) => void;
  /** Ribbon and spoken report are built from these same fields. */
  fields: ReturnType<typeof positionFields> | null;
  availability: Record<OrientationCommand, boolean>;
  /** Attach to the element that contains the rendered turns. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Moves focus to a turn, for the return after a save. */
  focusTurn: (turnId: Id) => void;
}

interface Options {
  resolved: ResolvedSource;
  userId: Id;
  flags: PrototypeFlags;
}

export function useTranscriptOrientation({
  resolved,
  userId,
  flags,
}: Options): TranscriptOrientation {
  const announcer = useAnnouncer();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sourceId = resolved.source.sourceId;
  const hasAudio = resolved.source.durationMs !== null;

  const [focusedTurnId, setFocusedTurnId] = useState<Id | null>(null);

  /**
   * The turn to scroll to on entry, per sections 2.1 and 8.
   *
   * Read once, and only ever used for orientation: contract 2.4 forbids moving
   * focus on load, so a restored position is brought into view and left there
   * for the reader to Tab into. A stored identifier that no longer resolves is
   * discarded rather than trusted.
   */
  const restoredTurnId = useMemo(() => {
    const stored = readSourcePosition(userId, sourceId);
    if (!stored || positionOf(resolved, stored.activeSegmentId) === null) return null;
    return turnOf(resolved, stored.activeSegmentId)?.turn.turnId ?? null;
    // Read once on entry. A position written later is this session's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fields = useMemo(() => {
    const turnId = focusedTurnId ?? restoredTurnId;
    if (!turnId) return null;
    const report = positionReport(resolved, turnId);
    return report ? positionFields(report, flags.positionReportDetail, hasAudio) : null;
  }, [flags.positionReportDetail, focusedTurnId, hasAudio, resolved, restoredTurnId]);

  /* ---------- Focus is the position ---------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      const turn = target instanceof Element ? target.closest('[data-turn-id]') : null;
      const turnId = turn?.getAttribute('data-turn-id') ?? null;
      if (!turnId) return;

      setFocusedTurnId(turnId);

      // Recorded for restoration only, as the turn's first sentence: the stored
      // shape is a segment identifier, and D-038 keeps it that way rather than
      // migrating every stored position for a value nothing else reads.
      const first = resolved.turns.find((candidate) => candidate.turn.turnId === turnId)
        ?.segments[0];
      if (first) {
        writeSourcePosition(userId, sourceId, first.segmentId, new Date().toISOString());
      }
    };

    container.addEventListener('focusin', onFocusIn);
    return () => container.removeEventListener('focusin', onFocusIn);
  }, [resolved, sourceId, userId]);

  /* ---------- Entering the source ---------- */

  const hasAnnouncedEntry = useRef(false);
  useEffect(() => {
    if (hasAnnouncedEntry.current) return;
    hasAnnouncedEntry.current = true;

    announcer.announce(enteredSource(resolved.source.title, resolved.speakers.length, fields));

    if (restoredTurnId) {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-turn-id="${restoredTurnId}"]`)
        ?.scrollIntoView?.({ block: 'center' });
    }
    // Entry is announced once per source, with whatever position was restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Commands ---------- */

  const availability = useMemo((): Record<OrientationCommand, boolean> => {
    const known = focusedTurnId !== null;
    return {
      'segment.speaker': known,
      'segment.timestamp': known,
      'position.report': known,
    };
  }, [focusedTurnId]);

  const run = useCallback(
    (command: OrientationCommand) => {
      const turnId = focusedTurnId;
      if (!turnId) return announcer.announce(UNAVAILABLE_TEXT.noFocusedTurn);

      const turn = resolved.turns.find((candidate) => candidate.turn.turnId === turnId);

      switch (command) {
        case 'segment.speaker':
          announcer.announce(speakerText(turn?.speaker?.label ?? null));
          return;

        case 'segment.timestamp':
          announcer.announce(timestampText(turn?.segments[0]?.startTimeMs ?? null));
          return;

        case 'position.report': {
          const report = positionReport(resolved, turnId);
          if (!report) return announcer.announce(UNAVAILABLE_TEXT.noFocusedTurn);
          announcer.announce(
            positionReportText(positionFields(report, flags.positionReportDetail, hasAudio)),
          );
          return;
        }
      }
    },
    [announcer, flags.positionReportDetail, focusedTurnId, hasAudio, resolved],
  );

  const focusTurn = useCallback((turnId: Id) => {
    containerRef.current?.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`)?.focus?.();
  }, []);

  /* ---------- Chords ---------- */

  const bindings = useMemo(() => bindingsFor(detectPlatform()), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // The target is not always an element: a keystroke with nothing focused
      // arrives on the document, which has no `closest`.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      const command = commandFor(event, bindings);
      if (!command || !(HANDLED as readonly Command[]).includes(command)) return;

      // Claimed only once it is a command this hook handles, so chords owned by
      // other patterns keep working.
      event.preventDefault();
      run(command as OrientationCommand);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, run]);

  return {
    focusedTurnId,
    run,
    fields,
    availability,
    containerRef,
    focusTurn,
  };
}
