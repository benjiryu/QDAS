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

function byCanonicalOrder(a: Code, b: Code): number {
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
export function searchCodes(nodes: CodeNode[], rawQuery: string): CodeSearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return [];

  const results: CodeSearchResult[] = [];

  for (const node of flattenCodeTree(nodes)) {
    const { code } = node;
    const has = (value: string) => value.toLowerCase().includes(query);

    let matchedOn: CodeSearchResult['matchedOn'] | null = null;
    if (has(code.name)) matchedOn = 'name';
    else if (node.parentPath.some(has)) matchedOn = 'parentPath';

    if (matchedOn) results.push({ code, parentPath: node.parentPath, matchedOn });
  }

  return results.sort((a, b) => byCanonicalOrder(a.code, b.code));
}
