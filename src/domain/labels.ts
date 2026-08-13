import type { ProjectPhase } from './types';

/**
 * How a project phase is written on screen.
 *
 * Here rather than on a page because two surfaces name it now — the Coded data
 * page's scenario control and the Project overview page's summary — and two
 * copies of a vocabulary drift the first time either is edited. The phase is a
 * domain value, so its wording is domain vocabulary.
 */
export const PHASE_LABELS: Record<ProjectPhase, string> = {
  setup: 'Setup',
  pilot: 'Pilot',
  independentCoding: 'Independent coding',
  review: 'Review',
  reflexivity: 'Reflexivity',
  recoding: 'Recoding',
  closed: 'Closed',
};
