import { useId } from 'react';
import type { PrototypeFlags } from '../../config/flags';
import type { Code, Id } from '../../domain';
import type { CodeNode } from './codeTree';
import type { CodePanelApi } from './useCodePanel';
import './codePanel.css';

/**
 * The code selection panel.
 *
 * Specification: docs/patterns/code-selection.md sections 2 to 5.
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
  /** Provisional codes are a later task; the region reads this and stays absent. */
  proposedCodes?: Code[];
}

export function CodePanel({
  panel,
  flags,
  excerptSummary,
  excerptSpeaker,
  onReadExcerpt,
  proposedCodes = [],
}: CodePanelProps) {
  const headingId = useId();
  const searchId = useId();

  // Destructured, so the search input's callback ref is a plain local. Reading
  // it off the panel object in JSX makes the ref rule treat every other read of
  // that object as a ref access during render.
  const { setSearchElement, query, setQuery, clearQuery, results, tree, pendingCodeIds } = panel;

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
          <ul className="code-panel__list">
            {proposedCodes.map((code) => (
              <li key={code.codeId}>
                <CodeCheckbox code={code} panel={panel} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 8. Create a code. Position held; the control arrives with task 9. */}
      <div className="code-panel__region" data-region="create">
        <h3>Create a code</h3>
        <p className="code-panel__deferred">Not built yet.</p>
      </div>

      {/* 9. Pending assignment. */}
      <div className="code-panel__region" data-region="pending">
        <h3>Pending assignment</h3>
        <p>
          {pendingCodeIds.length} {pendingCodeIds.length === 1 ? 'code' : 'codes'} pending
        </p>
        {pendingCodeIds.length > 0 ? (
          <ul className="code-panel__list">
            {pendingCodeIds.map((codeId) => (
              <li key={codeId}>
                <span>{nameOf(panel, codeId)}</span>{' '}
                <button type="button" onClick={() => panel.toggle(codeId, false)}>
                  Remove {nameOf(panel, codeId)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 10. Note. Position held; D-032 keeps the note here and off the top bar. */}
      <div className="code-panel__region" data-region="note">
        <h3>Note</h3>
        <p className="code-panel__deferred">Not built yet.</p>
      </div>

      {/* 11. Uncertainty control. Position held. */}
      <div className="code-panel__region" data-region="uncertainty">
        <h3>Uncertainty</h3>
        <p className="code-panel__deferred">Not built yet.</p>
      </div>

      {/* 12. Save and Cancel. */}
      <div className="code-panel__region code-panel__actions" data-region="actions">
        <button
          type="button"
          aria-disabled="true"
          onClick={() => panel.focusSearch()}
          data-command="codes.save"
        >
          Save
        </button>
        <button type="button" onClick={panel.cancel} data-command="codes.cancel">
          Cancel
        </button>
        <p className="code-panel__deferred" id="save-reason">
          Saving is not built yet.
        </p>
      </div>
    </section>
  );
}

function nameOf(panel: CodePanelApi, codeId: Id): string {
  const found = panel.tree.length > 0 ? findCode(panel.tree, codeId) : null;
  return found?.name ?? codeId;
}

function findCode(nodes: CodeNode[], codeId: Id): Code | null {
  for (const node of nodes) {
    if (node.code.codeId === codeId) return node.code;
    const inChildren = findCode(node.children, codeId);
    if (inChildren) return inChildren;
  }
  return null;
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
