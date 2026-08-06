import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import './AppShell.css';

/**
 * Application shell. Landmarks and route-entry focus.
 *
 * Specification: docs/accessibility-contract.md sections 2.1 and 2.4.
 *
 * The shell owns the landmark structure that every route shares: one banner,
 * an application-level navigation, a labeled project-level navigation, and one
 * main. Each route supplies its own h1.
 *
 * ## Where focus goes on route entry
 *
 * Task 5a asks for focus on the h1 of each route. Section 2.4 says focus is
 * never moved on load. Both hold, because they describe different events:
 *
 * - Following a link is a user action, and in a single-page application the
 *   element that had focus is then removed from the document. Something has to
 *   receive focus or it falls to the body, and the user loses their place. So
 *   focus moves to the new route's h1, which also names the page they landed on.
 * - A first render is not a user action. Typing a URL, reloading, or opening a
 *   deep link moves nothing, and focus starts where the browser puts it.
 *
 * The reading that would satisfy the task literally on a first load is the one
 * section 2.4 forbids, so the first render is excluded. Flagged in the task
 * report rather than settled here.
 */

export const MAIN_CONTENT_ID = 'main-content';

export function AppShell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // The route owns its heading, so the shell finds it rather than requiring
    // every page to wire a ref back up to here.
    mainRef.current?.querySelector('h1')?.focus();
  }, [pathname]);

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
          where no project is in context. Its items are still not specified:
          docs/pages is empty. D-015 closed A-2 by removing the question rather
          than answering it, since coding is an action on the open source and
          not a separate destination, so no navigation item owns transcript
          coding. What the region does list awaits a page specification. The
          landmark is present and labeled in the meantime.
        */}
        <nav aria-label="Project" className="project-nav">
          <p className="placeholder">Project navigation items are not yet specified.</p>
        </nav>

        <main id={MAIN_CONTENT_ID} ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
