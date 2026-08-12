/**
 * Which Coded data view a viewer gets.
 *
 * Specification: decision D-049, docs/pages/destinations.md section 2.
 *
 * The whole gate, in one pure function, because it is the thing that decides
 * whether another coder's work appears on screen. R-4 and D-010 keep that work
 * invisible during independent coding; the project-wide design was drawn for
 * the qualitative lead's monitoring need and for the moment after independent
 * coding closes, when R-4 lifts by its own terms. D-049 keeps both by resolving
 * on role and phase rather than reversing either.
 */

import type { ProjectPhase, UserRole } from '../../domain';

export type CodedDataView = 'own' | 'projectWide';

/**
 * The phases in order, so "past independent coding" is a comparison rather than
 * a list of names that would go stale when a phase is added.
 */
const PHASE_ORDER: ProjectPhase[] = [
  'setup',
  'pilot',
  'independentCoding',
  'review',
  'reflexivity',
  'recoding',
  'closed',
];

function isAfterIndependentCoding(phase: ProjectPhase): boolean {
  return PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf('independentCoding');
}

export function resolveCodedDataView(role: UserRole, phase: ProjectPhase): CodedDataView {
  // The lead monitors progress, which is the need the project-wide design was
  // drawn for. D-049 grants it in any phase.
  if (role === 'qualitativeLead') return 'projectWide';

  // R-4's veil lifts by its own terms once independent coding closes, for
  // everyone.
  if (isAfterIndependentCoding(phase)) return 'projectWide';

  /*
    Everyone else, which includes a case D-049 does not name: a reviewer during
    independent coding. The decision covers the coder and the lead, and a
    reviewer falls in neither clause.

    Resolved to own work because the two outcomes are not symmetric. Guessing
    "project-wide" and being wrong shows a participant another coder's work
    during independent coding, which is the contamination R-4 exists to prevent
    and which cannot be undone once seen. Guessing "own" and being wrong shows
    an empty page. Raised in the task report.
  */
  return 'own';
}

/** What the page calls itself, per D-049: nobody should mistake which they read. */
export const VIEW_LABELS: Record<CodedDataView, string> = {
  own: 'Your coded work',
  projectWide: 'Project-wide view',
};
