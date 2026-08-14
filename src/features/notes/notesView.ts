import {
  applySupersession,
  excerptText,
  isStanding,
  noteScope,
  positionOf,
  resolveSource,
} from '../../domain';
import type {
  Code,
  CodeAssignment,
  Excerpt,
  Id,
  Note,
  Source,
  Speaker,
  SpeakerTurn,
  TranscriptSegment,
} from '../../domain';

/**
 * The Notes page's data, built once and rendered.
 *
 * Specification: docs/pages/destinations.md section 3, decision D-058, R-4.
 *
 * Pure, and shaped like `codedDataView.ts` for the same reason: what belongs on
 * the page is a question about the records, and the page should render an
 * answer rather than work one out while it renders.
 *
 * Own notes only, all three scopes, per R-4. Filtering happens here rather than
 * at the call site because every count on the page is an own-note count — a
 * filter labelled "Transcript 1, 4 notes" that included another coder's would
 * be wrong in the accessible name, which is the one place F-4 says the count
 * has to be right.
 */

export type NoteEntryScope = 'excerpt' | 'source' | 'project';

export interface NoteEntry {
  noteId: Id;
  scope: NoteEntryScope;
  text: string;
  /**
   * Where this sits within its section: the excerpt's position for an excerpt
   * note, and after every excerpt note for the others, which have no position
   * of their own. Carried on the entry so ordering is one comparison rather
   * than a lookup back through the records.
   */
  position: number;
  /** Set for excerpt and source notes; the project scope has no source. */
  sourceId: Id | null;
  sourceTitle: string | null;
  /**
   * Only for an excerpt note: what the note is about.
   *
   * `turnId` is the turn holding the excerpt's start, which is where activating
   * the entry lands focus — the same `?turn=` route the Coded data page uses.
   */
  excerpt: {
    turnId: Id;
    speakerLabel: string;
    text: string;
    /** Standing assignments only. Empty for a note-only excerpt, per D-055. */
    codes: Code[];
  } | null;
}

export interface NoteFilter {
  /** `all`, `project`, or a source id. */
  key: string;
  label: string;
  count: number;
}

export interface NoteSection {
  key: string;
  title: string;
  entries: NoteEntry[];
}

export interface NotesData {
  filters: NoteFilter[];
  sections: NoteSection[];
  /** Every own note, so the count line does not move with the filter. */
  total: number;
}

export const ALL_NOTES = 'all';
export const PROJECT_NOTES = 'project';

interface Input {
  currentUserId: Id;
  sources: Source[];
  segments: TranscriptSegment[];
  turns: SpeakerTurn[];
  speakers: Speaker[];
  codes: Code[];
  excerpts: Excerpt[];
  assignments: CodeAssignment[];
  notes: Note[];
  supersededIds: readonly Id[];
  /** `all`, `project`, or a source id. */
  filter: string;
}

/**
 * Seeded notes with this session's records laid over them.
 *
 * Not a plain concatenation, because the coder's own seeded notes are editable:
 * the fixture is a starting state rather than another coder's work, and the
 * store is the only place an edit can be written. So an edit to a seeded note
 * is a session note carrying its id, and a deletion is the same record with a
 * `deleted` status.
 *
 * Shared since Task 46, when the Coded data page turned out to be concatenating
 * instead — which left a deleted note in the array twice, once as the seeded
 * original still marked active. A stale "Has a note" was the visible half; the
 * half that mattered is that D-067's disclosure would have revealed the text of
 * a note the coder had deleted.
 */
export function mergeSessionNotes(seeded: readonly Note[], session: readonly Note[]): Note[] {
  const shadowed = new Map(session.map((note) => [note.noteId, note]));
  const merged = seeded.map((note) => shadowed.get(note.noteId) ?? note);
  const seededIds = new Set(seeded.map((note) => note.noteId));
  return [...merged, ...session.filter((note) => !seededIds.has(note.noteId))];
}

export function buildNotesData({
  currentUserId,
  sources,
  segments,
  turns,
  speakers,
  codes,
  excerpts,
  assignments,
  notes,
  supersededIds,
  filter,
}: Input): NotesData {
  const own = notes.filter(
    (note) => note.authorId === currentUserId && note.status !== 'deleted',
  );

  const codeById = new Map(codes.map((code) => [code.codeId, code]));
  const excerptById = new Map(excerpts.map((excerpt) => [excerpt.excerptId, excerpt]));
  const standing = applySupersession(assignments, supersededIds).filter(isStanding);

  /*
    One resolved source per source, so a note's excerpt can be placed. Resolving
    is the expensive part of this and is done once per source rather than once
    per note.
  */
  const resolvedBySource = new Map(
    sources.map((source) => [
      source.sourceId,
      resolveSource({ source, segments, turns, speakers }),
    ]),
  );
  const speakerById = new Map(speakers.map((speaker) => [speaker.speakerId, speaker]));

  const entryOf = (note: Note): NoteEntry | null => {
    const scope = noteScope(note);

    if (scope === 'project') {
      return {
        noteId: note.noteId,
        scope,
        text: note.noteText,
        position: Number.MAX_SAFE_INTEGER,
        sourceId: null,
        sourceTitle: null,
        excerpt: null,
      };
    }

    if (scope === 'source') {
      const source = sources.find((candidate) => candidate.sourceId === note.relatedSourceId);
      if (!source) return null;
      return {
        noteId: note.noteId,
        scope,
        text: note.noteText,
        position: Number.MAX_SAFE_INTEGER,
        sourceId: source.sourceId,
        sourceTitle: source.title,
        excerpt: null,
      };
    }

    const excerpt = excerptById.get(note.relatedExcerptId as string);
    if (!excerpt) return null;
    const source = sources.find((candidate) => candidate.sourceId === excerpt.sourceId);
    const resolved = resolvedBySource.get(excerpt.sourceId);
    if (!source || !resolved) return null;

    const startSegment = segments.find(
      (segment) => segment.segmentId === excerpt.startSegmentId,
    );
    const turn = resolved.turns.find((candidate) =>
      candidate.segments.some((segment) => segment.segmentId === excerpt.startSegmentId),
    );
    if (!startSegment || !turn) return null;

    return {
      noteId: note.noteId,
      scope,
      text: note.noteText,
      position: positionOf(resolved, excerpt.startSegmentId) ?? Number.MAX_SAFE_INTEGER,
      sourceId: source.sourceId,
      sourceTitle: source.title,
      excerpt: {
        turnId: turn.turn.turnId,
        speakerLabel: speakerById.get(startSegment.speakerId)?.label ?? 'Unknown speaker',
        // The excerpt's own characters, offsets included: the same helper the
        // panel's hidden readback uses, so the two cannot describe different
        // ranges.
        text: excerptText(resolved, {
          startSegmentId: excerpt.startSegmentId,
          endSegmentId: excerpt.endSegmentId,
          startOffset: excerpt.startOffset,
          endOffset: excerpt.endOffset,
        }),
        /*
          Standing assignments only, and empty is a legitimate answer: a
          note-only excerpt has no codes and the entry shows no codes line at
          all, per D-055.
        */
        codes: standing
          .filter((assignment) => assignment.excerptId === excerpt.excerptId)
          .map((assignment) => codeById.get(assignment.codeId))
          .filter((code): code is Code => code !== undefined),
      },
    };
  };

  /*
    Newest last within a section, and by excerpt position where there is one.
    Section 3 asks for both and they do not conflict: position orders the
    excerpt notes against each other, and creation order settles everything
    else, including two notes on the same passage.
  */
  const createdAt = new Map(own.map((note) => [note.noteId, note.createdAt]));
  const entries = own
    .map(entryOf)
    .filter((entry): entry is NoteEntry => entry !== null)
    .sort(
      (a, b) =>
        a.position - b.position ||
        (createdAt.get(a.noteId) ?? '').localeCompare(createdAt.get(b.noteId) ?? ''),
    );

  /*
    Filters in the order section 3 fixes: All notes, Project notes, then each
    source in source order. Counts are own notes, which is what makes them
    honest in the accessible name.
  */
  const filters: NoteFilter[] = [
    { key: ALL_NOTES, label: 'All notes', count: entries.length },
    {
      key: PROJECT_NOTES,
      label: 'Project notes',
      count: entries.filter((entry) => entry.scope === 'project').length,
    },
    ...sources.map((source) => ({
      key: source.sourceId,
      label: source.title,
      count: entries.filter((entry) => entry.sourceId === source.sourceId).length,
    })),
  ];

  /* Sections mirror the filter order, and a filter shows only its own. */
  const projectSection: NoteSection = {
    key: PROJECT_NOTES,
    title: 'Project notes',
    entries: entries.filter((entry) => entry.scope === 'project'),
  };
  const sourceSections: NoteSection[] = sources.map((source) => ({
    key: source.sourceId,
    title: source.title,
    entries: entries.filter((entry) => entry.sourceId === source.sourceId),
  }));

  const all = [projectSection, ...sourceSections];
  const shown =
    filter === ALL_NOTES ? all : all.filter((section) => section.key === filter);

  return {
    filters,
    // An empty section is not a section. Under All notes a project with no
    // project notes should not show a heading over nothing.
    sections: shown.filter((section) => section.entries.length > 0),
    total: entries.length,
  };
}
