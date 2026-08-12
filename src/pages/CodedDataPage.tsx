import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { readSavedWork } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';

/**
 * Route /projects/:projectId/coded-data.
 *
 * Specification: docs/pages/destinations.md section 2, decisions D-043, D-045,
 * and R-4.
 *
 * A shell in this task: heading, count, and the explicit empty state. The
 * filter list, the results, and the focus-landing behaviour are Task 29.
 *
 * The count comes from the session store rather than the fixture, and that is
 * not an implementation shortcut. Every seeded excerpt belongs to the second
 * coder, and R-4 keeps another coder's work off this page during independent
 * coding, so the coder's own saved work is the only thing this page may show.
 * Without D-044 holding that work across the navigation, this page could only
 * ever say zero.
 */
export function CodedDataPage() {
  const { projectId } = useParams();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;
    return { count: readSavedWork(fixture.project.projectId).excerpts.length };
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
      <h1 tabIndex={-1}>Coded data</h1>
      <p>
        {view.count} coded {view.count === 1 ? 'excerpt' : 'excerpts'}
      </p>

      {view.count === 0 ? (
        /* Named route out, never a blank region. Shared rules. */
        <p>
          You have not coded anything in this project yet. Open a source from the project
          navigation, select some text, and choose Code selection.{' '}
          <Link to={`/projects/${projectId}`}>Back to the project</Link>
        </p>
      ) : (
        <p>The filter list and results arrive in the next task.</p>
      )}
    </>
  );
}
