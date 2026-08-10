import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { defaultFlags } from '../../config/flags';
import type { PrototypeFlags } from '../../config/flags';
import {
  buildCodingRecords,
  deriveSegmentDisplayStates,
  describeExcerptSize,
  excerptSize,
  positionReport,
  postCodingReturnTarget,
  requireTurnOf,
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
import { ExcerptToolbar } from '../excerpt/ExcerptToolbar';
import { useExcerptSelection } from '../excerpt/useExcerptSelection';
import { useNativeSelection } from '../excerpt/useNativeSelection';
import { PositionRibbon } from './PositionRibbon';
import { Transcript } from './Transcript';
import { TranscriptToolbar } from './TranscriptToolbar';
import { useTranscriptNavigation } from './useTranscriptNavigation';

/**
 * The reading and selection surface: position, controls, and the transcript.
 *
 * Specification: docs/patterns/transcript-segment.md sections 2, 4, 5, 6, and
 * docs/patterns/excerpt-selection.md sections 3 to 7.
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

  // Coded state covers seeded work and this session's saves alike, so a
  // sentence the coder just saved reads as coded immediately.
  const displayStates = useMemo(
    () =>
      deriveSegmentDisplayStates(resolved, {
        excerpts: [...seedExcerpts, ...savedExcerpts],
        codeAssignments: [...seedAssignments, ...savedAssignments],
      }),
    [resolved, savedAssignments, savedExcerpts, seedAssignments, seedExcerpts],
  );

  const navigation = useTranscriptNavigation({ resolved, displayStates, userId, flags });

  /**
   * Whether code selection is open. Held here because Escape resolves against
   * it: with the panel open Escape cancels the panel, and with it closed Escape
   * discards a pending excerpt. `resolveEscape` in the binding module decides,
   * and both features read the same answer.
   */
  const [panelOpen, setPanelOpen] = useState(false);
  const panelCodeById = useRef<Map<Id, Code>>(new Map());
  const panelClear = useRef<(() => void) | null>(null);

  /**
   * A drag in the transcript is a way in to the same application-owned range,
   * per D-034. Opportunistic: with nothing observable, which is the normal case
   * in browse mode, every control behaves exactly as it does without it.
   */
  const nativeSelection = useNativeSelection({
    enabled: flags.adoptNativeSelection,
    containerRef: navigation.containerRef,
    resolved,
  });

  const excerpt = useExcerptSelection({
    resolved,
    activeSegmentId: navigation.activeSegmentId,
    flags,
    containerRef: navigation.containerRef,
    // Confirming or cancelling an excerpt sets the active segment, per
    // transcript-segment.md section 2.1.
    onSetActiveSegment: navigation.setActiveSegment,
    panelOpen,
    onConfirm: () => setPanelOpen(true),
    onClosePanel: () => setPanelOpen(false),
    nativeSelection,
  });

  const excerptSummary = useMemo(() => {
    if (!excerpt.selection.range) return null;
    return describeExcerptSize(excerptSize(resolved, excerpt.selection.range));
  }, [excerpt.selection.range, resolved]);

  const excerptSpeaker = excerpt.startSegmentId
    ? (requireTurnOf(resolved, excerpt.startSegmentId).speaker?.label ?? null)
    : null;

  /**
   * Writes the records, then returns the reader where `postCodingReturn` says.
   *
   * Nothing the panel holds is cleared until the records exist, which is what
   * makes a failed save non-destructive.
   */
  const handleSave = useCallback(
    (pending: { codeIds: Id[]; noteText: string; uncertain: boolean }) => {
      const range = excerpt.selection.range;
      if (!range) return;

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
      if (!records) return;

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
      navigation.setActiveSegment(target);

      const report = positionReport(resolved, target);
      const count = records.assignments.length;
      announcer.announce(
        `${count} ${count === 1 ? 'code' : 'codes'} applied.${
          records.note ? ' Note saved.' : ''
        } Returned to sentence ${report?.sentenceIndex ?? 0} of ${report?.sentenceCount ?? 0}.`,
      );

      const turn = requireTurnOf(resolved, target);
      navigation.containerRef.current
        ?.querySelector<HTMLElement>(`[data-turn-id="${turn.turn.turnId}"]`)
        ?.focus?.();

      panelClear.current?.();
    },
    [
      announcer,
      codebookVersionId,
      codingRoundId,
      excerpt,
      flags.postCodingReturn,
      navigation,
      resolved,
      savedAssignments,
      savedExcerpts,
      seedAssignments,
      seedExcerpts,
      userId,
    ],
  );

  const panel = useCodePanel({
    codes,
    projectId,
    isOpen: panelOpen,
    excerptSummary,
    onSave: handleSave,
    onCancel: () => {
      setPanelOpen(false);
      // Section 9: cancel returns focus to the command strip, with the excerpt
      // still confirmed.
      excerpt.firstControlRef.current?.focus();
    },
  });

  // Bridges, so the save handler can read the panel's code lookup and clear it
  // afterwards without the two hooks depending on each other's order. Written
  // after render, since a ref is not readable or writable during one.
  useEffect(() => {
    panelCodeById.current = panel.codeById;
    panelClear.current = panel.clearAfterSave;
  }, [panel.clearAfterSave, panel.codeById]);

  return (
    <>
      <div
        data-saved-excerpts={savedSummary.excerpts}
        data-saved-assignments={savedSummary.assignments}
        data-saved-notes={savedSummary.notes}
        hidden
      />
      <PositionRibbon navigation={navigation} />
      <TranscriptToolbar navigation={navigation} />
      <ExcerptToolbar excerpt={excerpt} resolved={resolved} />
      <Transcript
        resolved={resolved}
        displayStates={displayStates}
        flags={flags}
        activeSegmentId={navigation.activeSegmentId}
        onActivateSegment={navigation.activate}
        containerRef={navigation.containerRef}
        segmentsInRange={excerpt.segmentsInRange}
        excerptStartSegmentId={excerpt.startSegmentId}
        excerptEndSegmentId={excerpt.endSegmentId}
        excerptState={excerpt.selection.state}
      />
      {/* D-033: below the transcript at narrow width, alongside it when there
          is room, in the same logical order either way. */}
      <CodePanel
        panel={panel}
        flags={flags}
        excerptSummary={excerptSummary}
        excerptSpeaker={excerptSpeaker}
        onReadExcerpt={() => excerpt.run('excerpt.read')}
      />
    </>
  );
}
