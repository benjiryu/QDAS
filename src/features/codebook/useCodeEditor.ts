import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import { resolveEscape } from '../../config/keybindings';
import { writeCode } from '../../data/codebookStore';
import {
  applyDraft,
  codeFromDraft,
  eligibleParents,
  familyColorToken,
  nextCanonicalIndex,
  validateCodeDraft,
} from '../../domain';
import type { Code, CodeDraft, CodeDraftProblem, Id } from '../../domain';

/**
 * The code editor panel: its fields, its validation, and its one way to save.
 *
 * Specification: decision D-070.
 *
 * ## Why this panel closes differently from every other
 *
 * D-042 made every exit from the code panel commit, and D-055 and D-058 carried
 * that idiom to the note panel: leaving keeps your work. This one is the
 * recorded exception, and the reason is what a partial record means in each
 * case. A half-written note is a note — shorter than intended, still the
 * coder's thought, still worth keeping. A half-defined code is nothing: a name
 * with no definition and no place in the hierarchy is not a vocabulary entry,
 * it is a fragment that would then appear in every coder's panel.
 *
 * So: explicit Save writes, every other exit discards, and validation blocks
 * Save and never blocks closing. Nobody is stranded in a panel they opened by
 * mistake, which is the half of D-042 that survives here intact.
 *
 * The exception is scoped to this panel. Nothing else changes.
 */

export type EditorMode = 'create' | 'accept' | 'edit';

export interface CodeEditorApi {
  isOpen: boolean;
  mode: EditorMode;
  draft: CodeDraft;
  setName: (name: string) => void;
  setDefinition: (definition: string) => void;
  setParent: (parentCodeId: Id | null) => void;
  setColor: (colorToken: string | null) => void;
  /** Which codes may be chosen as a parent, per D-070's depth cap. */
  parents: Code[];
  /**
   * Whether the placement fields render.
   *
   * False when editing a code that is already in the hierarchy: D-070 makes
   * parent and colour immutable there, because moving a code between families
   * changes its hue and every pill already drawn in it — a version-migration
   * problem the decision defers.
   */
  canPlace: boolean;
  problems: CodeDraftProblem[];
  /** Set only after an attempt, so a fresh form does not open shouting. */
  showProblems: boolean;
  openCreate: () => void;
  openAccept: (code: Code) => void;
  save: () => void;
  /** Every exit but Save. Discards, per D-070. */
  discard: () => void;
  setNameElement: (node: HTMLInputElement | null) => void;
}

const EMPTY_DRAFT: CodeDraft = {
  name: '',
  definition: '',
  parentCodeId: null,
  colorToken: null,
};

/** Opaque identifier for a code created this session. */
function newCodeId(): Id {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(16).slice(2, 12);
  return `cd-${random}`;
}

export function useCodeEditor({
  projectId,
  codes,
  onSaved,
}: {
  projectId: Id;
  /** Every code the codebook holds, merged, so uniqueness is codebook-wide. */
  codes: Code[];
  /** Called after a write, so the page can re-read what it renders. */
  onSaved: () => void;
}): CodeEditorApi {
  const announcer = useAnnouncer();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>('create');
  const [draft, setDraft] = useState<CodeDraft>(EMPTY_DRAFT);
  const [showProblems, setShowProblems] = useState(false);
  const [editing, setEditing] = useState<Code | null>(null);

  /** Where focus was before the panel took it. Contract 2.4. */
  const returnTo = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const setNameElement = useCallback((node: HTMLInputElement | null) => {
    nameRef.current = node;
  }, []);

  const problems = validateCodeDraft(draft, codes, editing?.codeId);
  const canPlace = mode !== 'edit';

  const open = useCallback(
    (next: { mode: EditorMode; draft: CodeDraft; editing: Code | null; announcement: string }) => {
      returnTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMode(next.mode);
      setDraft(next.draft);
      setEditing(next.editing);
      setShowProblems(false);
      setIsOpen(true);
      announcer.announce(next.announcement);
    },
    [announcer],
  );

  const openCreate = useCallback(() => {
    open({
      mode: 'create',
      draft: EMPTY_DRAFT,
      editing: null,
      announcement: 'New code. Name field focused.',
    });
  }, [open]);

  const openAccept = useCallback(
    (code: Code) => {
      /*
        Prefilled, and with the placement fields offered: a provisional has no
        parent yet, and choosing one is exactly how it enters the hierarchy. The
        immutability D-070 states applies to a code already placed there.
      */
      open({
        mode: 'accept',
        draft: {
          name: code.name,
          definition: code.fullDefinition,
          parentCodeId: null,
          colorToken: null,
        },
        editing: code,
        announcement: `Accept ${code.name}. Name field focused.`,
      });
    },
    [open],
  );

  /*
    Focus lands in the name field on open.

    In an effect keyed on the transition rather than at the end of `open`: the
    field does not exist until this state change has rendered, and a
    `queueMicrotask` from `open` still runs too early, leaving the dialog to take
    focus onto itself. The shape `useNotePanel` uses, for the same reason.
  */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen === wasOpen.current) return;
    wasOpen.current = isOpen;
    if (!isOpen) return;
    nameRef.current?.focus?.();
  }, [isOpen]);

  const returnFocus = useCallback(() => {
    const target = returnTo.current;
    returnTo.current = null;
    // After the dialog has unwound its own focus restore, the same ordering
    // every focus return in this build needs.
    queueMicrotask(() => {
      if (target?.isConnected) target.focus?.();
    });
  }, []);

  const discard = useCallback(() => {
    setIsOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditing(null);
    setShowProblems(false);
    returnFocus();
  }, [returnFocus]);

  const save = useCallback(() => {
    if (problems.length > 0) {
      /*
        Blocks the save and nothing else. The message is beside the field and
        focus moves there, the idiom `CreateCodeForm` already uses; announcing
        it as well would say the same thing twice to the same person.
      */
      setShowProblems(true);
      queueMicrotask(() => nameRef.current?.focus?.());
      return;
    }

    const merged = codes;
    const parentColor = familyColorToken(merged, draft.parentCodeId);
    const index = nextCanonicalIndex(merged, draft.parentCodeId);

    const code =
      editing === null
        ? codeFromDraft(draft, { codeId: newCodeId(), projectId }, index, parentColor)
        : applyDraft(editing, draft, canPlace ? index : editing.canonicalOrderIndex, parentColor);

    writeCode(projectId, code);
    setIsOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditing(null);
    setShowProblems(false);
    onSaved();

    announcer.announce(
      mode === 'accept'
        ? `${code.name} accepted into the codebook.`
        : `${code.name} saved to the codebook.`,
    );
    returnFocus();
  }, [announcer, canPlace, codes, draft, editing, mode, onSaved, problems.length, projectId, returnFocus]);

  return {
    isOpen,
    mode,
    draft,
    setName: (name) => setDraft((current) => ({ ...current, name })),
    setDefinition: (definition) => setDraft((current) => ({ ...current, definition })),
    setParent: (parentCodeId) =>
      // A descendant has no colour of its own to keep, so choosing a parent
      // clears one rather than leaving a stale choice to be written.
      setDraft((current) => ({
        ...current,
        parentCodeId,
        colorToken: parentCodeId === null ? current.colorToken : null,
      })),
    setColor: (colorToken) => setDraft((current) => ({ ...current, colorToken })),
    parents: eligibleParents(codes),
    canPlace,
    problems,
    showProblems,
    openCreate,
    openAccept,
    save,
    discard,
    setNameElement,
  };
}

/**
 * Whether the editor owns Escape right now.
 *
 * Asked through `resolveEscape` rather than branched on here, so one module
 * stays responsible for what Escape means — and so the shortcuts help, which
 * can open above this panel, keeps the key while it is up.
 */
export function editorOwnsEscape(helpOpen: boolean): boolean {
  return resolveEscape({ helpOpen, editorOpen: true, panelOpen: false }) === 'codeEditor';
}
