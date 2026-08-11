import { useId, useRef, useState } from 'react';
import type { CodePanelApi } from './useCodePanel';

/**
 * The note, as a progressive disclosure.
 *
 * Specification: docs/patterns/code-selection.md section 10, decisions D-020
 * and D-032.
 *
 * Collapsed to a single row, for the same reason Create code is: writing a note
 * is the occasional act, and a permanently expanded textarea gave it ten times
 * the space of the control beside it. Same shape as
 * [CreateCodeDisclosure](./CreateCodeDisclosure.tsx), deliberately: one
 * disclosure behaviour in this panel, not two.
 *
 * Two things differ from Create code.
 *
 * The row says whether a note exists. A draft behind a collapsed row is
 * invisible and still saved, so "Edit note" is what stops a coder saving a note
 * they have forgotten writing.
 *
 * It can open expanded. `excerpt.note` exists to put the coder straight into
 * this field — that is the whole difference between it and `excerpt.code` — so
 * when the panel opens for that command the row starts open and the panel's own
 * focus effect lands inside it.
 */
export function NoteDisclosure({
  panel,
  openExpanded,
}: {
  panel: CodePanelApi;
  /** True when `excerpt.note` opened the panel. Section 4 of excerpt-selection. */
  openExpanded: boolean;
}) {
  const fieldId = useId();
  const [isOpen, setIsOpen] = useState(openExpanded);

  const rowRef = useRef<HTMLButtonElement | null>(null);

  const { noteText, setNoteText, setNoteElement } = panel;
  const hasDraft = noteText.trim() !== '';

  function open() {
    setIsOpen(true);
    // After the field exists. The panel's opening effect focuses it when
    // `excerpt.note` opened the panel; this covers every other route in.
    queueMicrotask(() => document.getElementById(fieldId)?.focus());
  }

  function close() {
    setIsOpen(false);
    // Contract 2.4: a temporary view returns focus where it came from.
    queueMicrotask(() => rowRef.current?.focus());
  }

  return (
    <div className="code-panel__region" data-region="note">
      <button
        type="button"
        ref={rowRef}
        className="code-panel__create-row"
        aria-expanded={isOpen}
        aria-controls={fieldId}
        data-has-note={hasDraft ? '' : undefined}
        onClick={() => (isOpen ? close() : open())}
      >
        <span className="code-panel__create-plus" aria-hidden="true">
          {hasDraft ? '✎' : '+'}
        </span>
        {hasDraft ? 'Edit note' : 'Add note'}
      </button>

      {/*
        Rendered only while open, so the draft lives in the panel rather than in
        the DOM: collapsing never discards what was typed, and the cancel
        confirmation keeps counting it.
      */}
      {isOpen ? (
        <div
          onKeyDown={(event) => {
            // Escape collapses the row and stops there. The panel's own Escape
            // handler cancels everything, and one key should not do two things.
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            close();
          }}
        >
          <label htmlFor={fieldId}>Note about this excerpt (optional)</label>
          <textarea
            id={fieldId}
            ref={setNoteElement}
            className="code-panel__note-input"
            rows={3}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
