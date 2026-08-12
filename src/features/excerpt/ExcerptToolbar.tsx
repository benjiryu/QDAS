import { useMemo } from 'react';
import { bindingsFor, describeChord, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import { describeExcerptSize, excerptSize } from '../../domain';
import type { ResolvedSource } from '../../domain';
import type { ExcerptCommand, ExcerptSelectionApi } from './useExcerptSelection';
import './excerpt.css';

/**
 * The excerpt strip.
 *
 * Specification: docs/patterns/excerpt-selection.md sections 4 and 6, decision
 * D-036.
 *
 * Three controls where v0.1 had fourteen. The boundary groups, the revert
 * control, and the read-back group went with the commands they invoked; what
 * remains is capture, capture-into-a-note, and reopening a saved excerpt, each
 * showing its chord.
 *
 * Placement is unchanged: directly below the position ribbon, above the
 * transcript, in normal flow, not sticky. A bar pinned to the viewport eats
 * vertical space contract 2.5 needs left for reading at 400% zoom, and the
 * chords plus the return-to-position control cover the scroll distance.
 */

const CONTROLS: { command: ExcerptCommand; label: string }[] = [
  // Named for what they do to the selection, matching the context menu items in
  // section 2 word for word: the menu adds no capability the strip lacks.
  //
  // Two, not three. `excerpt.open` has no control of its own: D-038 names five
  // for the whole strip, and contract 2.2 no longer asks every command to carry
  // one. It stays reachable by chord and by clicking a coded highlight, which
  // is the route D-030 specifies.
  { command: 'excerpt.code', label: 'Code selection' },
  { command: 'excerpt.note', label: 'Add note' },
];

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

      <div className="excerpt-toolbar__group" role="group" aria-label="Excerpt">
        {CONTROLS.map(({ command, label }) => {
          const status = excerpt.availability[command];

          return (
            <button
              key={command}
              type="button"
              className="excerpt-toolbar__button"
              aria-disabled={status.available ? undefined : true}
              data-command={command}
              // A button's mousedown collapses the document selection before its
              // click handler runs, which would destroy the very range the
              // control exists to capture. Suppressing the default keeps the
              // selection alive long enough to read it; focus is moved
              // explicitly by the capture itself.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => excerpt.run(command)}
            >
              {label}
              <kbd className="excerpt-toolbar__chord" aria-hidden="true">
                {describeChord(bindings[command as Command], platform)}
              </kbd>
            </button>
          );
        })}
      </div>

      {/*
        Two or more saved excerpts cover this sentence, so the coder chooses.
        A temporary view: focus enters on the first option and returns to the
        strip when it is dismissed, per accessibility contract 2.4.
      */}
      {excerpt.openChoices.length > 0 ? (
        <div className="excerpt-toolbar__choices" role="group" aria-label="Saved excerpts here">
          <p>
            {excerpt.openChoices.length} saved excerpts cover this sentence. Choose one to open.
          </p>
          {/* Named although its group is: a list-jump lands on the list, not
              on the container that names it. D-051. */}
          <ul className="excerpt-toolbar__choice-list" aria-label="Saved excerpts here">
            {excerpt.openChoices.map((choice, index) => (
              <li key={choice.excerptId}>
                <button
                  type="button"
                  autoFocus={index === 0}
                  onClick={() => excerpt.chooseSavedExcerpt(choice.excerptId)}
                >
                  {/* Identified by range and code count, never by coder: R-4
                      keeps identities hidden until independent coding closes. */}
                  Sentences {choice.startSentence} to {choice.endSentence}, {choice.codeIds.length}{' '}
                  {choice.codeIds.length === 1 ? 'code' : 'codes'}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={excerpt.dismissChoices}>
            Open none of them
          </button>
        </div>
      ) : null}
    </section>
  );
}

const STATE_LABELS: Record<string, string> = {
  idle: 'No excerpt in progress',
  confirmed: 'Excerpt captured',
  saved: 'Excerpt saved',
};
