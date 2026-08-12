/**
 * Search across the whole code record, for the Codebook page.
 *
 * Specification: docs/pages/destinations.md section 1.
 *
 * Deliberately wider than the panel's `searchCodes`, and the difference is the
 * point rather than an inconsistency.
 *
 * The panel matches names and parent paths only, because a panel row shows a
 * name and a colour pill and nothing else: a result matched on text the coder
 * cannot see is a code appearing for no visible reason, which is worse than not
 * finding it. This page shows every definition and both criteria inline, so
 * that reason does not hold here. A hit on a definition is a hit the coder can
 * read the cause of, one line down.
 *
 * Section 1 asks for exactly this — "matches name, definitions, and criteria" —
 * and the same sentence calls it the panel's semantics, which it no longer is.
 * The conflict is recorded in the task report; this file is the wider half.
 *
 * Results come back in canonical order, never in relevance order. A list that
 * reorders itself between queries is what code-selection.md section 4 rules out,
 * and it holds here for the same reason.
 */

import { byCanonicalOrder, flattenCodeTree } from '../codes/codeTree';
import type { CodeNode } from '../codes/codeTree';
import type { Code } from '../../domain';

/**
 * Which field matched, so the page can say why a record is in the results.
 *
 * Its own type rather than a wider `CodeSearchResult`: the panel's union has
 * two members and should keep having two, since it can only ever match on those.
 */
export type CodebookMatchField =
  | 'name'
  | 'parentPath'
  | 'shortDefinition'
  | 'fullDefinition'
  | 'inclusionCriteria'
  | 'exclusionCriteria';

export interface CodebookSearchResult {
  code: Code;
  parentPath: string[];
  matchedOn: CodebookMatchField;
}

/** What each field is called on screen, for the "matched in" line. */
export const MATCH_FIELD_LABELS: Record<CodebookMatchField, string> = {
  name: 'name',
  parentPath: 'parent code',
  shortDefinition: 'short definition',
  fullDefinition: 'full definition',
  inclusionCriteria: 'inclusion criteria',
  exclusionCriteria: 'exclusion criteria',
};

/**
 * The order fields are tested in, which is the order they are reported in.
 *
 * Name first so a code whose name matches is never reported as matching on a
 * definition, which would be true but unhelpful.
 */
const FIELDS: { field: CodebookMatchField; read: (code: Code) => string }[] = [
  { field: 'name', read: (code) => code.name },
  { field: 'shortDefinition', read: (code) => code.shortDefinition },
  { field: 'fullDefinition', read: (code) => code.fullDefinition },
  { field: 'inclusionCriteria', read: (code) => code.inclusionCriteria },
  { field: 'exclusionCriteria', read: (code) => code.exclusionCriteria },
];

export function searchCodebook(nodes: CodeNode[], rawQuery: string): CodebookSearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return [];

  const results: CodebookSearchResult[] = [];

  for (const node of flattenCodeTree(nodes)) {
    const { code } = node;
    const has = (value: string) => value.toLowerCase().includes(query);

    let matchedOn: CodebookMatchField | null = null;
    for (const { field, read } of FIELDS) {
      if (has(read(code))) {
        matchedOn = field;
        break;
      }
    }
    // Checked after the record's own fields, so a code is reported as matching
    // itself wherever it can be.
    if (!matchedOn && node.parentPath.some(has)) matchedOn = 'parentPath';

    if (matchedOn) results.push({ code, parentPath: node.parentPath, matchedOn });
  }

  return results.sort((a, b) => byCanonicalOrder(a.code, b.code));
}
