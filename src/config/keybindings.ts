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
  | 'segment.speaker'
  | 'segment.timestamp'
  | 'position.report'
  | 'excerpt.code'
  | 'excerpt.note'
  | 'excerpt.open'
  | 'excerpt.menu'
  | 'codes.save'
  | 'codes.close'
  | 'codes.focusSearch'
  | 'codes.codebook'
  | 'note.open'
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

/**
 * Windows and Linux: Ctrl+Alt base layer.
 *
 * The movement chords went with D-038. Moving through a transcript is the
 * browser's and the screen reader's job — Tab, Shift+Tab, browse mode, scroll —
 * and an application layer over the top of that was a second set of keys to
 * learn for something the user's own software already did.
 */
const windowsLinuxBindings: Record<Command, Chord> = {
  'segment.speaker': { key: 's', ctrl: true, alt: true },
  'segment.timestamp': { key: 't', ctrl: true, alt: true },
  'position.report': { key: 'p', ctrl: true, alt: true },

  'excerpt.code': { key: 'Enter', ctrl: true, alt: true },
  'excerpt.note': { key: 'n', ctrl: true, alt: true },
  'excerpt.open': { key: 'o', ctrl: true, alt: true },
  'excerpt.menu': { key: 'F10', shift: true },

  'codes.save': { key: 'Enter', ctrl: true, alt: true, shift: true },
  'codes.close': { key: 'Escape' },
  'codes.focusSearch': { key: 'f', ctrl: true, alt: true },
  // The pair, per D-053: F always means the panel, B always means the codebook.
  'codes.codebook': { key: 'b', ctrl: true, alt: true },

  // D-055. M for memo: N is already the chord that writes a new note, and this
  // is the one that opens an existing one.
  'note.open': { key: 'm', ctrl: true, alt: true },

  'help.shortcuts': { key: '/', ctrl: true, alt: true },
};

/** macOS: Ctrl+Shift base layer, avoiding Ctrl+Option which VoiceOver owns. */
const macBindings: Record<Command, Chord> = {
  'segment.speaker': { key: 's', ctrl: true, shift: true },
  'segment.timestamp': { key: 't', ctrl: true, shift: true },
  'position.report': { key: 'p', ctrl: true, shift: true },

  'excerpt.code': { key: 'Enter', ctrl: true, shift: true },
  'excerpt.note': { key: 'n', ctrl: true, shift: true },
  'excerpt.open': { key: 'o', ctrl: true, shift: true },
  // Not remapped for macOS. Shift+F10 is the platform-independent convention
  // for opening a context menu, and VoiceOver users reach the same menu
  // through their own commands rather than through this one.
  'excerpt.menu': { key: 'F10', shift: true },

  'codes.save': { key: 'Enter', ctrl: true, shift: true, meta: true },
  'codes.close': { key: 'Escape' },
  'codes.focusSearch': { key: 'f', ctrl: true, shift: true },
  'codes.codebook': { key: 'b', ctrl: true, shift: true },
  'note.open': { key: 'm', ctrl: true, shift: true },

  'help.shortcuts': { key: '/', ctrl: true, shift: true },
};

/**
 * Additional chords that reach the same command.
 *
 * The applications key is the other convention for opening a context menu, and
 * a Windows keyboard has one. It belongs here rather than in the component that
 * listens for it: a chord hardcoded in a component cannot be reassigned after
 * the pre-session smoke test, which is the whole point of this file.
 *
 * Alternates never appear on a visible control; `describeChord` shows the
 * primary chord, so a control advertises one way in rather than two.
 */
const alternateBindings: Partial<Record<Command, Chord[]>> = {
  'excerpt.menu': [{ key: 'ContextMenu' }],
};

export function bindingsFor(platform: Platform): Record<Command, Chord> {
  return platform === 'mac' ? macBindings : windowsLinuxBindings;
}

export function alternatesFor(command: Command): Chord[] {
  return alternateBindings[command] ?? [];
}

/**
 * Which layer owns Escape right now.
 *
 * Escape is the one chord whose meaning depends on context, so it is not a row
 * in the binding table, and this is where that meaning is decided. Components
 * ask rather than branching on Escape themselves.
 *
 * The layers, topmost first:
 *
 * - **The shortcuts help**, which closes and leaves everything beneath it
 *   untouched. It can open over the code panel, and closing the help must not
 *   commit or discard the panel's work.
 * - **The code panel**, where Escape closes and per D-042 commits the pending
 *   codes and the note rather than discarding them.
 * - **Nobody.** D-036 removed the in-progress range, so with no panel open
 *   there is no capture to discard and Escape belongs to the browser.
 *
 * Returns the owner rather than a `Command`, which it used to. A `help.close`
 * command would need a row in both binding tables, Escape already belongs to
 * `codes.close` there, and the collision guard would reject the pair — so the
 * owner is the honest thing to return and needs no fictional command to say it.
 */
export type EscapeOwner = 'help' | 'codePanel' | null;

export function resolveEscape(layers: {
  helpOpen?: boolean;
  panelOpen: boolean;
}): EscapeOwner {
  if (layers.helpOpen) return 'help';
  return layers.panelOpen ? 'codePanel' : null;
}

/**
 * Whether a keypress is a character that should redirect into search, per D-054.
 *
 * Not a chord, and here anyway. It is knowledge about keys, and the exclusions
 * are the whole content of it — a component with `event.key === ' '` buried in a
 * handler is exactly what `CLAUDE.md`'s failure-mode list says to grep for, and
 * the reason is that the exclusions have to be reviewable beside the chords they
 * sit next to rather than found by reading components.
 *
 * What is excluded and why:
 *
 * - **Space**, which is printable and is the one that has to be named. It
 *   toggles the checkbox the user is standing on, and D-054 keeps it.
 * - **Any modified key.** `Ctrl+Alt+F` is `codes.focusSearch`; redirecting on
 *   it would swallow every chord that happens to carry a letter.
 * - **Named keys** — Enter, Tab, arrows, Escape — which report a multi-character
 *   `key` and are excluded by the length test rather than by a list to maintain.
 *
 * Browse-mode users never reach this: their letter keys belong to their screen
 * reader and are consumed before the page sees them. That is not a gap here.
 * It is why the visible search field and `codes.focusSearch` both still exist.
 */
export function isTypeAheadCharacter(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  return event.key.length === 1 && event.key !== ' ';
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
  for (const [command, chords] of Object.entries(alternateBindings) as [Command, Chord[]][]) {
    if (chords.some((chord) => matches(event, chord))) return command;
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

function signatureOf(chord: Chord): string {
  return [
    chord.key.toLowerCase(),
    chord.ctrl ? 'c' : '',
    chord.alt ? 'a' : '',
    chord.shift ? 's' : '',
    chord.meta ? 'm' : '',
  ].join('|');
}

/**
 * Development guard. Two commands sharing a chord is a silent failure at
 * runtime, so fail loudly at startup instead.
 */
export function assertNoDuplicateChords(bindings: Record<Command, Chord>): void {
  const seen = new Map<string, Command>();
  for (const [command, chord] of Object.entries(bindings) as [Command, Chord][]) {
    const signature = signatureOf(chord);
    const existing = seen.get(signature);
    if (existing) {
      throw new Error(`Chord collision: "${existing}" and "${command}" share the same chord.`);
    }
    seen.set(signature, command);
  }

  for (const [command, chords] of Object.entries(alternateBindings) as [Command, Chord[]][]) {
    for (const chord of chords) {
      const signature = signatureOf(chord);
      const existing = seen.get(signature);
      if (existing && existing !== command) {
        throw new Error(
          `Chord collision: "${existing}" and the alternate for "${command}" share the same chord.`,
        );
      }
      seen.set(signature, command);
    }
  }
}
