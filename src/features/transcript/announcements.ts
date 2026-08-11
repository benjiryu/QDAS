/**
 * What orientation says, in one place.
 *
 * Specification: docs/patterns/transcript-segment.md section 6 and its v0.2
 * banner, decision D-038.
 *
 * Section 6 fixes the information content of each announcement and not its
 * phrasing; the accessibility contract 2.3 says the same. So the wording here
 * is provisional and is itself a candidate for testing, while what appears in
 * each string is not: the table in section 6 decides that.
 *
 * Every string goes through the shared announcement service. Nothing in this
 * feature writes to a live region.
 */

import type { PositionField } from './positionText';
import { describePosition } from './positionText';
import { formatTimestamp } from './formatTimestamp';

/*
 * The movement announcements went with the movement commands. Nothing the
 * application says now describes a move it made, because it no longer makes
 * any: the reader moves, and these three answer where they are.
 */

export function positionReportText(fields: PositionField[]): string {
  return describePosition(fields);
}

export function speakerText(speakerLabel: string | null): string {
  return speakerLabel ? `Speaker: ${speakerLabel}.` : 'This turn has no speaker recorded.';
}

export function timestampText(timestampMs: number | null): string {
  return timestampMs === null
    ? 'This turn has no timestamp.'
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
 * Why a command answered nothing. Announced on attempt rather than left silent,
 * so an unavailable control is never a dead end (contract 2.6).
 *
 * It names the way in, because after D-038 there is no application command that
 * would establish a position: the reader has to be on a turn.
 */
export const UNAVAILABLE_TEXT: Record<string, string> = {
  noFocusedTurn: 'No speaker turn is focused. Press Tab to move into the transcript.',
};
