import { useMemo } from 'react';
import { bindingsFor, describeChord, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { describeExcerptSize, excerptSize } from '../../domain';
import type { ResolvedSource } from '../../domain';
import type { ExcerptCommand, ExcerptSelectionApi } from './useExcerptSelection';
import './excerpt.css';

/**
 * The excerpt controls.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 4, 6, 7.
 *
 * D-018 leaves presentation to the implementer and fixes behaviour. The
 * behaviour that is fixed and visible here: every command has a control, the
 * revert control appears only in `adjusting`, and the toolbar holds one place
 * in the layout and never follows the selection.
 *
 * Placement: directly below the position ribbon, above the transcript, in
 * normal flow. Not sticky, because a bar pinned to the viewport eats vertical
 * space that contract 2.5 needs left for reading at 400% zoom. The cost is that
 * a user far down a long transcript scrolls to reach the buttons; the chords
 * and the return-to-position control cover that, and every control keeps the
 * same location on every invocation, which is the predictability the
 * magnification interview asked for.
 */

/** Grouped by what they do, in the order the workflow uses them. */
const GROUPS: { label: string; commands: { command: ExcerptCommand; label: string }[] }[] = [
  {
    label: 'Excerpt',
    commands: [
      { command: 'excerpt.begin', label: 'Begin excerpt' },
      { command: 'excerpt.confirm', label: 'Confirm' },
      { command: 'excerpt.discard', label: 'Discard' },
    ],
  },
  {
    label: 'Start boundary',
    commands: [
      { command: 'excerpt.start.expand', label: 'Expand start' },
      { command: 'excerpt.start.contract', label: 'Contract start' },
      { command: 'excerpt.start.expandTurn', label: 'Expand start by turn' },
    ],
  },
  {
    label: 'End boundary',
    commands: [
      { command: 'excerpt.end.expand', label: 'Expand end' },
      { command: 'excerpt.end.contract', label: 'Contract end' },
      { command: 'excerpt.end.expandTurn', label: 'Expand end by turn' },
    ],
  },
  {
    label: 'Review',
    commands: [
      { command: 'excerpt.read', label: 'Read excerpt' },
      { command: 'excerpt.contextBefore', label: 'Context before' },
      { command: 'excerpt.contextAfter', label: 'Context after' },
      { command: 'excerpt.speakers', label: 'Speakers' },
      { command: 'excerpt.timestamps', label: 'Timestamps' },
    ],
  },
];

const CHORDLESS: ExcerptCommand[] = ['excerpt.speakers', 'excerpt.timestamps'];

/** Focus lands here when an excerpt begins, per section 6. */
const FIRST_CONTROL = GROUPS[0].commands[0].command;

interface ExcerptToolbarProps {
  excerpt: ExcerptSelectionApi;
  resolved: ResolvedSource;
}

export function ExcerptToolbar({ excerpt, resolved }: ExcerptToolbarProps) {
  const platform = useMemo(() => detectPlatform(), []);
  const bindings = useMemo(() => bindingsFor(platform), [platform]);

  const { selection } = excerpt;
  const size = selection.range ? excerptSize(resolved, selection.range) : null;

  return (
    <section className="excerpt-toolbar" aria-label="Excerpt">
      <p className="excerpt-toolbar__status">
        <span className="excerpt-toolbar__state" data-state={selection.state}>
          {STATE_LABELS[selection.state]}
        </span>
        {size ? <span className="excerpt-toolbar__size">{describeExcerptSize(size)}</span> : null}
      </p>

      {GROUPS.map((group) => (
        <div key={group.label} className="excerpt-toolbar__group" role="group" aria-label={group.label}>
          {group.commands.map(({ command, label }) => {
            // The revert control exists only in `adjusting`, which is the whole
            // reason `anchored` and `adjusting` are separate states.
            const status = excerpt.availability[command];

            return (
              <button
                key={command}
                type="button"
                ref={command === FIRST_CONTROL ? excerpt.firstControlRef : undefined}
                className="excerpt-toolbar__button"
                aria-disabled={status.available ? undefined : true}
                data-command={command}
                onClick={() => excerpt.run(command)}
              >
                {label}
                {CHORDLESS.includes(command) ? null : (
                  <kbd className="excerpt-toolbar__chord" aria-hidden="true">
                    {describeChord(bindings[command as Command], platform)}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {selection.state === 'adjusting' ? (
        <div className="excerpt-toolbar__group" role="group" aria-label="Revert">
          <button
            type="button"
            className="excerpt-toolbar__button"
            data-command="excerpt.revert"
            onClick={() => excerpt.run('excerpt.revert')}
          >
            Revert to start
            <kbd className="excerpt-toolbar__chord" aria-hidden="true">
              {describeChord(bindings['excerpt.revert'], platform)}
            </kbd>
          </button>
        </div>
      ) : null}
    </section>
  );
}

const STATE_LABELS: Record<string, string> = {
  idle: 'No excerpt in progress',
  anchored: 'Excerpt started',
  adjusting: 'Adjusting boundaries',
  confirmed: 'Excerpt confirmed',
  saved: 'Excerpt saved',
};
