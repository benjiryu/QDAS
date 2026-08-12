import { describe, expect, it } from 'vitest';

/**
 * The tokens-only rule, enforced.
 *
 * Specification: docs/project-management/build-sequence.md Task 22, and the
 * header of tokens.css: "component CSS references tokens, never raw values".
 *
 * A review can catch a raw colour once. It cannot catch the fifth one added on
 * a busy afternoon six weeks from now, which is how a token system quietly
 * stops being one. This makes that a test failure instead.
 *
 * There is no allowlist and this file does not exempt itself, so it can carry
 * no colour literal of its own — not even in an example. That is deliberate: an
 * exempted file is exactly where drift would hide.
 */

/**
 * Read through Vite rather than through `node:fs`, so this stays inside the
 * browser-facing project: `tsconfig.app.json` deliberately carries no node
 * types, and adding them here would let application code reach for `process`
 * and still typecheck.
 */
const SOURCES: Record<string, string> = import.meta.glob('/src/**/*.{css,ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const TOKEN_FILE = '/src/styles/tokens.css';

/**
 * A colour, not any other use of the character.
 *
 * Three, four, six, or eight digits, ending at a word boundary. A CSS id
 * selector and a URL fragment do not match, because their first character is
 * not a hex digit.
 */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

interface Offence {
  file: string;
  line: number;
  literal: string;
}

function findLiterals(): Offence[] {
  const offences: Offence[] = [];

  for (const [file, contents] of Object.entries(SOURCES)) {
    if (file === TOKEN_FILE) continue;

    contents.split('\n').forEach((text, index) => {
      for (const match of text.matchAll(HEX_COLOUR)) {
        offences.push({ file, line: index + 1, literal: match[0] });
      }
    });
  }

  return offences;
}

describe('the tokens-only rule', () => {
  it('finds no colour literal anywhere under src, outside the token file', () => {
    const offences = findLiterals();

    // Named and located, so the failure says what to fix rather than that
    // something somewhere is wrong.
    expect(
      offences.map(({ file, line, literal }) => `${file}:${line} ${literal}`),
    ).toEqual([]);
  });

  it('reads the token file, so the walk is not silently finding nothing', () => {
    // Guards the guard. If the walk broke, or the extensions stopped matching,
    // the test above would pass by looking at no files at all.
    const scanned = Object.keys(SOURCES);

    expect(scanned).toContain(TOKEN_FILE);
    expect(scanned).toContain('/src/index.css');
    expect(scanned.filter((file) => file.endsWith('.css')).length).toBeGreaterThan(5);
    expect(scanned.length).toBeGreaterThan(40);
    // And the contents really arrived, rather than a map of empty strings.
    expect(SOURCES[TOKEN_FILE]).toContain('--font-family');
  });

  it('recognises a colour literal, and leaves other uses of the character alone', () => {
    const colour = ['#', 'abc'].join('');
    const withAlpha = ['#', '11223344'].join('');
    const selector = ['#', 'root'].join('');
    const fragment = ['#', 'main-content'].join('');

    expect(colour.match(HEX_COLOUR)).toEqual([colour]);
    expect(withAlpha.match(HEX_COLOUR)).toEqual([withAlpha]);
    expect(selector.match(HEX_COLOUR)).toBeNull();
    expect(fragment.match(HEX_COLOUR)).toBeNull();
  });
});
