import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../data/seed';
import {
  SAME_EXCERPT_JACCARD,
  isSameExcerpt,
  jaccard,
  sameExcerptCoderIds,
  sentenceSet,
} from './sameExcerpt';
import { resolveSource } from './source';
import { buildTestSource } from './testing/buildTestSource';
import type { Excerpt } from './types';

/**
 * Specification: decision D-066, and R-1, which resolved the comparison unit
 * for overlap to the sentence.
 *
 * The threshold is what these tests are really about. D-066 calls it
 * provisional and expects it to move on session evidence, so what has to hold
 * is that the boundary behaves as the decision states — "0.5 or above" — and
 * that the number itself lives in one place.
 */

const resolved = buildTestSource([12]); // one turn, s0 to s11

function excerptOver(spec: {
  excerptId: string;
  from: number;
  to: number;
  coderId: string;
  sourceId?: string;
}): Excerpt {
  return {
    excerptId: spec.excerptId,
    sourceId: spec.sourceId ?? resolved.source.sourceId,
    startSegmentId: `s${spec.from}`,
    endSegmentId: `s${spec.to}`,
    startOffset: 0,
    endOffset: 11,
    coderId: spec.coderId,
    codingRoundId: 'rd-test',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

const setOver = (from: number, to: number) =>
  sentenceSet(resolved, excerptOver({ excerptId: 'ex', from, to, coderId: 'us-a' }));

describe('how much two sentence sets share', () => {
  it('is 1 for identical ranges', () => {
    expect(jaccard(setOver(2, 5), setOver(2, 5))).toBe(1);
  });

  it('is 0 for ranges that touch no sentence in common', () => {
    expect(jaccard(setOver(0, 2), setOver(5, 7))).toBe(0);
  });

  it('counts sentences either touches in the denominator', () => {
    // D-066: "the sentences both touch, divided by the sentences either
    // touches". Containment is where a shared-over-smaller measure would part
    // company: it would score this 1 and call a four-sentence excerpt the same
    // as the one sentence inside it.
    expect(jaccard(setOver(0, 3), setOver(1, 1))).toBe(1 / 4);
  });

  it('ignores where in a sentence each range starts and stops', () => {
    /*
      R-1 and D-036 in one assertion. Storage keeps exact characters because
      boundary variation between coders is data; comparison happens a level up,
      at the sentence, so two coders who read the same three sentences and
      disagree about where the first one begins have read the same passage.

      This is the test that fails if the comparison is ever "improved" to
      characters.
    */
    const a = excerptOver({ excerptId: 'ex-a', from: 1, to: 3, coderId: 'us-a' });
    const b = { ...a, excerptId: 'ex-b', coderId: 'us-b', startOffset: 5, endOffset: 4 };

    expect(jaccard(sentenceSet(resolved, a), sentenceSet(resolved, b))).toBe(1);
  });

  it('is 0 rather than NaN when a set is empty', () => {
    // A valid range always touches a sentence, so this is defensive. 0 is the
    // answer that stops a caller reporting an overlap nothing measured.
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(jaccard(setOver(0, 2), new Set())).toBe(0);
  });
});

describe('the same-excerpt threshold', () => {
  it('is met just above it', () => {
    // s1..s5 and s1..s3: 3 shared of 5 touched, 0.6.
    expect(jaccard(setOver(1, 5), setOver(1, 3))).toBeCloseTo(0.6);
    expect(isSameExcerpt(setOver(1, 5), setOver(1, 3))).toBe(true);
  });

  it('is not met just below it', () => {
    // s1..s5 and s1..s2: 2 shared of 5 touched, 0.4.
    expect(jaccard(setOver(1, 5), setOver(1, 2))).toBeCloseTo(0.4);
    expect(isSameExcerpt(setOver(1, 5), setOver(1, 2))).toBe(false);
  });

  it('is 0.5, so retuning it is a deliberate edit with a failing test attached', () => {
    // D-066 expects this number to move on session evidence. Pinned so that it
    // moves on purpose rather than in passing.
    expect(SAME_EXCERPT_JACCARD).toBe(0.5);
  });

  it('is met exactly on it, because D-066 says "0.5 or above"', () => {
    // s0..s3 and s0..s1: 2 shared of 4 touched. The one assertion that pins
    // the comparison as inclusive rather than strict.
    expect(jaccard(setOver(0, 3), setOver(0, 1))).toBe(SAME_EXCERPT_JACCARD);
    expect(isSameExcerpt(setOver(0, 3), setOver(0, 1))).toBe(true);
  });

  it('is met by identical ranges and not by disjoint ones', () => {
    expect(isSameExcerpt(setOver(2, 5), setOver(2, 5))).toBe(true);
    expect(isSameExcerpt(setOver(0, 2), setOver(5, 7))).toBe(false);
  });
});

describe('which other coders coded the same excerpt', () => {
  const mine = excerptOver({ excerptId: 'ex-mine', from: 1, to: 5, coderId: 'us-a' });

  it('names a coder whose excerpt meets the threshold', () => {
    const theirs = excerptOver({ excerptId: 'ex-theirs', from: 1, to: 3, coderId: 'us-b' });

    expect(sameExcerptCoderIds(resolved, mine, [mine, theirs])).toEqual(['us-b']);
  });

  it('says nothing about a coder whose excerpt falls below it', () => {
    const theirs = excerptOver({ excerptId: 'ex-theirs', from: 1, to: 2, coderId: 'us-b' });

    expect(sameExcerptCoderIds(resolved, mine, [mine, theirs])).toEqual([]);
  });

  it('never names the excerpt’s own coder', () => {
    // D-066 is about two coders. A coder who captured the same passage twice is
    // not disagreeing with anybody, and "also coded by" naming yourself would
    // be nonsense on the page.
    const again = excerptOver({ excerptId: 'ex-again', from: 1, to: 5, coderId: 'us-a' });

    expect(sameExcerptCoderIds(resolved, mine, [mine, again])).toEqual([]);
  });

  it('never reaches across sources', () => {
    // Segment identifiers are unique across sources, so this would score zero
    // anyway. The guard is here so the rule does not depend on that.
    const elsewhere = excerptOver({
      excerptId: 'ex-elsewhere',
      from: 1,
      to: 5,
      coderId: 'us-b',
      sourceId: 'src-other',
    });

    expect(sameExcerptCoderIds(resolved, mine, [mine, elsewhere])).toEqual([]);
  });

  it('names every matching coder, each once', () => {
    const b1 = excerptOver({ excerptId: 'ex-b1', from: 1, to: 4, coderId: 'us-b' });
    const b2 = excerptOver({ excerptId: 'ex-b2', from: 2, to: 5, coderId: 'us-b' });
    const c1 = excerptOver({ excerptId: 'ex-c1', from: 1, to: 5, coderId: 'us-c' });

    expect(sameExcerptCoderIds(resolved, mine, [mine, b1, b2, c1])).toEqual(['us-b', 'us-c']);
  });
});

describe('against the seeded fixture', () => {
  const fixture = createSeedFixture();
  const sourceA = fixture.sources[0];
  const seeded = resolveSource({
    source: sourceA,
    segments: fixture.segments.filter((segment) => segment.sourceId === sourceA.sourceId),
    turns: fixture.turns.filter((turn) => turn.sourceId === sourceA.sourceId),
    speakers: fixture.speakers.filter((speaker) => speaker.sourceId === sourceA.sourceId),
  });
  const byId = new Map(fixture.excerpts.map((excerpt) => [excerpt.excerptId, excerpt]));
  const ratio = (a: string, b: string) =>
    jaccard(sentenceSet(seeded, byId.get(a)!), sentenceSet(seeded, byId.get(b)!));

  /*
    The measured overlap of every cross-coder pair the fixture seeds, pinned
    here so that a change to a seeded range is reported rather than absorbed.
    Without this, an edit could quietly leave the prototype with nothing above
    the threshold to demonstrate.
  */
  it('holds one pair well above the threshold', () => {
    expect(ratio('ex-5806e4b2', 'ex-4f92d7c1')).toBeCloseTo(0.8);
    expect(isSameExcerpt(sentenceSet(seeded, byId.get('ex-5806e4b2')!), sentenceSet(seeded, byId.get('ex-4f92d7c1')!))).toBe(true);
  });

  it('holds one pair exactly on it, which is the older pair and was luck', () => {
    expect(ratio('ex-4b8e30da', 'ex-77e0ac53')).toBe(0.5);
  });

  it('holds four pairs below it', () => {
    expect(ratio('ex-9d27b014', 'ex-5c1908be')).toBeCloseTo(2 / 7);
    expect(ratio('ex-d1750ae6', 'ex-6c40b8ff')).toBeCloseTo(2 / 7);
    expect(ratio('ex-c47b2059', 'ex-90e3f471')).toBeCloseTo(2 / 7);
    expect(ratio('ex-6a3d80e1', 'ex-08fc71a5')).toBe(0.25);
  });

  it('finds no same-excerpt partner for an excerpt nobody else touched', () => {
    const alone = byId.get('ex-0a41f7c3')!;

    expect(sameExcerptCoderIds(seeded, alone, fixture.excerpts)).toEqual([]);
  });
});
