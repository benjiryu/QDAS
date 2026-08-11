import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../../data/seed';
import { buildCodeTree, flattenCodeTree, searchCodes } from './codeTree';
import type { Code } from '../../domain';

/**
 * Specification: docs/patterns/code-selection.md sections 4 and 5.
 *
 * Search matches the code name and the parent path, which are the two things
 * the panel puts on screen. Matching hidden text would put a code in front of a
 * coder with no visible reason for it being there.
 */

const fixture = createSeedFixture();
const tree = buildCodeTree(fixture.codes);
const nodes = flattenCodeTree(tree);

const search = (query: string) => searchCodes(tree, query);
const names = (query: string) => search(query).map((result) => result.code.name);

const has = (value: string, query: string) => value.toLowerCase().includes(query.toLowerCase());

/**
 * Asserts a phrase is genuinely in the fixture, in the field the test names,
 * and is in no name or parent path anywhere.
 *
 * Without the first half these tests would pass on a typo; without the second
 * they would pass for the wrong reason. Both are checked against the fixture
 * rather than assumed, so a codebook edit fails the test instead of quietly
 * emptying it.
 */
function hiddenPhrase(phrase: string, field: (code: Code) => string[]) {
  expect(
    fixture.codes.some((code) => field(code).some((value) => has(value, phrase))),
    `no fixture code carries "${phrase}" in the field under test`,
  ).toBe(true);

  const visible = nodes.flatMap((node) => [node.code.name, ...node.parentPath]);
  expect(
    visible.some((value) => has(value, phrase)),
    `"${phrase}" is visible on a row, so it cannot test hidden text`,
  ).toBe(false);
}

describe('matching what the panel shows', () => {
  it('finds a code by its name', () => {
    expect(names('Water access')).toContain('Water access');
  });

  it('ignores case', () => {
    expect(names('WATER ACCESS')).toEqual(names('water access'));
    expect(names('water access')).toContain('Water access');
  });

  it('matches inside a name, not only at its start', () => {
    // A coder typing the distinguishing word rather than the leading one.
    expect(names('pressure')).toContain('Water pressure');
  });

  it('reports a name match as such', () => {
    const result = search('Water pressure').find((entry) => entry.code.name === 'Water pressure')!;
    expect(result.matchedOn).toBe('name');
  });

  it('finds a child through its parent path', () => {
    // "Water pressure" does not contain "access"; its parent "Water access"
    // does, and the results region shows that path beside the row.
    const result = search('access').find((entry) => entry.code.name === 'Water pressure');

    expect(result).toBeDefined();
    expect(result!.matchedOn).toBe('parentPath');
    expect(result!.parentPath).toContain('Water access');
  });
});

describe('not matching what it does not', () => {
  it('does not match a phrase that is only in a short definition', () => {
    hiddenPhrase('Physical availability', (code) => [code.shortDefinition]);
    expect(search('Physical availability')).toEqual([]);
  });

  it('does not match a phrase that is only in a full definition', () => {
    hiddenPhrase('infrastructure, not the policy', (code) => [code.fullDefinition]);
    expect(search('infrastructure, not the policy')).toEqual([]);
  });

  it('does not match a phrase that is only in inclusion or exclusion criteria', () => {
    // The criteria branch was never in section 5 at all: the code searched it
    // without the specification ever asking.
    hiddenPhrase('distance, and carrying', (code) => [
      code.inclusionCriteria,
      code.exclusionCriteria,
    ]);
    expect(search('distance, and carrying')).toEqual([]);
  });

  it('does not match a synonym', () => {
    hiddenPhrase('spigots', (code) => code.synonyms);
    expect(search('spigots')).toEqual([]);
  });

  it('does not match a synonym that merely contains a visible word', () => {
    // "water supply" is a synonym on Water access, and "water" is in three
    // names, so this is the case a substring check would let through.
    hiddenPhrase('water supply', (code) => code.synonyms);
    expect(search('water supply')).toEqual([]);
  });
});

describe('what comes back', () => {
  it('returns nothing for an empty or whitespace query', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('trims the query rather than failing to match on it', () => {
    expect(names('  water access  ')).toEqual(names('water access'));
  });

  it('returns results in canonical order, never in relevance order', () => {
    const results = search('a');
    expect(results.length).toBeGreaterThan(1);

    const indexes = results.map((result) => result.code.canonicalOrderIndex);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('carries the parent path on every result, for identifying a matched child', () => {
    for (const result of search('water')) {
      const node = nodes.find((candidate) => candidate.code.codeId === result.code.codeId)!;
      expect(result.parentPath).toEqual(node.parentPath);
    }
  });

  it('matches every code whose name carries the query, and no others', () => {
    const expected = fixture.codes
      .filter((code) => has(code.name, 'water'))
      .map((code) => code.name);
    expect(expected.length).toBeGreaterThan(1);

    // Plus any code sitting under one of them, which matches on its path.
    const found = names('water');
    for (const name of expected) expect(found).toContain(name);
    for (const result of search('water')) {
      const visible = [result.code.name, ...result.parentPath];
      expect(visible.some((value) => has(value, 'water'))).toBe(true);
    }
  });
});
