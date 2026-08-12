import { useId, useMemo } from 'react';
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
 * The files group's header is a label, not a destination. It names the nested
 * source list through `aria-labelledby`, so a screen reader hears "Project 1
 * Files, list" rather than a fifth place to go. A link or a button there would
 * be worse than nothing: a stop in the tab order that leads nowhere.
 *
 * The narrow-width disclosure `destinations.md` names from D-033 is still not
 * built. Neither Task 27's brief nor 27r's lists it, and 27r says the narrow
 * behaviour is unchanged; recorded as outstanding rather than quietly skipped.
 * What 27r does require at narrow width is that the sidebar is never fixed
 * there, which the stylesheet handles.
 */

/** Fixed, and in this order. Rendered after the source list. */
const DESTINATIONS = [
  { segment: 'codebook', label: 'Code book' },
  { segment: 'coded-data', label: 'Coded data' },
  { segment: 'notes', label: 'Notes' },
] as const;

export function ProjectNav() {
  const { projectId } = useParams();
  const filesId = useId();

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
        <>
          {/*
            The files group first, then the destinations: the content order the
            shared Sidebar rule fixes.

            Two lists rather than one, per D-051: a list-jump arrives with no
            context, so each has to say what it is. The single outer list that
            held both could not — it was neither the sources nor the
            destinations.
          */}
          <div className="project-nav__group">
            {/*
              A span, not a heading and not a link. `aria-labelledby` makes it
              the source list's name, which is the whole job; a heading would
              add a stop to the document outline for something that labels a
              list rather than opening a section.
            */}
            <span id={filesId} className="project-nav__group-label">
              Project 1 Files
            </span>

            <ul className="project-nav__sources" aria-labelledby={filesId}>
              {view.sources.map((source) => (
                <li key={source.sourceId}>
                  <NavLink
                    className="project-nav__link project-nav__source"
                    to={`/projects/${view.projectId}/sources/${source.sourceId}`}
                  >
                    {source.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <ul className="project-nav__list" aria-label="Destinations">
            {DESTINATIONS.map((destination) => (
              <li key={destination.segment}>
                <NavLink
                  className="project-nav__link project-nav__destination"
                  to={`/projects/${view.projectId}/${destination.segment}`}
                >
                  {destination.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
