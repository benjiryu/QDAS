import { useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { readCodebookQuery, readProvisionalCodes, writeCodebookQuery } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import type { Code } from '../domain';
import { codeFragmentId } from '../features/codebook/fragmentId';
import { MATCH_FIELD_LABELS, searchCodebook } from '../features/codebook/searchCodebook';
import { buildCodeTree } from '../features/codes/codeTree';
import type { CodeNode } from '../features/codes/codeTree';
import './codebook.css';

/**
 * Route /projects/:projectId/codebook.
 *
 * Specification: docs/pages/destinations.md section 1, decisions D-035, D-043.
 *
 * The destination D-035 pointed definition lookup at when it took definitions
 * out of the coding panel. That makes this page the reason D-044 exists: a
 * coder comes here mid-capture to tell `Water access` from `Water access rules`,
 * and the capture has to be waiting when they go back.
 *
 * So the page is long and complete rather than short and navigable. Every code
 * shows its full record inline with no disclosure per row, because a disclosure
 * would put the coder's answer one more activation away on the surface built to
 * answer them.
 *
 * Read-only. Codebook editing is out of scope per prototype-scope.md, and
 * everything a coder changes still goes through the coding panel.
 */

/** The fields on every record. Order is fixed, as the field list gives it. */
const RECORD_FIELDS: { label: string; read: (code: Code) => string }[] = [
  { label: 'Short definition', read: (code) => code.shortDefinition },
  { label: 'Full definition', read: (code) => code.fullDefinition },
  { label: 'Inclusion criteria', read: (code) => code.inclusionCriteria },
  { label: 'Exclusion criteria', read: (code) => code.exclusionCriteria },
];

const STATUS_LABELS: Record<Code['status'], string> = {
  approved: 'Approved',
  provisional: 'Provisional',
  deprecated: 'Deprecated',
  merged: 'Merged',
};

export function CodebookPage() {
  const { projectId } = useParams();
  const searchId = useId();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;

    return {
      projectId: fixture.project.projectId,
      codes: fixture.codes,
      tree: buildCodeTree(fixture.codes),
      version: fixture.codebookVersion,
    };
  }, [projectId]);

  /*
    Session-scoped, per section 1: a coder who searches, leaves to code, and
    comes back does not retype it. Seeded lazily so the first render already
    has it, rather than an effect repairing an empty field afterwards.
  */
  const [query, setQuery] = useState(() => (projectId ? readCodebookQuery(projectId) : ''));

  useEffect(() => {
    if (projectId) writeCodebookQuery(projectId, query);
  }, [projectId, query]);

  /*
    Read once per render rather than held in state: the panel writes these while
    this page is unmounted, so state seeded at mount would go stale.
  */
  const provisional = view ? readProvisionalCodes(view.projectId) : [];
  const results = useMemo(
    () => (view ? searchCodebook(view.tree, query) : []),
    [query, view],
  );

  if (!view) {
    return (
      <>
        <h1 tabIndex={-1}>Project not found</h1>
        <p>No seeded project has the identifier {projectId}.</p>
      </>
    );
  }

  const trimmed = query.trim();

  return (
    <>
      <h1 tabIndex={-1}>Code book</h1>

      {/*
        Count and version together, which is the orientation a screen reader
        hears on arrival. The version is stated here rather than on all fifty
        records: every code in this codebook carries the same one, so per record
        it would be the same sentence fifty times on a page read straight
        through. A deviation from section 1's field list, in the task report.
      */}
      <p className="codebook__summary">
        {view.codes.length} codes · {view.version.versionLabel}
      </p>

      {/* Search. No region heading: the field's own label names it. */}
      <div className="codebook__search">
        <label htmlFor={searchId}>Search the codebook</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* Results, only while a query is active, and above the canonical list,
          which never reorders under them. Section 1. */}
      {trimmed !== '' ? (
        <section className="codebook__region" data-region="search-results" aria-labelledby="codebook-results">
          <h2 id="codebook-results">
            {results.length} {results.length === 1 ? 'result' : 'results'} for “{trimmed}”
          </h2>
          {results.length === 0 ? (
            <p>No codes match. The codebook below is unchanged.</p>
          ) : (
            <ul className="codebook__list">
              {results.map((result) => (
                <li key={result.code.codeId}>
                  <CodeRecord
                    code={result.code}
                    headingLevel={3}
                    idPrefix="result"
                    parentPath={result.parentPath}
                    /* Why this record is here. The panel cannot say this,
                       because it matches only what it displays; this page can,
                       because the matched text is on screen. */
                    matchedIn={MATCH_FIELD_LABELS[result.matchedOn]}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="codebook__region" data-region="codebook" aria-labelledby="codebook-canonical">
        <h2 id="codebook-canonical">Codebook</h2>
        <CodeTree nodes={view.tree} headingLevel={3} />
      </section>

      {/* After the canonical list and never interleaved, per section 1. Absent
          rather than empty when the coder has proposed nothing, the same rule
          the panel applies to its conditional regions. */}
      {provisional.length > 0 ? (
        <section
          className="codebook__region"
          data-region="provisional"
          aria-labelledby="codebook-provisional"
        >
          <h2 id="codebook-provisional">Provisional codes</h2>
          <p>Awaiting approval. These are not part of the codebook.</p>
          <ul className="codebook__list">
            {provisional.map((code) => (
              <li key={code.codeId}>
                <CodeRecord code={code} headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/**
 * The codebook as nested lists, in canonical order.
 *
 * Hierarchy shows as indentation and as the nesting itself. Each nested list is
 * labelled by its parent, so a child is heard in context.
 */
function CodeTree({ nodes, headingLevel }: { nodes: CodeNode[]; headingLevel: number }) {
  return (
    <ul className="codebook__list codebook__tree">
      {nodes.map((node) => (
        <li key={node.code.codeId}>
          <CodeRecord code={node.code} headingLevel={headingLevel} />
          {node.children.length > 0 ? (
            <CodeTree nodes={node.children} headingLevel={Math.min(headingLevel + 1, 6)} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface CodeRecordProps {
  code: Code;
  /** 3 under a section h2, descending with the nesting. Contract 2.1. */
  headingLevel: number;
  /** Distinguishes the results copy of a record from the canonical one. */
  idPrefix?: string;
  parentPath?: string[];
  matchedIn?: string;
}

/**
 * One code, in full.
 *
 * A heading as well as the nested list section 1 asks for. The list carries the
 * hierarchy; the heading is how a screen reader user crosses fifty records
 * without reading every line of every one, which is the whole difficulty of a
 * long reference page.
 */
function CodeRecord({ code, headingLevel, idPrefix, parentPath, matchedIn }: CodeRecordProps) {
  const Heading = `h${headingLevel}` as 'h3';
  const fragmentId = codeFragmentId(code.codeId);

  return (
    <article
      className="codebook__record"
      /* The canonical list owns the fragment; the results copy takes a derived
         id so a deep link never lands on a record that vanishes with a query. */
      id={idPrefix ? `${idPrefix}-${fragmentId}` : fragmentId}
      data-code-id={code.codeId}
    >
      <Heading className="codebook__name">
        {/* Colour is a redundant channel, never carrying meaning on its own:
            the name beside it says everything the pill does. D-041, Task 25. */}
        <span className="codebook__pill" data-color-token={code.colorToken} aria-hidden="true" />
        {code.name}
      </Heading>

      {parentPath && parentPath.length > 0 ? (
        <p className="codebook__path">in {parentPath.join(' › ')}</p>
      ) : null}

      {matchedIn ? <p className="codebook__matched">Matched in {matchedIn}</p> : null}

      <dl className="codebook__fields">
        {RECORD_FIELDS.map((field) => (
          <div key={field.label} className="codebook__field">
            <dt>{field.label}</dt>
            <dd>{field.read(code) === '' ? 'Not recorded.' : field.read(code)}</dd>
          </div>
        ))}
        <div className="codebook__field">
          <dt>Status</dt>
          <dd>{STATUS_LABELS[code.status]}</dd>
        </div>
      </dl>
    </article>
  );
}
