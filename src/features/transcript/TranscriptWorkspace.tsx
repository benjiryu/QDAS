import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import type { PrototypeFlags } from '../../config/flags';
import {
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
  userId: Id;
  codingRoundId: Id;
  codebookVersionId: Id;
  /** The project codebook, for code selection. */
  codes: Code[];
  projectId: Id;
  flags?: PrototypeFlags;
}

export function TranscriptWorkspace({
  resolved,
  seedExcerpts,
  seedAssignments,
  userId,
  codingRoundId,
  codebookVersionId,
  codes,
  projectId,
  flags = defaultFlags,
}: TranscriptWorkspaceProps) {
  const announcer = useAnnouncer();

  /**
   * Work saved during this session. Front-end state within a session is real,
   * per prototype-scope.md; nothing is written to a server, and nothing here
   * survives a reload.
   */
  const [savedExcerpts, setSavedExcerpts] = useState<Excerpt[]>([]);
  const [savedAssignments, setSavedAssignments] = useState<CodeAssignment[]>([]);
  const [savedNotes, setSavedNotes] = useState<Note[]>([]);
  /**
   * Assignments the coder removed from a reopened excerpt.
   *
   * Superseded, never deleted: the project preserves before-and-after history,
   * and a removed assignment is evidence about how interpretation changed.
   * D-030.
   */
  const [supersededIds, setSupersededIds] = useState<Set<Id>>(() => new Set());
  const panelLoad = useRef<((codeIds: Id[]) => void) | null>(null);

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
    () =>
      [...seedAssignments, ...savedAssignments].map((assignment) =>
        supersededIds.has(assignment.assignmentId)
          ? { ...assignment, status: 'superseded' as const }
          : assignment,
      ),
    [savedAssignments, seedAssignments, supersededIds],
  );

  const allExcerpts = useMemo(
    () => [...seedExcerpts, ...savedExcerpts],
    [savedExcerpts, seedExcerpts],
  );

  // Coded state covers seeded work and this session's saves alike, so a
  // sentence the coder just saved reads as coded immediately. An excerpt whose
  // assignments have all been superseded is no longer coded.
  const displayStates = useMemo(
    () =>
      deriveSegmentDisplayStates(resolved, {
        excerpts: allExcerpts,
        codeAssignments: effectiveAssignments,
        includeExcerpt: (_excerpt, assignments) =>
          assignments.some((assignment) => assignment.status !== 'superseded'),
      }),
    [allExcerpts, effectiveAssignments, resolved],
  );

  const orientation = useTranscriptOrientation({ resolved, userId, flags });

  /**
   * Whether code selection is open. Held here because Escape resolves against
   * it: with the panel open Escape cancels the panel, and with it closed Escape
   * discards a pending excerpt. `resolveEscape` in the binding module decides,
   * and both features read the same answer.
   */
  const [panelOpen, setPanelOpen] = useState(false);
  /**
   * Which field the panel opens focused on, set by whichever capture command
   * opened it. Section 4: `excerpt.code` lands in search, `excerpt.note` in the
   * note field.
   */
  const [panelFocus, setPanelFocus] = useState<CaptureTarget>('search');
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
          )
        : [],
    [allExcerpts, effectiveAssignments, orientation.focusedTurnId, resolved],
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
      // The panel opens pre-populated with what is already saved, per D-030.
      panelLoad.current?.(summary.codeIds);
      setPanelFocus('search');
      setPanelOpen(true);
    },
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
        const diff = diffReopenedAssignments(
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
          new Date().toISOString(),
        );

        setSavedAssignments((current) => [...current, ...diff.added]);
        setSupersededIds((current) => {
          const next = new Set(current);
          for (const id of diff.supersededAssignmentIds) next.add(id);
          return next;
        });

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
      // A reopened excerpt's saved assignments are untouched by cancel. D-030.
      // For a fresh capture, cancel discards it and creates nothing, per
      // section 3, and returns focus to the turn the capture started in.
      excerpt.run('excerpt.discard');
    },
  });

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
      const here = savedExcerptsAt(resolved, segmentId, allExcerpts, effectiveAssignments);
      if (here.length === 0) return;
      // One opens; several ask, exactly as the command does.
      excerpt.runOpenAt(here);
    },
    [allExcerpts, effectiveAssignments, excerpt, resolved],
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
