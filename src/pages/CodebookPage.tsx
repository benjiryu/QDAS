import { useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { readCodebookQuery, readProvisionalCodes, writeCodebookQuery } from '../data/codingSessionStore';
import { createSeedFixture } from '../data/seed';
import type { Code } from '../domain';
import { hueNameFor } from '../features/codebook/familyHues';
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

/**
 * The heading level a code sits at, from its depth in the tree.
 *
 * Section 1 as amended by D-047: families at `h2`, children `h3`, grandchildren
 * `h4`. This is what makes a screen reader's heading list read as the
 * codebook's own hierarchy, which is the point of the whole structure.
 *
 * Clamped at `h6`, the last level HTML has. A codebook deeper than four would
 * flatten there rather than emit an invalid tag; nothing in the fixture goes
 * past three, and the depth test would fail loudly if one did.
 */
function headingLevelFor(depth: number): number {
  return Math.min(2 + depth, 6);
}

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

      {/*
        One card per top-level family, per D-047 and frame 247:357.

        No heading of its own above the cards. Section 1 puts families at `h2`,
        so a "Codebook" heading here would sit at the same level and interrupt
        the outline this structure exists to produce: h1, then family, child,
        grandchild. The container keeps its marker and stays a plain div, which
        also keeps it out of the landmark list.
      */}
      <div className="codebook__region" data-region="codebook">
        {view.tree.map((family) => (
          <FamilyCard key={family.code.codeId} family={family} />
        ))}
      </div>

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
 * One top-level family, as a card.
 *
 * The card carries the family's colour token, so the border resolves through the
 * same `--code-strong` rule the pills and the transcript rail use: one place
 * decides what a family is coloured, and this cannot disagree with the panel.
 *
 * With six families the hue assignment never reaches the four shade-1 tokens
 * that fail 3:1 on white, so no low-contrast border is in play. If a seventh
 * family arrived one would be, which is why section 1 has the colour name
 * carrying the identity in text as well.
 */
function FamilyCard({ family }: { family: CodeNode }) {
  const hue = hueNameFor(family.code.colorToken);

  return (
    <article
      className="codebook__card"
      data-color-token={family.code.colorToken}
      data-family-id={family.code.codeId}
    >
      <CodeRecord code={family.code} headingLevel={headingLevelFor(0)} colorName={hue} />
      <CodeSubtree nodes={family.children} depth={1} />
    </article>
  );
}

/**
 * Children and grandchildren inside a card.
 *
 * Nested lists, so the hierarchy is programmatic as well as indented, and the
 * headings descend with the depth. The frame draws the same relationship as
 * indentation alone; the nesting is what a screen reader gets.
 */
function CodeSubtree({ nodes, depth }: { nodes: CodeNode[]; depth: number }) {
  if (nodes.length === 0) return null;

  return (
    <ul className="codebook__list codebook__tree">
      {nodes.map((node) => (
        <li key={node.code.codeId}>
          <CodeRecord code={node.code} headingLevel={headingLevelFor(depth)} />
          <CodeSubtree nodes={node.children} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

interface CodeRecordProps {
  code: Code;
  /** From the code's depth: 2 for a family, descending with the nesting. */
  headingLevel: number;
  /** Distinguishes the results copy of a record from the canonical one. */
  idPrefix?: string;
  parentPath?: string[];
  matchedIn?: string;
  /** The family hue, on the card's own record only. D-047. */
  colorName?: string | null;
}

/**
 * One code, in full.
 *
 * A heading as well as the nested list section 1 asks for. The list carries the
 * hierarchy; the heading is how a screen reader user crosses fifty records
 * without reading every line of every one, which is the whole difficulty of a
 * long reference page.
 */
function CodeRecord({
  code,
  headingLevel,
  idPrefix,
  parentPath,
  matchedIn,
  colorName,
}: CodeRecordProps) {
  const Heading = `h${headingLevel}` as 'h2';
  const fragmentId = codeFragmentId(code.codeId);

  return (
    <div
      className="codebook__record"
      /* The canonical list owns the fragment; the results copy takes a derived
         id so a deep link never lands on a record that vanishes with a query. */
      id={idPrefix ? `${idPrefix}-${fragmentId}` : fragmentId}
      data-code-id={code.codeId}
    >
      {/*
        Heading and colour on one row, which is where the frame puts them.

        The colour follows the heading in the DOM as well as beside it on
        screen, so the two orders agree at every width. That is what keeps
        section 1's 400 percent criterion — the colour value in the reading
        order rather than out at the card's far edge — true by construction
        rather than by a breakpoint that has to be remembered.
      */}
      <div className="codebook__head">
        <Heading className="codebook__name">
          {/* Colour is a redundant channel here: the name says it in text. */}
          <span className="codebook__pill" data-color-token={code.colorToken} aria-hidden="true" />
          {code.name}
        </Heading>

        {colorName ? (
          /*
            A labelled value, never a control, per D-047. The frame draws a
            combobox; colour assignment is a codebook-formation privilege and no
            coder-facing surface edits it, so a control here would look operable
            and refuse. Static text is the honest rendering, and over a screen
            reader it is the difference between a value and a collapsed widget
            that will not open.
          */
          <p className="codebook__color">
            <span className="codebook__color-label">Color:</span>{' '}
            <span
              className="codebook__swatch"
              data-color-token={code.colorToken}
              aria-hidden="true"
            />{' '}
            {colorName}
          </p>
        ) : null}
      </div>

      {parentPath && parentPath.length > 0 ? (
        <p className="codebook__path">in {parentPath.join(' › ')}</p>
      ) : null}

      {matchedIn ? <p className="codebook__matched">Matched in {matchedIn}</p> : null}

      {/* One open-ended definition, per D-046. Unlabelled: it follows its own
          heading, and a "Definition" label on every one of fifty records is a
          word the reader steps over each time. */}
      <p className="codebook__definition">
        {code.fullDefinition === '' ? 'No definition recorded.' : code.fullDefinition}
      </p>
    </div>
  );
}
