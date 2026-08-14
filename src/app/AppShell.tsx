import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ProjectNav } from '../features/navigation/ProjectNav';
import { useReadingScale } from '../features/readingScale/useReadingScale';
import { ShortcutsHelp } from '../features/help/ShortcutsHelp';
import { useShortcutsHelp } from '../features/help/useShortcutsHelp';
import { CURRENT_CODER_ID } from '../data/seed/project';
import './AppShell.css';

/**
 * Application shell. Landmarks and route-entry focus.
 *
 * Specification: docs/accessibility-contract.md sections 2.1 and 2.4.
 *
 * The shell owns the landmark structure that every route shares: one banner,
 * one labeled project-level navigation, and one main. Each route supplies its
 * own h1.
 *
 * There was an application-level navigation landmark too, until D-068 removed
 * it. It wrapped one link, and landmark-jumping to the banner landed on the
 * wrapper rather than on anything in it. A navigation landmark marks a
 * navigation system; the sidebar is one and this was not.
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

  /*
    The shortcuts help, mounted here so its chord answers on every route. The
    commands it documents live in the transcript and its panels, but a coder
    stuck on a destination page is exactly the person who needs to ask.
  */
  const help = useShortcutsHelp();
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

        {/*
          A link, not a navigation system, since D-068. It used to sit inside a
          `nav` holding a one-item list, so reaching it by landmark meant
          entering a wrapper announced "Application, navigation", then "list",
          and only then arriving — while the button below sat one stop away as a
          direct child of this header.

          The list carried a name per D-051, which is the rule for how a list is
          named and not a reason for something to be one.
        */}
        <Link to="/projects">Projects</Link>

        {/*
          The way into the help, and the reason it is a visible control rather
          than a chord alone: D-065's gate was that nothing on screen names a
          command, and a shortcuts dialog reachable only by `Ctrl` plus `/`
          teaches chords to people who already know one.

          In the banner because that is chrome on every route and never scrolls
          away; last of the three, so asking for help does not push the way out
          of the page one stop further back.
        */}
        <button
          type="button"
          className="app-banner__help"
          data-command="help.shortcuts"
          onClick={help.open}
        >
          Keyboard shortcuts
        </button>
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

      <ShortcutsHelp help={help} />
    </div>
  );
}
