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

/** What the note is attached to. */
export type NoteTarget =
  /** A capture with no record yet: saving is what creates the excerpt. */
  | { kind: 'capture' }
  /** An excerpt already saved, with its existing note where it has one. */
  | { kind: 'excerpt'; excerptId: Id; noteId: Id | null };

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
  open: (options: { target: NoteTarget; label: string; text?: string }) => void;
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

export function useNotePanel({ onCommit }: Options): NotePanelApi {
  const announcer = useAnnouncer();

  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [target, setTarget] = useState<NoteTarget>({ kind: 'capture' });
  /** What it opened holding, so closing can tell a change from a no-op. */
  const [openedWith, setOpenedWith] = useState('');

  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const setFieldElement = useCallback((node: HTMLTextAreaElement | null) => {
    fieldRef.current = node;
  }, []);

  const open = useCallback<NotePanelApi['open']>(
    ({ target: nextTarget, label: nextLabel, text: nextText = '' }) => {
      setTarget(nextTarget);
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
    onCommit({ outcome, target, text: trimmed });
  }, [onCommit, openedWith, target, text]);

  return {
    isOpen,
    label,
    text,
    setText,
    isLoaded: openedWith.trim() !== '',
    open,
    close,
    setFieldElement,
  };
}
