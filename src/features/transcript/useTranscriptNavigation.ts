import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import type { PrototypeFlags } from '../../config/flags';
import { readSourcePosition, writeSourcePosition } from '../../data/sourcePositionStore';
import {
  codingOf,
  nextSegment,
  nextTurn,
  positionOf,
  positionReport,
  previousSegment,
  previousTurn,
  segmentById,
  turnOf,
} from '../../domain';
import type { Id, ResolvedSource, SegmentDisplayStates } from '../../domain';
import {
  enteredSource,
  movedToSegment,
  movedToTurn,
  positionReportText,
  speakerText,
  timestampText,
  UNAVAILABLE_TEXT,
} from './announcements';
import { positionFields } from './positionText';

/**
 * Segment navigation, position, and the announcements that go with them.
 *
 * Specification: docs/patterns/transcript-segment.md sections 2, 4, 5, 6.
 *
 * Three rules from section 2 shape this hook, and each is a thing not done:
 *
 * - Scroll never sets the active segment. There is no scroll listener here.
 *   Scrolling is not a statement of intent, and treating it as one makes the
 *   position drift while a magnification user pans to read context.
 * - The screen reader browse cursor never sets it either. The application
 *   cannot know where the virtual cursor sits.
 * - Focus does not move on a movement command. Only `position.return` moves
 *   focus, because it is the one command whose purpose is to take the user
 *   back to where the position is.
 */

/** Commands this hook owns. Anything else is left for its own pattern. */
const HANDLED = [
  'segment.next',
  'segment.previous',
  'turn.next',
  'turn.previous',
  'segment.repeat',
  'segment.speaker',
  'segment.timestamp',
  'position.report',
  'position.return',
] as const satisfies readonly Command[];

export type NavigationCommand = (typeof HANDLED)[number];

export interface TranscriptNavigation {
  activeSegmentId: Id | null;
  /** Sets the active segment from a pointer affordance, per section 2.1. */
  activate: (segmentId: Id) => void;
  /**
   * Moves the position without announcing it. For callers that already speak,
   * such as confirming or cancelling an excerpt, which section 2.1 lists as
   * things that set the active segment.
   */
  setActiveSegment: (segmentId: Id) => void;
  run: (command: NavigationCommand) => void;
  /** False once the active segment has scrolled out of view. */
  isActiveInView: boolean;
  /** Ribbon and spoken report are built from these same fields. */
  fields: ReturnType<typeof positionFields> | null;
  availability: Record<NavigationCommand, boolean>;
  /** Attach to the element that contains the rendered turns. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface Options {
  resolved: ResolvedSource;
  displayStates: SegmentDisplayStates;
  userId: Id;
  flags: PrototypeFlags;
}

export function useTranscriptNavigation({
  resolved,
  displayStates,
  userId,
  flags,
}: Options): TranscriptNavigation {
  const announcer = useAnnouncer();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sourceId = resolved.source.sourceId;
  const hasAudio = resolved.source.durationMs !== null;

  // Restored on entry, per sections 2.1 and 8. A stored identifier that no
  // longer resolves is discarded rather than trusted.
  const [activeSegmentId, setActiveSegmentId] = useState<Id | null>(() => {
    const stored = readSourcePosition(userId, sourceId);
    if (!stored) return null;
    return positionOf(resolved, stored.activeSegmentId) === null ? null : stored.activeSegmentId;
  });

  /**
   * The segment last observed to have left the viewport, rather than a boolean.
   * Keying it to the identifier means a new active segment is in view by
   * definition, with no stale false to reset and no flash of the return control.
   */
  const [segmentOutOfView, setSegmentOutOfView] = useState<Id | null>(null);
  const isActiveInView = activeSegmentId === null || segmentOutOfView !== activeSegmentId;
  /** Set by a command, so the next effect knows to scroll. Never set by scroll. */
  const shouldScrollRef = useRef(false);

  const fields = useMemo(() => {
    if (!activeSegmentId) return null;
    const report = positionReport(resolved, activeSegmentId);
    return report ? positionFields(report, flags.positionReportDetail, hasAudio) : null;
  }, [activeSegmentId, flags.positionReportDetail, hasAudio, resolved]);

  /* ---------- Entering the source ---------- */

  const hasAnnouncedEntry = useRef(false);
  useEffect(() => {
    if (hasAnnouncedEntry.current) return;
    hasAnnouncedEntry.current = true;

    announcer.announce(
      enteredSource(resolved.source.title, resolved.speakers.length, fields),
    );
    // Bring a restored position into view. This is orientation, not focus:
    // contract 2.4 forbids moving focus on load, and nothing here does.
    if (activeSegmentId) shouldScrollRef.current = true;
    // Entry is announced once per source, with whatever position was restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Moving ---------- */

  const setActive = useCallback(
    (segmentId: Id) => {
      setActiveSegmentId(segmentId);
      shouldScrollRef.current = true;
      writeSourcePosition(userId, sourceId, segmentId, new Date().toISOString());
    },
    [sourceId, userId],
  );

  const activate = useCallback(
    (segmentId: Id) => {
      if (positionOf(resolved, segmentId) === null) return;
      setActive(segmentId);
      announcer.announce(
        movedToSegment(segmentById(resolved, segmentId)!.text, codingOf(displayStates, segmentId)),
      );
    },
    [announcer, displayStates, resolved, setActive],
  );

  const availability = useMemo((): Record<NavigationCommand, boolean> => {
    const hasPosition = activeSegmentId !== null;
    return {
      // With no position set, moving is how a user acquires one.
      'segment.next': !hasPosition || nextSegment(resolved, activeSegmentId!) !== null,
      'segment.previous': !hasPosition || previousSegment(resolved, activeSegmentId!) !== null,
      'turn.next': !hasPosition || nextTurn(resolved, activeSegmentId!) !== null,
      'turn.previous': !hasPosition || previousTurn(resolved, activeSegmentId!) !== null,
      'segment.repeat': hasPosition,
      'segment.speaker': hasPosition,
      'segment.timestamp': hasPosition,
      'position.report': hasPosition,
      'position.return': hasPosition,
    };
  }, [activeSegmentId, resolved]);

  const run = useCallback(
    (command: NavigationCommand) => {
      const active = activeSegmentId;

      // Movement with no position yet starts at the first sentence, since
      // section 2.1 makes invoking a movement command one of the things that
      // sets the active segment.
      const first = resolved.segments[0];

      switch (command) {
        case 'segment.next':
        case 'segment.previous': {
          if (!active) {
            if (!first) return;
            setActive(first.segmentId);
            announcer.announce(movedToSegment(first.text, codingOf(displayStates, first.segmentId)));
            return;
          }
          const target =
            command === 'segment.next'
              ? nextSegment(resolved, active)
              : previousSegment(resolved, active);
          if (!target) {
            announcer.announce(
              UNAVAILABLE_TEXT[command === 'segment.next' ? 'atSourceEnd' : 'atSourceStart'],
            );
            return;
          }
          setActive(target.segmentId);
          announcer.announce(
            movedToSegment(target.text, codingOf(displayStates, target.segmentId)),
          );
          return;
        }

        case 'turn.next':
        case 'turn.previous': {
          if (!active) {
            if (!first) return;
            setActive(first.segmentId);
            announcer.announce(
              movedToTurn(
                turnOf(resolved, first.segmentId)?.speaker?.label ?? null,
                first.text,
                codingOf(displayStates, first.segmentId),
              ),
            );
            return;
          }
          const target =
            command === 'turn.next' ? nextTurn(resolved, active) : previousTurn(resolved, active);
          if (!target) {
            announcer.announce(
              UNAVAILABLE_TEXT[command === 'turn.next' ? 'atLastTurn' : 'atFirstTurn'],
            );
            return;
          }
          setActive(target.segmentId);
          announcer.announce(
            movedToTurn(
              turnOf(resolved, target.segmentId)?.speaker?.label ?? null,
              target.text,
              codingOf(displayStates, target.segmentId),
            ),
          );
          return;
        }

        case 'segment.repeat': {
          if (!active) return announcer.announce(UNAVAILABLE_TEXT.noPosition);
          // Re-announced without moving, per section 4.1.
          announcer.announce(
            movedToSegment(segmentById(resolved, active)!.text, codingOf(displayStates, active)),
          );
          return;
        }

        case 'segment.speaker': {
          if (!active) return announcer.announce(UNAVAILABLE_TEXT.noPosition);
          announcer.announce(speakerText(turnOf(resolved, active)?.speaker?.label ?? null));
          return;
        }

        case 'segment.timestamp': {
          if (!active) return announcer.announce(UNAVAILABLE_TEXT.noPosition);
          announcer.announce(timestampText(segmentById(resolved, active)!.startTimeMs));
          return;
        }

        case 'position.report': {
          if (!active || !fields) return announcer.announce(UNAVAILABLE_TEXT.noPosition);
          announcer.announce(positionReportText(fields));
          return;
        }

        case 'position.return': {
          if (!active) return announcer.announce(UNAVAILABLE_TEXT.noPosition);
          const turn = turnOf(resolved, active);
          const container = containerRef.current;
          const element = container?.querySelector<HTMLElement>(
            `[data-turn-id="${turn?.turn.turnId}"]`,
          );
          element?.scrollIntoView?.({ block: 'center' });
          // The one command that moves focus, per section 4.1. Focus lands on
          // the turn container, so the reader hears the turn it returned to.
          element?.focus?.();
          return;
        }
      }
    },
    [activeSegmentId, announcer, displayStates, fields, resolved, setActive],
  );

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
      // other patterns keep working when those patterns arrive.
      event.preventDefault();
      run(command as NavigationCommand);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, run]);

  /* ---------- Keeping the active segment in view ---------- */

  useEffect(() => {
    if (!shouldScrollRef.current || !activeSegmentId) return;
    shouldScrollRef.current = false;

    const element = containerRef.current?.querySelector<HTMLElement>(
      `[data-segment-id="${activeSegmentId}"]`,
    );
    element?.scrollIntoView?.({ block: 'nearest' });
  }, [activeSegmentId]);

  useEffect(() => {
    if (!activeSegmentId || typeof IntersectionObserver === 'undefined') return;

    const element = containerRef.current?.querySelector<HTMLElement>(
      `[data-segment-id="${activeSegmentId}"]`,
    );
    if (!element) return;

    // Observing visibility is not the same as deriving position from scroll:
    // this decides whether to offer a way back, and never what the position is.
    const observer = new IntersectionObserver(
      ([entry]) => setSegmentOutOfView(entry.isIntersecting ? null : activeSegmentId),
      { threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeSegmentId]);

  return {
    activeSegmentId,
    activate,
    setActiveSegment: setActive,
    run,
    isActiveInView,
    fields,
    availability,
    containerRef,
  };
}
