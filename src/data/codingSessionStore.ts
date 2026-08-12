/**
 * Coding state that outlives a page, per D-044.
 *
 * Specification: decision D-044, docs/pages/destinations.md shared rules.
 *
 * D-035 moved definition lookup to the Codebook destination, which made leaving
 * the coding surface mid-task a designed behaviour rather than an accident. A
 * coder who leaves to check whether a passage is `Water access` or `Water
 * access rules` and returns to an empty panel has been punished for diligence,
 * and the coders least able to reconstruct their place pay the most. So the
 * capture, the checked codes, and the draft note are held here while the route
 * changes, and restored when the source page mounts again.
 *
 * **In memory, deliberately.** `sourcePositionStore` sits beside this one and
 * writes to `localStorage`, because a reading position is scoped "across
 * sessions". Nothing here is. D-044 is explicit that a page reload still clears
 * in-progress state, and prototype-scope.md says saved work does not survive
 * one either, so a module-level object is not a shortcut — it is the required
 * lifetime. Writing this to storage would be a behaviour change.
 *
 * Two scopes, because they expire differently. A draft belongs to one source
 * and dies when it is saved or discarded; the rest belongs to the project and
 * accumulates across every source the coder visits, which is what the Codebook,
 * Coded data, and Notes destinations read.
 *
 * A reset between participants must call `clearCodingSession`; seed-data.md
 * section 5 requires one command returning the application to a known state,
 * and this is one of the things that command has to clear.
 */

import type { Code, CodeAssignment, Excerpt, Id, Note } from '../domain';
import type { CaptureTarget } from '../features/excerpt/capture';
import { IDLE } from '../features/excerpt/excerptMachine';
import type { ExcerptSelection } from '../features/excerpt/excerptMachine';

/**
 * What the coder was in the middle of, for one source.
 *
 * Provisional codes are deliberately *not* here. A code the coder proposed
 * outlives the capture that produced it: it can be assigned, it shows on the
 * Codebook page, and other sources can use it. Holding it per source would mean
 * it disappeared the moment the draft was cleared, leaving its id on
 * assignments with no record to resolve.
 */
export interface CodingDraft {
  selection: ExcerptSelection;
  panelOpen: boolean;
  panelFocus: CaptureTarget;
  pendingCodeIds: Id[];
  noteText: string;
  uncertain: boolean;
  query: string;
}

/**
 * What the coder has saved, for one project.
 *
 * Held here rather than in the source page because the destinations outlive it.
 * Every seeded excerpt belongs to the second coder, and R-4 keeps that material
 * off the coder-facing destinations, so this is the only work Coded data and
 * Notes are permitted to show.
 */
export interface SavedWork {
  excerpts: Excerpt[];
  assignments: CodeAssignment[];
  notes: Note[];
  /** Assignments removed from a reopened excerpt. Superseded, never deleted. */
  supersededIds: Id[];
}

export const EMPTY_DRAFT: CodingDraft = {
  selection: IDLE,
  panelOpen: false,
  panelFocus: 'search',
  pendingCodeIds: [],
  noteText: '',
  uncertain: false,
  query: '',
};

export const EMPTY_SAVED_WORK: SavedWork = {
  excerpts: [],
  assignments: [],
  notes: [],
  supersededIds: [],
};

const drafts = new Map<string, CodingDraft>();
const savedWork = new Map<string, SavedWork>();
const provisionalCodes = new Map<string, Code[]>();
const codebookQueries = new Map<string, string>();
const codedDataFilters = new Map<string, string>();

export function readDraft(sourceId: Id): CodingDraft {
  return drafts.get(sourceId) ?? EMPTY_DRAFT;
}

export function writeDraft(sourceId: Id, draft: CodingDraft): void {
  drafts.set(sourceId, draft);
}

/**
 * Drops a source's draft.
 *
 * Called once the work it held has become records, so a saved excerpt is not
 * also sitting here as a capture waiting to be restored.
 */
export function clearDraft(sourceId: Id): void {
  drafts.delete(sourceId);
}

export function readSavedWork(projectId: Id): SavedWork {
  return savedWork.get(projectId) ?? EMPTY_SAVED_WORK;
}

export function writeSavedWork(projectId: Id, work: SavedWork): void {
  savedWork.set(projectId, work);
}

/* ---------- Provisional codes, per project ---------- */

/**
 * Codes the coder proposed this session, per section 7 of code-selection.md.
 *
 * Project-scoped and append-only. They never join the canonical codebook —
 * that structure does not change until a qualitative lead approves them — but
 * they do have to outlast the capture that produced them, because an
 * assignment can already name one.
 */
export function readProvisionalCodes(projectId: Id): Code[] {
  return provisionalCodes.get(projectId) ?? [];
}

/** Records one, ignoring a repeat. Nothing here ever removes a code. */
export function addProvisionalCode(projectId: Id, code: Code): void {
  const current = provisionalCodes.get(projectId) ?? [];
  if (current.some((candidate) => candidate.codeId === code.codeId)) return;
  provisionalCodes.set(projectId, [...current, code]);
}

/* ---------- Codebook page query ---------- */

/**
 * The Codebook search query, which destinations.md section 1 keeps for the
 * session: a coder who looks something up, leaves, and comes back does not
 * retype it.
 */
export function readCodebookQuery(projectId: Id): string {
  return codebookQueries.get(projectId) ?? '';
}

export function writeCodebookQuery(projectId: Id, query: string): void {
  codebookQueries.set(projectId, query);
}

/* ---------- Coded data page filter ---------- */

/**
 * The selected code filter, per project and per view.
 *
 * destinations.md section 2 keeps it for the session, and per view: the two
 * views list different codes, so a selection made in one is meaningless in the
 * other and would silently show an empty result list.
 */
export function readCodedDataFilter(projectId: Id, view: string): string {
  return codedDataFilters.get(`${projectId}|${view}`) ?? 'all';
}

export function writeCodedDataFilter(projectId: Id, view: string, codeId: string): void {
  codedDataFilters.set(`${projectId}|${view}`, codeId);
}

/** For the between-participants reset, and for test setup. */
export function clearCodingSession(): void {
  drafts.clear();
  savedWork.clear();
  provisionalCodes.clear();
  codebookQueries.clear();
  codedDataFilters.clear();
}
