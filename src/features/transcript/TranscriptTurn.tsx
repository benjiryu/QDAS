import { Fragment, useId } from 'react';
import { codingOf } from '../../domain';
import type { Code, Id, ResolvedTurn, SegmentDisplayStates, TurnCoding } from '../../domain';
import type { TimestampVerbosity } from '../../config/flags';
import { formatTimestamp } from './formatTimestamp';
import { segmentRuns } from './segmentRuns';
import type { CaptureExtent } from './segmentRuns';
import { turnDescription } from './turnDescription';

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
 *
 * The one thing inside a turn that does have a role is a highlighted run, which
 * is a `mark` per D-052. That is not a third level: a mark is not focusable,
 * names nothing, and adds no stop to the reading order, so the turn still reads
 * straight through. It states what the text is and leaves how much to say about
 * it to the reader's verbosity setting.
 */

interface TranscriptTurnProps {
  turn: ResolvedTurn;
  displayStates: SegmentDisplayStates;
  timestampVerbosity: TimestampVerbosity;
  /**
   * Clicking a coded sentence reopens its excerpt, per D-030. That is the only
   * thing a click does now: D-038 removed click-to-set-active-segment, so a
   * click on uncoded prose focuses the turn and draws nothing.
   */
  onOpenSavedAt?: (segmentId: Id) => void;
  /** Segments inside the excerpt range, and which of them are its boundaries. */
  segmentsInRange?: Set<Id>;
  excerptStartSegmentId?: Id | null;
  excerptEndSegmentId?: Id | null;
  /** Characters into the boundary sentences. D-036 stores exact characters. */
  excerptStartOffset?: number | null;
  excerptEndOffset?: number | null;
  excerptState?: string;
  /** What this turn carries, for the rail and its description. D-041. */
  coding?: TurnCoding;
  /** Names and hues for the rail's pills. */
  codeById?: Map<Id, Code>;
  /**
   * Clicking the rail's note icon opens that turn's note, per D-055. The
   * pointer twin of `note.open`, mirroring click-a-coded-sentence from D-030.
   */
  onOpenNote?: (turnId: Id) => void;
}

type ExcerptMarker = 'start' | 'end' | 'only' | 'in-range';

/**
 * The code family a run belongs to, or null where it belongs to more than one.
 *
 * A run carries every code covering those characters, across however many
 * excerpts overlap there. One family means there is a hue to show; two or more
 * means there is not, and the stylesheet washes it grey rather than picking a
 * winner.
 *
 * `colorToken` is already the family's, not the individual code's — every code
 * in the fixture carries its family root's token — so this is a lookup rather
 * than a walk up the tree.
 */
function familyTokenOf(codeIds: readonly Id[], codeById: Map<Id, Code> | undefined): string | null {
  if (!codeById) return null;

  let token: string | null = null;
  for (const codeId of codeIds) {
    const code = codeById.get(codeId);
    if (!code) continue;
    if (token === null) token = code.colorToken;
    else if (token !== code.colorToken) return null;
  }
  return token;
}

/**
 * Which characters of this sentence the capture in progress covers.
 *
 * Section 6: a captured range may begin or end mid-sentence, and the highlight
 * shows exactly what will be coded. Only the two boundary sentences are cut;
 * everything between them is covered whole.
 */
function captureExtent(
  text: string,
  marker: ExcerptMarker,
  startOffset: number | null,
  endOffset: number | null,
): CaptureExtent {
  const start = marker === 'start' || marker === 'only' ? clamp(startOffset ?? 0, text) : 0;
  const end =
    marker === 'end' || marker === 'only' ? clamp(endOffset ?? text.length, text) : text.length;

  // A range stored inside out cannot be drawn as one, so the sentence is
  // covered whole rather than rendered backwards.
  return end < start ? { start: 0, end: text.length } : { start, end };
}

function clamp(offset: number, text: string): number {
  return Math.max(0, Math.min(offset, text.length));
}

/**
 * Which end of the captured range this run holds, if either.
 *
 * Only where the range itself begins or ends: a run at the start of an
 * in-between sentence is not a boundary, it is the middle of the excerpt.
 */
function captureEdge(
  marker: ExcerptMarker | undefined,
  runIndex: number,
  firstCaptured: number,
  lastCaptured: number,
): 'start' | 'end' | 'both' | undefined {
  if (!marker) return undefined;
  const startsHere =
    (marker === 'start' || marker === 'only') && runIndex === firstCaptured && firstCaptured >= 0;
  const endsHere =
    (marker === 'end' || marker === 'only') && runIndex === lastCaptured && lastCaptured >= 0;

  if (startsHere && endsHere) return 'both';
  if (startsHere) return 'start';
  if (endsHere) return 'end';
  return undefined;
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
  onOpenSavedAt,
  segmentsInRange,
  excerptStartSegmentId = null,
  excerptEndSegmentId = null,
  excerptStartOffset = null,
  excerptEndOffset = null,
  excerptState,
  coding,
  codeById,
  onOpenNote,
}: TranscriptTurnProps) {
  const descriptionId = useId();
  const description = coding ? turnDescription(coding) : null;
  const railCodes = (coding?.codeIds ?? [])
    .map((codeId) => codeById?.get(codeId))
    .filter((code): code is Code => code !== undefined);

  const first = turn.segments[0];
  const startTimeMs = first?.startTimeMs ?? null;
  const showTimestamp = timestampVerbosity !== 'never' && startTimeMs !== null;

  /*
    The only pointer affordance left, per D-030: clicking a coded sentence
    reopens its excerpt. Clicking anywhere else focuses the turn, which the
    browser does on its own because the turn is a focusable element, and draws
    nothing beyond the focus ring.
  */
  function handleClick(event: React.MouseEvent<HTMLLIElement>) {
    if (!onOpenSavedAt) return;

    // A drag ends with a click, whose target is the common ancestor of where it
    // started and where it finished rather than a sentence. A selection still
    // standing means this click is the tail of that gesture, not a request to
    // open anything.
    if (typeof document !== 'undefined') {
      const selection = document.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) return;
    }

    const clicked = (event.target as HTMLElement).closest<HTMLElement>('[data-segment-id]');
    if (clicked?.dataset.segmentId) onOpenSavedAt(clicked.dataset.segmentId);
  }

  return (
    <li
      className="transcript-turn"
      tabIndex={0}
      data-turn-id={turn.turn.turnId}
      aria-describedby={description ? descriptionId : undefined}
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
          const coding = codingOf(displayStates, segment.segmentId);
          const runs = segmentRuns(
            segment.text,
            coding.spans,
            marker
              ? captureExtent(segment.text, marker, excerptStartOffset, excerptEndOffset)
              : null,
          );
          const plain = runs.length === 1 && runs[0].coded === null && !runs[0].captured;
          // Which run carries the boundary bar. The captured runs are
          // contiguous, so these are the two ends of that stretch.
          const firstCaptured = runs.findIndex((run) => run.captured);
          const lastCaptured = runs.map((run) => run.captured).lastIndexOf(true);

          return (
          <Fragment key={segment.segmentId}>
            <span
              className="transcript-segment"
              data-segment-id={segment.segmentId}
              /* The sentence's own state: whether it is coded at all, which is
                 the granularity R-1 compares at. What is painted is the runs
                 inside, which may cover only part of it. D-036 section 5. */
              data-display-state={coding.state}
              data-excerpt={marker}
              data-excerpt-state={
                segmentsInRange?.has(segment.segmentId) ? excerptState : undefined
              }
            >
              {/* A sentence with nothing on it stays one text node, which is
                  what most of a transcript is and what capture reads fastest. */}
              {plain
                ? segment.text
                : runs.map((run, runIndex) => {
                    /*
                      A highlighted run is a `mark`, per D-052. Everything about
                      it other than the element is unchanged: the styling below
                      is the same, the click still reopens the excerpt, and the
                      turn's description is untouched.

                      What the element buys is the one channel the styling could
                      not reach. A wash and an underline are seen; a screen
                      reader reading straight through a styled span passes over
                      it with no signal at all, so a coded passage was a visual
                      secret until D-041's description fired on focus. `mark` is
                      what NVDA and JAWS already report as highlighted, at the
                      verbosity their user chose, and nothing is injected into
                      the prose to do it.

                      A run that is neither coded nor captured stays a span,
                      because it is not highlighted: a sentence coded in part
                      marks the coded characters and no more.
                    */
                    const Run = run.coded !== null || run.captured ? 'mark' : 'span';

                    return (
                      <Run
                        key={runIndex}
                        className="transcript-segment__run"
                        data-coded-run={run.coded ?? undefined}
                        /* The family's hue, or absent where the run spans more
                           than one and the stylesheet falls back to grey. The
                           same attribute the rail's pills carry, so a passage
                           and its pill cannot show different colours. */
                        data-color-token={familyTokenOf(run.codeIds, codeById) ?? undefined}
                        data-captured={run.captured ? '' : undefined}
                        data-capture-edge={captureEdge(
                          marker,
                          runIndex,
                          firstCaptured,
                          lastCaptured,
                        )}
                      >
                        {run.text}
                      </Run>
                    );
                  })}
            </span>
            {/* The space belongs between the sentences, not inside one, so a
                coded sentence's underline stops at its own last character. */}
            {index < turn.segments.length - 1 ? ' ' : null}
          </Fragment>
          );
        })}
      </span>

      {/*
        The code rail, per D-041. A glance channel for sighted and magnification
        users, and out of the accessibility tree: code names in the reading
        stream would fragment the continuous prose D-002 protects. What makes
        hiding it legitimate is the description below, which is its twin.

        Pills carry their text label as well as their hue, so the rail does not
        rely on colour even though nothing here reads it aloud.
      */}
      {railCodes.length > 0 || coding?.hasNote ? (
        <span className="transcript-turn__rail" aria-hidden="true">
          {railCodes.map((code) => (
            <span
              key={code.codeId}
              className="transcript-turn__pill"
              data-color-token={code.colorToken}
            >
              {code.status === 'provisional' ? `${code.name} (provisional)` : code.name}
            </span>
          ))}
          {coding?.hasNote ? (
            /*
              The pointer twin of `note.open`, per D-055, the way clicking a
              coded sentence is the twin of `excerpt.open`.

              `tabIndex={-1}` is not an oversight. The rail is `aria-hidden` per
              D-041 because its content is already in the turn's description,
              and a focusable control inside an aria-hidden subtree is a
              genuine defect — reachable by Tab, absent from the tree. So this
              is the pointer route and the chord is the other one. The cost is
              recorded: a keyboard user who cannot use the chord has no third
              way in.
            */
            <button
              type="button"
              className="transcript-turn__note"
              tabIndex={-1}
              data-command="note.open"
              onClick={(event) => {
                event.stopPropagation();
                onOpenNote?.(turn.turn.turnId);
              }}
            >
              {/* Drawn rather than typed: Luciole has no glyph at U+270E, and a
                  missing glyph renders as a replacement box. */}
              <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                <path
                  d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H6.7L3.4 13.8A.5.5 0 0 1 2.6 13.4V11H2.5A.5.5 0 0 1 2 10.5z"
                  fill="currentColor"
                />
              </svg>
            </button>
          ) : null}
        </span>
      ) : null}

      {/*
        The programmatic twin. Hidden both ways on purpose: `aria-hidden` keeps
        it out of continuous reading, and the clip keeps it off the screen. A
        hidden node referenced by `aria-describedby` is still used to compute
        the description, so it is announced when the turn takes focus and at no
        other time. Verified per screen reader in the smoke test.
      */}
      {description ? (
        <span id={descriptionId} className="transcript-turn__description" aria-hidden="true">
          {description}
        </span>
      ) : null}
    </li>
  );
}
