import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import type { Id } from '../../domain';

/**
 * The isolated note panel's state.
 *
 * Specification: decision D-055, docs/patterns/excerpt-selection.md sections 3
 * and 4.
 *
 * Session evidence drove this: reaching the note field through the whole code
 * panel cost too much. A coder recording a thought about a passage had to open
 * code selection and travel past search, results, the codebook, proposed codes
 * and create-code before opening a disclosure — eight regions to write one
 * sentence. This is the field on its own.
 *
 * What the panel means and what writes the records are kept apart. The panel
 * decides *what closing did* — the D-042 idiom applied to notes — and the
 * workspace, which owns the records, performs it.
 */

/**
 * Where a note the panel writes attaches, per D-055 and D-058.
 *
 * The three scopes D-058 restored are derived from the record rather than
 * stored on it, so these are about what the panel is *doing* rather than about
 * a field: creating against a capture, editing what an excerpt already carries,
 * editing a note that hangs off a source or the project, or writing a new one
 * where the scope is still the writer's to choose.
 */
export type NoteTarget =
  /** A capture with no record yet: saving is what creates the excerpt. */
  | { kind: 'capture' }
  /** An excerpt already saved, with its existing note where it has one. */
  | { kind: 'excerpt'; excerptId: Id; noteId: Id | null }
  /** An existing file-wide or project note, reached from the Notes page. */
  | { kind: 'note'; noteId: Id }
  /**
   * A new note with no excerpt, written from the Notes page.
   *
   * `scope` is a source id or the project, and unlike the others it is the
   * writer's to change before saving — which is why it is the one target that
   * carries a field the panel renders.
   */
  | { kind: 'new'; scope: NoteWriteScope };

/** A source id, or the project. D-058. */
export type NoteWriteScope = { sourceId: Id } | 'project';

/** One option in the scope field. */
export interface NoteScopeOption {
  value: string;
  label: string;
}

/**
 * What closing the panel did.
 *
 * Every exit commits, per D-055 and the D-042 idiom it applies: there is one
 * rule to learn, which is that leaving keeps your work.
 */
export type NoteOutcome =
  /** Text to write: a new note, or a change to the one that was loaded. */
  | 'saved'
  /** A note that was loaded and has been emptied. Emptying is how you delete. */
  | 'deleted'
  /** A fresh capture with nothing written. No record is created. */
  | 'discarded'
  /** Opened and closed without changing anything. */
  | 'unchanged';

export interface NoteCommit {
  outcome: NoteOutcome;
  target: NoteTarget;
  /** Trimmed. Empty on `deleted` and `discarded`. */
  text: string;
}

export interface NotePanelApi {
  isOpen: boolean;
  /** Names the excerpt in the heading, per D-055. */
  label: string;
  text: string;
  setText: (text: string) => void;
  /** True when it opened on an existing note rather than a blank one. */
  isLoaded: boolean;
  open: (options: {
    target: NoteTarget;
    label: string;
    text?: string;
    /**
     * Offered only when the scope is still the writer's to choose, which is a
     * new non-excerpt note. Editing one leaves it where it is: D-058 specifies
     * the field for creation and says nothing about moving a note between
     * scopes, so the build does not invent the move.
     */
    scopeOptions?: NoteScopeOption[];
  }) => void;
  /** The chosen scope, while a new non-excerpt note is being written. */
  scopeOptions: NoteScopeOption[];
  scope: string;
  setScope: (value: string) => void;
  /** The single exit. Escape, the close control, and clicking outside all land here. */
  close: () => void;
  setFieldElement: (node: HTMLTextAreaElement | null) => void;
}

interface Options {
  /**
   * Performs what closing decided, then returns focus. Called once per close,
   * including for `unchanged`, so the caller has one place to put the return.
   */
  onCommit: (commit: NoteCommit) => void;
}

/** The scope field's value for the project, which has no id of its own. */
export const PROJECT_SCOPE = 'project';

export function useNotePanel({ onCommit }: Options): NotePanelApi {
  const announcer = useAnnouncer();

  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [target, setTarget] = useState<NoteTarget>({ kind: 'capture' });
  const [scopeOptions, setScopeOptions] = useState<NoteScopeOption[]>([]);
  const [scope, setScope] = useState('');
  /** What it opened holding, so closing can tell a change from a no-op. */
  const [openedWith, setOpenedWith] = useState('');

  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const setFieldElement = useCallback((node: HTMLTextAreaElement | null) => {
    fieldRef.current = node;
  }, []);

  const open = useCallback<NotePanelApi['open']>(
    ({ target: nextTarget, label: nextLabel, text: nextText = '', scopeOptions: options = [] }) => {
      setTarget(nextTarget);
      setScopeOptions(options);
      setScope(
        nextTarget.kind === 'new'
          ? nextTarget.scope === 'project'
            ? PROJECT_SCOPE
            : nextTarget.scope.sourceId
          : '',
      );
      setLabel(nextLabel);
      setText(nextText);
      setOpenedWith(nextText);
      setIsOpen(true);

      /*
        Loaded and new are announced differently, the D-036 honesty idiom: which
        case fired is stated rather than left to be worked out from whether the
        field happens to be empty. A coder who thinks they are writing a new note
        while editing an old one destroys the old one on the way past.
      */
      announcer.announce(
        nextText.trim() === ''
          ? `Note. ${nextLabel}. New note. Field focused.`
          : `Note. ${nextLabel}. Existing note loaded. Field focused.`,
      );
    },
    [announcer],
  );

  /*
    Focus lands in the field on open.

    In an effect keyed on the transition rather than at the end of `open`,
    because the field does not exist until this state change has rendered — and
    a `queueMicrotask` from `open` still runs too early, leaving the dialog to
    take focus onto itself. The same shape `useCodePanel` uses for the same
    reason.
  */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen === wasOpen.current) return;
    wasOpen.current = isOpen;
    if (!isOpen) return;
    fieldRef.current?.focus?.();
  }, [isOpen]);

  const close = useCallback(() => {
    const trimmed = text.trim();
    const had = openedWith.trim() !== '';

    /*
      The four cases, per D-055. Text saves; a loaded note emptied is deleted,
      which is the only deletion route the panel offers and is deliberate rather
      than a side effect; a fresh capture with nothing written creates no record
      and the capture goes; anything else changed nothing.
    */
    const outcome: NoteOutcome =
      trimmed !== ''
        ? trimmed === openedWith.trim()
          ? 'unchanged'
          : 'saved'
        : had
          ? 'deleted'
          : target.kind === 'capture'
            ? 'discarded'
            : 'unchanged';

    setIsOpen(false);
    setText('');
    setOpenedWith('');
    setScopeOptions([]);

    // The scope the writer settled on, folded back into the target so the
    // caller writes the note where the field says rather than where it opened.
    const committed: NoteTarget =
      target.kind === 'new'
        ? { kind: 'new', scope: scope === PROJECT_SCOPE ? 'project' : { sourceId: scope } }
        : target;

    onCommit({ outcome, target: committed, text: trimmed });
  }, [onCommit, openedWith, scope, target, text]);

  return {
    isOpen,
    label,
    text,
    setText,
    scopeOptions,
    scope,
    setScope,
    isLoaded: openedWith.trim() !== '',
    open,
    close,
    setFieldElement,
  };
}
