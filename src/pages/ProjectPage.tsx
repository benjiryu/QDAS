import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID } from '../data/seed/project';
import type { Source, UserRole } from '../domain';

/**
 * Route /projects/:projectId.
 *
 * The sources this coder is assigned, and enough context to know which round
 * they are working in. Per task 5a this is a functional route rather than the
 * designed project home.
 *
 * Two constraints shape what is absent:
 *
 * - D-010 keeps code frequencies off any coder-facing surface, so no counts of
 *   coding appear here.
 * - R-4 hides coder identities until independent coding closes, so only this
 *   user's own assignments are listed. The seeded second and third coders have
 *   work in this project and none of it is visible here.
 *
 * The current user is the fixture's designated coder. Authentication is
 * simulated through a role switcher that does not exist yet, per
 * prototype-scope.md, and inventing one here would build a simulated feature
 * this task does not need.
 */

const ROLE_LABELS: Record<UserRole, string> = {
  coder: 'Coder',
  reviewer: 'Reviewer',
  qualitativeLead: 'Qualitative lead',
};

const KIND_LABELS: Record<Source['kind'], string> = {
  transcript: 'Transcript',
  survey: 'Survey',
};

export function ProjectPage() {
  const { projectId } = useParams();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;

    const sourceById = new Map(fixture.sources.map((source) => [source.sourceId, source]));
    const sources = fixture.workAssignments
      .filter(
        (assignment) =>
          assignment.userId === CURRENT_CODER_ID &&
          assignment.codingRoundId === fixture.project.activeCodingRoundId,
      )
      .map((assignment) => sourceById.get(assignment.sourceId))
      .filter((source): source is Source => source !== undefined);

    const user = fixture.users.find((candidate) => candidate.userId === CURRENT_CODER_ID);

    return { project: fixture.project, round: fixture.codingRound, sources, user };
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

  return (
    <>
      <h1 tabIndex={-1}>{view.project.name}</h1>

      <p>Coding round: {view.round.label}</p>
      <p>Your role: {view.user ? ROLE_LABELS[view.user.role] : 'Unknown'}</p>

      <h2 id="your-sources">Your sources</h2>

      {view.sources.length === 0 ? (
        <p>No sources are assigned to you in this round.</p>
      ) : (
        <ul className="route-list" aria-labelledby="your-sources">
          {view.sources.map((source) => (
            <li key={source.sourceId}>
              <Link to={`/projects/${view.project.projectId}/sources/${source.sourceId}`}>
                {source.title}
              </Link>{' '}
              {/* Kind and size sit beside the link rather than inside it, so a
                  list of links read on its own stays a list of source titles. */}
              <span className="route-meta">
                {KIND_LABELS[source.kind]}, {source.segmentCount} sentences
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
