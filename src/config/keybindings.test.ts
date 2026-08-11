import { describe, expect, it } from 'vitest';
import {
  alternatesFor,
  assertNoDuplicateChords,
  bindingsFor,
  commandFor,
  describeChord,
} from './keybindings';
import type { Chord, Command, Platform } from './keybindings';

/**
 * Specification: docs/accessibility-contract.md section 2.2, decision D-006.
 *
 * The collision guard exists because two commands sharing a chord fails
 * silently: one of them simply never runs, and which one depends on key order.
 */

const platforms: Platform[] = ['mac', 'other'];

function keyEvent(chord: Chord): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: chord.key,
    ctrlKey: Boolean(chord.ctrl),
    altKey: Boolean(chord.alt),
    shiftKey: Boolean(chord.shift),
    metaKey: Boolean(chord.meta),
  });
}

describe('the binding table', () => {
  it.each(platforms)('has no colliding chords on %s', (platform) => {
    expect(() => assertNoDuplicateChords(bindingsFor(platform))).not.toThrow();
  });

  it.each(platforms)('resolves every command back from its own chord on %s', (platform) => {
    const bindings = bindingsFor(platform);

    for (const [command, chord] of Object.entries(bindings) as [Command, Chord][]) {
      expect(commandFor(keyEvent(chord), bindings)).toBe(command);
    }
  });

  it('catches a collision when one is introduced', () => {
    // Guards the guard: a test that cannot fail would leave the real table
    // unchecked the day someone adds a duplicate.
    const speaker = bindingsFor('other')['segment.speaker'];
    const colliding = { ...bindingsFor('other'), 'help.shortcuts': speaker };

    expect(() => assertNoDuplicateChords(colliding as Record<Command, Chord>)).toThrow(/collision/i);
  });
});

describe('alternate chords', () => {
  it('reaches the context menu from the applications key as well as Shift+F10', () => {
    const bindings = bindingsFor('other');

    expect(commandFor(keyEvent({ key: 'F10', shift: true }), bindings)).toBe('excerpt.menu');
    expect(commandFor(keyEvent({ key: 'ContextMenu' }), bindings)).toBe('excerpt.menu');
  });

  it('does not collide with the primary table on either platform', () => {
    for (const platform of platforms) {
      expect(() => assertNoDuplicateChords(bindingsFor(platform))).not.toThrow();
    }
  });

  it('shows only the primary chord on a visible control', () => {
    // A control advertising two ways in is a control that reads twice as long.
    expect(alternatesFor('excerpt.menu')).toHaveLength(1);
    expect(describeChord(bindingsFor('other')['excerpt.menu'], 'other')).toBe('Shift plus F10');
  });

  it('has none for any other command', () => {
    for (const command of Object.keys(bindingsFor('other')) as Command[]) {
      if (command === 'excerpt.menu') continue;
      expect(alternatesFor(command)).toEqual([]);
    }
  });
});
