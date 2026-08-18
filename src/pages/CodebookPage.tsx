import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { mergeSessionCodes, readCodebookEdits } from '../data/codebookStore';
import { readProvisionalCodes } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { readSimulatedSession } from '../data/simulatedSession';
import { CodebookContent } from '../features/codebook/CodebookContent';
import { CodeEditorPanel } from '../features/codebook/CodeEditorPanel';
import { canEditCodebook } from '../features/codebook/resolveCodebookEditing';
import { useCodeEditor } from '../features/codebook/useCodeEditor';

/**
 * Route /projects/:projectId/codebook.
 *
 * Specification: docs/pages/destinations.md section 1, decisions D-035, D-043,
 * D-047, and D-070 for the editing controls.
 *
 * The destination D-035 pointed definition lookup at when it took definitions
 * out of the coding panel. Since D-048 the same content also renders beside the
 * panel as the companion, so everything but the route heading lives in
 * `CodebookContent` and this file is the route around it.
 *
 * The editing controls live here rather than in that shared component, which is
 * what keeps the companion free of them: D-048 asks that the two surfaces show
 * the same codebook, not that they offer the same actions.
 *
 * Families sit at `h2` here, under this `h1`.
 */
export function CodebookPage() {
  const { projectId } = useParams();

  const found = useMemo(
    () => createSeedFixture().project.projectId === projectId,
    [projectId],
  );

  /*
    Bumped on every write, which is what re-renders this page and remounts the
    content below so it re-reads the stores. They are plain module maps with
    nothing to subscribe to, which is how the rest of this build reads them.
  */
  const [revision, setRevision] = useState(0);
  const session = readSimulatedSession();
  const mayEdit = canEditCodebook(session.role, session.phase);

  /*
    Computed every render rather than memoised. The stores are plain module maps
    with nothing to subscribe to, so a memo would have to be keyed on a counter
    that stands in for "they changed" — and a dependency list that lies is worse
    than a merge over fifty codes.
  */
  const codes = projectId
    ? mergeSessionCodes(
        [...createSeedFixture().codes, ...readProvisionalCodes(projectId)],
        readCodebookEdits(projectId).codes,
      )
    : [];

  const editor = useCodeEditor({
    projectId: projectId ?? '',
    codes,
    onSaved: () => setRevision((current) => current + 1),
  });

  if (!found || !projectId) {
    return (
      <>
        <h1 tabIndex={-1}>Project not found</h1>
        <p>No seeded project has the identifier {projectId}.</p>
      </>
    );
  }

  return (
    <>
      <h1 tabIndex={-1}>Code book</h1>

      {/*
        Per D-070, and only for the lead while no round is open. Outside the
        gate it does not render at all rather than rendering unavailable: a
        control a participant cannot use is a control they have to ask about.
      */}
      {mayEdit ? (
        <p className="codebook__actions">
          <button type="button" className="codebook__create" onClick={editor.openCreate}>
            Create new code
          </button>
        </p>
      ) : null}

      <CodebookContent
        key={revision}
        projectId={projectId}
        headingLevel={2}
        renderProvisionalAction={
          mayEdit
            ? (code) => (
                <button
                  type="button"
                  className="codebook__accept"
                  onClick={() => editor.openAccept(code)}
                >
                  Accept
                  {/* The name in the control's own name, so a screen reader
                      running through the list hears which code each Accept is
                      for rather than one word repeated.

                      Separated by a comma rather than a space, which is what
                      the Notes page's entry links already do. Name computation
                      trims each text node before joining them, so a space is
                      the one separator that does not survive. */}
                  <span className="visually-hidden">, {code.name}</span>
                </button>
              )
            : undefined
        }
      />

      <CodeEditorPanel editor={editor} />
    </>
  );
}
