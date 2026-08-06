import { useId } from 'react';
import { defaultFlags } from '../../config/flags';
import type { PrototypeFlags } from '../../config/flags';
import type { Id, ResolvedSource, SegmentDisplayStates } from '../../domain';
import { TranscriptTurn } from './TranscriptTurn';
import './transcript.css';

/**
 * The transcript.
 *
 * Specification: docs/patterns/transcript-segment.md sections 1, 3, and 7.
 *
 * A labelled region, per accessibility contract 2.1, so it is findable in
 * browse mode without tabbing through it.
 */

interface TranscriptProps {
  resolved: ResolvedSource;
  displayStates: SegmentDisplayStates;
  /** Flags are read from src/config/flags.ts and passed in, never branched on inline. */
  flags?: PrototypeFlags;
  activeSegmentId?: Id | null;
  /** Pointer affordance only, per section 2.1. */
  onActivateSegment?: (segmentId: Id) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  segmentsInRange?: Set<Id>;
  excerptStartSegmentId?: Id | null;
  excerptEndSegmentId?: Id | null;
  excerptState?: string;
}

export function Transcript({
  resolved,
  displayStates,
  flags = defaultFlags,
  activeSegmentId = null,
  onActivateSegment,
  containerRef,
  segmentsInRange,
  excerptStartSegmentId = null,
  excerptEndSegmentId = null,
  excerptState,
}: TranscriptProps) {
  const headingId = useId();

  return (
    <section className="transcript" aria-labelledby={headingId}>
      <h2 id={headingId}>Transcript</h2>

      <div ref={containerRef}>
        {/*
          A list, so a screen reader reports how many turns there are on entry
          and where the user is within them. Section 1: one focusable container
          per turn, marked up as a list item.
        */}
        <ol className="transcript__turns">
          {resolved.turns.map((turn) => (
            <TranscriptTurn
              key={turn.turn.turnId}
              turn={turn}
              displayStates={displayStates}
              timestampVerbosity={flags.timestampVerbosity}
              activeSegmentId={activeSegmentId}
              onActivateSegment={onActivateSegment}
              segmentsInRange={segmentsInRange}
              excerptStartSegmentId={excerptStartSegmentId}
              excerptEndSegmentId={excerptEndSegmentId}
              excerptState={excerptState}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
