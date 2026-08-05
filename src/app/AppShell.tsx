import { Link, Outlet } from 'react-router';
import './AppShell.css';

/**
 * Application shell. Landmarks only, no page content.
 *
 * Specification: docs/accessibility-contract.md section 2.1.
 *
 * The shell owns the landmark structure that every route shares: one banner,
 * an application-level navigation, a labeled project-level navigation, and one
 * main. Each route supplies its own h1 and nothing else yet.
 *
 * Focus is not moved on navigation. Per section 2.4, focus moves only on a user
 * action; the skip link is that action, and it is the only thing in this file
 * that moves focus.
 */

export const MAIN_CONTENT_ID = 'main-content';

export function AppShell() {
  return (
    <>
      <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
        Skip to main content
      </a>

      <header className="app-banner">
        {/*
          The product name is a link, not a heading. The route owns the only h1
          on the page, and a heading here would either duplicate it or force the
          route heading down a level.
        */}
        <Link className="app-banner__name" to="/projects">
          Accessible QDAS
        </Link>

        <nav aria-label="Application">
          <ul className="nav-list">
            <li>
              <Link to="/projects">Projects</Link>
            </li>
          </ul>
        </nav>
      </header>

      <div className="app-body">
        {/*
          Project-level navigation renders on every route, including /projects
          where no project is in context. Its items are not specified: docs/pages
          is empty and A-2 in unresolved-questions.md, which project navigation
          item owns transcript coding, is open. The landmark is present and
          labeled; the items wait on a page specification.
        */}
        <nav aria-label="Project" className="project-nav">
          <p className="placeholder">Project navigation items are not yet specified.</p>
        </nav>

        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
