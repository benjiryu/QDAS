import { Fragment } from 'react';
import { displayStateOf } from '../../domain';
import type { Id, ResolvedTurn, SegmentDisplayStates } from '../../domain';
import type { TimestampVerbosity } from '../../config/flags';
import { formatTimestamp } from './formatTimestamp';

/**
 * One speaker turn: a focusable list item holding continuous prose.
 *
 * Specification: docs/patterns/transcript-segment.md sections 1 and 7.
 *
 * The whole turn is one focusable container and the sentences inside it are
 * spans with no role, no tabindex, and no accessible name of their own. That is
 * the two-level model: the turn is the reading unit and the sentence is the
 * addressing unit. Making each sentence focusable would fragment the turn into
 * separate objects and a screen reader user would lose the ability to read it
 * straight through, which is the whole reason section 1 separates the two.
 *
 * Sentences stay individually addressable through `data-segment-id` and
 * individually styleable through their own class, neither of which puts
 * anything into the accessibility tree.
 */

interface TranscriptTurnProps {
  turn: ResolvedTurn;
  displayStates: SegmentDisplayStates;
  timestampVerbosity: TimestampVerbosity;
  activeSegmentId?: Id | null;
  onActivateSegment?: (segmentId: Id) => void;
  /** Segments inside the excerpt range, and which of them are its boundaries. */
  segmentsInRange?: Set<Id>;
  excerptStartSegmentId?: Id | null;
  excerptEndSegmentId?: Id | null;
  excerptState?: string;
}

/**
 * Which part of the excerpt range a sentence is, if any.
 *
 * Section 7: the start and the end carry individual markers, so a magnification
 * user panning to one end can tell which boundary they are looking at without
 * scrolling to find the other.
 */
function excerptMarker(
  segmentId: Id,
  segmentsInRange: Set<Id> | undefined,
  startSegmentId: Id | null,
  endSegmentId: Id | null,
): 'start' | 'end' | 'only' | 'in-range' | undefined {
  if (!segmentsInRange?.has(segmentId)) return undefined;
  const isStart = segmentId === startSegmentId;
  const isEnd = segmentId === endSegmentId;
  if (isStart && isEnd) return 'only';
  if (isStart) return 'start';
  if (isEnd) return 'end';
  return 'in-range';
}

export function TranscriptTurn({
  turn,
  displayStates,
  timestampVerbosity,
  activeSegmentId = null,
  onActivateSegment,
  segmentsInRange,
  excerptStartSegmentId = null,
  excerptEndSegmentId = null,
  excerptState,
}: TranscriptTurnProps) {
  const first = turn.segments[0];
  const startTimeMs = first?.startTimeMs ?? null;
  const showTimestamp = timestampVerbosity !== 'never' && startTimeMs !== null;

  /*
    Pointer affordance only, per section 2.1: clicking a sentence makes it
    active, and clicking anywhere else in the turn makes the turn's first
    sentence active. Every position it reaches is also reachable through the
    movement commands, so this adds convenience without creating a path that
    only a mouse can take.
  */
  function handleClick(event: React.MouseEvent<HTMLLIElement>) {
    if (!onActivateSegment) return;
    const clicked = (event.target as HTMLElement).closest<HTMLElement>('[data-segment-id]');
    const segmentId = clicked?.dataset.segmentId ?? first?.segmentId;
    if (segmentId) onActivateSegment(segmentId);
  }

  return (
    <li
      className="transcript-turn"
      tabIndex={0}
      data-turn-id={turn.turn.turnId}
      onClick={handleClick}
    >
      {/*
        Speaker and timestamp sit at the head of the same flow as the prose, so
        the wide-viewport column and the narrow-viewport leading text are the
        same DOM in a different layout. Section 7 requires reading order to be
        preserved rather than the column becoming something to pan sideways to.
      */}
      <span className="transcript-turn__meta">
        <span className="transcript-turn__speaker">{turn.speaker?.label ?? 'Unknown speaker'}</span>
        {showTimestamp ? (
          <span
            className="transcript-turn__timestamp"
            /*
              Visible, and out of the accessibility tree unless the flag says
              timestamps are announced automatically. Section 6 keeps timestamps
              off automatic announcement at the default `onRequest`; the command
              that speaks one on request arrives with segment navigation.
            */
            aria-hidden={timestampVerbosity === 'always' ? undefined : true}
          >
            {formatTimestamp(startTimeMs)}
          </span>
        ) : null}
        <span className="transcript-turn__separator" aria-hidden="true">
          :
        </span>
      </span>{' '}
      <span className="transcript-turn__prose">
        {turn.segments.map((segment, index) => (
          <Fragment key={segment.segmentId}>
            <span
              className="transcript-segment"
              data-segment-id={segment.segmentId}
              data-display-state={displayStateOf(displayStates, segment.segmentId)}
              /* Orthogonal to the coded state, per section 3: a segment can be
                 active and coded at once and has to be legible as both. */
              data-active={segment.segmentId === activeSegmentId ? 'true' : undefined}
              data-excerpt={excerptMarker(
                segment.segmentId,
                segmentsInRange,
                excerptStartSegmentId,
                excerptEndSegmentId,
              )}
              data-excerpt-state={
                segmentsInRange?.has(segment.segmentId) ? excerptState : undefined
              }
            >
              {segment.text}
            </span>
            {/* The space belongs between the sentences, not inside one, so a
                coded sentence's underline stops at its own last character. */}
            {index < turn.segments.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </li>
  );
}
