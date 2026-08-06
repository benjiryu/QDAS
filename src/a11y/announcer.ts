/**
 * Shared announcement service.
 *
 * Specification: docs/accessibility-contract.md section 2.3.
 *
 * The whole application has exactly two live regions and they are owned here.
 * Components call `announce`. No component creates a live region, and no
 * component writes to a region node. This module is the only writer.
 *
 * No React. The provider in AnnouncerProvider.tsx mounts the regions and hands
 * their nodes over; everything else in this file is plain DOM and timers, so it
 * can be tested without rendering anything.
 *
 * ## Why there is a timer at all
 *
 * The contract says an announcement issued while another is still speaking must
 * not replace it. The DOM gives no signal for "still speaking" — there is no
 * event, and no way to ask a screen reader what it is doing. Writing message
 * two into the region while message one is unspoken is exactly the failure the
 * contract describes: the second write replaces the first and the first is
 * never heard.
 *
 * So messages queue and drain on an interval. The interval is a guess about
 * speech rate that no specification fixes, which makes `intervalMs` a tuning
 * knob of the same kind as the chords in src/config/keybindings.ts: provisional
 * until verified against JAWS, NVDA, and VoiceOver on real hardware. It is one
 * constant, in one place, for that reason.
 */

export type Politeness = 'polite' | 'assertive';

/**
 * The only two events allowed to interrupt, per section 2.3. Assertive requires
 * one, so the reservation is enforced by the compiler rather than by review.
 */
export type AssertiveReason = 'saveFailure' | 'destructiveConfirmation';

export interface Announcement {
  message: string;
  politeness: Politeness;
  /** Present only on assertive announcements. */
  reason?: AssertiveReason;
  /** Monotonic, assigned on enqueue. Ordering that does not depend on the clock. */
  sequence: number;
  /** Epoch milliseconds. For the development announcement log. */
  timestamp: number;
}

export interface AnnouncerOptions {
  /**
   * Milliseconds between one message being written and the next being written.
   * Provisional. See the note above.
   */
  intervalMs?: number;
  /**
   * Milliseconds the region is held empty before a message is written.
   *
   * Two consecutive identical messages are the reason this exists. A live
   * region announces on mutation; writing the same string twice is not a
   * mutation, and the second announcement is silently lost. Repeated boundary
   * adjustment produces identical messages often, so the region is cleared
   * first and the message written after a gap the screen reader can observe.
   */
  clearGapMs?: number;
  /** Announcements retained for repeat and for the development log. */
  historyLimit?: number;
}

export const DEFAULT_INTERVAL_MS = 1000;
export const DEFAULT_CLEAR_GAP_MS = 60;
export const DEFAULT_HISTORY_LIMIT = 50;

export interface Announcer {
  /**
   * Queue a message. Polite by default.
   *
   * Assertive requires a reason, because assertive is reserved for save failure
   * and destructive confirmation and nothing else interrupts.
   */
  announce(message: string, politeness?: 'polite'): void;
  announce(message: string, politeness: 'assertive', reason: AssertiveReason): void;

  /**
   * Re-announce the most recent announcement. Returns what was repeated, or
   * null if nothing has been announced yet.
   */
  repeatLast(): Announcement | null;

  /** The most recent announcement, without re-announcing it. */
  getLast(): Announcement | null;

  /** Recent announcements, oldest first, capped at `historyLimit`. */
  getHistory(): readonly Announcement[];

  /**
   * Called by the provider. Passing null detaches. While a region is detached
   * its queue holds rather than drains, so a message announced before mount is
   * spoken after mount instead of being dropped.
   */
  attachRegion(politeness: Politeness, node: HTMLElement | null): void;

  /** Observe every announcement as it is queued. For the development log. */
  subscribe(listener: (announcement: Announcement) => void): () => void;

  /** Clears queues, timers, and history. Tests and fixture resets. */
  reset(): void;
}

export function createAnnouncer(options: AnnouncerOptions = {}): Announcer {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const clearGapMs = options.clearGapMs ?? DEFAULT_CLEAR_GAP_MS;
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;

  const queues: Record<Politeness, Announcement[]> = { polite: [], assertive: [] };
  const regions: Record<Politeness, HTMLElement | null> = { polite: null, assertive: null };
  const timers: Record<Politeness, ReturnType<typeof setTimeout> | null> = {
    polite: null,
    assertive: null,
  };

  const history: Announcement[] = [];
  const listeners = new Set<(announcement: Announcement) => void>();
  let sequence = 0;

  /**
   * Polite and assertive drain independently. A save failure must not wait
   * behind a backlog of boundary announcements, which is the whole point of
   * having a second region.
   */
  function drain(politeness: Politeness): void {
    const node = regions[politeness];
    if (!node) {
      // Detached. Hold the queue; attachRegion resumes it.
      timers[politeness] = null;
      return;
    }

    const next = queues[politeness].shift();
    if (!next) {
      timers[politeness] = null;
      return;
    }

    node.textContent = '';

    timers[politeness] = setTimeout(() => {
      const target = regions[politeness];
      if (target) {
        target.textContent = next.message;
      } else {
        // Detached mid-write. Put it back rather than lose it.
        queues[politeness].unshift(next);
      }
      timers[politeness] = setTimeout(() => drain(politeness), intervalMs);
    }, clearGapMs);
  }

  function start(politeness: Politeness): void {
    if (timers[politeness] === null) drain(politeness);
  }

  function enqueue(announcement: Announcement): void {
    queues[announcement.politeness].push(announcement);

    history.push(announcement);
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit);

    for (const listener of listeners) listener(announcement);

    start(announcement.politeness);
  }

  function announce(
    message: string,
    politeness: Politeness = 'polite',
    reason?: AssertiveReason,
  ): void {
    if (message === '') return;

    if (politeness === 'assertive' && reason === undefined && import.meta.env.DEV) {
      // Announced anyway. A message spoken with the wrong politeness is a
      // defect; a message not spoken at all can end a session.
      console.error(
        `Announcer: assertive is reserved for save failure and destructive confirmation ` +
          `(accessibility contract 2.3). Announced without a reason: "${message}"`,
      );
    }

    enqueue({
      message,
      politeness,
      ...(reason ? { reason } : {}),
      sequence: sequence++,
      timestamp: Date.now(),
    });
  }

  return {
    announce: announce as Announcer['announce'],

    getLast(): Announcement | null {
      return history.length > 0 ? history[history.length - 1] : null;
    },

    getHistory(): readonly Announcement[] {
      return [...history];
    },

    repeatLast(): Announcement | null {
      const last = history.length > 0 ? history[history.length - 1] : null;
      if (!last) return null;

      /*
       * Repeated politely even when the original was assertive. The
       * interruption was earned by the original event, not by the user asking
       * to hear it again, and a repeat arriving while something else is
       * speaking should not cut that off. Section 2.3 does not settle this;
       * flagged for the team.
       */
      enqueue({
        message: last.message,
        politeness: 'polite',
        sequence: sequence++,
        timestamp: Date.now(),
      });

      return last;
    },

    attachRegion(politeness: Politeness, node: HTMLElement | null): void {
      regions[politeness] = node;
      if (node) start(politeness);
    },

    subscribe(listener: (announcement: Announcement) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    reset(): void {
      for (const politeness of ['polite', 'assertive'] as const) {
        const timer = timers[politeness];
        if (timer !== null) clearTimeout(timer);
        timers[politeness] = null;
        queues[politeness] = [];
        const node = regions[politeness];
        if (node) node.textContent = '';
      }
      history.length = 0;
      sequence = 0;
    },
  };
}

/**
 * The application's single announcer. Components use this one, through
 * `useAnnouncer`. Tests build their own with `createAnnouncer`.
 */
export const announcer = createAnnouncer();
