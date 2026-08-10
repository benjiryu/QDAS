import { useMemo, useState } from 'react';
import { defaultFlags } from '../../config/flags';
import type { PrototypeFlags } from '../../config/flags';
import { describeExcerptSize, excerptSize, requireTurnOf } from '../../domain';
import type { Code, Id, ResolvedSource, SegmentDisplayStates } from '../../domain';
import { CodePanel } from '../codes/CodePanel';
import { useCodePanel } from '../codes/useCodePanel';
import { ExcerptToolbar } from '../excerpt/ExcerptToolbar';
import { useExcerptSelection } from '../excerpt/useExcerptSelection';
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
  displayStates: SegmentDisplayStates;
  userId: Id;
  /** The project codebook, for code selection. */
  codes: Code[];
  flags?: PrototypeFlags;
}

export function TranscriptWorkspace({
  resolved,
  displayStates,
  userId,
  codes,
  flags = defaultFlags,
}: TranscriptWorkspaceProps) {
  const navigation = useTranscriptNavigation({ resolved, displayStates, userId, flags });

  /**
   * Whether code selection is open. Held here because Escape resolves against
   * it: with the panel open Escape cancels the panel, and with it closed Escape
   * discards a pending excerpt. `resolveEscape` in the binding module decides,
   * and both features read the same answer.
   */
  const [panelOpen, setPanelOpen] = useState(false);

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
  });

  const excerptSummary = useMemo(() => {
    if (!excerpt.selection.range) return null;
    return describeExcerptSize(excerptSize(resolved, excerpt.selection.range));
  }, [excerpt.selection.range, resolved]);

  const excerptSpeaker = excerpt.startSegmentId
    ? (requireTurnOf(resolved, excerpt.startSegmentId).speaker?.label ?? null)
    : null;

  const panel = useCodePanel({
    codes,
    isOpen: panelOpen,
    excerptSummary,
    onCancel: () => {
      setPanelOpen(false);
      // Section 9: cancel returns focus to the command strip, with the excerpt
      // still confirmed.
      excerpt.firstControlRef.current?.focus();
    },
  });

  return (
    <>
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
