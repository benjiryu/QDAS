import type { ProjectPhase, UserRole } from '../../domain';

/**
 * Who may edit the codebook, and when.
 *
 * Specification: decision D-070's gate.
 *
 * Its own resolver rather than a reuse of `resolveCodedDataView`'s phase
 * ordering: that one asks whether a phase is past another, and this one asks
 * whether a phase is in a set. Writing set membership as two comparisons
 * against an ordering is how a list gains a member nobody meant to add.
 *
 * The point of the gate is structural rather than procedural. A codebook that
 * cannot change while a round is open means a round always references one
 * stable version, so mid-round vocabulary drift is impossible rather than
 * discouraged — and every assignment already records the version it was made
 * against.
 */

/** Phases with no coding round open, per D-070. */
const EDITABLE_PHASES: ReadonlySet<ProjectPhase> = new Set<ProjectPhase>([
  'setup',
  'review',
  'recoding',
]);

export function canEditCodebook(role: UserRole, phase: ProjectPhase): boolean {
  return role === 'qualitativeLead' && EDITABLE_PHASES.has(phase);
}
