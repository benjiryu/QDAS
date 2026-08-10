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
  isOpen: boolean;
  /** Announced when the panel opens: excerpt size and start speaker, per section 10. */
  excerptSummary: string | null;
  /** Cancel closes the panel and returns focus to the command strip, per section 9. */
  onCancel: () => void;
}

export function useCodePanel({
  codes,
  isOpen,
  excerptSummary,
  onCancel,
}: Options): CodePanelApi {
  const announcer = useAnnouncer();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const setSearchElement = useCallback((node: HTMLInputElement | null) => {
    searchRef.current = node;
  }, []);

  const [query, setQueryState] = useState('');
  const [pendingCodeIds, setPendingCodeIds] = useState<Id[]>([]);
  const [recentCodeIds, setRecentCodeIds] = useState<Id[]>([]);

  const codeById = useMemo(() => new Map(codes.map((code) => [code.codeId, code])), [codes]);
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

    // Section 10: panel name, excerpt size, and start speaker.
    announcer.announce(
      `Code selection. ${excerptSummary ?? 'No excerpt.'} Search field focused.`,
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

      setPendingCodeIds((current) => {
        // Checking a parent does not check its children. Coding a parent is a
        // distinct analytic act from coding its children, per section 4.
        const next = checked
          ? current.includes(codeId)
            ? current
            : [...current, codeId]
          : current.filter((id) => id !== codeId);

        announcer.announce(
          checked
            ? `${code.name} added. ${next.length} pending.`
            : `${code.name} removed. ${next.length} pending.`,
        );
        return next;
      });

      if (checked) {
        setRecentCodeIds((current) =>
          [codeId, ...current.filter((id) => id !== codeId)].slice(0, RECENT_LIMIT),
        );
      }
    },
    [announcer, codeById],
  );

  const cancel = useCallback(() => {
    // Section 2.1: discard pending codes, close the panel, excerpt stays
    // confirmed. The draft note joins this when the note region is built.
    setPendingCodeIds([]);
    setQueryState('');
    announcedFor.current = null;
    announcer.announce('Code selection cancelled. The excerpt is still confirmed.');
    onCancel();
  }, [announcer, onCancel]);

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
        cancel();
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
  }, [bindings, cancel, clearQuery, focusSearch, isOpen, query]);

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
    cancel,
    focusSearch,
    setSearchElement,
  };
}
