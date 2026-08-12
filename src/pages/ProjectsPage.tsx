import { useMemo } from 'react';
import { Link } from 'react-router';
import { createSeedFixture } from '../data/seed';

/**
 * Route /projects.
 *
 * The minimal route into a project, per task 5a. `prototype-scope.md` puts
 * "Home and dashboard beyond a minimal route into a project" out of scope, so
 * this is a list of links and nothing else: no dashboard, no cards, no progress
 * summaries. Home is specified once the downstream workflows are concrete.
 */
export function ProjectsPage() {
  const projects = useMemo(() => [createSeedFixture().project], []);

  return (
    <>
      <h1 tabIndex={-1} id="projects-heading">
        Projects
      </h1>

      {/* Named, per D-051: a list-jump arrives without the heading above it. */}
      <ul className="route-list" aria-labelledby="projects-heading">
        {projects.map((project) => (
          <li key={project.projectId}>
            <Link to={`/projects/${project.projectId}`}>{project.name}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
