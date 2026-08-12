import { useEffect, useId, useMemo, useState } from 'react';
import { readCodebookQuery, readProvisionalCodes, writeCodebookQuery } from '../../data/codingSessionStore';
import { createSeedFixture } from '../../data/seed';
import type { Code, Id } from '../../domain';
import { buildCodeTree } from '../codes/codeTree';
import type { CodeNode } from '../codes/codeTree';
import { hueNameFor } from './familyHues';
import { codeFragmentId } from './fragmentId';
import { MATCH_FIELD_LABELS, searchCodebook } from './searchCodebook';
import './codebook.css';

/**
 * The codebook, as content rather than as a page.
 *
 * Specification: docs/pages/destinations.md section 1, decisions D-046, D-047,
 * D-048.
 *
 * Two surfaces render this: the Codebook destination and, per D-048, the
 * companion beside the coding panel. One component on purpose — D-048 asks that
 * they "cannot drift apart", and a fork is exactly how a reference surface and
 * the thing it references stop agreeing.
 *
 * That is why nothing here is route-aware. No `useParams`, no `h1`, and no
 * fixed element ids: two instances in one document would collide on the last of
 * those, which is what `useId` is for.
 *
 * Read-only on both surfaces. Codebook editing is out of scope per
 * prototype-scope.md, and codes are checked in the panel, never here.
 */

interface CodebookContentProps {
  projectId: Id;
  /**
   * The level families sit at; children and grandchildren descend from it.
   *
   * A prop because the two surfaces sit at different depths. The page puts
   * families at `h2` under its route `h1`; inside the dialog they cannot, since
   * the dialog's own title is an `h2`, so the companion passes `3`.
   */
  headingLevel: number;
  /** Callback ref for the search field, so a container can focus it on open. */
  searchRef?: (node: HTMLInputElement | null) => void;
}

export function CodebookContent({ projectId, headingLevel, searchRef }: CodebookContentProps) {
  const searchId = useId();
  const resultsId = useId();
  const provisionalId = useId();

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    if (fixture.project.projectId !== projectId) return null;

    return {
      codes: fixture.codes,
      tree: buildCodeTree(fixture.codes),
      version: fixture.codebookVersion,
    };
  }, [projectId]);

  /*
    Session-scoped, per section 1: a coder who searches, leaves to code, and
    comes back does not retype it. Seeded lazily so the first render already
    has it, rather than an effect repairing an empty field afterwards.

    Shared between the two surfaces, which follows from reusing this unforked:
    one codebook, one query.
  */
  const [query, setQuery] = useState(() => readCodebookQuery(projectId));

  useEffect(() => {
    writeCodebookQuery(projectId, query);
  }, [projectId, query]);

  /*
    Read once per render rather than held in state: the panel writes these while
    this component is unmounted, so state seeded at mount would go stale.
  */
  const provisional = readProvisionalCodes(projectId);
  const results = useMemo(() => (view ? searchCodebook(view.tree, query) : []), [query, view]);

  if (!view) return null;

  const trimmed = query.trim();
  const childLevel = Math.min(headingLevel + 1, 6);

  return (
    <>
      {/*
        Count and version together, which is the orientation a screen reader
        hears on arrival. The version is stated here rather than on all fifty
        records: every code in this codebook carries the same one, so per record
        it would be the same sentence fifty times on a surface read straight
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
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* Results, only while a query is active, and above the canonical cards,
          which never reorder under them. Section 1. */}
      {trimmed !== '' ? (
        <section className="codebook__region" data-region="search-results" aria-labelledby={resultsId}>
          <Heading level={headingLevel} id={resultsId}>
            {results.length} {results.length === 1 ? 'result' : 'results'} for “{trimmed}”
          </Heading>
          {results.length === 0 ? (
            <p>No codes match. The codebook below is unchanged.</p>
          ) : (
            <ul className="codebook__list">
              {results.map((result) => (
                <li key={result.code.codeId}>
                  <CodeRecord
                    code={result.code}
                    headingLevel={childLevel}
                    idPrefix="result"
                    parentPath={result.parentPath}
                    /* Why this record is here. The panel cannot say this,
                       because it matches only what it displays; this can,
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

        No heading of its own above the cards. Section 1 puts families at the
        base level, so a "Codebook" heading here would sit at the same level and
        interrupt the outline this structure exists to produce. The container
        keeps its marker and stays a plain div, which also keeps it out of the
        landmark list.
      */}
      <div className="codebook__region" data-region="codebook">
        {view.tree.map((family) => (
          <FamilyCard key={family.code.codeId} family={family} headingLevel={headingLevel} />
        ))}
      </div>

      {/* After the canonical cards and never interleaved, per section 1. Absent
          rather than empty when the coder has proposed nothing, the same rule
          the panel applies to its conditional regions. */}
      {provisional.length > 0 ? (
        <section
          className="codebook__region"
          data-region="provisional"
          aria-labelledby={provisionalId}
        >
          <Heading level={headingLevel} id={provisionalId}>
            Provisional codes
          </Heading>
          <p>Awaiting approval. These are not part of the codebook.</p>
          <ul className="codebook__list">
            {provisional.map((code) => (
              <li key={code.codeId}>
                <CodeRecord code={code} headingLevel={childLevel} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** A heading at a level decided at runtime, which JSX cannot express inline. */
function Heading({
  level,
  id,
  className,
  children,
}: {
  level: number;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = `h${Math.min(Math.max(level, 1), 6)}` as 'h2';
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}

/**
 * The heading level a code sits at, from the base level and its depth.
 *
 * Section 1 as amended by D-047: families at the base, children one below,
 * grandchildren one below that. This is what makes a screen reader's heading
 * list read as the codebook's own hierarchy, which is the point of the whole
 * structure.
 *
 * Clamped at `h6`, the last level HTML has. A codebook deeper than the base
 * allows would flatten there rather than emit an invalid tag; nothing in the
 * fixture goes past three levels, and the depth test fails loudly if one does.
 */
function headingLevelFor(base: number, depth: number): number {
  return Math.min(base + depth, 6);
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
function FamilyCard({ family, headingLevel }: { family: CodeNode; headingLevel: number }) {
  const hue = hueNameFor(family.code.colorToken);

  return (
    <article
      className="codebook__card"
      data-color-token={family.code.colorToken}
      data-family-id={family.code.codeId}
    >
      <CodeRecord code={family.code} headingLevel={headingLevel} colorName={hue} />
      <CodeSubtree nodes={family.children} headingLevel={headingLevel} depth={1} />
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
function CodeSubtree({
  nodes,
  headingLevel,
  depth,
}: {
  nodes: CodeNode[];
  headingLevel: number;
  depth: number;
}) {
  if (nodes.length === 0) return null;

  return (
    <ul className="codebook__list codebook__tree">
      {nodes.map((node) => (
        <li key={node.code.codeId}>
          <CodeRecord code={node.code} headingLevel={headingLevelFor(headingLevel, depth)} />
          <CodeSubtree nodes={node.children} headingLevel={headingLevel} depth={depth + 1} />
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
        <Heading level={headingLevel} className="codebook__name">
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
