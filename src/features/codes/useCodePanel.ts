import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform, resolveEscape } from '../../config/keybindings';
import type { Code, Id } from '../../domain';
import { buildCodeTree, searchCodes } from './codeTree';
import type { CodeNode, CodeSearchResult } from './codeTree';

/**
 * Code selection panel state: search, browse, and the pending assignment.
 *
 * Specification: docs/patterns/code-selection.md sections 2 to 5, plus the
 * panel-open focus destination in section 9.
 *
 * Non-modal, per D-027. Nothing here traps focus, and the panel deliberately
 * does not own the transcript: a coder can read the excerpt, move the position,
 * or reopen boundary adjustment while it is open.
 */

/** How many session-recent codes region 5 keeps. */
const RECENT_LIMIT = 5;

/** Opaque identifier for a code the coder proposes during a session. */
function newCodeId(): Id {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(16).slice(2, 12);
  return `cd-${random}`;
}

/**
 * What a save attempt reported.
 *
 * A failure carries what failed. Nothing is cleared and nothing is closed on a
 * failure: excerpt-selection.md section 9 and code-selection.md section 12 both
 * require that a failed save discards nothing and resets no state.
 */
export type SaveOutcome = { ok: true } | { ok: false; message: string };

export interface NewCodeDraft {
  name: string;
  shortDefinition: string;
  fullDefinition: string;
}

export interface CodePanelApi {
  isOpen: boolean;
  query: string;
  setQuery: (query: string) => void;
  clearQuery: () => void;
  results: CodeSearchResult[];
  tree: CodeNode[];
  pendingCodeIds: Id[];
  isPending: (codeId: Id) => boolean;
  toggle: (codeId: Id, checked: boolean) => void;
  recentCodes: Code[];
  /** Every code, canonical and proposed, for resolving names and definitions. */
  codeById: Map<Id, Code>;
  /** Codes created this session. Never part of the canonical codebook. */
  proposedCodes: Code[];
  createProvisionalCode: (draft: NewCodeDraft) => Code | null;
  /** Seeds the pending assignment when reopening a saved excerpt. D-030. */
  loadPending: (codeIds: Id[]) => void;
  /** One note per excerpt, plain text, no type. D-011 and D-020. */
  noteText: string;
  setNoteText: (text: string) => void;
  /** D-021. Set on every assignment written at save; affects no ordering. */
  uncertain: boolean;
  setUncertain: (uncertain: boolean) => void;
  /** Save is unavailable while nothing is pending, and says why. Section 8. */
  canSave: boolean;
  saveUnavailableReason: string | null;
  save: () => void;
  /** The last save failure, still on screen until it is resolved. */
  saveError: string | null;
  /** Retries the save that failed. Same action, named for what it is. */
  retrySave: () => void;
  setErrorElement: (node: HTMLElement | null) => void;
  /** Cancel asks first when there are unsaved changes. Section 8. */
  cancelPending: boolean;
  requestCancel: () => void;
  keepEditing: () => void;
  /** Removes a pending code and moves focus per section 9. */
  removePending: (codeId: Id) => void;
  /** Called by the workspace once records exist. Nothing clears before then. */
  clearAfterSave: () => void;
  /** Focus lands on the pending region after a code is created, per section 9. */
  setPendingElement: (node: HTMLElement | null) => void;
  cancel: () => void;
  focusSearch: () => void;
  /**
   * Callback ref for the search input. A callback rather than the ref object
   * itself, so nothing that renders the panel holds a ref it might read during
   * render.
   */
  setSearchElement: (node: HTMLInputElement | null) => void;
}

interface Options {
  codes: Code[];
  projectId: Id;
  isOpen: boolean;
  /** Announced when the panel opens: excerpt size and start speaker, per section 10. */
  excerptSummary: string | null;

  /** Cancel closes the panel and returns focus to the command strip, per section 9. */
  onCancel: () => void;
  /**
   * Writes the records and performs the return. The panel collects the pending
   * assignment; where it is written and where the user lands belong to the
   * workspace that owns the transcript.
   */
  onSave?: (pending: {
    codeIds: Id[];
    noteText: string;
    uncertain: boolean;
  }) => SaveOutcome | void;
}

export function useCodePanel({
  codes,
  projectId,
  isOpen,
  excerptSummary,
  onCancel,
  onSave,
}: Options): CodePanelApi {
  const announcer = useAnnouncer();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const setSearchElement = useCallback((node: HTMLInputElement | null) => {
    searchRef.current = node;
  }, []);

  const pendingRef = useRef<HTMLElement | null>(null);
  const setPendingElement = useCallback((node: HTMLElement | null) => {
    pendingRef.current = node;
  }, []);

  const [query, setQueryState] = useState('');
  const [pendingCodeIds, setPendingCodeIds] = useState<Id[]>([]);

  /**
   * The pending list, mirrored so it can be read synchronously.
   *
   * Computing the next list inside a state updater would be the obvious way to
   * avoid a stale closure, but an updater must be pure: React may run it during
   * a render, and twice in development, so announcing from inside one produces
   * duplicate speech and updates the announcement log mid-render. Every write
   * goes through `applyPending`, which keeps the two in step.
   */
  const pendingListRef = useRef<Id[]>([]);
  const applyPending = useCallback((next: Id[]) => {
    pendingListRef.current = next;
    setPendingCodeIds(next);
  }, []);
  const [recentCodeIds, setRecentCodeIds] = useState<Id[]>([]);
  const [proposedCodes, setProposedCodes] = useState<Code[]>([]);
  const [noteText, setNoteText] = useState('');
  const [uncertain, setUncertainState] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  /** How many codes the panel opened with, for the opening announcement. */
  const loadedCountRef = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const errorRef = useRef<HTMLElement | null>(null);
  const setErrorElement = useCallback((node: HTMLElement | null) => {
    errorRef.current = node;
  }, []);

  const codeById = useMemo(
    () => new Map([...codes, ...proposedCodes].map((code) => [code.codeId, code])),
    [codes, proposedCodes],
  );
  const tree = useMemo(() => buildCodeTree(codes), [codes]);
  const results = useMemo(() => searchCodes(tree, query), [query, tree]);

  const recentCodes = useMemo(
    () =>
      recentCodeIds
        .map((codeId) => codeById.get(codeId))
        .filter((code): code is Code => code !== undefined),
    [codeById, recentCodeIds],
  );

  /* ---------- Opening ---------- */

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen === wasOpen.current) return;
    wasOpen.current = isOpen;
    if (!isOpen) return;

    // Section 9: the panel opens with focus in the search field. That is also
    // the destination excerpt-selection.md section 6 names for confirm.
    searchRef.current?.focus?.();

    // Section 10: panel name, excerpt size, start speaker, and for a reopened
    // excerpt that existing codes are loaded and how many, so they are not
    // mistaken for codes the coder just applied. The count is read from a ref
    // written by `loadPending` just before the panel opened.
    const loaded = loadedCountRef.current;
    announcer.announce(
      `Code selection. ${excerptSummary ?? 'No excerpt.'}${
        loaded > 0
          ? ` ${loaded} existing ${loaded === 1 ? 'code' : 'codes'} loaded from the saved excerpt.`
          : ''
      } Search field focused.`,
    );
  }, [announcer, excerptSummary, isOpen]);

  /* ---------- Search ---------- */

  const announcedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed === '' || announcedFor.current === trimmed) return;
    announcedFor.current = trimmed;

    // Section 10: the result count is automatic; the list is on request, which
    // is the region itself.
    announcer.announce(
      `${results.length} ${results.length === 1 ? 'result' : 'results'} for ${trimmed}.`,
    );
  }, [announcer, isOpen, query, results.length]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    if (next.trim() === '') announcedFor.current = null;
  }, []);

  const clearQuery = useCallback(() => {
    setQueryState('');
    announcedFor.current = null;
    // Section 5: clearing removes the results region and returns focus to the
    // search field.
    searchRef.current?.focus?.();
    announcer.announce('Search cleared.');
  }, [announcer]);

  const focusSearch = useCallback(() => {
    // Without clearing it, per section 2.1. Focus can legitimately be in the
    // transcript while the panel is open, which is why this command exists.
    searchRef.current?.focus?.();
  }, []);

  /* ---------- Pending assignment ---------- */

  const isPending = useCallback(
    (codeId: Id) => pendingCodeIds.includes(codeId),
    [pendingCodeIds],
  );

  const toggle = useCallback(
    (codeId: Id, checked: boolean) => {
      const code = codeById.get(codeId);
      if (!code) return;

      // Checking a parent does not check its children. Coding a parent is a
      // distinct analytic act from coding its children, per section 4.
      const current = pendingListRef.current;
      const next = checked
        ? current.includes(codeId)
          ? current
          : [...current, codeId]
        : current.filter((id) => id !== codeId);

      applyPending(next);

      announcer.announce(
        checked
          ? `${code.name} added. ${next.length} pending.`
          : `${code.name} removed. ${next.length} pending.`,
      );

      if (checked) {
        setRecentCodeIds((current) =>
          [codeId, ...current.filter((id) => id !== codeId)].slice(0, RECENT_LIMIT),
        );
      }
    },
    [announcer, applyPending, codeById],
  );

  /**
   * Creates a provisional code, per section 7.
   *
   * It goes into the pending assignment immediately and into the Proposed codes
   * region. It never joins the canonical codebook: that structure does not
   * change until a qualitative lead approves the code, so the index that would
   * place it there does not exist yet.
   */
  /**
   * Starts the pending assignment from an excerpt's saved codes, per D-030.
   *
   * Called from the event that reopens the excerpt, before the panel opens, so
   * nothing here happens during a render or an effect.
   */
  const loadPending = useCallback(
    (codeIds: Id[]) => {
      loadedCountRef.current = codeIds.length;
      applyPending(codeIds);
    },
    [applyPending],
  );

  const createProvisionalCode = useCallback(
    (draft: NewCodeDraft): Code | null => {
      const name = draft.name.trim();
      const shortDefinition = draft.shortDefinition.trim();
      if (name === '' || shortDefinition === '') return null;

      const code: Code = {
        codeId: newCodeId(),
        projectId,
        parentCodeId: null,
        name,
        shortDefinition,
        fullDefinition: draft.fullDefinition.trim(),
        inclusionCriteria: '',
        exclusionCriteria: '',
        // D-019: examples stay in the model, unwritten and unread in v0.1.
        examples: [],
        synonyms: [],
        colorToken: 'code-color-provisional',
        status: 'provisional',
        // No canonical position until approval. Domain model: the index is
        // computed once at import or approval, and this code has neither.
        canonicalOrderIndex: -1,
      };

      const next = [...pendingListRef.current, code.codeId];
      setProposedCodes((current) => [...current, code]);
      applyPending(next);
      setRecentCodeIds((current) => [code.codeId, ...current].slice(0, RECENT_LIMIT));

      announcer.announce(
        `${code.name} created as provisional and added to pending. ${next.length} pending.`,
      );

      // Section 9: focus lands on the pending assignment region.
      pendingRef.current?.focus?.();
      return code;
    },
    [announcer, applyPending, projectId],
  );

  const setUncertain = useCallback(
    (next: boolean) => {
      setUncertainState(next);
      // Announced like any other change to the pending assignment, per D-021.
      announcer.announce(
        next
          ? 'Assignment marked uncertain.'
          : 'Assignment no longer marked uncertain.',
      );
    },
    [announcer],
  );

  const canSave = pendingCodeIds.length > 0;
  const saveUnavailableReason = canSave
    ? null
    : 'Save is unavailable because no codes are pending. Check at least one code.';

  const save = useCallback(() => {
    if (pendingCodeIds.length === 0) {
      announcer.announce(
        'Save is unavailable because no codes are pending. Check at least one code.',
      );
      return;
    }

    const outcome = onSave?.({ codeIds: pendingCodeIds, noteText, uncertain });
    if (!outcome || outcome.ok) {
      setSaveError(null);
      return;
    }

    // Nothing here clears anything. The pending codes, the note, and the
    // excerpt are exactly as they were a moment ago, and the announcement says
    // so, because a save failure that silently drops work ends a session.
    setSaveError(outcome.message);

    const codes = `${pendingCodeIds.length} pending ${
      pendingCodeIds.length === 1 ? 'code' : 'codes'
    }`;
    const note = noteText.trim() === '' ? '' : ' and your note';
    announcer.announce(
      `${outcome.message} Nothing was lost: your ${codes}${note} and the excerpt are still here. Retry is available.`,
      'assertive',
      'saveFailure',
    );

    // Section 9: focus lands on the error message, with retry adjacent.
    queueMicrotask(() => errorRef.current?.focus?.());
  }, [announcer, noteText, onSave, pendingCodeIds, uncertain]);

  /**
   * Clears everything this panel was holding. Called after a save has been
   * written, never before: nothing is discarded until the records exist.
   */
  const clearAfterSave = useCallback(() => {
    loadedCountRef.current = 0;
    setSaveError(null);
    applyPending([]);
    setNoteText('');
    setUncertainState(false);
    setQueryState('');
    setCancelPending(false);
    announcedFor.current = null;
  }, [applyPending]);

  /** Section 2.1: discard pending codes and the draft note, close the panel,
      leave the excerpt confirmed. No records are created. */
  const cancelNow = useCallback(() => {
    loadedCountRef.current = 0;
    setSaveError(null);
    applyPending([]);
    setNoteText('');
    setUncertainState(false);
    setQueryState('');
    setCancelPending(false);
    announcedFor.current = null;
    announcer.announce('Code selection cancelled. The excerpt is still confirmed.');
    onCancel();
  }, [announcer, applyPending, onCancel]);

  /**
   * Cancel asks first when there is unsaved work, because it destroys pending
   * codes and a draft note. Confirmation is announced assertively: contract 2.3
   * reserves the assertive region for exactly this and for save failures.
   */
  const requestCancel = useCallback(() => {
    const hasUnsavedWork = pendingCodeIds.length > 0 || noteText.trim() !== '';
    if (!hasUnsavedWork) {
      cancelNow();
      return;
    }
    setCancelPending(true);
    announcer.announce(
      `Discard ${pendingCodeIds.length} pending ${
        pendingCodeIds.length === 1 ? 'code' : 'codes'
      }${noteText.trim() === '' ? '' : ' and your note'}? Nothing is discarded until you confirm.`,
      'assertive',
      'destructiveConfirmation',
    );
  }, [announcer, cancelNow, noteText, pendingCodeIds]);

  const keepEditing = useCallback(() => {
    setCancelPending(false);
    announcer.announce('Still editing. Nothing was discarded.');
  }, [announcer]);

  const removePending = useCallback(
    (codeId: Id) => {
      const index = pendingListRef.current.indexOf(codeId);
      const remainingIds = pendingListRef.current.filter((id) => id !== codeId);
      toggle(codeId, false);

      // Section 9: focus the next pending code, or the region heading once the
      // list is empty, rather than leaving focus on a control that is gone.
      queueMicrotask(() => {
        const remaining = remainingIds;
        const nextId = remaining[index] ?? remaining[remaining.length - 1];
        const next = nextId
          ? document.querySelector<HTMLElement>(`[data-remove-pending="${nextId}"]`)
          : null;
        (next ?? pendingRef.current)?.focus?.();
      });
    },
    [toggle],
  );


  /* ---------- Chords ---------- */

  const bindings = useMemo(() => bindingsFor(detectPlatform()), []);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const inField =
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]');

      const matched = commandFor(event, bindings);
      if (!matched) return;

      // Escape while the panel is open means cancel, wherever focus sits. The
      // resolution lives in the binding module because Escape means something
      // else with the panel closed.
      if (matched === 'codes.cancel') {
        if (resolveEscape(true) !== 'codes.cancel') return;
        event.preventDefault();
        // Escape asks first when there is unsaved work, exactly as the Cancel
        // control does. It is the same command.
        requestCancel();
        return;
      }

      if (matched === 'codes.focusSearch') {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (matched === 'codes.clearSearch') {
        // Available only with a query, per section 2.1.
        if (query.trim() === '') return;
        event.preventDefault();
        clearQuery();
        return;
      }

      // Everything else, including typing in the search field, is left alone.
      void inField;
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, clearQuery, focusSearch, isOpen, query, requestCancel]);

  /* ---------- Closing ---------- */

  useEffect(() => {
    if (isOpen) return;
    // A panel that closed for any reason keeps nothing on screen. Pending codes
    // are held by the caller across a return to boundary adjustment, per
    // section 8; that is a later task, and this hook does not lose them here.
    announcedFor.current = null;
  }, [isOpen]);

  return {
    isOpen,
    query,
    setQuery,
    clearQuery,
    results,
    tree,
    pendingCodeIds,
    isPending,
    toggle,
    recentCodes,
    codeById,
    proposedCodes,
    createProvisionalCode,
    loadPending,
    noteText,
    setNoteText,
    uncertain,
    setUncertain,
    canSave,
    saveUnavailableReason,
    save,
    saveError,
    retrySave: save,
    setErrorElement,
    clearAfterSave,
    cancelPending,
    requestCancel,
    keepEditing,
    removePending,
    setPendingElement,
    cancel: cancelNow,
    focusSearch,
    setSearchElement,
  };
}
