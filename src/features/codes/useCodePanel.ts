import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { bindingsFor, commandFor, detectPlatform, resolveEscape } from '../../config/keybindings';
import { isShortcutsHelpOpen } from '../help/shortcutsHelpStore';
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

/**
 * A name and nothing else, per D-046.
 *
 * Section 7 required a short definition as well. Proposing a code happens
 * mid-coding, and two fields of prose at that moment is a codebook entry
 * demanded in the middle of reading a transcript.
 */
export interface NewCodeDraft {
  name: string;
}

export interface CodePanelApi {
  isOpen: boolean;
  /** The project whose codebook the companion renders. D-048. */
  projectId: Id;
  /** Which field the panel opened on, so the note row can open with it. */
  openFocus: 'search' | 'note';
  query: string;
  setQuery: (query: string) => void;
  results: CodeSearchResult[];
  tree: CodeNode[];
  pendingCodeIds: Id[];
  isPending: (codeId: Id) => boolean;
  toggle: (codeId: Id, checked: boolean) => void;
  /** Every code, canonical and proposed, for resolving names and definitions. */
  codeById: Map<Id, Code>;
  /** Codes created this session. Never part of the canonical codebook. */
  proposedCodes: Code[];
  createProvisionalCode: (draft: NewCodeDraft) => Code | null;
  /**
   * The empty search result's one action, per D-070 and Task 50.
   *
   * Creates the code from the current query, checks it for the capture, and
   * returns focus to the search field.
   */
  proposeFromQuery: () => Code | null;
  /**
   * Seeds the pending assignment and the note when reopening a saved excerpt.
   * D-030.
   */
  loadPending: (codeIds: Id[], noteText?: string) => void;
  /** One note per excerpt, plain text, no type. D-011 and D-020. */
  noteText: string;
  setNoteText: (text: string) => void;
  /** D-021. Set on every assignment written at save; affects no ordering. */
  uncertain: boolean;
  setUncertain: (uncertain: boolean) => void;
  /**
   * Save is unavailable while nothing is pending. The reason is spoken on
   * attempt rather than shown: the panel carries no help text for it.
   */
  canSave: boolean;
  save: () => void;
  /** The last save failure, still on screen until it is resolved. */
  saveError: string | null;
  /** Retries the save that failed. Same action, named for what it is. */
  retrySave: () => void;
  setErrorElement: (node: HTMLElement | null) => void;
  /**
   * Deleting the saved excerpt, offered only where there is one to delete.
   *
   * The route D-030 named and left unbuilt: "Deleting a coded excerpt is a
   * separate explicit action." Emptying the codes and saving is still not it.
   */
  canDelete: boolean;
  deletePending: boolean;
  requestDelete: () => void;
  confirmDelete: () => void;
  keepExcerpt: () => void;
  /**
   * The single exit, per D-042: Escape, the close control, and clicking
   * outside. Commits the pending codes and the note where there are any, and
   * otherwise closes on an empty assignment, creating nothing.
   */
  close: () => void;
  /**
   * The companion codebook, per D-048.
   *
   * Panel state rather than the workspace's, which is what lets Escape layer
   * here without any new wiring: the handler that owns Escape already lives in
   * this hook.
   */
  companionOpen: boolean;
  openCompanion: () => void;
  closeCompanion: () => void;
  /**
   * The hop, per D-053. One chord between the two surfaces, closing neither.
   */
  hopToCodebook: () => void;
  /** Callback refs, so the focus round trip has both ends to land on. */
  setCompanionButton: (node: HTMLButtonElement | null) => void;
  setCompanionSearch: (node: HTMLInputElement | null) => void;
  /** The companion's container, so the hop can tell which side focus is on. */
  setCompanionRegion: (node: HTMLElement | null) => void;
  /** Called by the workspace once records exist. Nothing clears before then. */
  clearAfterSave: () => void;
  focusSearch: () => void;
  /**
   * Expands the note region and lands focus in the field, per D-055.
   *
   * `excerpt.note` with this panel already open means "take me to the note",
   * not "capture something". The disclosure owns whether it is expanded, so it
   * registers how to open itself rather than that state being lifted up here
   * and reset from an effect.
   */
  focusNote: () => void;
  registerNoteOpener: (open: (() => void) | null) => void;
  /** Callback ref for the note field, which `excerpt.note` opens focused on. */
  setNoteElement: (node: HTMLTextAreaElement | null) => void;
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
  /**
   * Which field the panel opens focused on.
   *
   * Search by default, per section 9. `excerpt.note` opens on the note field
   * instead: it exists so a coder can write the thought that made them stop
   * reading before choosing codes, and landing them in search would make them
   * navigate past eight regions to reach it.
   */
  openFocus?: 'search' | 'note';
  /** True when a saved excerpt was reopened, per D-030. Gates deletion. */
  isReopened?: boolean;
  /**
   * Supersedes every assignment standing on the reopened excerpt. The excerpt
   * row itself is retained: D-030 keeps before-and-after history rather than
   * overwriting it, and an excerpt with nothing standing on it stops reading as
   * coded on its own.
   */
  onDelete?: () => void;

  /**
   * Closing on an empty assignment: discards the capture and returns focus to
   * the command strip, per section 9. Since D-042 this is the only route that
   * reaches it — closing with codes pending goes through `onSave`.
   */
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
  /**
   * The draft to resume, per D-044.
   *
   * Seeds the initial state rather than being restored by an effect: an effect
   * would render an empty panel first and would have to write state from
   * inside one, which `react-hooks/set-state-in-effect` rules out.
   */
  initialDraft?: InitialDraft;
}

/** The panel's share of a `CodingDraft`. Everything a coder had typed or ticked. */
export interface InitialDraft {
  pendingCodeIds: Id[];
  noteText: string;
  uncertain: boolean;
  query: string;
  proposedCodes: Code[];
}

const EMPTY_INITIAL_DRAFT: InitialDraft = {
  pendingCodeIds: [],
  noteText: '',
  uncertain: false,
  query: '',
  proposedCodes: [],
};

export function useCodePanel({
  codes,
  projectId,
  isOpen,
  excerptSummary,
  openFocus = 'search',
  isReopened = false,
  onCancel,
  onSave,
  onDelete,
  initialDraft = EMPTY_INITIAL_DRAFT,
}: Options): CodePanelApi {
  const announcer = useAnnouncer();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const setSearchElement = useCallback((node: HTMLInputElement | null) => {
    searchRef.current = node;
  }, []);

  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const setNoteElement = useCallback((node: HTMLTextAreaElement | null) => {
    noteRef.current = node;
  }, []);

  const [query, setQueryState] = useState(initialDraft.query);
  const [pendingCodeIds, setPendingCodeIds] = useState<Id[]>(initialDraft.pendingCodeIds);

  /**
   * The pending list, mirrored so it can be read synchronously.
   *
   * Computing the next list inside a state updater would be the obvious way to
   * avoid a stale closure, but an updater must be pure: React may run it during
   * a render, and twice in development, so announcing from inside one produces
   * duplicate speech and updates the announcement log mid-render. Every write
   * goes through `applyPending`, which keeps the two in step.
   */
  const pendingListRef = useRef<Id[]>(initialDraft.pendingCodeIds);
  const applyPending = useCallback((next: Id[]) => {
    pendingListRef.current = next;
    setPendingCodeIds(next);
  }, []);
  const [proposedCodes, setProposedCodes] = useState<Code[]>(initialDraft.proposedCodes);
  const [noteText, setNoteText] = useState(initialDraft.noteText);
  const [uncertain, setUncertainState] = useState(initialDraft.uncertain);
  const [deletePending, setDeletePending] = useState(false);
  /** D-048. Starts closed on every mount, and on every reopen; see below. */
  const [companionOpen, setCompanionOpen] = useState(false);
  const companionButtonRef = useRef<HTMLButtonElement | null>(null);
  const setCompanionButton = useCallback((node: HTMLButtonElement | null) => {
    companionButtonRef.current = node;
  }, []);
  const companionSearchRef = useRef<HTMLInputElement | null>(null);
  const setCompanionSearch = useCallback((node: HTMLInputElement | null) => {
    companionSearchRef.current = node;
  }, []);
  const companionRegionRef = useRef<HTMLElement | null>(null);
  const setCompanionRegion = useCallback((node: HTMLElement | null) => {
    companionRegionRef.current = node;
  }, []);
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

  /*
    Search covers proposed codes as well as the codebook, per Task 50; the
    codebook region below still renders `tree`, which is canonical only.

    Two trees rather than one because section 7 keeps a proposed code out of the
    canonical list, and because a search that could not find one would offer to
    propose it a second time — the empty state is what creates them now, so a
    coder would end up with two codes of the same name and no way to tell them
    apart.
  */
  const searchTree = useMemo(
    () => buildCodeTree([...codes, ...proposedCodes]),
    [codes, proposedCodes],
  );
  const results = useMemo(() => searchCodes(searchTree, query), [query, searchTree]);

  /* ---------- Opening ---------- */

  const wasOpen = useRef(false);
  /**
   * True only when the panel was already open at the first render, which means
   * a D-044 restore rather than a coder opening it.
   */
  const isRestore = useRef(isOpen);
  useEffect(() => {
    if (isOpen === wasOpen.current) return;
    wasOpen.current = isOpen;
    if (!isOpen) return;

    // Section 9: the panel opens with focus in the search field, which is also
    // where excerpt-selection.md section 4 sends `excerpt.code`. `excerpt.note`
    // is the one command that opens elsewhere.
    const field = openFocus === 'note' ? noteRef.current : searchRef.current;

    if (isRestore.current) {
      isRestore.current = false;
      /*
        A restore lands mid-navigation, and the shell focuses the route's `h1`
        on every pathname change. Child effects run before parent ones, so
        focusing here directly would be overwritten a moment later and leave a
        focus-trapping dialog open with focus behind it. Deferring puts this
        after the shell, which is the same ordering fix `ExcerptContextMenu`
        and `focusTurnOf` use.
      */
      queueMicrotask(() => field?.focus?.());
    } else {
      field?.focus?.();
    }

    // Section 10: panel name, excerpt size, and for a reopened excerpt that
    // existing codes are loaded and how many, so they are not mistaken for
    // codes the coder just applied. The count is read from a ref written by
    // `loadPending` just before the panel opened.
    //
    // Named as the card is named, per D-039, so what is heard on opening and
    // what is heard when browsing to the region are the same words.
    const loaded = loadedCountRef.current;
    announcer.announce(
      `Code Assignment. ${excerptSummary ?? 'No excerpt.'}${
        loaded > 0
          ? ` ${loaded} existing ${loaded === 1 ? 'code' : 'codes'} loaded from the saved excerpt.`
          : ''
      } ${openFocus === 'note' ? 'Note field focused.' : 'Search field focused.'}`,
    );
  }, [announcer, excerptSummary, isOpen, openFocus]);

  /* ---------- Search ---------- */

  const announcedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed === '' || announcedFor.current === trimmed) return;
    announcedFor.current = trimmed;

    /*
      Section 10: the result count is automatic; the list is on request, which
      is the region itself.

      Continuous, per D-050. Queued, this spoke every prefix a coder typed —
      "12 results for m, 8 results for mo, 8 results for mot" — reporting three
      counts of which only the last was still true. The intermediates are drafts
      of one fact, so they coalesce and the settled count is spoken once.
    */
    announcer.announce(
      `${results.length} ${results.length === 1 ? 'result' : 'results'} for ${trimmed}.`,
      'polite',
      'continuous',
    );
  }, [announcer, isOpen, query, results.length]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    if (next.trim() === '') announcedFor.current = null;
  }, []);

  const focusSearch = useCallback(() => {
    // Without clearing it, per section 2.1. Focus can legitimately be in the
    // transcript while the panel is open, which is why this command exists.
    searchRef.current?.focus?.();
  }, []);

  /* The disclosure's own opener, registered by it while it is mounted. */
  const noteOpenerRef = useRef<(() => void) | null>(null);
  const registerNoteOpener = useCallback((open: (() => void) | null) => {
    noteOpenerRef.current = open;
  }, []);

  const focusNote = useCallback(() => {
    // Expanding also focuses, so the collapsed and expanded cases are one
    // route. With no disclosure mounted the field is the fallback.
    if (noteOpenerRef.current) noteOpenerRef.current();
    else noteRef.current?.focus?.();
  }, []);

  /* ---------- The companion codebook, D-048 ---------- */

  /**
   * Opens it and hands focus to its search field.
   *
   * Deferred, because the field does not exist until the render this state
   * change causes. The same `queueMicrotask` the context menu and the restored
   * panel use for the same reason.
   */
  const openCompanion = useCallback(() => {
    setCompanionOpen(true);
    queueMicrotask(() => companionSearchRef.current?.focus?.());
    announcer.announce('Codebook opened beside the panel. Search field focused.');
  }, [announcer]);

  /**
   * Closes it and returns focus to the button that opened it.
   *
   * Contract 2.4: a temporary view returns focus where it came from. Escape and
   * the button itself both come through here, so there is one return.
   */
  const closeCompanion = useCallback(() => {
    setCompanionOpen(false);
    queueMicrotask(() => companionButtonRef.current?.focus?.());
    announcer.announce('Codebook closed.');
  }, [announcer]);

  /**
   * The hop, per D-053. Three cases, and none of them closes anything.
   *
   * The companion round trip was asymmetric: `codes.focusSearch` came back from
   * anywhere, but going out meant the button, and Escape conflated returning
   * with dismissing. The workflow the companion exists for — read a definition,
   * check the code, read a sibling definition — needs a hop, not a close. So
   * Escape keeps its layered meaning and stops being the only way back.
   *
   * Which side focus is on is asked of the companion's own container rather
   * than tracked in state: state would have to be written from a focus handler
   * on every move inside either surface to answer one question asked on a
   * keypress. Anything outside the companion counts as the panel, which is how
   * D-053 frames it and is exhaustive while the panel holds focus.
   *
   * Deliberately silent. Escape and the button both announce because they
   * change what is on screen; this only moves focus, and a screen reader
   * reports the field it lands in. A second announcement over the top would
   * talk across the field's own name, which is the more useful of the two.
   */
  const hopToCodebook = useCallback(() => {
    if (!companionOpen) {
      // Identical to activating the button, per D-053, rather than a second
      // opening path that could drift from it.
      openCompanion();
      return;
    }

    const active = document.activeElement;
    const inCompanion = active instanceof Node && companionRegionRef.current?.contains(active);

    if (inCompanion) searchRef.current?.focus?.();
    else companionSearchRef.current?.focus?.();
  }, [companionOpen, openCompanion]);

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
    (codeIds: Id[], noteText = '') => {
      loadedCountRef.current = codeIds.length;
      applyPending(codeIds);
      // The note comes back with the codes, so the row reads "Edit note" and
      // opens on what is already written rather than on an empty box.
      setNoteText(noteText);
    },
    [applyPending],
  );

  const createProvisionalCode = useCallback(
    (draft: NewCodeDraft): Code | null => {
      const name = draft.name.trim();
      if (name === '') return null;

      const code: Code = {
        codeId: newCodeId(),
        projectId,
        parentCodeId: null,
        name,
        /*
          Empty, and left on the record rather than removed from the type. The
          fields still exist on every canonical code and in the seed; D-046
          narrowed what is collected and displayed, not what a `Code` is, so
          widening the definition set later is a display change.
        */
        shortDefinition: '',
        fullDefinition: '',
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

      // What was said here moved to `proposeFromQuery`, the only caller since
      // Task 50 removed the standing form: one action, one sentence.
      return code;
    },
    [applyPending, projectId],
  );

  /**
   * Proposes the searched-for name, checks it, and goes back to the field.
   *
   * D-070 puts this at the failure point rather than in standing chrome: the
   * panel gains nothing a participant has to learn unless the vocabulary fails
   * them, and when it does the fix is one action from where they noticed.
   *
   * The name is the query, so there is no empty-name case to guard — the empty
   * state only renders on a query that has already been trimmed and found
   * non-empty.
   */
  const proposeFromQuery = useCallback((): Code | null => {
    const code = createProvisionalCode({ name: query });
    if (!code) return null;

    // Discrete, and one sentence: the coder asked for one thing and got it.
    announcer.announce(`Proposed and checked: ${code.name}`);
    // After the render that removes the empty state this button lives in —
    // focus would otherwise fall to the body as the button unmounts.
    queueMicrotask(() => searchRef.current?.focus?.());
    return code;
  }, [announcer, createProvisionalCode, query]);


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

  /**
   * A checked code or a written note is enough.
   *
   * Gated on codes alone, a coder who wrote only a note had no way to keep it:
   * Save was unavailable and every exit discarded it. code-selection.md section
   * 8 says "save is unavailable while nothing is pending"; a note is now
   * something pending. The deletion guard that sentence also protects is kept
   * elsewhere — an empty pending list never supersedes an assignment.
   */
  const hasNote = noteText.trim() !== '';
  const canSave = pendingCodeIds.length > 0 || hasNote;

  const save = useCallback(() => {
    if (pendingCodeIds.length === 0 && noteText.trim() === '') {
      announcer.announce(
        'Save is unavailable because nothing is pending. Check a code or write a note.',
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
    // D-048: a reopened panel starts with the companion closed. Reset on the
    // close routes rather than on open, because resetting on open would be a
    // state write from inside an effect.
    setCompanionOpen(false);
    applyPending([]);
    setNoteText('');
    setUncertainState(false);
    setQueryState('');
    setDeletePending(false);
    announcedFor.current = null;
  }, [applyPending]);

  /**
   * Closing with nothing to commit: the capture goes and no record is created.
   *
   * Per D-042 this is no longer the general exit, only the empty one. Save is
   * unavailable with an empty pending assignment, so there is nothing here to
   * keep. On a reopened excerpt the saved assignments are untouched, which is
   * what keeps unchecking-everything-then-closing from becoming the deletion
   * route D-030 forbids.
   */
  const discardAndClose = useCallback(() => {
    loadedCountRef.current = 0;
    setSaveError(null);
    setCompanionOpen(false);
    applyPending([]);
    setNoteText('');
    setUncertainState(false);
    setQueryState('');
    setDeletePending(false);
    announcedFor.current = null;
    announcer.announce('Code Assignment closed. Nothing was coded.');
    onCancel();
  }, [announcer, applyPending, onCancel]);

  /**
   * The one way out, per D-042. Every exit — Escape, the close control, and
   * clicking outside — comes through here, so there is a single rule to learn:
   * leaving the panel keeps your work.
   *
   * With codes pending this *is* Save & Close. A failed save still closes
   * nothing and loses nothing: `save` records the error and returns, and only
   * the workspace's success path closes the panel, so the contract's "no user
   * work is discarded as a side effect of an error" holds through this route as
   * much as through the button.
   */
  const close = useCallback(() => {
    // Whatever `canSave` counts, closing keeps. Gated on codes alone, Escape
    // would still have thrown away a note-only draft without a word, which is
    // the loss this change exists to stop.
    if (pendingCodeIds.length > 0 || noteText.trim() !== '') {
      save();
      return;
    }
    discardAndClose();
  }, [discardAndClose, noteText, pendingCodeIds, save]);

  /* ---------- Deleting a saved excerpt, per D-030 ---------- */

  const requestDelete = useCallback(() => {
    setDeletePending(true);
    // Assertive, because contract 2.3 reserves that region for save failures
    // and destructive confirmations, and this is the second of those.
    announcer.announce(
      `Delete this excerpt and its ${pendingCodeIds.length} ${
        pendingCodeIds.length === 1 ? 'code' : 'codes'
      }? Nothing is deleted until you confirm.`,
      'assertive',
      'destructiveConfirmation',
    );
  }, [announcer, pendingCodeIds]);

  const confirmDelete = useCallback(() => {
    setDeletePending(false);
    onDelete?.();
  }, [onDelete]);

  const keepExcerpt = useCallback(() => {
    setDeletePending(false);
    announcer.announce('Nothing was deleted.');
  }, [announcer]);

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

      // Escape while the panel is open means close, wherever focus sits. The
      // resolution lives in the binding module because Escape means something
      // else with the panel closed.
      if (matched === 'codes.close') {
        /*
          Who owns Escape right now. With the shortcuts help open it is the
          help's, and this panel does nothing at all — closing the help must not
          commit or discard the coder's pending codes and note, which is the
          whole reason the layering exists rather than both closing at once.
        */
        if (resolveEscape({ helpOpen: isShortcutsHelpOpen(), panelOpen: true }) !== 'codePanel') {
          return;
        }
        event.preventDefault();

        /*
          Layered, per D-048: the first Escape closes the companion, the next
          closes the panel. Checked here rather than on the companion itself
          because this listener is on `document` — the layering has to hold
          wherever focus sits in the composite surface, not only inside the
          companion.
        */
        if (companionOpen) {
          closeCompanion();
          return;
        }

        // The same exit as the close control and as clicking outside, so all
        // three keep the work. D-042.
        close();
        return;
      }

      if (matched === 'codes.focusSearch') {
        event.preventDefault();
        focusSearch();
        return;
      }

      // The other half of the pair, per D-053. Both are on `document` for the
      // same reason Escape is: they have to work wherever focus sits in the
      // composite surface, including inside the companion.
      if (matched === 'codes.codebook') {
        event.preventDefault();
        hopToCodebook();
        return;
      }

      // Everything else, including typing in the search field, is left alone.
      void inField;
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, close, closeCompanion, companionOpen, focusSearch, hopToCodebook, isOpen]);

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
    projectId,
    openFocus,
    query,
    setQuery,
    results,
    tree,
    pendingCodeIds,
    isPending,
    toggle,
    codeById,
    proposedCodes,
    createProvisionalCode,
    proposeFromQuery,
    loadPending,
    noteText,
    setNoteText,
    uncertain,
    setUncertain,
    canSave,
    save,
    saveError,
    retrySave: save,
    setErrorElement,
    clearAfterSave,
    canDelete: isReopened,
    deletePending,
    requestDelete,
    confirmDelete,
    keepExcerpt,
    close,
    focusNote,
    registerNoteOpener,
    companionOpen,
    openCompanion,
    closeCompanion,
    hopToCodebook,
    setCompanionButton,
    setCompanionSearch,
    setCompanionRegion,
    focusSearch,
    setNoteElement,
    setSearchElement,
  };
}
