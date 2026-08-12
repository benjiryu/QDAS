import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { readSavedWork } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';

/**
 * Route /projects/:projectId/notes.
 *
 * Specification: docs/pages/destinations.md section 3, decisions D-043 and R-4.
 *
 * A shell in this task: heading, count, and the empty state. Grouping by
 * source, the excerpt disclosure, and the link focus behaviour are Task 30.
 *
 * Excerpt notes only. File-wide notes stay deferred under D-017, and the count
 * is the coder's own for the same R-4 reason as Coded data.
 */
export function NotesPage() {
  const { projectId } = useParams();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;
    return { count: readSavedWork(fixture.project.projectId).notes.length };
  }, [projectId]);

  if (view === null) {
    return (
      <>
        <h1 tabIndex={-1}>Project not found</h1>
        <p>No seeded project has the identifier {projectId}.</p>
      </>
    );
  }

  return (
    <>
      <h1 tabIndex={-1}>Notes</h1>
      <p>
        {view.count} {view.count === 1 ? 'note' : 'notes'}
      </p>

      {view.count === 0 ? (
        <p>
          You have not written any notes in this project yet. A note is written while coding an
          excerpt, in the Add note field of the Code Assignment panel.{' '}
          <Link to={`/projects/${projectId}`}>Back to the project</Link>
        </p>
      ) : (
        <p>The note list arrives in the next task.</p>
      )}
    </>
  );
}
