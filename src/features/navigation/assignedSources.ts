/**
 * The sources this coder is assigned in the active round.
 *
 * Specification: decision R-4, docs/pages/destinations.md shared rules.
 *
 * Lifted out of `ProjectPage` when the sidebar came to need the same list, so
 * the page body and the navigation cannot list different sources.
 *
 * R-4 is the reason this filters rather than listing everything: coder
 * identities stay hidden until independent coding closes, and the seeded second
 * and third coders have work in this project that none of these surfaces show.
 */

import type { Id, Source, WorkAssignment } from '../../domain';

export function assignedSources(
  sources: Source[],
  workAssignments: WorkAssignment[],
  userId: Id,
  codingRoundId: Id,
): Source[] {
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));

  return workAssignments
    .filter(
      (assignment) =>
        assignment.userId === userId && assignment.codingRoundId === codingRoundId,
    )
    .map((assignment) => sourceById.get(assignment.sourceId))
    .filter((source): source is Source => source !== undefined);
}
