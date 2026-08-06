/**
 * Project, people, and round. Synthetic.
 *
 * Specification: docs/testing/seed-data.md section 2.2, docs/domain-model.md.
 *
 * The transcripts these refer to are invented for this repository. No real
 * research material appears anywhere in src/data/seed.
 *
 * Identifiers are opaque literals, assigned once and committed, per
 * domain-model.md section 2. Nothing derives order or meaning from them.
 */

import type { CodingRound, Project, User, WorkAssignment } from '../../domain/types';

export const PROJECT_ID = 'pr-c5a91d7e40';
export const CODEBOOK_VERSION_ID = 'cv-71b3e94a05';
export const CODING_ROUND_ID = 'rd-2e0d61fb88';

/** The person running the session. The role switcher stands in for auth. */
export const CURRENT_CODER_ID = 'us-4b17c0d922';
/** The simulated second coder whose work is already in the fixture. */
export const SECOND_CODER_ID = 'us-a93f2e5b71';
/** A third coder, present so that overlapping excerpts have two authors. */
export const THIRD_CODER_ID = 'us-6d208ac413';
export const QUALITATIVE_LEAD_ID = 'us-f52c9b3e07';

export const users: User[] = [
  { userId: CURRENT_CODER_ID, displayName: 'Sam Okafor', role: 'coder' },
  { userId: SECOND_CODER_ID, displayName: 'Dana Whitfield', role: 'coder' },
  { userId: THIRD_CODER_ID, displayName: 'Priya Raman', role: 'coder' },
  { userId: QUALITATIVE_LEAD_ID, displayName: 'Nadia Okonkwo', role: 'qualitativeLead' },
];

export const project: Project = {
  projectId: PROJECT_ID,
  name: 'Community garden participation study',
  description:
    'Interviews with plot holders at a city community garden, examining what supports and ' +
    'what limits sustained participation.',
  activeCodebookVersionId: CODEBOOK_VERSION_ID,
  activeCodingRoundId: CODING_ROUND_ID,
  phase: 'independentCoding',
};

export const codingRound: CodingRound = {
  codingRoundId: CODING_ROUND_ID,
  projectId: PROJECT_ID,
  label: 'Round 1, independent coding',
  phase: 'independentCoding',
  opensAt: '2026-06-01T00:00:00.000Z',
  closesAt: '2026-09-30T00:00:00.000Z',
};

/**
 * Two coders per source, which is what makes the review phase in slice 3 have
 * anything to compare. Source identifiers come from the generated transcripts.
 */
export function workAssignmentsFor(sourceAId: string, sourceBId: string): WorkAssignment[] {
  return [
    {
      assignmentId: 'wa-0c73f1a284',
      projectId: PROJECT_ID,
      userId: CURRENT_CODER_ID,
      sourceId: sourceAId,
      codingRoundId: CODING_ROUND_ID,
      requiredCoderCount: 2,
      status: 'inProgress',
    },
    {
      assignmentId: 'wa-8e41b60d3f',
      projectId: PROJECT_ID,
      userId: CURRENT_CODER_ID,
      sourceId: sourceBId,
      codingRoundId: CODING_ROUND_ID,
      requiredCoderCount: 2,
      status: 'notStarted',
    },
    {
      assignmentId: 'wa-5a92e7c130',
      projectId: PROJECT_ID,
      userId: SECOND_CODER_ID,
      sourceId: sourceAId,
      codingRoundId: CODING_ROUND_ID,
      requiredCoderCount: 2,
      status: 'complete',
    },
    {
      assignmentId: 'wa-1f60d8b4e2',
      projectId: PROJECT_ID,
      userId: SECOND_CODER_ID,
      sourceId: sourceBId,
      codingRoundId: CODING_ROUND_ID,
      requiredCoderCount: 2,
      status: 'complete',
    },
    {
      assignmentId: 'wa-b304a7f591',
      projectId: PROJECT_ID,
      userId: THIRD_CODER_ID,
      sourceId: sourceAId,
      codingRoundId: CODING_ROUND_ID,
      requiredCoderCount: 2,
      status: 'complete',
    },
  ];
}
