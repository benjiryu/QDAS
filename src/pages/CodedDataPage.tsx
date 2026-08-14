import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { lineageDescription, matchCode } from '../features/codes/codeTree';
import { useAnnouncer } from '../a11y';
import { Link, useParams } from 'react-router';
import { readCodedDataFilter, readSavedWork, writeCodedDataFilter } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID } from '../data/seed/project';
import { readSimulatedSession, writeSimulatedSession } from '../data/simulatedSession';
import { PHASE_LABELS } from '../domain';
import type { ProjectPhase, UserRole } from '../domain';
import { buildCodedData } from '../features/codedData/codedDataView';
import type { CodedResult } from '../features/codedData/codedDataView';
import { resolveCodedDataView, VIEW_LABELS } from '../features/codedData/resolveView';
import './codedData.css';

/**
 * Route /projects/:projectId/coded-data.
 *
 * Specification: docs/pages/destinations.md section 2, decisions D-045, D-049,
 * D-030, D-041, R-4.
 *
 * Two views behind one destination, resolved by role and phase per D-049. R-4
 * and D-010 keep another coder's work invisible during independent coding; the
 * project-wide design was drawn for the lead's monitoring need and for the
 * moment after independent coding closes, when R-4 lifts by its own terms.
 * Neither decision is reversed: the page shows different truths to different
 * viewers at different moments, which is what the role model was for.
 *
 * The view is named on screen, per D-049, so a session that accidentally ran in
 * the wrong one is visible in the recording rather than contaminating silently.
 *
 * Read-only. Editing routes through the coding panel via `excerpt.open`, which
 * is what a result link leads to.
 */

const ALL_CODES = 'all';

const ROLE_LABELS: Record<UserRole, string> = {
  coder: 'Coder',
  reviewer: 'Reviewer',
  qualitativeLead: 'Qualitative lead',
};

export function CodedDataPage() {
  const { projectId } = useParams();
  const roleId = useId();
  const phaseId = useId();
  const filtersId = useId();
  const searchId = useId();
  const resultsId = useId();

  /*
    Role and phase, from the simulated session. Held in component state as well
    so a change re-renders; the store is what survives the navigation.
  */
  const [session, setSession] = useState(() => readSimulatedSession());

  const fixture = useMemo(() => createSeedFixture(), []);
  const found = fixture.project.projectId === projectId;

  const view = resolveCodedDataView(session.role, session.phase);

  const data = useMemo(() => {
    if (!found) return null;
    const work = readSavedWork(fixture.project.projectId);

    return buildCodedData({
      view,
      currentUserId: CURRENT_CODER_ID,
      sources: fixture.sources,
      segments: fixture.segments,
      turns: fixture.turns,
      speakers: fixture.speakers,
      users: fixture.users,
      codes: [...fixture.codes],
      // Seeded work and this session's, which is the only place the coder's own
      // excerpts live: every seeded excerpt belongs to the second coder.
      excerpts: [...fixture.excerpts, ...work.excerpts],
      assignments: [...fixture.codeAssignments, ...work.assignments],
      notes: [...fixture.notes, ...work.notes],
      supersededIds: work.supersededIds,
    });
  }, [fixture, found, view]);

  /* Per view, per section 2: the two views have different filter lists. */
  const [selected, setSelected] = useState(() =>
    projectId ? readCodedDataFilter(projectId, view) : ALL_CODES,
  );

  useEffect(() => {
    if (projectId) writeCodedDataFilter(projectId, view, selected);
  }, [projectId, selected, view]);

  /*
    The filter search. Component state rather than the session store: section 2
    persists the selected filter and says nothing about a query, and a query
    that outlived the visit would hide most of the list on arrival with no
    obvious reason why.
  */
  const [query, setQuery] = useState('');

  /*
    Matching by the panel's rule, in this page's order.

    `searchCodes` would sort canonically, which is exactly the ordering D-062
    diverges from here — so the predicate is shared and the ordering is not.
  */
  const shownFilters = (data?.filters ?? []).filter(
    (filter) => query.trim() === '' || matchCode(filter.code.name, filter.lineage, query) !== null,
  );

  /*
    The count, announced once the typing settles.

    Continuous, per D-050, for the reason the panel's is: the intermediate
    counts are drafts of one fact still being typed, and speaking each would
    report three numbers of which only the last is true.
  */
  const announcer = useAnnouncer();
  const announcedFor = useRef<string | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery === '') {
      announcedFor.current = null;
      return;
    }
    if (announcedFor.current === trimmedQuery) return;
    announcedFor.current = trimmedQuery;

    announcer.announce(
      `${shownFilters.length} ${shownFilters.length === 1 ? 'code' : 'codes'} for ${trimmedQuery}.`,
      'polite',
      'continuous',
    );
  }, [announcer, shownFilters.length, trimmedQuery]);

  if (!found || !projectId || !data) {
    return (
      <>
        <h1 tabIndex={-1}>Project not found</h1>
        <p>No seeded project has the identifier {projectId}.</p>
      </>
    );
  }

  /*
    A filter that exists in one view may not in the other, and a selection that
    no longer matches anything would show an empty list with no explanation.
    Resolved at render rather than by clearing the store, so switching back
    finds the selection still there.
  */
  const live = data.filters.some((filter) => filter.code.codeId === selected)
    ? selected
    : ALL_CODES;

  const shown =
    live === ALL_CODES
      ? data.results
      : data.results.filter((result) => result.codes.some((code) => code.codeId === live));

  return (
    <>
      <h1 tabIndex={-1}>Coded data</h1>

      {/*
        The view's name and the count together, per D-049. "Your coded work" or
        "Project-wide view": nobody should have to infer which truth they are
        reading, least of all from a recording afterwards.
      */}
      <p className="coded-data__summary">
        <strong data-view-label>{VIEW_LABELS[view]}</strong> · {data.total} coded{' '}
        {data.total === 1 ? 'excerpt' : 'excerpts'}
      </p>

      {data.total === 0 ? (
        /* Named route out, never a blank region. Shared rules. */
        <p>
          {view === 'own'
            ? 'You have not coded anything in this project yet. Open a source from the project navigation, select some text, and either \
                right-click it and choose Assign code, or press the Assign code shortcut.'
            : 'Nothing has been coded in this project yet.'}{' '}
          <Link to={`/projects/${projectId}`}>Back to the project</Link>
        </p>
      ) : (
        <div className="coded-data__layout">
          {/*
            Filters before results in the DOM, which is also the order at 320px
            and at 400 percent. Two columns only when there is room, so the
            reading order never changes with the width. D-033.
          */}
          <section
            className="coded-data__filters"
            data-region="filters"
            aria-labelledby={filtersId}
          >
            <h2 id={filtersId}>Codes</h2>

            {/*
              Search, first control in the region, named as the panel's is and
              matching by the same rule — a coder typing the same letters on
              either surface finds the same codes.

              It narrows which filters are offered and never the results below:
              what is shown is decided by the filter that is selected, and a
              list quietly changing under a coder who was only looking for a
              code would be the surprise.
            */}
            <div className="coded-data__search">
              <label htmlFor={searchId}>Search codes</label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <ul className="coded-data__filter-list" aria-labelledby={filtersId}>
              <li>
                <FilterOption
                  value={ALL_CODES}
                  label="All codes"
                  count={data.total}
                  selected={live === ALL_CODES}
                  onSelect={setSelected}
                />
              </li>
              {shownFilters.map((filter) => (
                <li key={filter.code.codeId}>
                  <FilterOption
                    value={filter.code.codeId}
                    label={filter.code.name}
                    count={filter.count}
                    selected={live === filter.code.codeId}
                    onSelect={setSelected}
                    lineage={filter.lineage}
                    colorToken={filter.code.colorToken}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section className="coded-data__results" data-region="results" aria-labelledby={resultsId}>
            <h2 id={resultsId}>
              {shown.length} {shown.length === 1 ? 'excerpt' : 'excerpts'}
            </h2>
            <ul className="coded-data__result-list" aria-labelledby={resultsId}>
              {shown.map((result) => (
                <li key={result.excerptId}>
                  <ResultRow projectId={projectId} result={result} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/*
        The simulated session, per prototype-scope.md: a role switcher standing
        in for authentication, not a login. Last on the page, after the four
        regions section 2 fixes in order, so the specified sequence is untouched
        and a facilitator's control is out of a participant's path.
      */}
      <section className="coded-data__scenario" data-region="scenario">
        <h2>Session scenario</h2>
        <p>
          Simulated, for facilitator setup. Authentication is not built; this stands in for it,
          per the prototype scope.
        </p>

        <div className="coded-data__scenario-field">
          <label htmlFor={roleId}>Role</label>
          <select
            id={roleId}
            value={session.role}
            onChange={(event) => {
              const role = event.target.value as UserRole;
              writeSimulatedSession({ role });
              setSession(readSimulatedSession());
            }}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="coded-data__scenario-field">
          <label htmlFor={phaseId}>Project phase</label>
          <select
            id={phaseId}
            value={session.phase}
            onChange={(event) => {
              const phase = event.target.value as ProjectPhase;
              writeSimulatedSession({ phase });
              setSession(readSimulatedSession());
            }}
          >
            {Object.entries(PHASE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </>
  );
}

/**
 * One filter.
 *
 * A radio, because the filter is one choice out of many and a native radio
 * group carries that plus arrow-key movement without reimplementing either.
 *
 * The count is inside the label rather than beside it, so it is part of the
 * accessible name — "Water access, 20" — and so a magnification user reading
 * the name has the count in the same glance. That is the F-4 lesson D-049 cites.
 */
function FilterOption({
  value,
  label,
  count,
  selected,
  onSelect,
  lineage = [],
  colorToken,
}: {
  value: string;
  label: string;
  count: number;
  selected: boolean;
  onSelect: (value: string) => void;
  /** The ancestors' names, outermost first. */
  lineage?: readonly string[];
  /** The family's hue. Absent on "All codes", which belongs to no family. */
  colorToken?: string;
}) {
  const describedById = useId();
  const describedBy = lineageDescription(lineage);

  /*
    No level attribute, and no visual level channel.

    D-062 gave level indentation, its amendment replaced that with pill fill
    treatment, and both are gone: the pills went and indentation did not come
    back with them. So a sighted reader sees a flat alphabetical list, and level
    reaches only a screen reader, through the lineage description below.

    Recorded as a decision rather than left here as a shrug — the loss falls on
    the magnification users this page serves, and the ordering still keeps a
    family contiguous, so grouping survives even where level does not.
  */
  return (
    /*
      Wrapping, per D-051: a `for`-associated label beside its control names it
      and then reads again as loose text, so each filter was two stops.
    */
    <>
    <label className="coded-data__filter" data-selected={selected ? '' : undefined}>
      <input
        type="radio"
        name="coded-data-filter"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        /*
          The lineage, per D-054 as D-062 reuses it: the name stays exactly
          "Water access, 20" and the family rides in the description, so search,
          sorting and the count all keep operating on a clean name.
        */
        aria-describedby={describedBy ? describedById : undefined}
      />
      <span className="coded-data__filter-body">
        {/* The code name is data and scales with the reading preference; the
            count and the punctuation around it are the filter's scaffolding and
            stay put. D-061 classifies the two apart, so they need to be two
            elements. The accessible name is unchanged either way. */}
        <span className="coded-data__filter-name" data-color-token={colorToken}>
          {label}
        </span>
        ,{' '}
        <span className="coded-data__count">{count}</span>
      </span>
    </label>
      {/*
        Outside the label, not inside it. Inside, its text joins the label's
        contents and lands in the accessible name — the one thing D-054 rules
        out, and the name here has to stay the code and its count.
      */}
      {describedBy ? (
        <span id={describedById} className="visually-hidden">
          {describedBy}
        </span>
      ) : null}
    </>
  );
}

/**
 * One result.
 *
 * The link lands focus on the turn containing the excerpt's start, which
 * section 2 calls the page's most important behaviour: landing at the top of
 * the transcript instead makes the page useless. `?turn=` carries it, so the
 * row is an ordinary link and stays shareable.
 *
 * Codes render as D-041 does them: pills out of the accessibility tree, the
 * names as text, so a screen reader hears them once rather than twice.
 */
function ResultRow({ projectId, result }: { projectId: string; result: CodedResult }) {
  const names = result.codes.map((code) => code.name).join(', ');

  return (
    <article className="coded-data__result" data-excerpt-id={result.excerptId}>
      <p className="coded-data__excerpt">
        <Link to={`/projects/${projectId}/sources/${result.sourceId}?turn=${result.turnId}`}>
          {result.text}
        </Link>
      </p>

      <p className="coded-data__meta">
        <span className="coded-data__source">{result.sourceTitle}</span>
        {result.coderName ? (
          <>
            {' · '}
            <span className="coded-data__coder">{result.coderName}</span>
          </>
        ) : null}
        {result.hasNote ? <> · Has a note</> : null}
      </p>

      <p className="coded-data__codes">
        <span className="coded-data__pills" aria-hidden="true">
          {result.codes.map((code) => (
            <span key={code.codeId} className="coded-data__pill" data-color-token={code.colorToken}>
              {code.name}
            </span>
          ))}
        </span>
        <span className="coded-data__code-names">Codes: {names}</span>
      </p>
    </article>
  );
}
