import { useId } from 'react';
import type { PrototypeFlags } from '../../config/flags';
import type { Code } from '../../domain';
import { CreateCodeDisclosure } from './CreateCodeDisclosure';
import type { CodeNode } from './codeTree';
import type { CodePanelApi } from './useCodePanel';
import './codePanel.css';

/**
 * The Select Code card.
 *
 * Specification: docs/patterns/code-selection.md sections 2 to 7, as revised by
 * decisions D-039 and D-040.
 *
 * D-039 cut this down to the card: the verbose heading, the excerpt summary and
 * its read-back control, the visual level labels, and the pending assignment
 * region are all gone. The checkboxes are the pending state now — they were
 * always the thing the coder was actually looking at, and the region beneath
 * them restated it in a second place that could disagree.
 *
 * D-040 puts back the two affordances that removal cost, in forms that fit the
 * card: the captured excerpt as visually hidden text a screen reader user reads
 * on demand with their own commands, and an uncertainty checkbox in the footer.
 *
 * No definition control and no definition display, per D-035. The short
 * definition on each row is the only definition text here; the rest is read at
 * the Codebook destination.
 *
 * Non-modal, per D-027: no `role="dialog"`, no focus trap, no dimmed backdrop.
 * The transcript stays reachable and readable while this is open, which is the
 * property D-026 gave up and the reason it was reversed.
 *
 * The panel is a labelled region so a screen reader user browsing the document
 * finds it without tabbing. Its sub-regions are heading-labelled rather than
 * landmarks: D-039 fixes their order, and more landmarks inside one panel would
 * crowd the landmark list the accessibility contract keeps short.
 *
 * Layout follows D-033. The narrow form is primary: a full-width region below
 * the transcript. The wide form is the same sequence with the panel alongside,
 * fixed right at 360 to 400 pixels. The logical order is identical in both, and
 * the panel scrolls internally rather than holding fixed dimensions.
 */

interface CodePanelProps {
  panel: CodePanelApi;
  flags: PrototypeFlags;
  /** The captured text itself, for the hidden readback. D-040. */
  excerptText: string | null;
}

export function CodePanel({ panel, flags, excerptText }: CodePanelProps) {
  const headingId = useId();
  const searchId = useId();
  const noteId = useId();
  const uncertainId = useId();
  const saveReasonId = useId();

  // Destructured, so the search input's callback ref is a plain local. Reading
  // it off the panel object in JSX makes the ref rule treat every other read of
  // that object as a ref access during render.
  const {
    setSearchElement,
    query,
    setQuery,
    clearQuery,
    results,
    tree,
    pendingCodeIds,
    proposedCodes,
    noteText,
    setNoteText,
    uncertain,
    setUncertain,
    canSave,
    saveUnavailableReason,
    cancelPending,
    saveError,
    setErrorElement,
    setNoteElement,
  } = panel;

  if (!panel.isOpen) return null;

  return (
    <section
      className="code-panel"
      aria-labelledby={headingId}
      data-presentation={flags.codebookPresentation}
    >
      {/* 1. Heading and close. */}
      <div className="code-panel__header">
        <h2 id={headingId} className="code-panel__heading">
          Select Code
        </h2>
        {/*
          The card's close control. Named "Cancel" rather than "Close" because
          that is what D-039 says it is and what it does: it discards the
          pending codes and the draft note, asking first when there are any.
        */}
        <button
          type="button"
          className="code-panel__close"
          data-command="codes.cancel"
          onClick={panel.requestCancel}
        >
          <span aria-hidden="true">×</span>
          <span className="code-panel__close-label">Cancel</span>
        </button>
      </div>

      {/*
        The captured excerpt, per D-040. Visually hidden static text, read on
        demand with the reader's own commands and repeatable as often as they
        like.

        Deliberately not `aria-describedby` on the panel, which would recite the
        whole excerpt every time focus entered, and deliberately not a live
        region, since nothing here changes. Full text, never truncated: a
        truncated readback cannot answer the question it exists for.
      */}
      <p className="code-panel__hidden-excerpt" data-selected-excerpt>
        Selected excerpt: {excerptText ?? 'none.'}
      </p>

      {/* 2. Search field. First control in the panel, per D-005. */}
      <div className="code-panel__region">
        <h3>Search codes</h3>
        <label htmlFor={searchId}>Search the codebook</label>
        <input
          id={searchId}
          ref={setSearchElement}
          type="search"
          className="code-panel__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" onClick={clearQuery} aria-disabled={query === '' || undefined}>
          Clear search
        </button>
      </div>

      {/* 3. Search results. Present only with an active query: an always-present
          empty region is one more thing to browse past. */}
      {query.trim() !== '' ? (
        <div className="code-panel__region" data-region="search-results">
          <h3>
            {results.length} {results.length === 1 ? 'result' : 'results'} for “{query.trim()}”
          </h3>
          {results.length === 0 ? (
            <p>No codes match. The codebook below is unchanged.</p>
          ) : (
            <ul className="code-panel__list">
              {results.map((result) => (
                <li key={result.code.codeId}>
                  <CodeCheckbox code={result.code} panel={panel} />
                  {/* The parent path, so a matched child code is identifiable
                      without expanding the hierarchy. Section 5. */}
                  {result.parentPath.length > 0 ? (
                    <span className="code-panel__path"> in {result.parentPath.join(' › ')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* 4. Recently used codes, collapsed by default. */}
      {flags.showRecentCodes ? (
        <div className="code-panel__region" data-region="recent">
          <details>
            <summary>
              <h3 className="code-panel__inline-heading">Recently used codes</h3>
            </summary>
            {panel.recentCodes.length === 0 ? (
              <p>No codes used yet in this session.</p>
            ) : (
              <ul className="code-panel__list">
                {panel.recentCodes.map((code) => (
                  <li key={code.codeId}>
                    <CodeCheckbox code={code} panel={panel} />
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      ) : null}

      {/* 5. Codebook, in canonical order, present and unchanged whatever the
          search is doing. The checked boxes here are the pending assignment:
          D-039 removed the region that used to restate them. */}
      <div className="code-panel__region" data-region="codebook">
        <h3>Codebook</h3>
        <CodeList nodes={tree} panel={panel} />
      </div>

      {/* 6. Proposed codes. D-039's region order does not name this one, and
          does not list it as removed either; it has to stay, because a created
          code must be visible and checkable somewhere and the acceptance
          criterion in section 7 keeps it out of the canonical codebook. Raised
          in the task report. */}
      {flags.allowProvisionalCodes && proposedCodes.length > 0 ? (
        <div className="code-panel__region" data-region="proposed">
          <h3>Proposed codes</h3>
          <p className="code-panel__note">
            Awaiting approval. These are not part of the codebook.
          </p>
          <ul className="code-panel__list">
            {proposedCodes.map((code) => (
              <li key={code.codeId}>
                <CodeCheckbox code={code} panel={panel} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 7. Create code, collapsed. Offered only where the project permits
          provisional codes: a form that cannot produce one is a dead control. */}
      {flags.allowProvisionalCodes ? <CreateCodeDisclosure panel={panel} /> : null}

      {/* 8. Note. One per excerpt, plain text, no type: types belong to the
          notes page specification, per D-020. D-032 keeps it here rather than
          on the top bar. */}
      <div className="code-panel__region" data-region="note">
        <h3>Note</h3>
        <label htmlFor={noteId}>Note about this excerpt (optional)</label>
        <textarea
          id={noteId}
          ref={setNoteElement}
          className="code-panel__note-input"
          rows={3}
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
        />
      </div>

      {/* 9. The footer: uncertainty and Save & Close. */}
      <div className="code-panel__region code-panel__actions" data-region="actions">
        {cancelPending ? (
          // Cancel asks before destroying pending codes and a draft note.
          <div className="code-panel__confirm" data-confirm="cancel">
            <p>
              Discard {pendingCodeIds.length}{' '}
              {pendingCodeIds.length === 1 ? 'code' : 'codes'}
              {noteText.trim() === '' ? '' : ' and your note'}? Nothing has been discarded yet.
            </p>
            <button type="button" autoFocus onClick={panel.cancel}>
              Discard them
            </button>
            <button type="button" onClick={panel.keepEditing}>
              Keep editing
            </button>
          </div>
        ) : (
          <>
            {/* The error, with retry adjacent, per section 9. Focus lands here
                on a failure so the first thing heard is what happened and that
                nothing was lost. */}
            {saveError ? (
              <div
                className="code-panel__save-error"
                data-save-error
                ref={setErrorElement}
                tabIndex={-1}
              >
                <p>
                  {saveError} Nothing was lost: {pendingCodeIds.length}{' '}
                  {pendingCodeIds.length === 1 ? 'code' : 'codes'}
                  {noteText.trim() === '' ? '' : ', your note,'} and the excerpt are still here.
                </p>
                <button type="button" onClick={panel.retrySave}>
                  Retry save
                </button>
              </div>
            ) : null}

            {/* D-040: a checkbox rather than a button, because uncertainty is
                state that modifies the save and not an action of its own. */}
            <span className="code-panel__code code-panel__uncertain">
              <input
                id={uncertainId}
                type="checkbox"
                checked={uncertain}
                onChange={(event) => setUncertain(event.target.checked)}
              />
              <label htmlFor={uncertainId}>Mark uncertain</label>
            </span>

            <button
              type="button"
              aria-disabled={canSave ? undefined : true}
              aria-describedby={canSave ? undefined : saveReasonId}
              onClick={panel.save}
              data-command="codes.save"
            >
              Save &amp; Close
            </button>
            {/* A disabled control with no explanation is a dead end for a
                screen reader user. Contract 2.6. */}
            {canSave ? null : (
              <p className="code-panel__deferred" id={saveReasonId}>
                {saveUnavailableReason}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Native checkboxes in nested lists, not a tree widget.
 *
 * Section 4: multi-selectable `role="tree"` has uneven screen reader support
 * and would mean reimplementing keyboard behaviour native controls already
 * provide. Hierarchy comes from the nesting and from each nested list being
 * labelled by its parent code, so a child is heard in context without a tree's
 * level announcements.
 */
function CodeList({ nodes, panel }: { nodes: CodeNode[]; panel: CodePanelApi }) {
  return (
    <ul className="code-panel__list code-panel__tree">
      {nodes.map((node) => (
        <li key={node.code.codeId} data-depth={node.depth}>
          <CodeCheckbox code={node.code} panel={panel} depth={node.depth} />
          {node.children.length > 0 ? (
            <ul className="code-panel__list code-panel__tree" aria-label={node.code.name}>
              {node.children.map((child) => (
                <li key={child.code.codeId} data-depth={child.depth}>
                  <CodeCheckbox code={child.code} panel={panel} depth={child.depth} />
                  {child.children.length > 0 ? (
                    <CodeList nodes={child.children} panel={panel} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CodeCheckbox({
  code,
  panel,
  depth = 0,
}: {
  code: Code;
  panel: CodePanelApi;
  depth?: number;
}) {
  const inputId = useId();

  return (
    <span className="code-panel__code" data-depth={depth}>
      <input
        id={inputId}
        type="checkbox"
        checked={panel.isPending(code.codeId)}
        onChange={(event) => panel.toggle(code.codeId, event.target.checked)}
        data-code-id={code.codeId}
      />
      <label htmlFor={inputId}>
        <span className="code-panel__code-name">{code.name}</span>
        {/* Colour is a redundant channel only, never carrying meaning that is
            not also in text. Section 4. D-039 removed the visible level label;
            the nested lists still expose depth programmatically. */}
        <span
          className="code-panel__swatch"
          data-color-token={code.colorToken}
          aria-hidden="true"
        />
        <span className="code-panel__short">{code.shortDefinition}</span>
      </label>
    </span>
  );
}
