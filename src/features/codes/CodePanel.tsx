import { useId } from 'react';
import type { PrototypeFlags } from '../../config/flags';
import type { Code, Id } from '../../domain';
import { CreateCodeForm } from './CreateCodeForm';
import type { CodeNode } from './codeTree';
import type { CodePanelApi } from './useCodePanel';
import './codePanel.css';

/**
 * The code selection panel.
 *
 * Specification: docs/patterns/code-selection.md sections 2 to 7.
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
 * finds it without tabbing. Its twelve sub-regions are heading-labelled rather
 * than landmarks: section 3 fixes their order, and eleven more landmarks inside
 * one panel would crowd the landmark list the accessibility contract keeps
 * short. Headings give the same browse-mode navigation.
 *
 * Layout follows D-033. The narrow form is primary: a full-width region below
 * the transcript. The wide form is the same sequence with the panel alongside,
 * fixed right at 360 to 400 pixels. The logical order is identical in both, and
 * the panel scrolls internally rather than holding fixed dimensions.
 */

interface CodePanelProps {
  panel: CodePanelApi;
  flags: PrototypeFlags;
  /** Region 1 and 2: the excerpt this panel is coding. */
  excerptSummary: string | null;
  excerptSpeaker: string | null;
  onReadExcerpt: () => void;
}

export function CodePanel({
  panel,
  flags,
  excerptSummary,
  excerptSpeaker,
  onReadExcerpt,
}: CodePanelProps) {
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
    setPendingElement,
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

  const heading = excerptSummary
    ? `Code selection: ${excerptSummary}${excerptSpeaker ? `, starting with ${excerptSpeaker}` : ''}`
    : 'Code selection';

  return (
    <section
      className="code-panel"
      aria-labelledby={headingId}
      data-presentation={flags.codebookPresentation}
    >
      {/* 1. Panel heading, naming the excerpt by size and start speaker. */}
      <h2 id={headingId} className="code-panel__heading">
        {heading}
      </h2>

      {/* 2. Excerpt summary, with a control to re-read the full excerpt. A
          summary rather than the text, because the transcript is reachable. */}
      <div className="code-panel__region">
        <h3>Excerpt</h3>
        <p>{excerptSummary ?? 'No excerpt.'}</p>
        <button type="button" onClick={onReadExcerpt}>
          Read the full excerpt
        </button>
      </div>

      {/* 3. Search field. First control in the panel, per section 1. */}
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

      {/* 4. Search results. Present only with an active query: an always-present
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

      {/* 5. Recently used codes, collapsed by default. */}
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

      {/* 6. Codebook, in canonical order, present and unchanged whatever the
          search is doing. */}
      <div className="code-panel__region" data-region="codebook">
        <h3>Codebook</h3>
        <CodeList nodes={tree} panel={panel} />
      </div>

      {/* 7. Proposed codes. Present only when the project permits provisional
          codes and some exist; creating them is a later task. */}
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

      {/* 8. Create a code. Offered only where the project permits provisional
          codes: a form that cannot produce one is a dead control. */}
      {flags.allowProvisionalCodes ? (
        <div className="code-panel__region" data-region="create">
          <h3>Create a code</h3>
          <CreateCodeForm panel={panel} />
        </div>
      ) : null}

      {/* 9. Pending assignment. */}
      <div className="code-panel__region" data-region="pending">
        <h3 ref={setPendingElement} tabIndex={-1}>
          Pending assignment
        </h3>
        <p>
          {pendingCodeIds.length} {pendingCodeIds.length === 1 ? 'code' : 'codes'} pending
        </p>
        {pendingCodeIds.length > 0 ? (
          <ul className="code-panel__list">
            {pendingCodeIds.map((codeId) => (
              <li key={codeId} className="code-panel__pending-row">
                <span>{nameOf(panel, codeId)}</span>{' '}
                <button
                  type="button"
                  data-remove-pending={codeId}
                  onClick={() => panel.removePending(codeId)}
                >
                  Remove {nameOf(panel, codeId)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 10. Note. One per excerpt, plain text, no type: types belong to the
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

      {/* 11. Uncertainty, per D-021. Recorded on every assignment this save
          writes, and it changes no ordering in v0.1. */}
      <div className="code-panel__region" data-region="uncertainty">
        <h3>Uncertainty</h3>
        <span className="code-panel__code">
          <input
            id={uncertainId}
            type="checkbox"
            checked={uncertain}
            onChange={(event) => setUncertain(event.target.checked)}
          />
          <label htmlFor={uncertainId}>Mark this assignment uncertain</label>
        </span>
      </div>

      {/* 12. Save and Cancel. */}
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

            <button
              type="button"
              aria-disabled={canSave ? undefined : true}
              aria-describedby={canSave ? undefined : saveReasonId}
              onClick={panel.save}
              data-command="codes.save"
            >
              Save
            </button>
            <button type="button" onClick={panel.requestCancel} data-command="codes.cancel">
              Cancel
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

function nameOf(panel: CodePanelApi, codeId: Id): string {
  // Resolves proposed codes as well as canonical ones.
  return panel.codeById.get(codeId)?.name ?? codeId;
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
    <span className="code-panel__code">
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
            not also in text. Section 4. */}
        <span
          className="code-panel__swatch"
          data-color-token={code.colorToken}
          aria-hidden="true"
        />
        {depth > 0 ? (
          // Section 11: a text level indicator as well as indentation, since
          // indent depth is easy to lose when only part of the panel is visible.
          <span className="code-panel__level" aria-hidden="true">
            level {depth + 1}
          </span>
        ) : null}
        <span className="code-panel__short">{code.shortDefinition}</span>
      </label>
    </span>
  );
}
