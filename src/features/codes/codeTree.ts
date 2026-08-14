/**
 * The codebook as a hierarchy, and search over it.
 *
 * Specification: docs/patterns/code-selection.md sections 4 and 5.
 *
 * Pure. No React, no DOM.
 *
 * Order comes from the stored `canonicalOrderIndex` and from nothing else.
 * Section 4: the index is computed once at import or approval and stored, so
 * that renaming a code does not silently move it, and order never changes with
 * frequency, recency, or relevance. That last clause is why search results are
 * a separate region rather than a re-sorted codebook.
 */

import type { Code, Id } from '../../domain';

export interface CodeNode {
  code: Code;
  /** 0 for a top-level code. */
  depth: number;
  /** Names of the ancestors, outermost first. */
  parentPath: string[];
  children: CodeNode[];
}

export interface CodeSearchResult {
  code: Code;
  parentPath: string[];
  /**
   * Which field matched. The two are worth keeping apart: a parent path match
   * is the one case where the reason is not the row's own name, and the panel
   * renders the path beside exactly those rows.
   */
  matchedOn: 'name' | 'parentPath';
}

/**
 * A code's lineage, as the sentence a screen reader hears.
 *
 * Specification: D-054, reused verbatim by D-062 for the Coded Data filters.
 *
 * Shared so the panel and the filter list cannot word it differently: the same
 * relation said two ways is the drift the "one component, one label" rule
 * exists to stop, and here the two surfaces are far enough apart to drift
 * quietly.
 *
 * Outermost first — "in Water access, Rules" for a grandchild — so the path
 * reads general to specific while the row as a whole reads specific to general:
 * the code, then its family. Null where there is no lineage; "in" with nothing
 * after it is worse than silence.
 */
export function lineageDescription(lineage: readonly string[]): string | null {
  return lineage.length > 0 ? `in ${lineage.join(', ')}` : null;
}

/**
 * Lookup order for the Coded Data filter list, per D-062.
 *
 * Families alphabetical, then depth-first within a family with siblings
 * alphabetical — which is one path comparison rather than three rules, since
 * comparing `[...lineage, name]` element by element produces exactly that
 * traversal.
 *
 * Deliberately not canonical order, and deliberately only here. The codebook
 * and the panel teach the vocabulary in the order it was authored; this is a
 * lookup surface, and lookup wants alphabet. Scoping is what makes the
 * divergence defensible, so this comparator has one caller by design.
 */
export function byLookupPath(a: readonly string[], b: readonly string[]): number {
  const depth = Math.min(a.length, b.length);
  for (let index = 0; index < depth; index += 1) {
    const order = a[index].localeCompare(b[index], undefined, { sensitivity: 'base' });
    if (order !== 0) return order;
  }
  // A parent precedes its own descendants, which is what depth-first means.
  return a.length - b.length;
}

/** Shared with the Codebook page, so the two surfaces cannot order differently. */
export function byCanonicalOrder(a: Code, b: Code): number {
  return a.canonicalOrderIndex - b.canonicalOrderIndex;
}

/**
 * Builds the tree. Codes whose parent is missing are treated as roots rather
 * than dropped, so a codebook with a broken reference still renders every code
 * a coder might need.
 */
export function buildCodeTree(codes: Code[]): CodeNode[] {
  const byId = new Map(codes.map((code) => [code.codeId, code]));
  const childrenOf = new Map<Id | null, Code[]>();

  for (const code of codes) {
    const parentId = code.parentCodeId !== null && byId.has(code.parentCodeId) ? code.parentCodeId : null;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(code);
    else childrenOf.set(parentId, [code]);
  }

  const build = (parentId: Id | null, depth: number, parentPath: string[]): CodeNode[] =>
    (childrenOf.get(parentId) ?? [])
      .slice()
      .sort(byCanonicalOrder)
      .map((code) => ({
        code,
        depth,
        parentPath,
        children: build(code.codeId, depth + 1, [...parentPath, code.name]),
      }));

  return build(null, 0, []);
}

/** Every node in display order, parents before their children. */
export function flattenCodeTree(nodes: CodeNode[]): CodeNode[] {
  return nodes.flatMap((node) => [node, ...flattenCodeTree(node.children)]);
}

export function parentPathOf(nodes: CodeNode[], codeId: Id): string[] {
  const match = flattenCodeTree(nodes).find((node) => node.code.codeId === codeId);
  return match?.parentPath ?? [];
}

/**
 * Search over the code name and the parent path, and nothing else.
 *
 * Only what the panel displays. The rows carry a name and a colour pill; the
 * results region adds the parent path. Matching on definitions, criteria, or
 * synonyms would put a code in front of a coder with no visible reason for it
 * being there and no way to find out, which is worse than not finding it.
 *
 * The cost is real and belongs to the research team: a coder who remembers a
 * phrase from a definition can no longer reach the code by typing it, and the
 * fixture's deliberately similar name pairs have no disambiguation channel left
 * inside the panel. Recorded in the task report.
 *
 * Results come back in canonical order, not in relevance order. A list that
 * reorders itself between queries is the thing section 4 rules out.
 */
/**
 * Whether a code matches a query, and on which field.
 *
 * Extracted so the panel's search and the Coded Data filter search cannot drift
 * into matching different things. They differ in what they do with the answer —
 * the panel returns results in canonical order, the filter list keeps D-062's
 * lookup order — but a coder typing the same letters on either surface should
 * find the same codes.
 *
 * Null where nothing matches, and null for an empty query: a blank field is not
 * a search that everything passes.
 */
export function matchCode(
  name: string,
  lineage: readonly string[],
  rawQuery: string,
): CodeSearchResult['matchedOn'] | null {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return null;

  const has = (value: string) => value.toLowerCase().includes(query);
  if (has(name)) return 'name';
  if (lineage.some(has)) return 'parentPath';
  return null;
}

export function searchCodes(nodes: CodeNode[], rawQuery: string): CodeSearchResult[] {
  const results: CodeSearchResult[] = [];

  for (const node of flattenCodeTree(nodes)) {
    const matchedOn = matchCode(node.code.name, node.parentPath, rawQuery);
    if (matchedOn) results.push({ code: node.code, parentPath: node.parentPath, matchedOn });
  }

  return results.sort((a, b) => byCanonicalOrder(a.code, b.code));
}
