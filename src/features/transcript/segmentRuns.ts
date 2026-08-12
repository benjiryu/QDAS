import type { CodedSpan, Id } from '../../domain';

/**
 * Splitting a sentence into the stretches that have to be drawn differently.
 *
 * Specification: docs/patterns/transcript-segment.md section 3 and
 * docs/patterns/excerpt-selection.md section 6, decision D-036.
 *
 * Two things can cover part of a sentence at once: excerpts already saved, and
 * the range being captured right now. Neither respects sentence boundaries any
 * more, and they do not respect each other's boundaries either, so the sentence
 * is cut at the union of both sets of edges. Every run that comes out is
 * uniform: wholly coded or not, wholly captured or not, never partly either.
 *
 * Pure, and deliberately not in the domain: it mixes a stored fact with
 * workflow state, and the domain layer holds neither the second nor the render.
 */

export interface SegmentRun {
  text: string;
  /** Null when these characters carry no saved coding. */
  coded: CodedSpan['state'] | null;
  /**
   * Every code covering these characters, from the span that covers them.
   *
   * Carried so the render can colour the run by its code family. The union
   * across overlapping excerpts, which is what makes a run with two families on
   * it identifiable as one.
   */
  codeIds: readonly Id[];
  /** True when these characters are inside the range being captured. */
  captured: boolean;
}

const NO_CODES: readonly Id[] = Object.freeze([]);

/**
 * Whether two runs carry the same codes, and so should draw the same.
 *
 * By value rather than by reference: two adjacent excerpts carrying the same
 * code produce different arrays holding the same ids, and those runs are
 * indistinguishable on screen. Order-independent, because what the render takes
 * from this is the set's family, which order cannot change.
 */
function sameCodes(a: readonly Id[], b: readonly Id[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((codeId) => b.includes(codeId));
}

export interface CaptureExtent {
  start: number;
  end: number;
}

function clamp(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length));
}

export function segmentRuns(
  text: string,
  spans: CodedSpan[],
  capture: CaptureExtent | null,
): SegmentRun[] {
  const length = text.length;
  const extent =
    capture && clamp(capture.end, length) > clamp(capture.start, length)
      ? { start: clamp(capture.start, length), end: clamp(capture.end, length) }
      : null;

  // Nothing to distinguish, so one run. The caller uses this to keep rendering
  // a bare text node, which is what most of a transcript is.
  if (spans.length === 0 && !extent) {
    return length === 0 ? [] : [{ text, coded: null, codeIds: NO_CODES, captured: false }];
  }

  const edges = new Set<number>([0, length]);
  for (const span of spans) {
    edges.add(clamp(span.start, length));
    edges.add(clamp(span.end, length));
  }
  if (extent) {
    edges.add(extent.start);
    edges.add(extent.end);
  }

  const boundaries = [...edges].sort((a, b) => a - b);
  const runs: SegmentRun[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;

    const span =
      spans.find((candidate) => clamp(candidate.start, length) <= start && clamp(candidate.end, length) >= end) ??
      null;
    const coded = span?.state ?? null;
    const codeIds = span?.codeIds ?? NO_CODES;
    const captured = extent !== null && extent.start <= start && extent.end >= end;

    const previous = runs[runs.length - 1];
    /*
      Adjacent stretches that look the same are one run, so a sentence with
      nothing on it does not arrive as a pile of spans.

      `codeIds` is part of "look the same" now that the family colours the run.
      Without it, neighbouring stretches coded from different families would
      merge whenever their state matched, and the merged run would wear one
      family's colour over characters belonging to another's.
    */
    if (
      previous &&
      previous.coded === coded &&
      previous.captured === captured &&
      sameCodes(previous.codeIds, codeIds)
    ) {
      previous.text += text.slice(start, end);
      continue;
    }

    runs.push({ text: text.slice(start, end), coded, codeIds, captured });
  }

  return runs;
}
