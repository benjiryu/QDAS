/**
 * A tiny synthetic source for domain unit tests.
 *
 * Test-only. The committed seed fixture is realistic on purpose and is the
 * right thing to test scale against; it is the wrong thing to assert exact
 * boundary behaviour against, because every assertion would encode a sentence
 * position in a 330-sentence transcript and break whenever the fixture is
 * regenerated.
 *
 * Identifiers here are readable rather than opaque, which is acceptable in a
 * test builder and not acceptable in seeded data.
 */

import { resolveSource } from '../source';
import type { ResolvedSource } from '../source';
import type { Source, Speaker, SpeakerTurn, TranscriptSegment } from '../types';

export const TEST_SOURCE_ID = 'src-test';

/**
 * Builds a source from a list of turn lengths.
 *
 * `buildTestSource([3, 1, 4, 2])` gives four turns, alternating speakers, and
 * ten sentences numbered s0 through s9 in canonical order.
 */
export function buildTestSource(turnLengths: number[] = [3, 1, 4, 2]): ResolvedSource {
  const speakers: Speaker[] = [
    { speakerId: 'spk-a', sourceId: TEST_SOURCE_ID, label: 'Ana' },
    { speakerId: 'spk-b', sourceId: TEST_SOURCE_ID, label: 'Ben' },
  ];

  const segments: TranscriptSegment[] = [];
  const turns: SpeakerTurn[] = [];

  turnLengths.forEach((length, turnIndex) => {
    const turnId = `t${turnIndex}`;
    const speakerId = turnIndex % 2 === 0 ? 'spk-a' : 'spk-b';
    const segmentIds: string[] = [];

    for (let withinTurn = 0; withinTurn < length; withinTurn += 1) {
      const position = segments.length;
      const segmentId = `s${position}`;
      segmentIds.push(segmentId);
      segments.push({
        segmentId,
        sourceId: TEST_SOURCE_ID,
        turnId,
        speakerId,
        sequenceIndex: position,
        startTimeMs: position * 5000,
        endTimeMs: position * 5000 + 4000,
        text: `Sentence ${position}.`,
      });
    }

    turns.push({
      turnId,
      sourceId: TEST_SOURCE_ID,
      speakerId,
      sequenceIndex: turnIndex,
      segmentIds,
    });
  });

  const source: Source = {
    sourceId: TEST_SOURCE_ID,
    projectId: 'prj-test',
    title: 'Test source',
    kind: 'transcript',
    speakerCount: speakers.length,
    segmentCount: segments.length,
    durationMs: segments.length * 5000,
  };

  return resolveSource({ source, segments, turns, speakers });
}
