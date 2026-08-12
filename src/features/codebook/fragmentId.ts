/**
 * The fragment identifier for one code record.
 *
 * Specification: docs/pages/destinations.md section 1, "each code has a stable
 * fragment id so future surfaces can link to one code".
 *
 * Its own module rather than an export from the page, so a component file
 * exports only components and the link-building side keeps working when the
 * page is refactored.
 */
export function codeFragmentId(codeId: string): string {
  return `code-${codeId}`;
}
