import { bumpVersionIfEdited } from '../../data/codebookStore';
import { writeSimulatedSession } from '../../data/simulatedSession';
import type { Id, ProjectPhase } from '../../domain';

/**
 * Moving a project to another phase, which is where the codebook version bumps.
 *
 * Specification: decision D-070 — "the codebook version bumps at the phase
 * boundary when edits occurred, so a round always references one stable
 * version".
 *
 * One function so the boundary is a place rather than a convention. The phase is
 * written from the Coded data page's scenario control and nothing observes it,
 * so a bump left to the caller would be a line somebody has to remember to copy
 * the next time a phase can change.
 *
 * At the boundary and not at the edit, so a version covers a body of work rather
 * than a keystroke, and so a round never sees its own codebook's label move.
 */
export function changePhase(projectId: Id, phase: ProjectPhase, seededLabel: string): void {
  bumpVersionIfEdited(projectId, seededLabel);
  writeSimulatedSession({ phase });
}
