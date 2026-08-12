import { useMemo } from 'react';
import { useParams } from 'react-router';
import { createSeedFixture } from '../data/seed';
import { CodebookContent } from '../features/codebook/CodebookContent';

/**
 * Route /projects/:projectId/codebook.
 *
 * Specification: docs/pages/destinations.md section 1, decisions D-035, D-043,
 * D-047.
 *
 * The destination D-035 pointed definition lookup at when it took definitions
 * out of the coding panel. Since D-048 the same content also renders beside the
 * panel as the companion, so everything but the route heading lives in
 * `CodebookContent` and this file is the route around it.
 *
 * Families sit at `h2` here, under this `h1`.
 */
export function CodebookPage() {
  const { projectId } = useParams();

  const found = useMemo(
    () => createSeedFixture().project.projectId === projectId,
    [projectId],
  );

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
      <CodebookContent projectId={projectId} headingLevel={2} />
    </>
  );
}
