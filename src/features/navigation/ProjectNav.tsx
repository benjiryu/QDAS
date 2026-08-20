import { useId, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router';
import { createSeedFixture } from '../../data/seed';
import { CURRENT_CODER_ID } from '../../data/seed/project';
import { PHASE_LABELS } from '../../domain';
import type { ProjectPhase, UserRole } from '../../domain';
import { SWITCHABLE_ROLES, useRoleSwitcher } from './useRoleSwitcher';
import { useSessionControls } from './useSessionControls';
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
 * The files group's header is a link since D-059, and still names the nested
 * source list through `aria-labelledby` — one element, both jobs. It was a
 * plain label until the Project overview page existed, on the argument that a
 * control there would be "a stop in the tab order that leads nowhere". It leads
 * somewhere now, which is exactly what changed; the argument was about the
 * missing destination rather than about the element.
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

  /*
    The title block's text, per the D-059 addendum: read from the seeded user
    record rather than written here, so the two cannot drift and so a change of
    title is a data change.

    Outside the project lookup below, because the block belongs to the person
    rather than to the project — it is there on `/projects` too.
  */
  const roleId = useId();
  const phaseId = useId();
  const sessionId = useId();
  const roles = useRoleSwitcher();
  const [sessionOpen, setSessionOpen] = useState(false);
  const navigate = useNavigate();

  const controls = useSessionControls({
    projectId: projectId ?? '',
    seededVersionLabel: createSeedFixture().codebookVersion.versionLabel,
    /*
      To the projects list once the stores are cleared.

      Not decoration. The transcript workspace holds the session's work in
      component state and writes through, so a reset performed underneath it
      would leave the last participant's excerpts on screen and write them back
      on the next keystroke — a reset that un-resets itself. Two of the six
      stores notify; a remount is what makes the other four take effect, and
      the projects list is where starting over begins anyway.
    */
    onReset: () => navigate('/projects'),
  });

  /*
    Pulled out before use. Passing `controls.setTriggerElement` straight to
    `ref=` marks the whole object as holding a ref, and every other read of it
    in this render then trips `react-hooks/refs`.
  */
  const { setTriggerElement } = controls;

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
      {/*
        Who is signed in, at the top of the landmark — and since D-071, the
        control that decides it.

        This reverses the D-059 addendum's static-text rule for this block, and
        the reversal is the point rather than a side effect: role-dependent
        behaviour is part of what the prototype tests, and until now the only
        way to change role was a select at the bottom of one page. D-071 records
        what this is — scaffolding in product chrome, which a real deployment
        replaces with the role its authentication reports.

        Labelled visibly rather than by `aria-label`. D-051 wants a label
        associated and present, and a facilitator's control that hides what it
        does is the wrong thing to be subtle about.

        The divider is still this block's own bottom border rather than an `hr`,
        so it stays decoration instead of putting a separator in the
        accessibility tree for something that draws a line.
      */}
      <div className="project-nav__user">
        <label htmlFor={roleId}>Role</label>
        <select
          id={roleId}
          className="project-nav__role"
          value={roles.role}
          onChange={(event) => roles.setRole(event.target.value as UserRole)}
        >
          {SWITCHABLE_ROLES.map((entry) => (
            <option key={entry.role} value={entry.role}>
              {entry.title}
            </option>
          ))}
        </select>
      </div>

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
              A link, and the source list's name, per D-059. Still not a
              heading: it labels a list rather than opening a section, and a
              heading would add a stop to the outline for something that is not
              one.

              `end` matters. The project route is a prefix of every other route
              in this sidebar, so without it this would report itself the
              current page from the transcript, the Codebook and everywhere
              else — `aria-current` on four items at once, which is worse than
              none.
            */}
            <NavLink
              id={filesId}
              end
              className="project-nav__link project-nav__group-label"
              to={`/projects/${view.projectId}`}
            >
              Project 1 Files
            </NavLink>

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

      {/*
        The prototype-support surface D-072 gives a home, and the surface the
        D-056 addendum and D-071 both referenced before one existed.

        Last in the landmark and outside the branch above: a phase and a reset
        belong to the session rather than to a project, so they are here on
        `/projects` too, exactly as the role switcher is.

        Collapsed by default, and focus stays on the button across the toggle —
        D-067's case rather than the code panel's disclosures, because what
        opens is a group of controls and there is no one field to send focus to.

        The rule this does not escape: participants should never need any of
        this, and product features never live here.
      */}
      <div className="project-nav__session">
        <button
          type="button"
          className="project-nav__session-toggle"
          aria-expanded={sessionOpen}
          aria-controls={sessionOpen ? sessionId : undefined}
          onClick={() => setSessionOpen((open) => !open)}
        >
          Session controls
        </button>

        {sessionOpen ? (
          <div id={sessionId} className="project-nav__session-body">
            <p className="project-nav__session-note">
              Prototype scaffolding, for facilitator setup. Not part of the product.
            </p>

            <div className="project-nav__session-field">
              <label htmlFor={phaseId}>Project phase</label>
              <select
                id={phaseId}
                className="project-nav__role"
                value={controls.phase}
                onChange={(event) => controls.setPhase(event.target.value as ProjectPhase)}
              >
                {Object.entries(PHASE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {controls.resetPending ? (
              /*
                Asking first, per D-072: this one destroys the work a
                participant did. The prompt the eye reads and the one the ear
                heard are deliberately not the same string — present tense at
                the moment of arming, present perfect while it stands.
              */
              <div className="project-nav__session-confirm" data-confirm="reset">
                <p>Reset the session for the next participant? Nothing has been reset yet.</p>
                <button type="button" autoFocus onClick={controls.confirmReset}>
                  Reset it
                </button>
                <button type="button" onClick={controls.keepSession}>
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="project-nav__session-reset"
                ref={setTriggerElement}
                onClick={controls.requestReset}
              >
                Reset for next participant
              </button>
            )}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
