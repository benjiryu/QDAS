/**
 * Single source for keyboard chords.
 *
 * Components dispatch and listen for logical command names. No component
 * hardcodes a chord. Reassignment after the pre-session smoke test must be a
 * single edit in this file.
 *
 * Specification: docs/patterns/transcript-segment.md section 4,
 * docs/accessibility-contract.md section 2.2, decision D-006.
 *
 * Why chords differ by platform:
 *   Alt+Arrow      browser Back and Forward on Windows and Linux
 *   Alt+letter     opens browser menus on Windows and Linux; dead keys on macOS
 *   Alt+Shift+key  triggers Firefox accesskeys; switches input language on Windows
 *   Ctrl+Option    the VoiceOver modifier on macOS, unusable
 *   Ctrl+Alt       clear for JAWS and NVDA, but is AltGr on non-US layouts
 *
 * Every one of these is provisional until verified against JAWS, NVDA, and
 * VoiceOver on real hardware. That verification is a session gate.
 */

export type Command =
  | 'segment.next'
  | 'segment.previous'
  | 'turn.next'
  | 'turn.previous'
  | 'segment.repeat'
  | 'segment.speaker'
  | 'segment.timestamp'
  | 'position.report'
  | 'position.return'
  | 'excerpt.code'
  | 'excerpt.note'
  | 'excerpt.open'
  | 'codes.save'
  | 'codes.cancel'
  | 'codes.focusSearch'
  | 'codes.clearSearch'
  | 'help.shortcuts';

export interface Chord {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export type Platform = 'mac' | 'other';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'mac' : 'other';
}

/** Windows and Linux: Ctrl+Alt base layer, Ctrl+Alt+Shift for excerpt boundaries. */
const windowsLinuxBindings: Record<Command, Chord> = {
  'segment.next': { key: 'ArrowDown', ctrl: true, alt: true },
  'segment.previous': { key: 'ArrowUp', ctrl: true, alt: true },
  'turn.next': { key: 'ArrowRight', ctrl: true, alt: true },
  'turn.previous': { key: 'ArrowLeft', ctrl: true, alt: true },
  'segment.repeat': { key: 'r', ctrl: true, alt: true },
  'segment.speaker': { key: 's', ctrl: true, alt: true },
  'segment.timestamp': { key: 't', ctrl: true, alt: true },
  'position.report': { key: 'p', ctrl: true, alt: true },
  'position.return': { key: 'Home', ctrl: true, alt: true },

  'excerpt.code': { key: 'Enter', ctrl: true, alt: true },
  'excerpt.note': { key: 'n', ctrl: true, alt: true },
  'excerpt.open': { key: 'o', ctrl: true, alt: true },

  'codes.save': { key: 'Enter', ctrl: true, alt: true, shift: true },
  'codes.cancel': { key: 'Escape' },
  'codes.focusSearch': { key: 'f', ctrl: true, alt: true },
  'codes.clearSearch': { key: 'Backspace', ctrl: true, alt: true },

  'help.shortcuts': { key: '/', ctrl: true, alt: true },
};

/** macOS: Ctrl+Shift base layer, avoiding Ctrl+Option which VoiceOver owns. */
const macBindings: Record<Command, Chord> = {
  'segment.next': { key: 'ArrowDown', ctrl: true, shift: true },
  'segment.previous': { key: 'ArrowUp', ctrl: true, shift: true },
  'turn.next': { key: 'ArrowRight', ctrl: true, shift: true },
  'turn.previous': { key: 'ArrowLeft', ctrl: true, shift: true },
  'segment.repeat': { key: 'r', ctrl: true, shift: true },
  'segment.speaker': { key: 's', ctrl: true, shift: true },
  'segment.timestamp': { key: 't', ctrl: true, shift: true },
  'position.report': { key: 'p', ctrl: true, shift: true },
  'position.return': { key: 'Home', ctrl: true, shift: true },

  'excerpt.code': { key: 'Enter', ctrl: true, shift: true },
  'excerpt.note': { key: 'n', ctrl: true, shift: true },
  'excerpt.open': { key: 'o', ctrl: true, shift: true },

  'codes.save': { key: 'Enter', ctrl: true, shift: true, meta: true },
  'codes.cancel': { key: 'Escape' },
  'codes.focusSearch': { key: 'f', ctrl: true, shift: true },
  'codes.clearSearch': { key: 'Backspace', ctrl: true, shift: true },

  'help.shortcuts': { key: '/', ctrl: true, shift: true },
};

export function bindingsFor(platform: Platform): Record<Command, Chord> {
  return platform === 'mac' ? macBindings : windowsLinuxBindings;
}

/**
 * Escape is the one chord whose meaning depends on context, so it is not a row
 * in the binding table.
 *
 * With the code panel open it cancels the panel. With the panel closed it means
 * nothing: D-036 removed the in-progress range, so there is no capture to
 * discard outside the panel and Escape belongs to the browser.
 *
 * Components call this rather than branching on Escape themselves.
 */
export function resolveEscape(panelOpen: boolean): Command | null {
  return panelOpen ? 'codes.cancel' : null;
}

export function matches(event: KeyboardEvent, chord: Chord): boolean {
  return (
    event.key.toLowerCase() === chord.key.toLowerCase() &&
    event.ctrlKey === Boolean(chord.ctrl) &&
    event.altKey === Boolean(chord.alt) &&
    event.shiftKey === Boolean(chord.shift) &&
    event.metaKey === Boolean(chord.meta)
  );
}

export function commandFor(
  event: KeyboardEvent,
  bindings: Record<Command, Chord>,
): Command | null {
  for (const [command, chord] of Object.entries(bindings) as [Command, Chord][]) {
    if (matches(event, chord)) return command;
  }
  return null;
}

/** Human-readable label for the visible control that accompanies each command. */
export function describeChord(chord: Chord, platform: Platform): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Control');
  if (chord.alt) parts.push(platform === 'mac' ? 'Option' : 'Alt');
  if (chord.shift) parts.push('Shift');
  if (chord.meta) parts.push(platform === 'mac' ? 'Command' : 'Meta');
  parts.push(chord.key);
  return parts.join(' plus ');
}

/**
 * Development guard. Two commands sharing a chord is a silent failure at
 * runtime, so fail loudly at startup instead.
 */
export function assertNoDuplicateChords(bindings: Record<Command, Chord>): void {
  const seen = new Map<string, Command>();
  for (const [command, chord] of Object.entries(bindings) as [Command, Chord][]) {
    const signature = [
      chord.key.toLowerCase(),
      chord.ctrl ? 'c' : '',
      chord.alt ? 'a' : '',
      chord.shift ? 's' : '',
      chord.meta ? 'm' : '',
    ].join('|');
    const existing = seen.get(signature);
    if (existing) {
      throw new Error(`Chord collision: "${existing}" and "${command}" share the same chord.`);
    }
    seen.set(signature, command);
  }
}
