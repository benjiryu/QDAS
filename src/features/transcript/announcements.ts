/**
 * What navigation says, in one place.
 *
 * Specification: docs/patterns/transcript-segment.md section 6.
 *
 * Section 6 fixes the information content of each announcement and not its
 * phrasing; the accessibility contract 2.3 says the same. So the wording here
 * is provisional and is itself a candidate for testing, while what appears in
 * each string is not: the table in section 6 decides that.
 *
 * Every string goes through the shared announcement service. Nothing in this
 * feature writes to a live region.
 */

import type { SegmentCoding } from '../../domain';
import type { PositionField } from './positionText';
import { describePosition } from './positionText';
import { formatTimestamp } from './formatTimestamp';

/** Coded status and code count, announced automatically on entering a coded segment. */
export function describeCoding(coding: SegmentCoding): string | null {
  if (coding.state === 'inactive') return null;

  const codes = coding.codeIds.length;
  const overlap = coding.state === 'coded-multiple' ? `, in ${coding.excerptIds.length} excerpts` : '';
  return `Coded${overlap}. ${codes} ${codes === 1 ? 'code' : 'codes'}.`;
}

/** Moving by sentence: the sentence text, and coded status when there is one. */
export function movedToSegment(text: string, coding: SegmentCoding): string {
  const coded = describeCoding(coding);
  return coded ? `${text} ${coded}` : text;
}

/** Moving by turn: the speaker name first, then the sentence text. */
export function movedToTurn(
  speakerLabel: string | null,
  text: string,
  coding: SegmentCoding,
): string {
  const speaker = speakerLabel ? `${speakerLabel}. ` : '';
  return `${speaker}${movedToSegment(text, coding)}`;
}

export function positionReportText(fields: PositionField[]): string {
  return describePosition(fields);
}

export function speakerText(speakerLabel: string | null): string {
  return speakerLabel ? `Speaker: ${speakerLabel}.` : 'This sentence has no speaker recorded.';
}

export function timestampText(timestampMs: number | null): string {
  return timestampMs === null
    ? 'This sentence has no timestamp.'
    : `Timestamp ${formatTimestamp(timestampMs)}.`;
}

/**
 * Entering the source: title, speaker count, and the restored position if there
 * is one. Section 6, last row.
 */
export function enteredSource(
  title: string,
  speakerCount: number,
  restored: PositionField[] | null,
): string {
  const opening = `${title}. ${speakerCount} speakers.`;
  return restored
    ? `${opening} Position restored. ${describePosition(restored)}`
    : `${opening} No saved position.`;
}

/**
 * Why a movement did nothing. Announced on attempt rather than left silent, so
 * an unavailable control is never a dead end (contract 2.6).
 */
export const UNAVAILABLE_TEXT: Record<string, string> = {
  atSourceStart: 'Already at the first sentence.',
  atSourceEnd: 'Already at the last sentence.',
  atFirstTurn: 'Already in the first speaker turn.',
  atLastTurn: 'Already in the last speaker turn.',
  noPosition: 'No position set. Move to the next sentence to begin.',
};
