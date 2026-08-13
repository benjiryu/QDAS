import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID } from '../data/seed/project';
import { PHASE_LABELS } from '../domain';
import { assignedSources } from '../features/navigation/assignedSources';

/**
 * Route /projects/:projectId — the Project overview page.
 *
 * Specification: docs/pages/destinations.md section 0, decision D-059.
 *
 * Slice 1's first real surface: where the sidebar's project files link lands,
 * and where a researcher orients before opening a source. It was a functional
 * route standing in for the designed project home until D-059 gave it one.
 *
 * Regions in the fixed order section 0 gives: heading and summary, then the
 * source list. The coding round and role lines the functional version carried
 * are not in that order and are gone — the round is implicit in the phase, and
 * the role belongs to the simulated session control on the Coded data page.
 *
 * Read surface: nothing here edits anything.
 *
 * Two constraints still shape what is absent. D-010 keeps code frequencies off
 * any coder-facing surface, so no counts of coding appear. R-4 hides other
 * coders until independent coding closes, so the sources are this coder's own
 * assignments — the seeded second and third coders have work here and none of
 * it shows.
 */
export function ProjectPage() {
  const { projectId } = useParams();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;

    return {
      project: fixture.project,
      codebookVersion: fixture.codebookVersion,
      sources: assignedSources(
        fixture.sources,
        fixture.workAssignments,
        CURRENT_CODER_ID,
        fixture.project.activeCodingRoundId,
      ),
    };
  }, [projectId]);

  if (!view) {
    return (
      <>
        <h1 tabIndex={-1}>Project not found</h1>
        <p>
          No seeded project has the identifier {projectId}.{' '}
          <Link to="/projects">Back to projects</Link>
        </p>
      </>
    );
  }

  const count = view.sources.length;

  return (
    <>
      <h1 tabIndex={-1}>{view.project.name}</h1>

      {/*
        Plain text, from data the domain already holds, per section 0. It is
        also the orientation a screen reader hears on arrival, which is why it
        sits immediately under the `h1` and states the count in words rather
        than leaving it to be inferred from the list below.

        Richer summary content is an open extension point owned by the team, per
        D-059; this is the three facts that decision names and no more.
      */}
      <p className="project-overview__summary">
        {PHASE_LABELS[view.project.phase]}. {count} {count === 1 ? 'source' : 'sources'}.
        Codebook {view.codebookVersion.versionLabel}.
      </p>

      <h2 id="your-sources">Your sources</h2>

      {count === 0 ? (
        /*
          Named route in, never a blank region, per the shared rules. A coder
          with no sources cannot fix that themselves, so this says where they
          come from rather than offering an action that does not exist.
        */
        <p>
          No sources are assigned to you in this round. Sources are assigned by the qualitative
          lead when a coding round opens. <Link to="/projects">Back to projects</Link>
        </p>
      ) : (
        /* Named by its heading, so a list-jump lands on "Your sources". D-051. */
        <ul className="route-list" aria-labelledby="your-sources">
          {view.sources.map((source) => (
            <li key={source.sourceId}>
              <Link to={`/projects/${view.project.projectId}/sources/${source.sourceId}`}>
                {source.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
