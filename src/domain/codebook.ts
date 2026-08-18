/**
 * Making and changing codes.
 *
 * Specification: decision D-070, which makes the codebook editable, and D-046,
 * which decided a code record is a name and one open-ended definition.
 *
 * Pure. What a valid draft is, where a new code lands in canonical order, and
 * which codes may be a parent — none of which needs a panel to be true, and all
 * of which is easier to argue with here than through a form.
 *
 * The gate is not here. Who may edit and when is a role and phase question,
 * answered in `src/features/codebook/resolveCodebookEditing.ts`, because the
 * domain reads no session.
 */

import type { Code, Id } from './types';

/**
 * What the editor collects.
 *
 * A name and a definition, per D-046 — the same two fields the record itself
 * carries — plus the two placement choices D-070 adds. `colorToken` is null
 * wherever a parent is chosen, since a descendant wears its family's hue.
 */
export interface CodeDraft {
  name: string;
  definition: string;
  parentCodeId: Id | null;
  colorToken: string | null;
}

export type CodeDraftProblem = 'nameMissing' | 'nameTaken' | 'colorMissing';

/**
 * How deep a code may sit: family, child, grandchild.
 *
 * D-070 caps it by offering only families and children as parents, so the cap
 * is a consequence of `eligibleParents` rather than a rule enforced twice.
 */
export const MAX_CODE_DEPTH = 2;

/**
 * What is wrong with this draft, or nothing.
 *
 * Every problem at once rather than the first: a form that reports one error,
 * then another after the fix, makes the reader do the work twice.
 *
 * Uniqueness is codebook-wide and case-insensitive, per D-070, and counts
 * provisional codes too — two codes a coder cannot tell apart by name are two
 * codes a coder will use interchangeably, whatever their status.
 */
export function validateCodeDraft(
  draft: CodeDraft,
  codes: readonly Code[],
  editingCodeId?: Id,
): CodeDraftProblem[] {
  const problems: CodeDraftProblem[] = [];
  const name = draft.name.trim();

  if (name === '') problems.push('nameMissing');
  else if (
    codes.some(
      (code) =>
        code.codeId !== editingCodeId &&
        code.name.trim().localeCompare(name, undefined, { sensitivity: 'base' }) === 0,
    )
  ) {
    problems.push('nameTaken');
  }

  // A family with no hue would render in the provisional grey and read as
  // unapproved. Descendants take their family's, so this only applies at the top.
  if (draft.parentCodeId === null && (draft.colorToken ?? '') === '') {
    problems.push('colorMissing');
  }

  return problems;
}

/**
 * The codes a new one may sit under: families and their children, never a
 * grandchild.
 *
 * D-070 caps depth at grandchild by narrowing this list rather than by refusing
 * a deeper choice afterwards, which is the difference between a control that
 * cannot express the mistake and one that reports it.
 *
 * Provisional codes are not offered. One has no canonical position yet, so
 * hanging a code beneath it would place a canonical code under something that
 * is not in the codebook.
 */
export function eligibleParents(codes: readonly Code[]): Code[] {
  return codes.filter(
    (code) => code.status !== 'provisional' && depthOf(codes, code) < MAX_CODE_DEPTH,
  );
}

/**
 * How far a code sits from its family.
 *
 * Walked here rather than taken from `buildCodeTree`, which lives in the codes
 * feature: the domain does not import from features, and a parent chain is
 * three lines. The guard stops a cycle in malformed data from hanging the
 * caller rather than pretending one cannot happen.
 */
function depthOf(codes: readonly Code[], code: Code): number {
  const byId = new Map(codes.map((candidate) => [candidate.codeId, candidate]));
  let depth = 0;
  let current = code;
  while (current.parentCodeId !== null && depth <= MAX_CODE_DEPTH) {
    const parent = byId.get(current.parentCodeId);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return depth;
}

/**
 * Where a new code sits in canonical order, per D-070's "append after their
 * siblings".
 *
 * A fraction, and deliberately. The seeded index is a dense, global, zero-based
 * sequence in depth-first order, so inserting a child of an early family would
 * mean renumbering every code after it — thirty-six rewrites to add one code,
 * every one of them a chance to move something that should not have moved.
 *
 * Nothing requires that. `byCanonicalOrder` is a subtraction and every sibling
 * list is sorted independently, so the index only has to fall between the right
 * two neighbours. The new code takes the midpoint between the last index in its
 * parent's whole subtree — after the last sibling *and* that sibling's own
 * descendants, since the order is depth-first — and the next index outside it.
 *
 * A new family appends past the end, where there is no next index to halve
 * against.
 */
export function nextCanonicalIndex(codes: readonly Code[], parentCodeId: Id | null): number {
  const positioned = codes.filter((code) => code.status !== 'provisional');
  const maxIndex = positioned.reduce(
    (highest, code) => Math.max(highest, code.canonicalOrderIndex),
    -1,
  );

  if (parentCodeId === null) return maxIndex + 1;

  const subtree = subtreeIds(positioned, parentCodeId);
  const inSubtree = positioned.filter((code) => subtree.has(code.codeId));
  if (inSubtree.length === 0) return maxIndex + 1;

  const lastInside = Math.max(...inSubtree.map((code) => code.canonicalOrderIndex));
  const outsideAfter = positioned
    .filter((code) => !subtree.has(code.codeId) && code.canonicalOrderIndex > lastInside)
    .map((code) => code.canonicalOrderIndex);

  if (outsideAfter.length === 0) return lastInside + 1;
  return (lastInside + Math.min(...outsideAfter)) / 2;
}

/** A code and everything beneath it. */
function subtreeIds(codes: readonly Code[], rootId: Id): Set<Id> {
  const ids = new Set<Id>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const code of codes) {
      if (code.parentCodeId !== null && ids.has(code.parentCodeId) && !ids.has(code.codeId)) {
        ids.add(code.codeId);
        grew = true;
      }
    }
  }
  return ids;
}

export interface CodeIdentity {
  codeId: Id;
  projectId: Id;
}

/**
 * A draft as a record.
 *
 * The definition goes to `fullDefinition`, which is what every surface renders
 * since D-046 collapsed the two prose fields into one. The rest of `Code`'s
 * fields stay in the model and empty, exactly as `createProvisionalCode`
 * leaves them.
 */
export function codeFromDraft(
  draft: CodeDraft,
  identity: CodeIdentity,
  canonicalOrderIndex: number,
  colorTokenOfParent: string | null,
): Code {
  return {
    codeId: identity.codeId,
    projectId: identity.projectId,
    parentCodeId: draft.parentCodeId,
    name: draft.name.trim(),
    shortDefinition: '',
    fullDefinition: draft.definition.trim(),
    inclusionCriteria: '',
    exclusionCriteria: '',
    examples: [],
    synonyms: [],
    // A descendant wears its family's hue, which is what makes the transcript's
    // family highlight mean anything. Only a family carries a chosen one.
    colorToken: draft.parentCodeId === null ? (draft.colorToken ?? '') : (colorTokenOfParent ?? ''),
    status: 'approved',
    canonicalOrderIndex,
  };
}

/**
 * An existing code with a draft applied.
 *
 * Identity is kept, which is what makes Accept cheap: a provisional's
 * assignments already name this `codeId`, so moving it into the hierarchy
 * carries them without touching a single assignment record.
 */
export function applyDraft(
  code: Code,
  draft: CodeDraft,
  canonicalOrderIndex: number,
  colorTokenOfParent: string | null,
): Code {
  return {
    ...code,
    parentCodeId: draft.parentCodeId,
    name: draft.name.trim(),
    fullDefinition: draft.definition.trim(),
    colorToken:
      draft.parentCodeId === null ? (draft.colorToken ?? '') : (colorTokenOfParent ?? ''),
    status: 'approved',
    canonicalOrderIndex,
  };
}

/** The hue a code's family wears, for a descendant to inherit. */
export function familyColorToken(codes: readonly Code[], codeId: Id | null): string | null {
  const byId = new Map(codes.map((code) => [code.codeId, code]));
  let current = codeId === null ? undefined : byId.get(codeId);
  while (current?.parentCodeId) current = byId.get(current.parentCodeId);
  return current?.colorToken ?? null;
}
