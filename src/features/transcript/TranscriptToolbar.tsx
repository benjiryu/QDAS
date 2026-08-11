import { useMemo } from 'react';
import { bindingsFor, describeChord, detectPlatform } from '../../config/keybindings';
import type { OrientationCommand, TranscriptOrientation } from './useTranscriptOrientation';

/**
 * A visible control for every orientation command.
 *
 * Specification: docs/patterns/transcript-segment.md section 4 as revised by
 * D-038, accessibility contract 2.2: every keyboard command has a visible
 * control performing the same action, so no participant is blocked by a chord
 * that fails on their setup.
 *
 * Three controls where there were eight. The five movement controls went with
 * D-038: Tab, Shift+Tab, browse mode and scrolling already move a reader
 * through a transcript, and a second set of controls for it was a second thing
 * to learn and a second thing to get wrong.
 *
 * Chords are read from src/config/keybindings.ts and never written here. The
 * hint beside each label is generated from the same binding table the keyboard
 * handler uses, so a reassignment cannot leave the label lying.
 */

const CONTROLS: { command: OrientationCommand; label: string }[] = [
  { command: 'segment.speaker', label: 'Speaker' },
  { command: 'segment.timestamp', label: 'Timestamp' },
  { command: 'position.report', label: 'Where am I' },
];

export function TranscriptToolbar({ orientation }: { orientation: TranscriptOrientation }) {
  const platform = useMemo(() => detectPlatform(), []);
  const bindings = useMemo(() => bindingsFor(platform), [platform]);

  return (
    <div className="transcript-toolbar" role="group" aria-label="Orientation">
      {CONTROLS.map(({ command, label }) => {
        const available = orientation.availability[command];

        return (
          <button
            key={command}
            type="button"
            className="transcript-toolbar__button"
            /*
              aria-disabled rather than disabled: an unavailable control stays
              reachable and says why when invoked, which contract 2.6 requires
              of a disabled control and which `disabled` cannot do, since a
              disabled button cannot be focused or activated at all.
            */
            aria-disabled={available ? undefined : true}
            onClick={() => orientation.run(command)}
          >
            {label}
            {/*
              The chord is shown, and left out of the accessible name so it is
              not repeated on every button. Reaching the chords by ear belongs
              to the shortcuts help command, which is specified and not yet built.
            */}
            <kbd className="transcript-toolbar__chord" aria-hidden="true">
              {describeChord(bindings[command], platform)}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
