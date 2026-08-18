/**
 * What each code family's colour is called on screen.
 *
 * Specification: docs/pages/destinations.md section 1, decision D-047 — "Color:
 * [name] with its swatch", a read-only labelled value.
 *
 * ## Why this is a map and not `code.colorToken`
 *
 * The fixture's tokens stopped describing their hues. `code-color-moss` renders
 * red and `code-color-amber` renders cerulean, which `src/index.css` already
 * records: the hue assignment was made in canonical family order from the nine
 * shade-1 tokens that clear 3:1 on white, and the token names were never
 * revisited. They are opaque identifiers.
 *
 * Naming a family "Moss" beside a red border would be wrong for every reader and
 * worst for the one this text exists for. Section 1 leans on the colour name to
 * mitigate the low-contrast borders, so the name has to be the hue actually
 * drawn — it is the only colour channel a screen reader user has.
 *
 * Paired with the `[data-color-token=...]` rules in `src/index.css`: that file
 * decides which hue a token draws, this one decides what that hue is called.
 * They can drift, so a browser test reads each card's rendered border and checks
 * it against the token for the name claimed here.
 *
 * Retiring this file means renaming the fixture's tokens to match their hues,
 * which is a wider change than D-047 and is raised in the task report.
 */

const HUE_NAMES: Record<string, string> = {
  'code-color-moss': 'Red',
  'code-color-clay': 'Coral',
  'code-color-indigo': 'Dark green',
  'code-color-amber': 'Cerulean',
  'code-color-slate': 'Blue',
  'code-color-rust': 'Purple',
  /* The three a new family can be given, per D-070. Named for the hue they
     actually draw, which the six above stopped doing. */
  'code-color-violet': 'Violet',
  'code-color-pink': 'Pink',
  'code-color-rose': 'Rose',
  /* Provisional codes draw in the muted grey, not a family hue. */
  'code-color-provisional': 'Not assigned',
};

/**
 * The hues a new family may be given, per D-070's "a pick from the unused named
 * token hues, never a free color wheel".
 *
 * The six in use are absent because a hue identifies a family, and two families
 * drawing the same one would make the transcript's family highlight ambiguous.
 * The other four unclaimed ramps — orange, yellow, light green, sea green — are
 * absent because the token audit measures their shade-1 borders under the 3:1 a
 * non-text boundary needs on white.
 */
export const ASSIGNABLE_HUES: readonly { colorToken: string; name: string }[] = [
  { colorToken: 'code-color-violet', name: 'Violet' },
  { colorToken: 'code-color-pink', name: 'Pink' },
  { colorToken: 'code-color-rose', name: 'Rose' },
];

/**
 * The hue name for a token, or null where there is none to state.
 *
 * Null rather than a placeholder: a card with no colour to report should render
 * no colour row at all, rather than a label with nothing after it.
 */
export function hueNameFor(colorToken: string): string | null {
  return HUE_NAMES[colorToken] ?? null;
}

/** For the drift test, which needs the whole set rather than one lookup. */
export const FAMILY_HUE_NAMES = HUE_NAMES;
