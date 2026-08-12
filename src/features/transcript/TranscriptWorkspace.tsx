import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import {
  addProvisionalCode,
  clearDraft,
  readDraft,
  readProvisionalCodes,
  readSavedWork,
  writeDraft,
  writeSavedWork,
} from '../../data/codingSessionStore';
import type { CodingDraft, SavedWork } from '../../data/codingSessionStore';
import type { PrototypeFlags } from '../../config/flags';
import {
  applySupersession,
  buildCodingRecords,
  deriveSegmentDisplayStates,
  describeExcerptSize,
  diffReopenedAssignments,
  excerptSize,
  excerptText,
  positionReport,
  postCodingReturnTarget,
  requireTurnOf,
  savedExcerptsAt,
  savedExcerptsInTurn,
  turnCoding,
} from '../../domain';
import type {
  Code,
  CodeAssignment,
  Excerpt,
  Id,
  Note,
  ResolvedSource,
} from '../../domain';
import { CodePanel } from '../codes/CodePanel';
import { useCodePanel } from '../codes/useCodePanel';
import type { SaveOutcome } from '../codes/useCodePanel';
import { ExcerptContextMenu } from '../excerpt/ExcerptContextMenu';
import { ExcerptToolbar } from '../excerpt/ExcerptToolbar';
import type { CaptureTarget } from '../excerpt/capture';
import { useExcerptSelection } from '../excerpt/useExcerptSelection';
import { PositionRibbon } from './PositionRibbon';
import { Transcript } from './Transcript';
import { TranscriptToolbar } from './TranscriptToolbar';
import { useTranscriptOrientation } from './useTranscriptOrientation';

/**
 * The reading and selection surface: position, controls, and the transcript.
 *
 * Specification: docs/patterns/transcript-segment.md section 5 and its v0.2
 * banner, docs/patterns/excerpt-selection.md sections 1 to 7, decision D-038.
 *
 * Reading order matches workflow order and does not change with viewport width,
 * per accessibility contract 2.1: where you are, what you can do to move, what
 * you can do to the excerpt, then the text. Both toolbars hold their place in
 * that order and neither follows the selection.
 */

interface TranscriptWorkspaceProps {
  resolved: ResolvedSource;
  /** Excerpts already stored for this source, from the seeded fixture. */
  seedExcerpts: Excerpt[];
  seedAssignments: CodeAssignment[];
  /** Notes already on the project, so the rail's note channel is not empty. */
  seedNotes?: Note[];
  userId: Id;
  codingRoundId: Id;
  codebookVersionId: Id;
  /** The project codebook, for code selection. */
  codes: Code[];
  projectId: Id;
  /**
   * A turn to land focus on when this page opens, from a Coded data result.
   *
   * destinations.md section 2 calls this the page's most important behaviour:
   * "landing at the top of the transcript instead makes the page useless".
   * Following a link is a user action and the element that had focus is gone,
   * so moving focus here is the same reasoning the shell already documents for
   * route headings, not the load-time move contract 2.4 forbids.
   */
  entryTurnId?: Id | null;
  flags?: PrototypeFlags;
}

export function TranscriptWorkspace({
  resolved,
  seedExcerpts,
  seedAssignments,
  seedNotes = [],
  userId,
  codingRoundId,
  codebookVersionId,
  codes,
  projectId,
  entryTurnId = null,
  flags = defaultFlags,
}: TranscriptWorkspaceProps) {
  const announcer = useAnnouncer();

  /**
   * What this source page resumes from, per D-044.
   *
   * Read once, at the first render, so restoring costs no extra paint and no
   * state write from inside an effect. `useState` with an initialiser rather
   * than `useMemo`, because this must not be recomputed if the store changes
   * underneath: the component owns this state from here on.
   */
  const [restored] = useState(() => ({
    draft: readDraft(resolved.source.sourceId),
    work: readSavedWork(projectId),
    /*
      Project-scoped, unlike the draft: a code the coder proposed while working
      another source is still theirs to use here, and one already assigned must
      keep a record to resolve its name from.
    */
    provisionalCodes: readProvisionalCodes(projectId),
  }));

  /**
   * Work saved during this session. Front-end state within a session is real,
   * per prototype-scope.md; nothing is written to a server, and nothing here
   * survives a reload.
   *
   * Seeded from the session store so it outlives a trip to a destination. Every
   * seeded excerpt belongs to the second coder, and R-4 keeps that off the
   * coder-facing destinations, so this is the only work Coded data and Notes
   * are permitted to show.
   */
  const [savedExcerpts, setSavedExcerpts] = useState<Excerpt[]>(restored.work.excerpts);
  const [savedAssignments, setSavedAssignments] = useState<CodeAssignment[]>(
    restored.work.assignments,
  );
  const [savedNotes, setSavedNotes] = useState<Note[]>(restored.work.notes);
  /**
   * Assignments the coder removed from a reopened excerpt.
   *
   * Superseded, never deleted: the project preserves before-and-after history,
   * and a removed assignment is evidence about how interpretation changed.
   * D-030.
   */
  const [supersededIds, setSupersededIds] = useState<Set<Id>>(
    () => new Set(restored.work.supersededIds),
  );
  const panelLoad = useRef<((codeIds: Id[], noteText?: string) => void) | null>(null);

  /**
   * Whether the next save is set to fail, from `simulateSaveFailure`.
   *
   * One save, not every save: the point is to rehearse recovery, and a retry
   * that could never succeed would test half the behaviour. Disarmed by the
   * attempt it fails.
   */
  const failureArmed = useRef(flags.simulateSaveFailure);

  /*
   * Exposed on the element for tests and for the development announcement log:
   * there is no store to inspect, and a save that writes nothing would
   * otherwise be indistinguishable from one that worked.
   */
  const savedSummary = {
    excerpts: savedExcerpts.length,
    assignments: savedAssignments.length,
    notes: savedNotes.length,
  };

  /** Every assignment in play, with superseded ones marked as such. */
  const effectiveAssignments = useMemo(
    () => applySupersession([...seedAssignments, ...savedAssignments], supersededIds),
    [savedAssignments, seedAssignments, supersededIds],
  );

  const allExcerpts = useMemo(
    () => [...seedExcerpts, ...savedExcerpts],
    [savedExcerpts, seedExcerpts],
  );

  /** Every note in play, seeded and from this session. */
  const allNotes = useMemo(() => [...seedNotes, ...savedNotes], [savedNotes, seedNotes]);

  // Coded state covers seeded work and this session's saves alike, so a
  // sentence the coder just saved reads as coded immediately. An excerpt whose
  // assignments have all been superseded is no longer coded.
  const displayStates = useMemo(
    () =>
      deriveSegmentDisplayStates(resolved, {
        excerpts: allExcerpts,
        codeAssignments: effectiveAssignments,
        /*
          An excerpt counts if something still stands on it: a code, or a note.

          The note half is what paints the passage a note is about. Without it
          the reader got an icon on the turn and no way to tell which words it
          concerned — and the derivation decides which characters are painted,
          so this is where that has to be said.
        */
        includeExcerpt: (excerpt, assignments) =>
          assignments.some((assignment) => assignment.status !== 'superseded') ||
          allNotes.some((note) => note.relatedExcerptId === excerpt.excerptId),
      }),
    [allExcerpts, allNotes, effectiveAssignments, resolved],
  );

  /**
   * What each turn carries, for the code rail and the turn's accessible
   * description. One derivation feeds both, per D-041, so the glance channel
   * and the announced one cannot disagree.
   */
  const codingByTurnId = useMemo(
    () =>
      new Map(
        resolved.turns.map((turn) => [
          turn.turn.turnId,
          turnCoding(resolved, turn.turn.turnId, allExcerpts, effectiveAssignments, allNotes),
        ]),
      ),
    [allExcerpts, allNotes, effectiveAssignments, resolved],
  );

  const codeById = useMemo(() => new Map(codes.map((code) => [code.codeId, code])), [codes]);

  const orientation = useTranscriptOrientation({ resolved, userId, flags });

  /**
   * Whether code selection is open. Held here because Escape resolves against
   * it: with the panel open Escape closes the panel, and with it closed Escape
   * means nothing. `resolveEscape` in the binding module decides, and both
   * features read the same answer.
   */
  const [panelOpen, setPanelOpen] = useState(restored.draft.panelOpen);
  /**
   * Which field the panel opens focused on, set by whichever capture command
   * opened it. Section 4: `excerpt.code` lands in search, `excerpt.note` in the
   * note field.
   */
  const [panelFocus, setPanelFocus] = useState<CaptureTarget>(restored.draft.panelFocus);
  const panelCodeById = useRef<Map<Id, Code>>(new Map());
  const panelClear = useRef<(() => void) | null>(null);

  /**
   * Saved excerpts the focused turn intersects, for `excerpt.open`. D-038.
   *
   * Every excerpt the transcript shows as coded is reachable, including the
   * seeded second coder's. Whether a participant should be able to reopen
   * another coder's work is the same open question as whether they should see
   * it, so the filter stays here at the call site.
   */
  const savedAt = useMemo(
    () =>
      orientation.focusedTurnId
        ? savedExcerptsInTurn(
            resolved,
            orientation.focusedTurnId,
            allExcerpts,
            effectiveAssignments,
            allNotes,
          )
        : [],
    [allExcerpts, allNotes, effectiveAssignments, orientation.focusedTurnId, resolved],
  );

  const excerpt = useExcerptSelection({
    resolved,
    containerRef: orientation.containerRef,
    panelOpen,
    onCapture: (target) => {
      setPanelFocus(target);
      setPanelOpen(true);
    },
    onClosePanel: () => setPanelOpen(false),
    savedAt,
    onReopen: (summary) => {
      /*
        The panel opens pre-populated with what is already saved, per D-030 —
        the note included. Without it the row said "Add note" over an empty box
        on an excerpt that already had one, and saving would then have written
        a second note or dropped the first.
      */
      const note = summary.noteId
        ? allNotes.find((candidate) => candidate.noteId === summary.noteId)
        : undefined;
      panelLoad.current?.(summary.codeIds, note?.noteText ?? '');
      setPanelFocus('search');
      setPanelOpen(true);
    },
    initialSelection: restored.draft.selection,
  });

  const excerptSummary = useMemo(() => {
    if (!excerpt.selection.range) return null;
    return describeExcerptSize(excerptSize(resolved, excerpt.selection.range));
  }, [excerpt.selection.range, resolved]);

  /**
   * Writes the records, then returns the reader where `postCodingReturn` says.
   *
   * Nothing the panel holds is cleared until the records exist, which is what
   * makes a failed save non-destructive.
   */
  const handleSave = useCallback(
    (pending: { codeIds: Id[]; noteText: string; uncertain: boolean }): SaveOutcome => {
      const range = excerpt.selection.range;
      if (!range) return { ok: true };

      // Checked before anything is written, so a failed save leaves no partial
      // record behind and nothing to unwind.
      if (failureArmed.current) {
        failureArmed.current = false;
        return { ok: false, message: 'The save could not be written.' };
      }

      // A reopened excerpt writes the difference rather than a new set.
      const reopenedId = excerpt.selection.reopenedExcerptId;
      if (reopenedId) {
        const now = new Date().toISOString();

        /*
          An empty pending list changes no assignment.

          D-030: "emptying the list and saving is not a route to deleting an
          excerpt". Now that a note alone can be saved, that route would open
          here — uncheck everything, write a note, save — so this branch leaves
          the assignments standing and writes only the note. Unchecking one of
          two still supersedes that one, which is the ordinary edit.
        */
        const diff =
          pending.codeIds.length === 0
            ? { added: [], supersededAssignmentIds: [], unchangedCodeIds: [] }
            : diffReopenedAssignments(
                reopenedId,
                effectiveAssignments,
                pending.codeIds,
                {
                  sourceId: resolved.source.sourceId,
                  coderId: userId,
                  codingRoundId,
                  codebookVersionId,
                },
                panelCodeById.current,
                pending.uncertain,
                now,
              );

        setSavedAssignments((current) => [...current, ...diff.added]);
        setSupersededIds((current) => {
          const next = new Set(current);
          for (const id of diff.supersededAssignmentIds) next.add(id);
          return next;
        });

        /*
          The note, which this branch used to drop on the floor: it diffed the
          assignments and returned, so a note edited on a revisited excerpt was
          discarded on save without a word.

          Updated in place when it is the coder's own, so D-011's one note per
          excerpt holds. Another coder's is never overwritten — the seeded
          excerpts belong to the second coder and are reopenable, so that is
          reachable today, and a new note is written alongside instead.
        */
        const noteText = pending.noteText.trim();
        const existing = allNotes.find(
          (candidate) => candidate.relatedExcerptId === reopenedId,
        );

        if (noteText !== '') {
          if (existing && existing.authorId === userId) {
            setSavedNotes((current) => {
              const without = current.filter((note) => note.noteId !== existing.noteId);
              return [...without, { ...existing, noteText }];
            });
          } else if (!existing || existing.authorId !== userId) {
            setSavedNotes((current) => [
              ...current,
              {
                noteId: `nt-${Math.random().toString(16).slice(2, 12)}`,
                authorId: userId,
                noteType: null,
                noteText,
                visibility: 'afterIndependentCoding' as const,
                status: 'active',
                createdAt: now,
                relatedExcerptId: reopenedId,
                relatedSourceId: null,
                relatedAssignmentId: null,
                relatedCodeId: null,
                relatedReviewItemId: null,
              },
            ]);
          }
        }

        const range = excerpt.selection.range!;
        const target = postCodingReturnTarget(
          resolved,
          range,
          flags.postCodingReturn,
          displayStates,
        );

        excerpt.markSaved();
        setPanelOpen(false);

        // Focus is the position now, so the return is the focus move: nothing
        // else has to be told where the reader ended up. D-038.
        const turn = requireTurnOf(resolved, target);
        orientation.focusTurn(turn.turn.turnId);

        const report = positionReport(resolved, turn.turn.turnId);
        const kept = diff.unchangedCodeIds.length;
        announcer.announce(
          `Saved. ${diff.added.length} added, ${diff.supersededAssignmentIds.length} removed, ${kept} unchanged. Returned to speaker turn ${
            report?.turnIndex ?? 0
          } of ${report?.turnCount ?? 0}.`,
        );

        panelClear.current?.();
        return { ok: true };
      }

      const records = buildCodingRecords(
        resolved,
        { range, ...pending },
        {
          sourceId: resolved.source.sourceId,
          coderId: userId,
          codingRoundId,
          codebookVersionId,
        },
        panelCodeById.current,
        new Date().toISOString(),
      );
      if (!records) return { ok: true };

      const nextExcerpts = [...savedExcerpts, records.excerpt];
      const nextAssignments = [...savedAssignments, ...records.assignments];
      setSavedExcerpts(nextExcerpts);
      setSavedAssignments(nextAssignments);
      if (records.note) setSavedNotes((current) => [...current, records.note as Note]);

      // The return is computed against the coded state this save produces, so
      // "next uncoded sentence" does not land inside what was just coded.
      const afterSave = deriveSegmentDisplayStates(resolved, {
        excerpts: [...seedExcerpts, ...nextExcerpts],
        codeAssignments: [...seedAssignments, ...nextAssignments],
      });
      const target = postCodingReturnTarget(resolved, range, flags.postCodingReturn, afterSave);

      excerpt.markSaved();
      setPanelOpen(false);

      const turn = requireTurnOf(resolved, target);
      orientation.focusTurn(turn.turn.turnId);

      const report = positionReport(resolved, turn.turn.turnId);
      const count = records.assignments.length;
      announcer.announce(
        `${count} ${count === 1 ? 'code' : 'codes'} applied.${
          records.note ? ' Note saved.' : ''
        } Returned to speaker turn ${report?.turnIndex ?? 0} of ${report?.turnCount ?? 0}.`,
      );

      panelClear.current?.();
      return { ok: true };
    },
    [
      allNotes,
      announcer,
      codebookVersionId,
      codingRoundId,
      displayStates,
      effectiveAssignments,
      excerpt,
      flags.postCodingReturn,
      orientation,
      resolved,
      savedAssignments,
      savedExcerpts,
      seedAssignments,
      seedExcerpts,
      userId,
    ],
  );

  /**
   * Deleting a reopened excerpt, per D-030's "separate explicit action".
   *
   * The same diff a reopened save uses, with nothing pending: everything
   * standing is superseded and nothing is added. The excerpt row itself stays,
   * because the project preserves before-and-after history rather than
   * overwriting it, and an excerpt with no standing assignment already stops
   * reading as coded through `includeExcerpt` above.
   */
  const handleDelete = useCallback(() => {
    const reopenedId = excerpt.selection.reopenedExcerptId;
    const range = excerpt.selection.range;
    if (!reopenedId || !range) return;

    const diff = diffReopenedAssignments(
      reopenedId,
      effectiveAssignments,
      [],
      {
        sourceId: resolved.source.sourceId,
        coderId: userId,
        codingRoundId,
        codebookVersionId,
      },
      panelCodeById.current,
      false,
      new Date().toISOString(),
    );

    setSupersededIds((current) => {
      const next = new Set(current);
      for (const id of diff.supersededAssignmentIds) next.add(id);
      return next;
    });

    const target = postCodingReturnTarget(resolved, range, flags.postCodingReturn, displayStates);

    excerpt.markSaved();
    setPanelOpen(false);

    const turn = requireTurnOf(resolved, target);
    orientation.focusTurn(turn.turn.turnId);

    const report = positionReport(resolved, turn.turn.turnId);
    const removed = diff.supersededAssignmentIds.length;
    announcer.announce(
      `Excerpt deleted. ${removed} ${removed === 1 ? 'code' : 'codes'} removed. Returned to speaker turn ${
        report?.turnIndex ?? 0
      } of ${report?.turnCount ?? 0}.`,
    );

    panelClear.current?.();
  }, [
    announcer,
    codebookVersionId,
    codingRoundId,
    displayStates,
    effectiveAssignments,
    excerpt,
    flags.postCodingReturn,
    orientation,
    resolved,
    userId,
  ]);

  const panel = useCodePanel({
    codes,
    projectId,
    isOpen: panelOpen,
    excerptSummary,
    openFocus: panelFocus,
    isReopened: excerpt.selection.reopenedExcerptId !== null,
    onSave: handleSave,
    onDelete: handleDelete,
    onCancel: () => {
      // Reached only when the assignment is empty, per D-042: there is nothing
      // to commit, so the capture goes and nothing is created. A reopened
      // excerpt's saved assignments are untouched, which is what keeps this
      // from becoming the deletion route D-030 forbids. Focus returns to the
      // turn the capture started in.
      excerpt.run('excerpt.discard');
    },
    initialDraft: { ...restored.draft, proposedCodes: restored.provisionalCodes },
  });

  /**
   * The D-044 hand-off.
   *
   * A ref refreshed after every render, and a cleanup that writes it when this
   * page unmounts. Two effects rather than one because they answer different
   * questions: what is current, and when to hand it over.
   *
   * Deliberately not a write on every change. That would mean setting store
   * state from inside an effect on every keystroke, which is both what
   * `react-hooks/set-state-in-effect` exists to stop and far more work than the
   * one moment that matters — the moment this page goes away.
   */
  const snapshot = useRef<{ sourceId: Id; projectId: Id; draft: CodingDraft; work: SavedWork }>({
    sourceId: resolved.source.sourceId,
    projectId,
    draft: restored.draft,
    work: restored.work,
  });

  /**
   * Saved work syncs on change rather than waiting for the unmount.
   *
   * It has to: a destination page reads the store while it renders, and React
   * renders the incoming route before running the outgoing one's cleanup. An
   * unmount write would arrive after Coded data had already counted, so the
   * page would show the state from before the last save.
   *
   * Writing to a module store from an effect is not a state write, so this is
   * not what `react-hooks/set-state-in-effect` is about; the store is a plain
   * object and nothing re-renders because of it.
   */
  useEffect(() => {
    writeSavedWork(projectId, {
      excerpts: savedExcerpts,
      assignments: savedAssignments,
      notes: savedNotes,
      supersededIds: [...supersededIds],
    });
  }, [projectId, savedAssignments, savedExcerpts, savedNotes, supersededIds]);

  /**
   * The landing, when a Coded data result sent the reader here.
   *
   * Once, on mount, and deferred: the shell moves focus to the route's `h1` on
   * every navigation, and child effects run before parent ones, so focusing
   * directly would be overwritten a moment later. The same `queueMicrotask`
   * ordering fix the restored panel needs.
   */
  const hasLanded = useRef(false);
  useEffect(() => {
    if (hasLanded.current || !entryTurnId) return;
    hasLanded.current = true;
    queueMicrotask(() => orientation.focusTurn(entryTurnId));
  }, [entryTurnId, orientation]);

  /**
   * Records proposed codes where they outlive the capture.
   *
   * Append-only, so a save that clears the panel cannot take one away, and a
   * repeat is ignored. Without this a coder could assign a provisional code and
   * then find the assignment naming a code with no record anywhere.
   */
  useEffect(() => {
    for (const code of panel.proposedCodes) addProvisionalCode(projectId, code);
  }, [panel.proposedCodes, projectId]);

  useEffect(() => {
    snapshot.current = {
      sourceId: resolved.source.sourceId,
      projectId,
      draft: {
        selection: excerpt.selection,
        panelOpen,
        panelFocus,
        pendingCodeIds: panel.pendingCodeIds,
        noteText: panel.noteText,
        uncertain: panel.uncertain,
        query: panel.query,
      },
      work: {
        excerpts: savedExcerpts,
        assignments: savedAssignments,
        notes: savedNotes,
        supersededIds: [...supersededIds],
      },
    };
  });

  useEffect(() => {
    return () => {
      const held = snapshot.current;

      /*
        A capture that has become records is not a capture any more. Holding it
        would restore a highlight over an excerpt the coder has already saved,
        which reads as unsaved work that is not there.
      */
      if (held.draft.selection.state === 'idle' && held.draft.pendingCodeIds.length === 0
          && held.draft.noteText.trim() === '') {
        clearDraft(held.sourceId);
        return;
      }
      writeDraft(held.sourceId, held.draft);
    };
  }, []);

  // Bridges, so the save handler can read the panel's code lookup and clear it
  // afterwards without the two hooks depending on each other's order. Written
  // after render, since a ref is not readable or writable during one.
  useEffect(() => {
    panelCodeById.current = panel.codeById;
    panelClear.current = panel.clearAfterSave;
    panelLoad.current = panel.loadPending;
  }, [panel.clearAfterSave, panel.codeById, panel.loadPending]);

  /**
   * Clicking a coded highlight opens that saved excerpt, which is the sighted
   * route D-030 names. With nothing coded there it just sets the position, and
   * with an excerpt already in progress it does not interrupt.
   */
  const openSavedAt = useCallback(
    (segmentId: Id) => {
      if (excerpt.selection.state === 'confirmed') return;
      const here = savedExcerptsAt(
        resolved,
        segmentId,
        allExcerpts,
        effectiveAssignments,
        allNotes,
      );
      if (here.length === 0) return;
      // One opens; several ask, exactly as the command does.
      excerpt.runOpenAt(here);
    },
    [allExcerpts, allNotes, effectiveAssignments, excerpt, resolved],
  );

  return (
    <>
      <div
        data-saved-excerpts={savedSummary.excerpts}
        data-saved-assignments={savedSummary.assignments}
        data-saved-notes={savedSummary.notes}
        hidden
      />
      <PositionRibbon orientation={orientation} />
      <TranscriptToolbar orientation={orientation} />
      <ExcerptToolbar excerpt={excerpt} resolved={resolved} />
      {/* Section 2: opens over the transcript on a selection, and nowhere
          else. It renders nothing until then. */}
      <ExcerptContextMenu excerpt={excerpt} />
      <Transcript
        resolved={resolved}
        displayStates={displayStates}
        flags={flags}
        onOpenSavedAt={openSavedAt}
        containerRef={orientation.containerRef}
        segmentsInRange={excerpt.segmentsInRange}
        excerptStartSegmentId={excerpt.startSegmentId}
        excerptEndSegmentId={excerpt.endSegmentId}
        excerptStartOffset={excerpt.startOffset}
        excerptEndOffset={excerpt.endOffset}
        excerptState={excerpt.selection.state}
        codingByTurnId={codingByTurnId}
        codeById={codeById}
      />
      {/* D-033: below the transcript at narrow width, alongside it when there
          is room, in the same logical order either way. */}
      <CodePanel
        panel={panel}
        flags={flags}
        /* The captured text itself: D-040 renders it visually hidden inside
           the panel so a screen reader user can re-read what they captured
           with their own commands. */
        excerptText={
          excerpt.selection.range ? excerptText(resolved, excerpt.selection.range) : null
        }
      />
    </>
  );
}
