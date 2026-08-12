import { useId, useRef, useState } from 'react';
import { CreateCodeForm } from './CreateCodeForm';
import type { CodePanelApi } from './useCodePanel';

/**
 * Create code, as a progressive disclosure.
 *
 * Specification: docs/patterns/code-selection.md section 7, decision D-039.
 *
 * Collapsed to a single row, because creating a code is the rare act and the
 * form was five fields of permanent clutter above the note field.
 *
 * A button and a conditionally rendered form rather than `<details>`: the focus
 * moves D-039 requires — into the name field on expanding, back to the row on
 * collapsing or on Escape — are not what a disclosure widget does on its own,
 * and a native `<summary>` cannot be told to hand focus onward.
 */
export function CreateCodeDisclosure({ panel }: { panel: CodePanelApi }) {
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const rowRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  function open() {
    setIsOpen(true);
    // After the form exists. Focus lands on the first field, so the coder is
    // typing the name rather than hunting for where the row went.
    queueMicrotask(() => nameRef.current?.focus());
  }

  function close() {
    setIsOpen(false);
    // Contract 2.4: a temporary view returns focus where it came from.
    queueMicrotask(() => rowRef.current?.focus());
  }

  return (
    <div className="code-panel__region" data-region="create">
      <button
        type="button"
        ref={rowRef}
        className="code-panel__create-row"
        aria-expanded={isOpen}
        aria-controls={formId}
        onClick={() => (isOpen ? close() : open())}
      >
        <span className="code-panel__create-plus" aria-hidden="true">
          +
        </span>
        Create new code
      </button>

      {isOpen ? (
        <div
          id={formId}
          onKeyDown={(event) => {
            // Escape collapses without discarding anything else. The panel's own
            // Escape handler closes the whole panel, so this stops here rather
            // than letting one key do two things at once.
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            close();
          }}
        >
          <CreateCodeForm panel={panel} nameRef={nameRef} onCreated={close} />
        </div>
      ) : null}
    </div>
  );
}
