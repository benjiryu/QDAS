import { Link } from 'react-router';

/** Placeholder. Any unmatched URL. Keeps the one-h1-per-page rule true. */
export function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link to="/projects">Go to Projects</Link>
      </p>
    </>
  );
}
