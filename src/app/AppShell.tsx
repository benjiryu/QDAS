import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ProjectNav } from '../features/navigation/ProjectNav';
import { useReadingScale } from '../features/readingScale/useReadingScale';
import { CURRENT_CODER_ID } from '../data/seed/project';
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
  /*
    Applies the reading preference on every route, per D-061.

    Called for its effect rather than its value: the control lives in the
    transcript header, and the Codebook page — the surface the participant
    asked for — has no control on it. Reading the same store here is what
    carries the preference to routes the control never renders on.
  */
  useReadingScale(CURRENT_CODER_ID);
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
    /*
      One grid since D-059, where the banner sat above a flex row holding the
      navigation and `main`. The sidebar has to reach the viewport's top and
      left, which it cannot do underneath a full-width banner, so the three
      become siblings and the stylesheet places them.

      Order here is unchanged and is the reading order: banner, project
      navigation, main. Only where they paint moved.
    */
    <div className="app-shell">
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
          {/* Named for the same reason as every other list, per D-051, even
              though its landmark is named: the two are reached separately. */}
          <ul className="nav-list" aria-label="Application">
            <li>
              <Link to="/projects">Projects</Link>
            </li>
          </ul>
        </nav>
      </header>

      {/*
          Project-level navigation, per D-043 and docs/pages/destinations.md.
          Renders on every route, including /projects where no project is in
          context and it says so.

          D-015 closed A-2 by removing the question rather than answering it:
          coding is an action on the open source, not a separate destination, so
          no item here owns transcript coding. The items are the coder's sources
          and the three read surfaces.
        */}
      <ProjectNav />

      <main id={MAIN_CONTENT_ID} ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
