import { useMemo } from 'react';
import { NavLink, useParams } from 'react-router';
import { createSeedFixture } from '../../data/seed';
import { CURRENT_CODER_ID } from '../../data/seed/project';
import { assignedSources } from './assignedSources';

/**
 * The project sidebar.
 *
 * Specification: decision D-043, docs/pages/destinations.md shared rules.
 *
 * Fixed order: the coder's sources, then Code book, Coded data, Notes. No
 * Themes, per D-017. This is the landmark Task 1 left as a placeholder and
 * D-013 promised; `docs/pages` was empty until D-043 specified it.
 *
 * The current item carries `aria-current="page"` and a non-colour indicator, so
 * where you are does not depend on seeing a colour. The stylesheet draws a bar
 * and thickens the weight; `aria-current` is what a screen reader reads. Both
 * channels, per contract 2.6.
 *
 * The narrow-width disclosure `destinations.md` names from D-033 is not built
 * here. Task 27's brief does not list it and the sidebar keeps its current
 * wrapping behaviour; recorded as outstanding rather than quietly skipped.
 */

/** Fixed, and in this order. Rendered after the source list. */
const DESTINATIONS = [
  { segment: 'codebook', label: 'Code book' },
  { segment: 'coded-data', label: 'Coded data' },
  { segment: 'notes', label: 'Notes' },
] as const;

export function ProjectNav() {
  const { projectId } = useParams();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (!projectId || fixture.project.projectId !== projectId) return null;

    return {
      projectId: fixture.project.projectId,
      sources: assignedSources(
        fixture.sources,
        fixture.workAssignments,
        CURRENT_CODER_ID,
        fixture.project.activeCodingRoundId,
      ),
    };
  }, [projectId]);

  return (
    <nav aria-label="Project" className="project-nav">
      {view === null ? (
        /*
          No project in context, on /projects and on a bad identifier. The
          landmark stays rather than appearing and disappearing between routes:
          contract 2.1 lists a second labelled navigation as part of the
          structure every route shares.
        */
        <p className="project-nav__empty">Open a project to see its sources and destinations.</p>
      ) : (
        <ul className="project-nav__list">
          {view.sources.map((source) => (
            <li key={source.sourceId}>
              <NavLink
                className="project-nav__link"
                to={`/projects/${view.projectId}/sources/${source.sourceId}`}
              >
                {source.title}
              </NavLink>
            </li>
          ))}

          {DESTINATIONS.map((destination) => (
            <li key={destination.segment}>
              <NavLink
                className="project-nav__link"
                to={`/projects/${view.projectId}/${destination.segment}`}
              >
                {destination.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
