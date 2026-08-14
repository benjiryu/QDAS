import { isNoteOnly } from './useExcerptSelection';
import type { ExcerptSelectionApi } from './useExcerptSelection';
import type { SavedExcerptSummary } from '../../domain';
import './excerpt.css';

/**
 * The disambiguation chooser: which of these overlapping excerpts did you mean?
 *
 * Specification: docs/patterns/excerpt-selection.md section 4, decision D-030.
 *
 * All that survives of the command strip. The strip and its five controls were
 * removed as the prototype tidied up, and this stayed because D-030 forbids
 * guessing: where two saved excerpts cover one sentence, `excerpt.open`,
 * `note.open` and a click on the passage all have to ask. Without it they would
 * announce a choice and then show nothing to choose from.
 *
 * Renders nothing at all until there is a choice pending, so the page it sits
 * on stays as clear as the removal intended.
 *
 * A temporary view: focus enters on the first option and the dismissal returns
 * it, per accessibility contract 2.4.
 */
export function ExcerptChoices({ excerpt }: { excerpt: ExcerptSelectionApi }) {
  if (excerpt.openChoices.length === 0) return null;

  /*
    One chooser for three routes, per D-055. The question is the same each time
    — which of these did you mean — so the list, the focus rules and the
    dismissal are shared, and only the wording follows which command is waiting.
  */
  const isNoteChoice = excerpt.choiceIntent === 'note';
  const label = isNoteChoice ? 'Notes here' : 'Saved excerpts here';

  /*
    What choosing a row will do. Under `auto` the list can hold both kinds at
    once, so each row says which it is rather than the heading claiming they are
    all the same.
  */
  const describeChoice = (choice: SavedExcerptSummary): string => {
    if (isNoteChoice || (excerpt.choiceIntent === 'auto' && isNoteOnly(choice))) return 'a note';
    return `${choice.codeIds.length} ${choice.codeIds.length === 1 ? 'code' : 'codes'}`;
  };

  return (
    <div className="excerpt-choices" role="group" aria-label={label}>
      <p>
        {excerpt.openChoices.length}{' '}
        {isNoteChoice
          ? 'notes on this speaker turn. Choose one to open.'
          : 'saved excerpts cover this sentence. Choose one to open.'}
      </p>
      {/* Named although its group is: a list-jump lands on the list, not on the
          container that names it. D-051. */}
      <ul className="excerpt-choices__list" aria-label={label}>
        {excerpt.openChoices.map((choice, index) => (
          <li key={choice.excerptId}>
            <button
              type="button"
              autoFocus={index === 0}
              onClick={() => excerpt.chooseSavedExcerpt(choice.excerptId)}
            >
              {/* Identified by range and what it carries, never by coder: R-4
                  keeps identities hidden until independent coding closes. */}
              Sentences {choice.startSentence} to {choice.endSentence}, {describeChoice(choice)}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={excerpt.dismissChoices}>
        Open none of them
      </button>
    </div>
  );
}
