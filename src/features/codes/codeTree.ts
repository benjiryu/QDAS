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
  /** Which field matched, for the result's supporting text. */
  matchedOn: 'name' | 'definition' | 'criteria' | 'synonym' | 'parentPath';
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
 * Search over name, short and full definition, inclusion and exclusion
 * criteria, parent path, and synonyms, per section 5.
 *
 * Results come back in canonical order, not in relevance order. A list that
 * reorders itself between queries is the thing section 4 rules out, and the
 * pair of similarly named codes in the fixture is meant to be told apart by
 * reading definitions rather than by trusting a ranking.
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
    else if (has(code.shortDefinition) || has(code.fullDefinition)) matchedOn = 'definition';
    else if (has(code.inclusionCriteria) || has(code.exclusionCriteria)) matchedOn = 'criteria';
    else if (code.synonyms.some(has)) matchedOn = 'synonym';
    else if (node.parentPath.some(has)) matchedOn = 'parentPath';

    if (matchedOn) results.push({ code, parentPath: node.parentPath, matchedOn });
  }

  return results.sort((a, b) => byCanonicalOrder(a.code, b.code));
}
