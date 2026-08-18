import { useEffect, useId } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { lineageDescription, parentPathOf, buildCodeTree } from '../codes/codeTree';
import { ASSIGNABLE_HUES } from './familyHues';
import { editorOwnsEscape } from './useCodeEditor';
import type { CodeEditorApi } from './useCodeEditor';
import { isShortcutsHelpOpen } from '../help/shortcutsHelpStore';
import './codeEditor.css';

/**
 * The code editor, per D-070.
 *
 * The container is the code panel's, reused as the note panel and the shortcuts
 * help already reuse it: the centring, the internal scroll and the sizing that
 * keeps a dialog usable at 400 percent zoom are solved there, and a second copy
 * would be a second thing to keep in step.
 *
 * What is different is the footer. Save is the only thing that writes; the close
 * control, Escape and a click outside all discard. That inversion of D-042 is
 * the decision's, and the reason is in `useCodeEditor`.
 */

const PROBLEM_MESSAGES = {
  nameMissing: 'A code needs a name. Nothing you typed has been lost.',
  nameTaken: 'Another code already has that name. Names are unique across the codebook.',
  colorMissing: 'A family needs a colour, so its codes can be told apart at a glance.',
} as const;

export function CodeEditorPanel({ editor }: { editor: CodeEditorApi }) {
  const headingId = useId();
  const nameId = useId();
  const definitionId = useId();
  const parentId = useId();
  const colorId = useId();
  const errorId = useId();

  /*
    Escape, asked of `resolveEscape` rather than left to React Aria.

    The note panel lets the library have it, because nothing stacks above that
    one. This panel's Escape discards, and the shortcuts help can open above it
    — so the key has to be refused while the help is up, or asking what a chord
    does would cost the coder the code they were defining.
  */
  useEffect(() => {
    if (!editor.isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (!editorOwnsEscape(isShortcutsHelpOpen())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.discard();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  /*
    Pulled out before use. Passing `editor.setNameElement` straight to `ref=`
    marks the whole object as holding a ref, and every other read of it in this
    render then trips `react-hooks/refs` — the shape `CodePanel` already avoids.
  */
  const { setNameElement } = editor;

  const problems = editor.showProblems ? editor.problems : [];
  const tree = buildCodeTree(editor.parents);

  return (
    <ModalOverlay
      className="code-panel__overlay"
      isOpen={editor.isOpen}
      /* Clicking outside discards, per D-070: it is not Save. */
      onOpenChange={(open) => {
        if (!open) editor.discard();
      }}
      isDismissable
      isKeyboardDismissDisabled
    >
      <Modal className="code-editor__modal">
        <Dialog className="code-panel__surface" aria-labelledby={headingId}>
          <div className="code-panel code-editor" data-region="code-editor">
            <div className="code-panel__header">
              <h2 id={headingId} className="code-panel__heading">
                {editor.mode === 'accept' ? 'Accept code' : 'New code'}
              </h2>
              {/* Named Discard, not Close: a control that throws work away has
                  to say so, which is the same reason D-042 renamed Cancel. */}
              <button type="button" className="code-panel__close" onClick={editor.discard}>
                <span aria-hidden="true">×</span>
                <span className="code-panel__close-label">Discard</span>
              </button>
            </div>

            <div className="code-panel__scroll" data-scroll-region>
              {problems.length > 0 ? (
                <div id={errorId} className="code-panel__error" data-editor-error>
                  {problems.map((problem) => (
                    <p key={problem}>{PROBLEM_MESSAGES[problem]}</p>
                  ))}
                </div>
              ) : null}

              <div className="code-panel__field">
                <label htmlFor={nameId}>Code name</label>
                <input
                  id={nameId}
                  ref={setNameElement}
                  type="text"
                  value={editor.draft.name}
                  required
                  aria-describedby={problems.length > 0 ? errorId : undefined}
                  onChange={(event) => editor.setName(event.target.value)}
                />
              </div>

              <div className="code-panel__field">
                {/* One open-ended definition, per D-046. */}
                <label htmlFor={definitionId}>Definition</label>
                <textarea
                  id={definitionId}
                  rows={4}
                  value={editor.draft.definition}
                  onChange={(event) => editor.setDefinition(event.target.value)}
                />
              </div>

              {editor.canPlace ? (
                <>
                  {/*
                    A native select, which exposes role combobox and carries
                    typeahead without recreating either. The lineage rides in
                    each option's text through `lineageDescription`, so the
                    wording is D-054's — an option has no description channel,
                    which is the one place that treatment cannot be followed
                    exactly.

                    Only families and their children are here, which is how
                    D-070 caps depth at grandchild.
                  */}
                  <div className="code-panel__field">
                    <label htmlFor={parentId}>Parent code</label>
                    <select
                      id={parentId}
                      value={editor.draft.parentCodeId ?? ''}
                      onChange={(event) => editor.setParent(event.target.value || null)}
                    >
                      <option value="">None — this is a new family</option>
                      {editor.parents.map((code) => {
                        const lineage = lineageDescription(parentPathOf(tree, code.codeId));
                        return (
                          <option key={code.codeId} value={code.codeId}>
                            {lineage ? `${code.name} ${lineage}` : code.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/*
                    Only a family picks a hue; a descendant wears its family's,
                    which is what makes the transcript's family highlight mean
                    something. A pick from named hues, never a colour wheel,
                    per D-070.
                  */}
                  {editor.draft.parentCodeId === null ? (
                    <div className="code-panel__field">
                      <label htmlFor={colorId}>Colour</label>
                      <select
                        id={colorId}
                        value={editor.draft.colorToken ?? ''}
                        onChange={(event) => editor.setColor(event.target.value || null)}
                      >
                        <option value="">Choose a colour</option>
                        {ASSIGNABLE_HUES.map((hue) => (
                          <option key={hue.colorToken} value={hue.colorToken}>
                            {hue.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="code-panel__region code-panel__actions" data-region="actions">
              {/*
                `aria-disabled` rather than `disabled`, the treatment Save &
                Close already uses: the control stays reachable, and pressing it
                says what is wrong instead of doing nothing.
              */}
              <button
                type="button"
                aria-disabled={editor.problems.length > 0 ? true : undefined}
                onClick={editor.save}
                data-editor-save
              >
                Save
              </button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
