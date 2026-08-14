/**
 * What the Coded data page shows, derived from the records.
 *
 * Specification: docs/pages/destinations.md section 2, decisions D-045, D-049,
 * D-030, R-4.
 *
 * Separate from the component so the gate and the counting can be tested
 * without rendering, and so the page is assembly rather than arithmetic.
 */

import {
  applySupersession,
  canReadNote,
  excerptText,
  isStanding,
  rangeOf,
  requireTurnOf,
  resolveSource,
  sameExcerptCoderIds,
  positionOf,
} from '../../domain';
import type {
  Code,
  CodeAssignment,
  Excerpt,
  Id,
  Note,
  SpeakerTurn,
  Source,
  Speaker,
  TranscriptSegment,
  User,
} from '../../domain';
import {
  buildCodeTree,
  byCanonicalOrder,
  byLookupPath,
  flattenCodeTree,
} from '../codes/codeTree';
import type { CodedDataView } from './resolveView';

export interface CodedResult {
  excerptId: Id;
  sourceId: Id;
  sourceTitle: string;
  /** The turn to land focus on: the one containing the excerpt's start. */
  turnId: Id;
  text: string;
  codes: Code[];
  /**
   * The note on this excerpt, where the viewer may read it. Null otherwise.
   *
   * Text rather than a boolean since D-067, whose disclosure reveals it. That
   * also makes "no indicator where the viewer cannot read the note" structural
   * rather than a rule to remember: there is nothing to disclose, so there is
   * nothing to render.
   */
  noteText: string | null;
  /** Named only in the project-wide view, where R-4 has lifted. */
  coderName: string | null;
  /**
   * Other coders who coded the same excerpt, per D-066. Empty in the own view.
   *
   * Names, alphabetical. The domain decides who qualifies; the ordering is
   * wording, and belongs here with the names rather than with the arithmetic.
   */
  alsoCodedBy: string[];
}

export interface CodeFilter {
  code: Code;
  count: number;
  /**
   * How deep the code sits in the codebook, per D-062. 0 for a family.
   *
   * Derived from the whole codebook rather than from the codes in this list,
   * which is what makes D-062's own-view edge fall out rather than needing a
   * rule: a child whose ancestors nobody used keeps its real depth and names
   * them, and no placeholder row appears for a code with no excerpts.
   */
  depth: number;
  /** The ancestors' names, outermost first. Empty for a family. */
  lineage: string[];
}

export interface CodedData {
  filters: CodeFilter[];
  results: CodedResult[];
  /** Every result, so the count line does not change with the filter. */
  total: number;
}

interface Input {
  view: CodedDataView;
  currentUserId: Id;
  sources: Source[];
  segments: TranscriptSegment[];
  turns: SpeakerTurn[];
  speakers: Speaker[];
  users: User[];
  codes: Code[];
  excerpts: Excerpt[];
  assignments: CodeAssignment[];
  notes: Note[];
  supersededIds: readonly Id[];
}

export function buildCodedData({
  view,
  currentUserId,
  sources,
  segments,
  turns,
  speakers,
  users,
  codes,
  excerpts,
  assignments,
  notes,
  supersededIds,
}: Input): CodedData {
  /*
    R-4, and the one filter that matters most on this page. In the own view a
    coder sees their own work and nothing else; in the project-wide view the
    veil has lifted, either because the viewer is the lead or because the phase
    passed independent coding.
  */
  const visibleExcerpts =
    view === 'own'
      ? excerpts.filter((excerpt) => excerpt.coderId === currentUserId)
      : excerpts;
  const visibleExcerptIds = new Set(visibleExcerpts.map((excerpt) => excerpt.excerptId));

  // Superseded assignments are marked, then dropped. D-030 keeps the record;
  // this page counts what still stands.
  const standing = applySupersession(assignments, supersededIds).filter(
    (assignment) => isStanding(assignment) && visibleExcerptIds.has(assignment.excerptId),
  );

  const codeById = new Map(codes.map((code) => [code.codeId, code]));
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const userById = new Map(users.map((user) => [user.userId, user]));
  /*
    The note on each excerpt, where this viewer may read it, per `canReadNote`.

    Filtered here for the first time. Before D-067 this counted every note it
    was handed — no author, no status, no visibility — which made "Has a note"
    survive its own note's deletion. A disclosure cannot be built on that: it
    would have opened onto text the coder had deleted.

    `identitiesVisible` is the project-wide view's condition, the same one that
    gates `coderName` and `alsoCodedBy` below. Own notes are readable in either
    view; another coder's only once R-4 has lifted, and never a private one.
  */
  const audience = { viewerId: currentUserId, identitiesVisible: view === 'projectWide' };
  const noteByExcerpt = new Map<Id, string>();
  for (const note of notes) {
    if (note.relatedExcerptId === null) continue;
    if (!canReadNote(note, audience)) continue;
    noteByExcerpt.set(note.relatedExcerptId, note.noteText);
  }

  /* ---------- Filters ---------- */

  const counts = new Map<Id, number>();
  for (const assignment of standing) {
    counts.set(assignment.codeId, (counts.get(assignment.codeId) ?? 0) + 1);
  }

  // Only codes carrying a standing assignment, per section 2: a code nobody has
  // used is not a filter, in either view.
  /*
    Depth and lineage for every code in the codebook, not only the used ones.
    See `CodeFilter.depth`: the absent ancestors are exactly what a child with
    unused parents needs in order to indent honestly.
  */
  const placeById = new Map(
    flattenCodeTree(buildCodeTree([...codes])).map((node) => [
      node.code.codeId,
      { depth: node.depth, lineage: node.parentPath },
    ]),
  );

  /*
    Lookup order, per D-062: families alphabetical, depth-first within, siblings
    alphabetical. A page-scoped divergence from the authored order — the
    codebook and the panel still teach the vocabulary in the order it was
    written, and the sort on the result rows below is untouched.
  */
  const filters: CodeFilter[] = [...counts.entries()]
    .map(([codeId, count]) => {
      const code = codeById.get(codeId);
      const place = placeById.get(codeId);
      return code ? { code, count, depth: place?.depth ?? 0, lineage: place?.lineage ?? [] } : null;
    })
    .filter((entry): entry is CodeFilter => entry !== null)
    .sort((a, b) => byLookupPath([...a.lineage, a.code.name], [...b.lineage, b.code.name]));

  /* ---------- Results ---------- */

  /*
    One resolved source per source, so an excerpt's text and its landing turn
    come from the same derivation the transcript uses. Built once here rather
    than per row: `resolveSource` walks every segment.
  */
  const resolvedById = new Map(
    sources.map((source) => [
      source.sourceId,
      resolveSource({
        source,
        segments: segments.filter((segment) => segment.sourceId === source.sourceId),
        turns: turns.filter((turn) => turn.sourceId === source.sourceId),
        speakers: speakers.filter((speaker) => speaker.sourceId === source.sourceId),
      }),
    ]),
  );

  const codesByExcerpt = new Map<Id, Code[]>();
  for (const assignment of standing) {
    const code = codeById.get(assignment.codeId);
    if (!code) continue;
    const list = codesByExcerpt.get(assignment.excerptId) ?? [];
    if (!list.some((candidate) => candidate.codeId === code.codeId)) list.push(code);
    codesByExcerpt.set(assignment.excerptId, list);
  }

  const sourceOrder = new Map(sources.map((source, index) => [source.sourceId, index]));

  const coded = visibleExcerpts.filter(
    (excerpt) => (codesByExcerpt.get(excerpt.excerptId) ?? []).length > 0,
  );

  /*
    Who else coded the same excerpt, per D-066.

    The candidate set is `coded` rather than every excerpt, which is a scoping
    decision worth naming: an excerpt whose assignments have all been superseded
    is not a row on this page, and D-066's reasoning is that the reader looks at
    the neighbouring row to see what the other coder chose. Pointing at a row
    that is not there would send them hunting, and "also coded by" would be
    naming somebody with no standing code.

    Gated on the view as well, and that gate is unreachable today: the own view
    filters `visibleExcerpts` to one coder above, so no cross-coder pair can
    reach here to be suppressed. It is kept deliberately and is stated as such
    rather than left looking load-bearing — R-4 is the rule this page exists
    under, and if `visibleExcerpts` ever widens, the leak should be stopped by
    something that says so rather than by remembering to re-narrow it.

    No test bites on removing it, for the same reason. The own view's emptiness
    is covered, but by the filter above.
  */
  const alsoCodedByExcerpt = new Map<Id, string[]>();
  if (view === 'projectWide') {
    const bySource = new Map<Id, Excerpt[]>();
    for (const excerpt of coded) {
      const list = bySource.get(excerpt.sourceId) ?? [];
      list.push(excerpt);
      bySource.set(excerpt.sourceId, list);
    }

    for (const [sourceId, group] of bySource) {
      const resolved = resolvedById.get(sourceId);
      if (!resolved) continue;

      for (const excerpt of group) {
        const names = sameExcerptCoderIds(resolved, excerpt, group)
          .map((coderId) => userById.get(coderId)?.displayName ?? 'Unknown coder')
          .sort((a, b) => a.localeCompare(b));
        if (names.length > 0) alsoCodedByExcerpt.set(excerpt.excerptId, names);
      }
    }
  }

  const results: CodedResult[] = coded
    .map((excerpt) => {
      const resolved = resolvedById.get(excerpt.sourceId);
      if (!resolved) return null;

      const range = rangeOf(excerpt);
      const turn = requireTurnOf(resolved, excerpt.startSegmentId);
      const coder = userById.get(excerpt.coderId);

      return {
        excerptId: excerpt.excerptId,
        sourceId: excerpt.sourceId,
        sourceTitle: sourceById.get(excerpt.sourceId)?.title ?? 'Unknown source',
        turnId: turn.turn.turnId,
        text: excerptText(resolved, range),
        codes: (codesByExcerpt.get(excerpt.excerptId) ?? [])
          .slice()
          .sort(byCanonicalOrder),
        noteText: noteByExcerpt.get(excerpt.excerptId) ?? null,
        // Attribution belongs to the project-wide view only. Naming a coder in
        // the own view would be noise; naming one during independent coding
        // would be the leak R-4 forbids.
        coderName: view === 'projectWide' ? (coder?.displayName ?? 'Unknown coder') : null,
        alsoCodedBy: alsoCodedByExcerpt.get(excerpt.excerptId) ?? [],
      } satisfies CodedResult;
    })
    .filter((result): result is CodedResult => result !== null)
    // Source order, then position within the source. Section 2.
    .sort((a, b) => {
      const bySource = (sourceOrder.get(a.sourceId) ?? 0) - (sourceOrder.get(b.sourceId) ?? 0);
      if (bySource !== 0) return bySource;

      const resolved = resolvedById.get(a.sourceId)!;
      const startOf = (result: CodedResult) => {
        const excerpt = coded.find((candidate) => candidate.excerptId === result.excerptId)!;
        return positionOf(resolved, excerpt.startSegmentId) ?? 0;
      };
      return startOf(a) - startOf(b);
    });

  return { filters, results, total: results.length };
}
