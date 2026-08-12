import { useMemo } from 'react';
import { useParams } from 'react-router';
import { createSeedFixture } from '../data/seed';

/**
 * Route /projects/:projectId/codebook.
 *
 * Specification: docs/pages/destinations.md section 1, decision D-043.
 *
 * A shell in this task: the heading, the count, and the entry behaviour the
 * shared rules require. The full records, the search, and the provisional
 * section are Task 28.
 *
 * The destination D-035 pointed definition lookup at, which is what makes
 * D-044 necessary: a coder reads a definition here mid-capture, and the capture
 * has to be waiting when they go back.
 */
export function CodebookPage() {
  const { projectId } = useParams();

  const codeCount = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;
    return fixture.codes.length;
  }, [projectId]);

  if (codeCount === null) {
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
      {/* Plain text beside the heading, which doubles as the orientation a
          screen reader hears on arrival. Shared rules. */}
      <p>{codeCount} codes</p>
      <p>Full code records arrive in the next task.</p>
    </>
  );
}
