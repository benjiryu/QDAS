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
  /** Characters into the boundary sentences. D-036 stores exact characters. */
  excerptStartOffset?: number | null;
  excerptEndOffset?: number | null;
  excerptState?: string;
}

type ExcerptMarker = 'start' | 'end' | 'only' | 'in-range';

/**
 * Splits a sentence into the part before the capture, the captured part, and
 * the part after.
 *
 * Section 6: a captured range may begin or end mid-sentence, and the highlight
 * shows exactly what will be coded. Whole-sentence highlighting would show the
 * coder something different from what is about to be stored, which is the
 * failure D-036 removed sentence snapping to avoid.
 */
function splitAtOffsets(
  text: string,
  marker: ExcerptMarker,
  startOffset: number | null,
  endOffset: number | null,
): [string, string, string] {
  const start = marker === 'start' || marker === 'only' ? clamp(startOffset ?? 0, text) : 0;
  const end = marker === 'end' || marker === 'only' ? clamp(endOffset ?? text.length, text) : text.length;

  // A range whose offsets cross within one sentence cannot be shown, so the
  // sentence is highlighted whole rather than rendered inside out.
  if (end < start) return ['', text, ''];

  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
}

function clamp(offset: number, text: string): number {
  return Math.max(0, Math.min(offset, text.length));
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
  excerptStartOffset = null,
  excerptEndOffset = null,
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

    // A drag ends with a click, whose target is the common ancestor of where it
    // started and where it finished rather than a sentence. Treating that as a
    // click would move the reading position to the turn's first sentence, announce
    // it, and scroll there, all while the user is only selecting text. A selection
    // still standing means this click is the tail of that gesture, not a request
    // to move.
    if (typeof document !== 'undefined') {
      const selection = document.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) return;
    }

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
        {turn.segments.map((segment, index) => {
          const marker = excerptMarker(
            segment.segmentId,
            segmentsInRange,
            excerptStartSegmentId,
            excerptEndSegmentId,
          );
          const [before, inside, after] = marker
            ? splitAtOffsets(segment.text, marker, excerptStartOffset, excerptEndOffset)
            : ['', '', ''];

          return (
          <Fragment key={segment.segmentId}>
            <span
              className="transcript-segment"
              data-segment-id={segment.segmentId}
              data-display-state={displayStateOf(displayStates, segment.segmentId)}
              /* Orthogonal to the coded state, per section 3: a segment can be
                 active and coded at once and has to be legible as both. */
              data-active={segment.segmentId === activeSegmentId ? 'true' : undefined}
              data-excerpt={marker}
              data-excerpt-state={
                segmentsInRange?.has(segment.segmentId) ? excerptState : undefined
              }
            >
              {/* Split only where there is a capture: an uncaptured sentence
                  stays one text node, which is what everything else reads. */}
              {marker ? (
                <>
                  {before}
                  <span className="transcript-segment__captured" data-captured>
                    {inside}
                  </span>
                  {after}
                </>
              ) : (
                segment.text
              )}
            </span>
            {/* The space belongs between the sentences, not inside one, so a
                coded sentence's underline stops at its own last character. */}
            {index < turn.segments.length - 1 ? ' ' : null}
          </Fragment>
          );
        })}
      </span>
    </li>
  );
}
