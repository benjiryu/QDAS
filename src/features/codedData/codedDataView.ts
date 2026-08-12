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
  excerptText,
  isStanding,
  rangeOf,
  requireTurnOf,
  resolveSource,
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
import { byCanonicalOrder } from '../codes/codeTree';
import type { CodedDataView } from './resolveView';

export interface CodedResult {
  excerptId: Id;
  sourceId: Id;
  sourceTitle: string;
  /** The turn to land focus on: the one containing the excerpt's start. */
  turnId: Id;
  text: string;
  codes: Code[];
  hasNote: boolean;
  /** Named only in the project-wide view, where R-4 has lifted. */
  coderName: string | null;
}

export interface CodeFilter {
  code: Code;
  count: number;
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
  const notedExcerptIds = new Set(
    notes.map((note) => note.relatedExcerptId).filter((id): id is Id => id !== null),
  );

  /* ---------- Filters ---------- */

  const counts = new Map<Id, number>();
  for (const assignment of standing) {
    counts.set(assignment.codeId, (counts.get(assignment.codeId) ?? 0) + 1);
  }

  // Only codes carrying a standing assignment, per section 2: a code nobody has
  // used is not a filter, in either view.
  const filters: CodeFilter[] = [...counts.entries()]
    .map(([codeId, count]) => ({ code: codeById.get(codeId), count }))
    .filter((entry): entry is CodeFilter => entry.code !== undefined)
    .sort((a, b) => byCanonicalOrder(a.code, b.code));

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

  const results: CodedResult[] = visibleExcerpts
    .filter((excerpt) => (codesByExcerpt.get(excerpt.excerptId) ?? []).length > 0)
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
        hasNote: notedExcerptIds.has(excerpt.excerptId),
        // Attribution belongs to the project-wide view only. Naming a coder in
        // the own view would be noise; naming one during independent coding
        // would be the leak R-4 forbids.
        coderName: view === 'projectWide' ? (coder?.displayName ?? 'Unknown coder') : null,
      } satisfies CodedResult;
    })
    .filter((result): result is CodedResult => result !== null)
    // Source order, then position within the source. Section 2.
    .sort((a, b) => {
      const bySource = (sourceOrder.get(a.sourceId) ?? 0) - (sourceOrder.get(b.sourceId) ?? 0);
      if (bySource !== 0) return bySource;

      const resolved = resolvedById.get(a.sourceId)!;
      const startOf = (result: CodedResult) => {
        const excerpt = visibleExcerpts.find((candidate) => candidate.excerptId === result.excerptId)!;
        return positionOf(resolved, excerpt.startSegmentId) ?? 0;
      };
      return startOf(a) - startOf(b);
    });

  return { filters, results, total: results.length };
}
