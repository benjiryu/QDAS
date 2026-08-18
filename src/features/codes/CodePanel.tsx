import { useId, useMemo } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import {
  bindingsFor,
  describeChord,
  detectPlatform,
  isTypeAheadCharacter,
} from '../../config/keybindings';
import type { PrototypeFlags } from '../../config/flags';
import type { Code } from '../../domain';
import { CodebookContent } from '../codebook/CodebookContent';
import { NoteDisclosure } from './NoteDisclosure';
import type { CodeNode } from './codeTree';
import type { CodePanelApi } from './useCodePanel';
import './codePanel.css';

/**
 * The Code Assignment card.
 *
 * Specification: docs/patterns/code-selection.md sections 2 to 7, as revised by
 * decisions D-039, D-040, and D-042.
 *
 * D-042 gave the panel one way out. Escape, the close control, and clicking
 * outside all commit, exactly as Save & Close does; the discard confirmation is
 * gone because nothing is destroyed on the way out any more. Closing with
 * nothing checked still creates nothing, which is what keeps a panel opened by
 * mistake from being a trap.
 *
 * D-039 cut this down to the card: the verbose heading, the excerpt summary and
 * its read-back control, the visual level labels, and the pending assignment
 * region are all gone. The checkboxes are the pending state now — they were
 * always the thing the coder was actually looking at, and the region beneath
 * them restated it in a second place that could disagree.
 *
 * D-040 puts back the two affordances that removal cost, in forms that fit the
 * card: the captured excerpt as visually hidden text a screen reader user reads
 * on demand with their own commands, and an uncertainty checkbox in the footer.
 *
 * No definition control and no definition display, per D-035. The short
 * definition on each row is the only definition text here; the rest is read at
 * the Codebook destination.
 *
 * A centered modal dialog, reinstating D-026's container over D-027's fixed
 * non-modal panel. Two of D-027's four reasons for the reversal no longer
 * exist: D-036 removed the boundary adjustment a focus trap could not reach,
 * and D-040 put the excerpt inside the panel, which is what a coder previously
 * had to leave the panel to re-read. Raised in the task report.
 *
 * React Aria owns the dialog because focus trapping, focus restore, scroll
 * locking, and click-outside are precisely the things a hand-rolled one gets
 * subtly wrong, which is the case `CLAUDE.md` reserves the library for.
 *
 * Its sub-regions are heading-labelled rather than landmarks: D-039 fixes their
 * order, and more landmarks inside one dialog would crowd the landmark list the
 * accessibility contract keeps short.
 *
 * D-026's sizing constraint still holds and is in the stylesheet: the dialog
 * resizes and scrolls internally rather than holding 441 by 568, which cannot
 * fit at 400 percent zoom, and it centres on the viewport rather than the
 * document so a magnified user panned into a corner still finds it.
 */

interface CodePanelProps {
  panel: CodePanelApi;
  flags: PrototypeFlags;
  /** The captured text itself, for the hidden readback. D-040. */
  excerptText: string | null;
}

export function CodePanel({ panel, flags, excerptText }: CodePanelProps) {
  const headingId = useId();
  const searchId = useId();
  const companionId = useId();
  const toggleId = useId();
  const resultsId = useId();
  const proposedId = useId();

  /* The chord shown on the Open Codebook button, per D-053 and contract 2.2. */
  const platform = useMemo(() => detectPlatform(), []);
  const bindings = useMemo(() => bindingsFor(platform), [platform]);

  // Destructured, so the search input's callback ref is a plain local. Reading
  // it off the panel object in JSX makes the ref rule treat every other read of
  // that object as a ref access during render.
  const {
    setSearchElement,
    query,
    setQuery,
    results,
    tree,
    pendingCodeIds,
    proposedCodes,
    noteText,
    uncertain,
    setUncertain,
    canSave,
    canDelete,
    deletePending,
    saveError,
    setErrorElement,
    // The companion's three callback refs, destructured for the same reason as
    // the search one above: read off `panel` in JSX, the ref rule treats every
    // other read of that object as a ref access during render.
    setCompanionButton,
    setCompanionSearch,
    setCompanionRegion,
    companionOpen,
    openCompanion,
    closeCompanion,
    focusSearch,
    projectId,
  } = panel;

  /*
    Type-ahead in spirit, the search machinery in fact, per D-054.

    Participants expected first-letter navigation and did not find it. It is a
    property of widget roles — listbox, menu, tree — which D-004 declined to
    imitate, and label association could not give the list something its role
    never had. But the need underneath it, jump-by-typing from where you are
    standing, is what the search field already does, so the letter goes there
    rather than a tree being built to receive it.

    The character starts the query rather than being swallowed, so the first
    keystroke counts and typing carries on uninterrupted in the field. The count
    is spoken by the existing continuous search announcement — nothing new
    announces here, which is what keeps it one settled count rather than two.

    Which keys qualify lives in the binding module. Space and Enter keep their
    checkbox meanings, and every modified key is left for the chords.
  */
  function handleTypeAhead(event: React.KeyboardEvent<HTMLUListElement>) {
    if (!isTypeAheadCharacter(event.nativeEvent)) return;
    event.preventDefault();
    setQuery(event.key);
    focusSearch();
  }

  return (
    <ModalOverlay
      className="code-panel__overlay"
      isOpen={panel.isOpen}
      /*
        Clicking outside is the same exit as Escape and the close control, per
        D-042: it commits. Controlled rather than self-closing, because a save
        that fails has to leave the dialog standing — `close` runs the save,
        `isOpen` stays true when it reports an error, and the work is still
        here to retry.
      */
      onOpenChange={(open) => {
        if (!open) panel.close();
      }}
      isDismissable
      /*
        Escape stays with the binding module. `resolveEscape` decides who owns
        it and `useCodePanel` acts on that; letting React Aria also close on
        Escape would give one key two handlers racing to close.
      */
      isKeyboardDismissDisabled
    >
      {/*
        The surface holds the card and, when it is open, the companion beside
        it. Both live inside the dialog, which is what puts the companion in the
        panel's focus scope: D-048 makes the two one composite surface for a
        keyboard and screen reader user, not two things to move between.
      */}
      <Modal
        className="code-panel__modal"
        data-companion={companionOpen ? '' : undefined}
      >
        <Dialog className="code-panel__surface" aria-labelledby={headingId}>
          <div className="code-panel">
      {/* 1. Heading and close. */}
      <div className="code-panel__header">
        <h2 id={headingId} className="code-panel__heading">
          Code Assignment
        </h2>
        {/*
          The card's close control. Named "Close" since D-042: it commits the
          pending codes and the note rather than discarding them, so the name
          D-039 gave it, "Cancel", would now describe the opposite of what it
          does. This span is the control's whole accessible name — the glyph is
          hidden — so the name is the only thing standing between a screen
          reader user and a surprise.
        */}
        <button
          type="button"
          className="code-panel__close"
          data-command="codes.close"
          onClick={panel.close}
        >
          <span aria-hidden="true">×</span>
          <span className="code-panel__close-label">Close</span>
        </button>

      {/*
        The captured excerpt, per D-040. Visually hidden static text, read on
        demand with the reader's own commands and repeatable as often as they
        like.

        Deliberately not `aria-describedby` on the panel, which would recite the
        whole excerpt every time focus entered, and deliberately not a live
        region, since nothing here changes. Full text, never truncated: a
        truncated readback cannot answer the question it exists for.
      */}
      <p className="code-panel__hidden-excerpt" data-selected-excerpt>
        Selected excerpt: {excerptText ?? 'none.'}
      </p>
      </div>

      {/*
        Everything between the two fixed ends. The header and the footer hold
        still while this scrolls, so the excerpt's name and the way out are
        always where the coder left them.
      */}
      <div className="code-panel__scroll" data-scroll-region>

      {/* 2. Search field. First control in the panel, per D-005.
          No region heading: the field's own label names it, and a heading one
          line above saying the same thing is one more thing to browse past.
          No Clear search control either — `type="search"` gives pointer users
          the browser's own clear, and a keyboard user selects and deletes. */}
      <div className="code-panel__region">
        {/* "Search codes" against the companion's "Search codebook", per
            D-053. With both on screen a screen reader user has to be able to
            tell from the field's name alone which of the two searches they are
            in, and two fields both called some variation of "codes" cannot. */}
        <label htmlFor={searchId}>Search codes</label>
        <input
          id={searchId}
          ref={setSearchElement}
          type="search"
          className="code-panel__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* 3. Search results. Present only with an active query: an always-present
          empty region is one more thing to browse past. */}
      {query.trim() !== '' ? (
        <div className="code-panel__region" data-region="search-results">
          <h3 id={resultsId}>
            {results.length} {results.length === 1 ? 'result' : 'results'} for “{query.trim()}”
          </h3>
          {results.length === 0 ? (
            <>
              <p>No codes match. The codebook below is unchanged.</p>
              {/*
                The one action the empty state offers, per D-070 and Task 50.
                It lives here rather than in standing chrome so the panel gains
                nothing a coder has to learn until the vocabulary fails them —
                and when it does, the fix is one press from where they noticed.

                Under the same flag as the region the proposal lands in: a build
                that hides proposed codes must not offer a way to make one.
              */}
              {flags.allowProvisionalCodes ? (
                <button
                  type="button"
                  className="code-panel__propose"
                  onClick={panel.proposeFromQuery}
                >
                  Propose “{query.trim()}” as a new code
                </button>
              ) : null}
            </>
          ) : (
            /* Named by its own heading, so a list-jump lands on "3 results for
               water" rather than on "list, 3 items". D-051. */
            <ul className="code-panel__list" aria-labelledby={resultsId}>
              {results.map((result) => (
                <li key={result.code.codeId}>
                  <CodeCheckbox code={result.code} panel={panel} lineage={result.parentPath} />
                  {/* The parent path, so a matched child code is identifiable
                      without expanding the hierarchy. Section 5.

                      Out of the accessibility tree since D-054: the same
                      lineage is the checkbox's description now, and left
                      readable it would be said twice — once as the row's
                      description and again as loose text after it, which is
                      the second stop D-051 removed from these rows. The eye
                      keeps it; the ear gets it from the description. */}
                  {result.parentPath.length > 0 ? (
                    <span className="code-panel__path" aria-hidden="true">
                      {' '}
                      in {result.parentPath.join(' › ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* 4. Codebook, in canonical order, present and unchanged whatever the
          search is doing. The checked boxes here are the pending assignment:
          D-039 removed the region that used to restate them. */}
      <div className="code-panel__region" data-region="codebook">
        {/*
          The region's heading is the button now, per D-048. That is a real
          cost: a screen reader user browsing by heading loses the stop this
          region had, and finds it among the buttons instead. Raised in the
          task report.

          `aria-controls` only while the companion exists, rather than pointing
          at an id that is not in the document.
        */}
        <button
          type="button"
          id={toggleId}
          ref={setCompanionButton}
          className="code-panel__companion-toggle"
          aria-expanded={companionOpen}
          aria-controls={companionOpen ? companionId : undefined}
          onClick={() => (companionOpen ? closeCompanion() : openCompanion())}
        >
          {/* An affordance, because this replaced a heading and would otherwise
              look exactly like the one it replaced. Drawn from the glyphs
              Luciole actually carries. */}
          <span className="code-panel__companion-caret" aria-hidden="true">
            ›
          </span>
          Open Codebook
          {/*
            The visible control for `codes.codebook`, per contract 2.2 and
            D-053. Out of the accessible name for the reason the toolbar gives —
            the chord should not be repeated on every control — and here for a
            second reason as well: this button names the codebook list below it
            through `aria-labelledby`, so a chord inside the name would rename
            the list along with it.
          */}
          <kbd className="code-panel__chord" aria-hidden="true">
            {describeChord(bindings['codes.codebook'], platform)}
          </kbd>
        </button>
        {/* The specific gap the Task 28a finding left: this list lost its name
            when its heading became the button. The button names it now. */}
        <CodeList
          nodes={tree}
          panel={panel}
          labelledBy={toggleId}
          onTypeAhead={handleTypeAhead}
        />
      </div>

      {/* 5. Proposed codes. D-039's region order does not name this one, and
          does not list it as removed either; it has to stay, because a created
          code must be visible and checkable somewhere and the acceptance
          criterion in section 7 keeps it out of the canonical codebook. Raised
          in the task report. */}
      {flags.allowProvisionalCodes && proposedCodes.length > 0 ? (
        <div className="code-panel__region" data-region="proposed">
          <h3 id={proposedId}>Proposed codes</h3>
          <p className="code-panel__note">
            Awaiting approval. These are not part of the codebook.
          </p>
          <ul className="code-panel__list" aria-labelledby={proposedId}>
            {proposedCodes.map((code) => (
              <li key={code.codeId}>
                <CodeCheckbox code={code} panel={panel} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 6. Note, collapsed. One per excerpt, plain text, no type: types
          belong to the notes page specification, per D-020. D-032 keeps it
          here rather than on the top bar. */}
      <NoteDisclosure panel={panel} openExpanded={panel.openFocus === 'note'} />

      </div>

      {/* 8. The footer: the flag, delete where it applies, and Save & Close. */}
      <div className="code-panel__region code-panel__actions" data-region="actions">
        {deletePending ? (
          /*
            Deleting asks first. It is the panel's only confirmation now that
            D-042 removed the discard one, and it stays because D-030 built
            the confirmation into the requirement: a destructive action that is
            easy to perform by accident is the thing it was guarding against.
          */
          <div className="code-panel__confirm" data-confirm="delete">
            <p>
              Delete this excerpt and its {pendingCodeIds.length}{' '}
              {pendingCodeIds.length === 1 ? 'code' : 'codes'}? Nothing has been deleted yet.
            </p>
            <button type="button" autoFocus onClick={panel.confirmDelete}>
              Delete it
            </button>
            <button type="button" onClick={panel.keepExcerpt}>
              Keep it
            </button>
          </div>
        ) : (
          <>
            {/* The error, with retry adjacent, per section 9. Focus lands here
                on a failure so the first thing heard is what happened and that
                nothing was lost. */}
            {saveError ? (
              <div
                className="code-panel__save-error"
                data-save-error
                ref={setErrorElement}
                tabIndex={-1}
              >
                <p>
                  {saveError} Nothing was lost: {pendingCodeIds.length}{' '}
                  {pendingCodeIds.length === 1 ? 'code' : 'codes'}
                  {noteText.trim() === '' ? '' : ', your note,'} and the excerpt are still here.
                </p>
                <button type="button" onClick={panel.retrySave}>
                  Retry save
                </button>
              </div>
            ) : null}

            {/* Nothing on screen says why this is unavailable. Pressing it
                with nothing checked still announces the reason, so contract
                2.6's "a disabled control with no explanation is a dead end"
                holds through the ear rather than the eye. */}
            {/* Only where there is a saved excerpt to delete. A fresh capture
                has no record to remove: closing it with nothing checked
                already leaves nothing behind. Its confirmation stays, unlike
                the discard one D-042 removed — deleting destroys records that
                exist, which is what D-030 made it ask about. */}
            {canDelete ? (
              <button
                type="button"
                className="code-panel__delete"
                onClick={panel.requestDelete}
                data-command="codes.delete"
              >
                Delete excerpt
              </button>
            ) : null}

            <button
              type="button"
              aria-disabled={canSave ? undefined : true}
              onClick={panel.save}
              data-command="codes.save"
            >
              Save &amp; Close
            </button>

            {/* A checkbox rather than a button, because this is state that
                modifies the save and not an action of its own. D-040.

                After Save & Close in the markup as well as on screen: a flex
                `order` that moved it visually while leaving it earlier in the
                tab sequence is the mismatch contract 2.1 exists to prevent.

                Labelled generally, but still writing `uncertaintyFlag`, which
                D-023 reads as uncertainty when it orders slice 3 review. The
                label and the field no longer mean quite the same thing; raised
                in the task report. */}
            {/* Wrapping, for the reason D-051 gives for the code rows: a
                `for`-associated label beside its control reads as a second
                stop. Not a code pill, so outside the letter of the task, but
                the identical defect two lines away. */}
            <label className="code-panel__code code-panel__uncertain">
              <input
                type="checkbox"
                checked={uncertain}
                onChange={(event) => setUncertain(event.target.checked)}
              />
              <span className="code-panel__code-body">Flag</span>
            </label>
          </>
        )}
      </div>
          </div>

          {/*
            The companion, per D-048. The same component the destination page
            renders — one component, two surfaces, so they cannot drift apart.

            Families at `h3`: the dialog's own title is the `h2`, so the page's
            base level cannot be used here. Read-only, and it adds no
            capability; codes are checked in the panel and nowhere else.
          */}
          {companionOpen ? (
            /*
              A labeled region, per D-053, which is the free route: a browse-mode
              user reaches the codebook by landmark and its family cards by
              heading, without knowing the chord at all.

              Named "Codebook" rather than by the button that opened it. The
              button reads "Open Codebook", which names an action; a region
              named for the act of opening it tells a user arriving by landmark
              nothing about where they have arrived.
            */
            <section
              className="code-panel__companion"
              id={companionId}
              ref={setCompanionRegion}
              aria-label="Codebook"
              data-companion-codebook
            >
              <CodebookContent
                projectId={projectId}
                headingLevel={3}
                searchRef={setCompanionSearch}
              />
            </section>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * Native checkboxes in nested lists, not a tree widget.
 *
 * Section 4: multi-selectable `role="tree"` has uneven screen reader support
 * and would mean reimplementing keyboard behaviour native controls already
 * provide. Hierarchy comes from the nesting and from each nested list being
 * labelled by its parent code, so a child is heard in context without a tree's
 * level announcements.
 */
function CodeList({
  nodes,
  panel,
  labelledBy,
  label,
  onTypeAhead,
}: {
  nodes: CodeNode[];
  panel: CodePanelApi;
  /** The root list, named by the Open Codebook button. */
  labelledBy?: string;
  /** A nested list, named by the code it hangs from. */
  label?: string;
  /**
   * D-054's redirect, passed only by the root call. Keystrokes bubble out of
   * the nested lists to here, so one handler covers the whole tree and no
   * nested list runs it a second time on the way past.
   */
  onTypeAhead?: (event: React.KeyboardEvent<HTMLUListElement>) => void;
}) {
  return (
    <ul
      className="code-panel__list code-panel__tree"
      aria-labelledby={labelledBy}
      aria-label={label}
      onKeyDown={onTypeAhead}
    >
      {nodes.map((node) => (
        <li key={node.code.codeId} data-depth={node.depth}>
          <CodeCheckbox
            code={node.code}
            panel={panel}
            depth={node.depth}
            lineage={node.parentPath}
          />
          {node.children.length > 0 ? (
            <ul className="code-panel__list code-panel__tree" aria-label={node.code.name}>
              {node.children.map((child) => (
                <li key={child.code.codeId} data-depth={child.depth}>
                  <CodeCheckbox
                    code={child.code}
                    panel={panel}
                    depth={child.depth}
                    lineage={child.parentPath}
                  />
                  {child.children.length > 0 ? (
                    /* Named like the level above it: every list a rotor can
                       land on says which code it belongs to. D-051. */
                    <CodeList nodes={child.children} panel={panel} label={child.code.name} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CodeCheckbox({
  code,
  panel,
  depth = 0,
  lineage = [],
}: {
  code: Code;
  panel: CodePanelApi;
  depth?: number;
  /** The ancestors, outermost first. Empty for a top-level code. D-054. */
  lineage?: readonly string[];
}) {
  const describedById = useId();

  /*
    The lineage, per D-054: the D-041 twin pattern applied to hierarchy.

    Nesting and indentation carry the family tree to the eye. They do not reach
    the ear — screen readers flatten nested lists in form contexts — so a
    participant standing on a grandchild heard its name and nothing about where
    it came from. This says it, in the channel that was silent.

    Not in the name. The name stays exactly the code name, so search, sorting,
    and the type-ahead redirect all keep operating on clean names, and so a
    coder checking a box hears what they are checking rather than a path.
    Verbosity is then the user's own screen reader setting, which is the right
    owner for it: this is context, not identity.

    Outermost first — "in Water access, Rules" for a grandchild — so the path
    reads general to specific while the row as a whole reads specific to
    general: the code, then its family. Speech cannot be skimmed, so the thing
    being named comes first.
  */
  /*
    And whether it is provisional, per D-070's "marked in both channels wherever
    they render".

    In the description beside the lineage rather than in the name, for exactly
    the reason above: the name stays the code name. Grey was the only channel
    carrying this until now, under a stylesheet comment reading "a proposed code
    is marked in words, never by colour alone" — the words did not exist.
  */
  const isProvisional = code.status === 'provisional';
  const describedBy =
    [isProvisional ? 'Provisional' : null, lineage.length > 0 ? `in ${lineage.join(', ')}` : null]
      .filter((part): part is string => part !== null)
      .join(', ') || null;

  /*
    The label wraps the control, per D-051.

    Associated by `for` and sitting beside it, the pill named the checkbox
    correctly and *also* stayed in the accessibility tree as loose text: one
    row, two stops, the code name read twice. Wrapping consumes the text into
    the control's name, which is what makes the row one stop.

    The description sits outside the label rather than inside it. Inside, its
    text would join the label's contents and land in the name, which is the one
    thing D-054 rules out. `aria-hidden` would exclude it from the name
    computation, but resting name purity on that is resting it on a subtlety;
    outside, the name cannot pick it up however the rules are read.
  */
  return (
    <>
      <label className="code-panel__code" data-depth={depth}>
        <input
          type="checkbox"
          checked={panel.isPending(code.codeId)}
          onChange={(event) => panel.toggle(code.codeId, event.target.checked)}
          data-code-id={code.codeId}
          aria-describedby={describedBy ? describedById : undefined}
        />
        <span className="code-panel__code-body">
          <span className="code-panel__code-name">{code.name}</span>
          {/* Colour is a redundant channel only, never carrying meaning that is
              not also in text. Section 4. D-039 removed the visible level label;
              the nested lists still expose depth programmatically.

              No definition text: a list scanned by name does not need a second
              line of prose against every row. Definitions are read at the
              Codebook destination, per D-035. */}
          <span
            className="code-panel__swatch"
            data-color-token={code.colorToken}
            aria-hidden="true"
          />
        </span>
      </label>

      {/*
        The visible half, outside the label so it cannot join the name. `aria-hidden`
        because the description above already says it, and a row that said it twice
        is the second stop D-051 removed from these rows.
      */}
      {isProvisional ? (
        <span className="code-panel__provisional" aria-hidden="true">
          Provisional
        </span>
      ) : null}
      {describedBy ? (
        <span id={describedById} className="visually-hidden">
          {describedBy}
        </span>
      ) : null}
    </>
  );
}
