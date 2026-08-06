import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnouncer } from './announcer';
import type { Announcer, Politeness } from './announcer';

/**
 * Specification: docs/accessibility-contract.md section 2.3.
 *
 * The failure these tests exist to catch is silence. A dropped announcement
 * looks identical to a working one from the outside, so the assertions here
 * read what actually reached the live region node over time rather than what
 * the service says it did.
 */

const INTERVAL_MS = 100;
const CLEAR_GAP_MS = 10;

let announcer: Announcer;
let polite: HTMLElement;
let assertive: HTMLElement;

function attach(regions: Politeness[] = ['polite', 'assertive']) {
  if (regions.includes('polite')) announcer.attachRegion('polite', polite);
  if (regions.includes('assertive')) announcer.attachRegion('assertive', assertive);
}

/**
 * Everything the region said, in order, by sampling it as the queue drains.
 *
 * Reading the node once at the end would pass even if every earlier message had
 * been clobbered, which is precisely the bug. A message that appears, is
 * cleared, and appears again counts twice, because a screen reader speaks it
 * twice.
 */
function spokenFrom(node: HTMLElement, totalMs = 2000, stepMs = 5): string[] {
  const spoken: string[] = [];
  let previous = node.textContent ?? '';

  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    vi.advanceTimersByTime(stepMs);
    const current = node.textContent ?? '';
    if (current !== previous) {
      if (current !== '') spoken.push(current);
      previous = current;
    }
  }

  return spoken;
}

beforeEach(() => {
  vi.useFakeTimers();
  polite = document.createElement('div');
  assertive = document.createElement('div');
  document.body.append(polite, assertive);
  announcer = createAnnouncer({ intervalMs: INTERVAL_MS, clearGapMs: CLEAR_GAP_MS });
});

afterEach(() => {
  announcer.reset();
  polite.remove();
  assertive.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('queueing', () => {
  it('speaks every message from a rapid burst, in order', () => {
    attach();

    // The boundary-adjustment case from docs/testing/manual-testing.md 2.4:
    // five presses in quick succession, five announcements expected.
    for (const message of ['one', 'two', 'three', 'four', 'five']) {
      announcer.announce(message);
    }

    expect(spokenFrom(polite)).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('does not let a later announcement replace one that is still pending', () => {
    attach();

    announcer.announce('first');
    vi.advanceTimersByTime(CLEAR_GAP_MS);
    expect(polite.textContent).toBe('first');

    // Issued while "first" is still on screen, and by assumption still speaking.
    announcer.announce('second');
    expect(polite.textContent).toBe('first');

    expect(spokenFrom(polite)).toEqual(['second']);
  });

  it('drops nothing under sustained load', () => {
    attach();

    const messages = Array.from({ length: 20 }, (_, index) => `message ${index}`);
    for (const message of messages) announcer.announce(message);

    expect(spokenFrom(polite, 20 * (INTERVAL_MS + CLEAR_GAP_MS) + 500)).toEqual(messages);
  });

  it('speaks two identical consecutive messages twice', () => {
    attach();

    // Writing the same string into a live region twice is not a mutation, so
    // the region is cleared between messages. Without that, the second
    // "Removed: ..." after two identical contractions is silent.
    announcer.announce('Excerpt is now four sentences.');
    announcer.announce('Excerpt is now four sentences.');

    expect(spokenFrom(polite)).toEqual([
      'Excerpt is now four sentences.',
      'Excerpt is now four sentences.',
    ]);
  });

  it('holds messages announced before the region is attached', () => {
    announcer.announce('before mount');
    vi.advanceTimersByTime(INTERVAL_MS * 5);
    expect(polite.textContent).toBe('');

    attach();
    expect(spokenFrom(polite)).toEqual(['before mount']);
  });

  it('ignores an empty message', () => {
    attach();
    announcer.announce('');

    expect(spokenFrom(polite, 500)).toEqual([]);
    expect(announcer.getHistory()).toHaveLength(0);
  });
});

describe('politeness', () => {
  it('drains assertive without waiting behind the polite backlog', () => {
    attach();

    for (let index = 0; index < 10; index += 1) announcer.announce(`polite ${index}`);
    announcer.announce('Save failed. Nothing was lost.', 'assertive', 'saveFailure');

    // Sampled over one polite interval: the polite queue is still on its first
    // message while the assertive one has already been spoken.
    const assertiveSpoken = spokenFrom(assertive, INTERVAL_MS + CLEAR_GAP_MS * 2);
    expect(assertiveSpoken).toEqual(['Save failed. Nothing was lost.']);
    expect(polite.textContent).not.toContain('Save failed');
  });

  it('records the reason an assertive announcement was allowed to interrupt', () => {
    attach();
    announcer.announce('Discard this excerpt?', 'assertive', 'destructiveConfirmation');

    expect(announcer.getLast()).toMatchObject({
      politeness: 'assertive',
      reason: 'destructiveConfirmation',
    });
  });

  it('still speaks an assertive message with no reason, and reports the misuse', () => {
    attach();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Not reachable from TypeScript; the overload requires a reason. Guards the
    // runtime path so a misuse is loud rather than a lost message.
    (announcer.announce as (message: string, politeness: Politeness) => void)(
      'unreserved',
      'assertive',
    );

    expect(spokenFrom(assertive, 500)).toEqual(['unreserved']);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('repeat on request', () => {
  it('returns the last message', () => {
    attach();
    announcer.announce('Added: and then I stopped. Excerpt is now four sentences.');
    announcer.announce('Excerpt is now five sentences.');
    spokenFrom(polite, 500);

    expect(announcer.repeatLast()).toMatchObject({
      message: 'Excerpt is now five sentences.',
    });
  });

  it('speaks the repeat again without the original action being redone', () => {
    attach();
    announcer.announce('Sentence four of twelve.');
    expect(spokenFrom(polite, 500)).toEqual(['Sentence four of twelve.']);

    announcer.repeatLast();
    expect(spokenFrom(polite, 500)).toEqual(['Sentence four of twelve.']);
  });

  it('returns null before anything has been announced', () => {
    attach();
    expect(announcer.repeatLast()).toBeNull();
    expect(announcer.getLast()).toBeNull();
  });

  it('keeps every announcement retrievable, oldest first, capped at the limit', () => {
    const limited = createAnnouncer({
      intervalMs: INTERVAL_MS,
      clearGapMs: CLEAR_GAP_MS,
      historyLimit: 3,
    });
    limited.attachRegion('polite', polite);

    for (const message of ['a', 'b', 'c', 'd']) limited.announce(message);

    expect(limited.getHistory().map((entry) => entry.message)).toEqual(['b', 'c', 'd']);
    limited.reset();
  });

  it('publishes each announcement to subscribers in order', () => {
    attach();
    const seen: string[] = [];
    const unsubscribe = announcer.subscribe((announcement) => seen.push(announcement.message));

    announcer.announce('first');
    announcer.announce('second');
    unsubscribe();
    announcer.announce('third');

    expect(seen).toEqual(['first', 'second']);
  });
});

describe('reset', () => {
  it('clears the queue, the region, and the history', () => {
    attach();
    announcer.announce('one');
    announcer.announce('two');
    vi.advanceTimersByTime(CLEAR_GAP_MS);

    announcer.reset();

    expect(polite.textContent).toBe('');
    expect(announcer.getHistory()).toEqual([]);
    expect(spokenFrom(polite, 500)).toEqual([]);
  });
});
