import { useId } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import type { NotePanelApi } from './useNotePanel';
import './notePanel.css';

/**
 * The isolated note panel, per D-055.
 *
 * A heading naming the excerpt, one paragraph field, and the way out. Nothing
 * else — that restraint is the whole decision. The code panel's note region
 * still exists and still edits the same note; this serves the direct routes
 * from the transcript, where a coder wants to write a sentence about a passage
 * and not to choose codes.
 *
 * The container is the code panel's, reused rather than restated: D-055 asks
 * for "the code panel's container style", and a second copy of the overlay,
 * centring and sizing rules is a second thing to keep in step with the zoom
 * constraint they carry. Only the contents inside are this panel's own.
 *
 * One panel at a time. The two never stack, so Escape here has no other handler
 * to race with and React Aria owns it — unlike the code panel, which disables
 * that precisely because `useCodePanel` already owns Escape. Escape, the close
 * control, and clicking outside all reach `close`, and closing commits.
 */
export function NotePanel({ panel }: { panel: NotePanelApi }) {
  const headingId = useId();
  const fieldId = useId();

  const { isOpen, label, text, setText, isLoaded, close, setFieldElement } = panel;

  return (
    <ModalOverlay
      className="code-panel__overlay"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      isDismissable
    >
      <Modal className="code-panel__modal">
        <Dialog className="code-panel__surface" aria-labelledby={headingId}>
          <div className="code-panel note-panel" data-region="note-panel">
            <div className="code-panel__header">
              {/*
                The heading names the excerpt, per D-055, so a panel that opened
                over a transcript says which passage it is about rather than
                leaving the coder to remember.
              */}
              <h2 id={headingId} className="code-panel__heading">
                {isLoaded ? 'Edit note' : 'Add note'}: {label}
              </h2>

              {/*
                Named "Close" and not "Cancel", for the reason D-042 gave the
                code panel's: it commits what is in the field rather than
                throwing it away, so "Cancel" would name the opposite.
              */}
              <button
                type="button"
                className="code-panel__close"
                data-command="note.close"
                onClick={close}
              >
                <span aria-hidden="true">×</span>
                <span className="code-panel__close-label">Close</span>
              </button>
            </div>

            <div className="code-panel__region note-panel__field">
              {/*
                Natively associated and visible, per D-051. One field, so
                nothing here needs a region heading above its own label.
              */}
              <label htmlFor={fieldId}>Note</label>
              <textarea
                id={fieldId}
                ref={setFieldElement}
                className="note-panel__input"
                rows={5}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              {/*
                Emptying is the deletion route, and it is the one thing here a
                coder could do by accident without being told. Stated on screen
                rather than only in the closing announcement.
              */}
              {isLoaded ? (
                <p className="note-panel__hint">
                  Clearing this field and closing deletes the note.
                </p>
              ) : null}
            </div>

            <div className="code-panel__region code-panel__actions">
              <button type="button" data-command="note.save" onClick={close}>
                Save &amp; Close
              </button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
