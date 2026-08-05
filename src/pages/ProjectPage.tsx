import { useParams } from 'react-router';

/**
 * Placeholder. Route /projects/:projectId.
 *
 * The heading names the page by identifier because no project data layer
 * exists yet. It is replaced by the project name once one does.
 */
export function ProjectPage() {
  const { projectId } = useParams();
  return <h1>Project {projectId}</h1>;
}
