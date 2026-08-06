import { defaultFlags } from '../../config/flags';
import type { PrototypeFlags } from '../../config/flags';
import type { Id, ResolvedSource, SegmentDisplayStates } from '../../domain';
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
  flags?: PrototypeFlags;
}

export function TranscriptWorkspace({
  resolved,
  displayStates,
  userId,
  flags = defaultFlags,
}: TranscriptWorkspaceProps) {
  const navigation = useTranscriptNavigation({ resolved, displayStates, userId, flags });

  const excerpt = useExcerptSelection({
    resolved,
    activeSegmentId: navigation.activeSegmentId,
    flags,
    containerRef: navigation.containerRef,
    // Confirming or cancelling an excerpt sets the active segment, per
    // transcript-segment.md section 2.1.
    onSetActiveSegment: navigation.setActiveSegment,
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
    </>
  );
}
