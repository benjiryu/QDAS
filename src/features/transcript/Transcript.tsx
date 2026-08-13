import { useId } from 'react';
import { defaultFlags } from '../../config/flags';
import type { PrototypeFlags } from '../../config/flags';
import type { Code, Id, ResolvedSource, SegmentDisplayStates, TurnCoding } from '../../domain';
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
  /** Clicking a coded sentence reopens its excerpt, per D-030. */
  onOpenSavedAt?: (segmentId: Id) => void;
  /** Clicking the rail's note icon, the pointer twin of `note.open`. D-055. */
  onOpenNote?: (turnId: Id) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  segmentsInRange?: Set<Id>;
  excerptStartSegmentId?: Id | null;
  excerptEndSegmentId?: Id | null;
  excerptStartOffset?: number | null;
  excerptEndOffset?: number | null;
  excerptState?: string;
  /** Per turn, for the code rail and its description. D-041. */
  codingByTurnId?: Map<Id, TurnCoding>;
  codeById?: Map<Id, Code>;
}

export function Transcript({
  resolved,
  displayStates,
  flags = defaultFlags,
  onOpenSavedAt,
  onOpenNote,
  containerRef,
  segmentsInRange,
  excerptStartSegmentId = null,
  excerptEndSegmentId = null,
  excerptStartOffset = null,
  excerptEndOffset = null,
  excerptState,
  codingByTurnId,
  codeById,
}: TranscriptProps) {
  const headingId = useId();

  return (
    <section className="transcript" aria-labelledby={headingId}>
      <h2 id={headingId}>Transcript</h2>

      <div ref={containerRef} data-transcript>
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
              onOpenSavedAt={onOpenSavedAt}
              onOpenNote={onOpenNote}
              segmentsInRange={segmentsInRange}
              excerptStartSegmentId={excerptStartSegmentId}
              excerptEndSegmentId={excerptEndSegmentId}
              excerptStartOffset={excerptStartOffset}
              excerptEndOffset={excerptEndOffset}
              excerptState={excerptState}
              coding={codingByTurnId?.get(turn.turn.turnId)}
              codeById={codeById}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
