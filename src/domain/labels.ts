import type { ProjectPhase, UserRole } from './types';

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

/**
 * How a role is written on screen in the prototype-support surface.
 *
 * Here rather than on a page for the same reason `PHASE_LABELS` is: two
 * surfaces name the role since D-071, and two copies of a vocabulary drift the
 * first time either is edited.
 *
 * The sidebar's switcher does not read this. Its options are the seeded users'
 * titles — "AFB Researcher", "Qualitative Lead" — because D-071 makes the
 * select's value the displayed title, and a title is who someone is where a
 * role is what they may do. Two vocabularies for one state, deliberately.
 *
 * Reviewer left with D-071: the sidebar offers two roles, and a support surface
 * offering a third would let a facilitator reach a state the sidebar could only
 * misreport. What that costs is the prototype's ability to put a participant in
 * the case `resolveCodedDataView` reasons about — a reviewer during independent
 * coding — and it is recorded rather than absorbed.
 */
export const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  coder: 'Coder',
  qualitativeLead: 'Qualitative lead',
};
