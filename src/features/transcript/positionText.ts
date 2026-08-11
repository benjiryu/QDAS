/**
 * Position wording, in one place.
 *
 * Specification: docs/patterns/transcript-segment.md section 5.
 *
 * The visible ribbon and the spoken report are built from the same fields by
 * the same function. That is not tidiness: acceptance criterion "Position
 * agreement" requires the announced values to match the shown values, and the
 * only way to guarantee that is to leave no second place where either could be
 * assembled differently.
 *
 * Per D-009 these report reading position, never coding completion, so no label
 * here says "Progress". Since D-038 the position is the focused speaker turn.
 */

import type { PositionReportDetail } from '../../config/flags';
import type { PositionReport } from '../../domain';
import { formatTimestamp } from './formatTimestamp';

export interface PositionField {
  /** Stable key for rendering and for tests. */
  name: 'turn' | 'percentage' | 'timestamp';
  /** Shown beside the value in the ribbon and spoken as part of the report. */
  label: string;
  value: string;
}

/**
 * Fields for the current detail level.
 *
 * `brief` is the turn index and percentage; `full` adds the timestamp. Section
 * 11 defines both, and D-038 removed the sentence index that used to lead:
 * there is no active sentence to report. The timestamp appears only when the
 * source has audio, per section 5.
 */
export function positionFields(
  report: PositionReport,
  detail: PositionReportDetail,
  hasAudio: boolean,
): PositionField[] {
  const fields: PositionField[] = [
    {
      name: 'turn',
      label: 'Speaker turn',
      value: `${report.turnIndex} of ${report.turnCount}`,
    },
    { name: 'percentage', label: 'Through source', value: `${report.percentage}%` },
  ];

  if (detail === 'full' && hasAudio && report.timestampMs !== null) {
    fields.push({
      name: 'timestamp',
      label: 'Timestamp',
      value: formatTimestamp(report.timestampMs),
    });
  }

  return fields;
}

/** The same fields as a sentence for the announcement service to speak. */
export function describePosition(fields: PositionField[]): string {
  return `${fields.map((field) => `${field.label} ${field.value}`).join('. ')}.`;
}
