import { useParams } from 'react-router';

/**
 * Placeholder. Route /projects/:projectId/sources/:sourceId.
 *
 * The transcript region, the code panel, and their labels belong to later
 * tasks. This route contributes a heading and nothing else.
 */
export function SourcePage() {
  const { sourceId } = useParams();
  return <h1>Source {sourceId}</h1>;
}
