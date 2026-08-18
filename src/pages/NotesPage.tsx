import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  readCodedDataFilter,
  readSavedWork,
  writeCodedDataFilter,
  writeSavedWork,
} from '../data/codingSessionStore';
import { mergeSessionCodes, readCodebookEdits } from '../data/codebookStore';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID } from '../data/seed/project';
import type { Note } from '../domain';
import { NotePanel } from '../features/notes/NotePanel';
import { useNotePanel } from '../features/notes/useNotePanel';
import type { NoteCommit, NoteScopeOption } from '../features/notes/useNotePanel';
import { PROJECT_SCOPE } from '../features/notes/useNotePanel';
import {
  ALL_NOTES,
  buildNotesData,
  mergeSessionNotes,
  PROJECT_NOTES,
} from '../features/notes/notesView';
import type { NoteEntry } from '../features/notes/notesView';
import './codedData.css';
import './notes.css';

/**
 * Route /projects/:projectId/notes.
 *
 * Specification: docs/pages/destinations.md section 3, decisions D-058, D-055,
 * D-042, D-043, R-4.
 *
 * D-058 built this page and brought back the two non-excerpt note scopes with
 * it. N-4 deferred file-wide notes as "maybe a later page"; this is that page.
 * A note's scope is derived rather than stored, so nothing in the model changed
 * to support it — the scopes were always expressible and only the surface was
 * missing.
 *
 * The page edits nothing itself. Every write goes through the D-055 note panel,
 * which is the read-surface rule D-058 restates rather than excepts.
 *
 * Own notes only, every scope, per R-4.
 */

/** A note id is enough to find the entry again, which is where focus returns. */
type EntryRefs = Map<string, HTMLElement | null>;

/** Records an entry's element, keyed by note. A callback rather than the map
    itself, so nothing reads a ref while rendering. */
type RegisterEntry = (noteId: string, node: HTMLElement | null) => void;

export function NotesPage() {
  const { projectId } = useParams();
  const filtersId = useId();
  const listId = useId();

  const fixture = useMemo(() => createSeedFixture(), []);
  const found = fixture.project.projectId === projectId;

  /*
    Saved work is read into state rather than on every render, because this page
    writes to it as well: a note created here has to appear in the list without
    a navigation. The store is the record; this is the copy being rendered.
  */
  const [work, setWork] = useState(() =>
    found ? readSavedWork(fixture.project.projectId) : null,
  );

  /* Per the Coded Data pattern, and persisted within the session the same way. */
  const [selected, setSelected] = useState(() =>
    projectId ? readCodedDataFilter(projectId, 'notes') : ALL_NOTES,
  );

  useEffect(() => {
    if (projectId) writeCodedDataFilter(projectId, 'notes', selected);
  }, [projectId, selected]);

  const entryRefs = useRef<EntryRefs>(new Map());
  const registerEntry = useCallback<RegisterEntry>((noteId, node) => {
    entryRefs.current.set(noteId, node);
  }, []);

  /*
    Seeded notes and this session's, with the session's shadowing a seeded one
    of the same id.

    Not a plain concatenation, because the coder's own seeded notes are
    editable: the fixture is a starting state rather than another coder's work,
    and the store is the only place an edit can be written. So an edit to a
    seeded note is a session note carrying its id, and a deletion is the same
    record with a `deleted` status, which `buildNotesData` filters out.
  */
  const allNotes = useMemo(
    () => mergeSessionNotes(fixture.notes, work?.notes ?? []),
    [fixture.notes, work],
  );

  /**
   * Writes a note the panel committed, then re-reads what the page renders.
   *
   * Every note the page shows is the coder's own, per R-4, so every one of them
   * is editable — including the seeded ones, which are a starting state rather
   * than another coder's work. Another coder's notes never reach this handler
   * because they never reach the page.
   */
  const commitNote = useCallback(
    (commit: NoteCommit) => {
      if (!projectId || !found) return;
      const current = readSavedWork(fixture.project.projectId);
      const now = new Date().toISOString();

      let notes = current.notes;

      if (commit.target.kind === 'note') {
        const { noteId } = commit.target;
        const held = notes.find((note) => note.noteId === noteId);
        const seeded = fixture.notes.find((note) => note.noteId === noteId);
        const subject = held ?? seeded;

        if (subject && (commit.outcome === 'deleted' || commit.outcome === 'saved')) {
          const next: Note =
            commit.outcome === 'deleted'
              ? { ...subject, status: 'deleted' }
              : { ...subject, noteText: commit.text };

          /*
            A seeded note is shadowed rather than mutated: the fixture is a
            module constant and the store is where a session's changes live, so
            an edit to one writes a record carrying the same id. A note already
            in the store is replaced in place.
          */
          notes = held
            ? notes.map((note) => (note.noteId === noteId ? next : note))
            : [...notes, next];
        }
      } else if (commit.target.kind === 'new' && commit.outcome === 'saved') {
        const scope = commit.target.scope;
        const written: Note = {
          noteId: `nt-${Math.random().toString(16).slice(2, 12)}`,
          authorId: CURRENT_CODER_ID,
          noteType: null,
          noteText: commit.text,
          visibility: 'afterIndependentCoding',
          status: 'active',
          createdAt: now,
          relatedExcerptId: null,
          // The scope, and the whole of it: a source id here makes this
          // file-wide, and its absence makes it the project's. D-058.
          relatedSourceId: scope === 'project' ? null : scope.sourceId,
          relatedAssignmentId: null,
          relatedCodeId: null,
          relatedReviewItemId: null,
        };
        notes = [...notes, written];
      }

      const next = { ...current, notes };
      writeSavedWork(fixture.project.projectId, next);
      setWork(next);

      /*
        Focus returns to the entry that opened the panel, per contract 2.4 and
        section 3's acceptance criterion. Deferred for the reason every focus
        return in this build is: the dialog unwinds its own restore first.
      */
      const returnTo =
        commit.target.kind === 'note' ? entryRefs.current.get(commit.target.noteId) : null;
      if (returnTo) queueMicrotask(() => returnTo.focus?.());
    },
    [found, fixture.notes, fixture.project.projectId, projectId],
  );

  const panel = useNotePanel({ onCommit: commitNote });

  const data = useMemo(() => {
    if (!found) return null;
    return buildNotesData({
      currentUserId: CURRENT_CODER_ID,
      sources: fixture.sources,
      segments: fixture.segments,
      turns: fixture.turns,
      speakers: fixture.speakers,
      codes: mergeSessionCodes(
        fixture.codes,
        readCodebookEdits(fixture.project.projectId).codes,
      ),
      excerpts: [...fixture.excerpts, ...(work?.excerpts ?? [])],
      assignments: [...fixture.codeAssignments, ...(work?.assignments ?? [])],
      notes: allNotes,
      supersededIds: work?.supersededIds ?? [],
      filter: selected,
    });
  }, [allNotes, fixture, found, selected, work]);

  if (!found || !projectId || !data) {
    return (
      <>
        <h1 tabIndex={-1}>Project not found</h1>
        <p>No seeded project has the identifier {projectId}.</p>
      </>
    );
  }

  /* Every source, plus the project, as the scope field's options. D-058. */
  const scopeOptions: NoteScopeOption[] = [
    { value: PROJECT_SCOPE, label: 'The whole project' },
    ...fixture.sources.map((source) => ({ value: source.sourceId, label: source.title })),
  ];

  /*
    The scope a new note defaults to, per D-058: filtered to a source it
    attaches there, and on All notes or Project notes it attaches to the
    project.
  */
  const defaultScope =
    selected === ALL_NOTES || selected === PROJECT_NOTES
      ? ('project' as const)
      : { sourceId: selected };

  const openNew = () => {
    panel.open({
      target: { kind: 'new', scope: defaultScope },
      label:
        defaultScope === 'project'
          ? 'the whole project'
          : (fixture.sources.find((source) => source.sourceId === selected)?.title ??
            'this source'),
      scopeOptions,
    });
  };

  const openExisting = (entry: NoteEntry) => {
    panel.open({
      target: { kind: 'note', noteId: entry.noteId },
      label: entry.sourceTitle ?? 'the whole project',
      text: entry.text,
    });
  };

  return (
    <>
      <h1 tabIndex={-1}>Notes</h1>
      <p className="coded-data__summary">
        {data.total} {data.total === 1 ? 'note' : 'notes'}
      </p>

      {/*
        Before the filter and the list, in the fixed region order section 3
        gives. A creation control that sat under the list would be below
        whatever the list happens to contain.
      */}
      <p>
        <button type="button" className="notes__new" onClick={openNew}>
          New note
        </button>
      </p>

      {data.total === 0 ? (
        /*
          Both routes named, per section 3's acceptance criterion. An empty
          state that names only one leaves a coder believing the other does not
          exist — and the two are genuinely different acts, one about a passage
          and one about the file or the project.
        */
        <p>
          You have not written any notes in this project yet. Note a passage while reading a
          transcript, with Add note, or write one about a source or the whole project with the
          New note button above.{' '}
          <Link to={`/projects/${projectId}`}>Back to the project</Link>
        </p>
      ) : (
        <div className="coded-data__layout">
          {/*
            Filters before the list in the DOM, which is also the order at 320px
            and at 400 percent. Two columns only when there is room, so the
            reading order never changes with the width. D-033.
          */}
          <section
            className="coded-data__filters"
            data-region="filters"
            aria-labelledby={filtersId}
          >
            <h2 id={filtersId}>Sources</h2>
            <ul className="coded-data__filter-list" aria-labelledby={filtersId}>
              {data.filters.map((filter) => (
                <li key={filter.key}>
                  <FilterOption
                    value={filter.key}
                    label={filter.label}
                    count={filter.count}
                    selected={selected === filter.key}
                    onSelect={setSelected}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section className="coded-data__results" data-region="notes" aria-labelledby={listId}>
            <h2 id={listId} className="visually-hidden">
              Notes
            </h2>
            {data.sections.length === 0 ? (
              <p>No notes here yet.</p>
            ) : (
              data.sections.map((section) => (
                <section key={section.key} className="notes__section">
                  <h2>{section.title}</h2>
                  {/* Named by its own heading, so a list-jump lands on the
                      source rather than on "list, 3 items". D-051. */}
                  <ul className="coded-data__result-list" aria-label={section.title}>
                    {section.entries.map((entry) => (
                      <li key={entry.noteId}>
                        <NoteCard
                          entry={entry}
                          projectId={projectId}
                          onOpen={openExisting}
                          registerEntry={registerEntry}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </section>
        </div>
      )}

      <NotePanel panel={panel} />
    </>
  );
}

/**
 * One filter.
 *
 * The Coded Data control, reused rather than restyled: D-058 says the pattern
 * is the same one, and a second implementation of it would drift. The count is
 * inside the label so it is part of the accessible name — "Transcript 1, 4
 * notes" — which is the F-4 lesson both pages carry.
 */
function FilterOption({
  value,
  label,
  count,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  count: number;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <label className="coded-data__filter" data-selected={selected ? '' : undefined}>
      <input
        type="radio"
        name="notes-filter"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
      />
      <span className="coded-data__filter-body">
        {/* The source or scope name scales; the count around it does not. D-061. */}
        <span className="coded-data__filter-name">{label}</span>,{' '}
        <span className="coded-data__count">{count}</span>{' '}
        {count === 1 ? 'note' : 'notes'}
      </span>
    </label>
  );
}

/**
 * One note.
 *
 * The three scopes differ in what they can offer rather than in kind. An
 * excerpt note has a passage to show and a turn to land on; the other two have
 * neither, so activating them opens the panel instead — which is the edit route
 * D-058 names, and keeps the page itself a read surface.
 */
function NoteCard({
  entry,
  projectId,
  onOpen,
  registerEntry,
}: {
  entry: NoteEntry;
  projectId: string;
  onOpen: (entry: NoteEntry) => void;
  registerEntry: RegisterEntry;
}) {
  return (
    <article className="notes__card" data-note-id={entry.noteId} data-scope={entry.scope}>
      {entry.excerpt ? (
        <>
          {/*
            The route to the passage, and the entry's whole context in one
            control, per the D-058 addendum.

            The accessible name is "Note on [speaker], [source]", so a screen
            reader running down the page's links hears which passage and which
            file each belongs to without the heading above it — which is what
            link-by-link navigation across sections loses.

            The source is visually hidden rather than supplied by `aria-label`.
            A label replacing the visible text would break the requirement that
            the visible label be contained in the accessible name, so the
            visible part is a prefix of it instead. The section heading is where
            the source renders visibly, once for the whole section.
          */}
          <p className="notes__link">
            <Link
              to={`/projects/${projectId}/sources/${entry.sourceId}?turn=${entry.excerpt.turnId}`}
            >
              Note on {entry.excerpt.speakerLabel}
              <span className="visually-hidden">, {entry.sourceTitle}</span>
            </Link>
          </p>

          {/*
            The participant's voice, per D-069, and a `blockquote` because that
            is what it is: quoted words from someone who is not the coder. The
            element is announced at default verbosity, so the visual grey block
            and the semantics say the same thing.

            Whole, with no truncation and no disclosure. Readers could not tell
            excerpt from note, and a control in the middle of every entry was
            being operated on every visit just to read past it — D-068's cost
            principle. Long excerpts render long; whole-turn captures from the
            turn fallback are the accepted cost.

            The speaker is not repeated here. It is in the link above, and one
            fact rendering twice in the same channel is the defect the D-058
            addendum removes.
          */}
          <blockquote className="notes__excerpt">{entry.excerpt.text}</blockquote>

          {/*
            The coder's voice, and the marker that carries it programmatically.

            The prefix is the load-bearing half of D-069 rather than a belt to
            the blockquote's braces: a blockquote announcement rides the
            reader's verbosity setting and can be turned off, and plain text
            cannot. So an entry names both of its voices whatever the settings.

            Only on this branch. A file-wide or project note is one voice with
            nothing to distinguish itself from, and destinations.md amends only
            the excerpt-note bullet.
          */}
          <p className="notes__text">
            <span className="visually-hidden">Note: </span>
            {entry.text}
          </p>

          {/*
            One channel each, the treatment the transcript rail already carries.

            The pills are the visual channel and stay out of the accessibility
            tree; they name their codes as text, so the visual channel is never
            colour alone. The compact line is the programmatic channel and is off
            the screen. Read straight through, that is one stop carrying every
            code rather than one stop per pill.

            Nothing in either channel on a note-only excerpt, per D-055: an
            empty "Codes:" would announce codes and then name none.
          */}
          {entry.excerpt.codes.length > 0 ? (
            <p className="notes__codes">
              <span className="notes__pills" aria-hidden="true">
                {entry.excerpt.codes.map((code) => (
                  <span
                    key={code.codeId}
                    className="coded-data__pill"
                    data-color-token={code.colorToken}
                  >
                    {code.name}
                  </span>
                ))}
              </span>
              <span className="visually-hidden">
                Codes: {entry.excerpt.codes.map((code) => code.name).join(', ')}
              </span>
            </p>
          ) : null}

        </>
      ) : (
        <>
          {/*
            No passage and no turn, so the whole card is the control: activating
            it opens the note panel loaded with this note. A button rather than
            a link, because it opens a panel rather than going anywhere.
          */}
          <button
            type="button"
            className="notes__open"
            ref={(node) => registerEntry(entry.noteId, node)}
            onClick={() => onOpen(entry)}
          >
            <span className="notes__text">{entry.text}</span>
            {/*
              The source in the name only, per the D-058 addendum. On screen it
              is the section heading above, once for the whole section; here it
              tells a screen reader user which file this note belongs to when
              they reach it by control rather than by reading down.
            */}
            {entry.sourceTitle ? (
              <span className="visually-hidden">, {entry.sourceTitle}</span>
            ) : null}
          </button>
        </>
      )}
    </article>
  );
}

