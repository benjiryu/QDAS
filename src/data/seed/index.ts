/**
 * The committed synthetic fixture.
 *
 * Specification: docs/testing/seed-data.md sections 2.2 and 4.
 *
 * Invented content on a neutral topic. No real research material is in this
 * directory or in scripts/seed-sources. Real deidentified AFB material loads at
 * runtime from gitignored `data-local/`, per D-007 and D-025.
 *
 * The transcripts are generated. Regenerate with:
 *   node scripts/convert-transcript.mjs
 */

import type {
  Code,
  CodeAssignment,
  CodebookVersion,
  CodingRound,
  Excerpt,
  Note,
  Project,
  Source,
  Speaker,
  SpeakerTurn,
  TranscriptSegment,
  User,
  WorkAssignment,
} from '../../domain/types';

import { codebookVersion, codes } from './codebook';
import { codeAssignments, excerpts, notes } from './excerpts';
import { codingRound, project, users, workAssignmentsFor } from './project';
import {
  segmentsA,
  segmentsB,
  sourceA,
  sourceB,
  speakersA,
  speakersB,
  turnsA,
  turnsB,
} from './transcripts.generated';

export interface SeedFixture {
  project: Project;
  users: User[];
  codingRound: CodingRound;
  workAssignments: WorkAssignment[];
  sources: Source[];
  speakers: Speaker[];
  turns: SpeakerTurn[];
  segments: TranscriptSegment[];
  codes: Code[];
  codebookVersion: CodebookVersion;
  excerpts: Excerpt[];
  codeAssignments: CodeAssignment[];
  notes: Note[];
}

/**
 * Built fresh on each call, so a session reset returns a known state rather
 * than whatever the previous participant left behind. Seed data section 5.
 *
 * Deep copied, not shared. Handing out the module-level arrays would mean a
 * participant's session could mutate the fixture the next reset restores from,
 * and the smoke test item that checks for a clean state would still pass.
 */
export function createSeedFixture(): SeedFixture {
  return structuredClone({
    project,
    users,
    codingRound,
    workAssignments: workAssignmentsFor(sourceA.sourceId, sourceB.sourceId),
    sources: [sourceA, sourceB],
    speakers: [...speakersA, ...speakersB],
    turns: [...turnsA, ...turnsB],
    segments: [...segmentsA, ...segmentsB],
    codes,
    codebookVersion,
    excerpts,
    codeAssignments,
    notes,
  });
}

export { codes, codebookVersion } from './codebook';
export { excerpts, codeAssignments, notes } from './excerpts';
export { project, users, codingRound } from './project';
export { sourceA, sourceB } from './transcripts.generated';
