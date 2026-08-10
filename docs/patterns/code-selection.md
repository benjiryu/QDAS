# Pattern: Code Selection and Assignment

## Metadata

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08-05
- Related workflows: code-selection-and-assignment, excerpt-selection, notes-and-memos
- Related patterns: excerpt-selection, transcript-segment, pending-assignment (not yet written), status-feedback (not yet written). Definition display belongs to the Codebook destination, per D-035
- Research evidence: magnification interview with Carmel (stable code ordering), co-design workshop (codebook reference without losing position), competitive analysis (dropdown-based assignment as a friction point)

## Purpose

Let a researcher find one or more codes, apply them to a confirmed excerpt, and return to the transcript with position intact.

## Owns

- Code search and browse
- Pending assignment state
- Provisional code creation
- Save and return

## Does not own

- Excerpt boundaries (excerpt-selection.md)
- Codebook editing, approval, and versioning (codebook.md, not yet written)
- Note content and visibility rules (note-editor.md, not yet written)

## 1. Two changes from the current draft

**Search is required.** The current draft gives the popup a create-a-code field and a hierarchical checkbox list, with no way to search. With a codebook of realistic size, browse-only navigation will consume most of a participant session, and the finding will be about scrolling rather than about coding. Search is the first control in the panel.

**The panel is not anchored to the selected text.** The current draft places a popup adjacent to the selection. Under magnification this means the panel appears in a different screen location for every excerpt, which is the predictability problem Carmel raised. Resolved by D-027: a non-modal panel in a fixed position.

## 2. Container

A non-modal panel in a fixed position, present in the DOM only while open. Per D-027, which supersedes D-026 and reinstates D-003.

Fixed position, so the panel lands in the same place on every invocation. That is the predictability property the anchored popup failed, and it does not require modality to achieve.

Non-modal, so the transcript stays reachable and readable while codes are chosen. This is the property D-026 gave up and the reason it was reversed: a coder mid-selection who wants to check whether the last sentence is included can simply read it, and the route from a confirmed excerpt back to boundary adjustment stays open because boundary commands still reach the application.

The backdrop is not dimmed. Dimming tells a sighted user the content behind is unavailable, and with focus untrapped that would be untrue for a keyboard or screen reader user, who can move into it. Visual modality and interaction modality have to agree.

Consequences of being non-modal that the pattern has to handle:

- **The panel is a labeled region**, so a screen reader user browsing the document can find it without tabbing.
- **`codes.focusSearch` returns focus to the panel** from anywhere, which matters more here than it would in a dialog because focus can legitimately be in the transcript while the panel is open.
- **Escape cancels the panel** wherever focus sits, so a user who has moved into the transcript is not stranded with an open panel and no way to dismiss it.

The panel resizes and scrolls internally rather than holding fixed dimensions. The Hi-Fi frame is 441 by 568, which cannot fit at 400 percent zoom.

Placement remains a `codebookPresentation` flag, so the comparison recorded against B-2 can still be run: the fixed side panel, a full-page variant, and the centered modal. Testing the modal variant requires first building the excerpt readout and boundary-recovery control that D-026 needed, so it is not a free comparison.

### 2.1 Commands

| Command | Available when | Result |
|---|---|---|
| `codes.save` | Pending assignment is non-empty | Write assignments, close panel, return per `postCodingReturn` |
| `codes.cancel` | Panel open | Discard pending codes and draft note, close panel, excerpt stays `confirmed` |
| `codes.focusSearch` | Panel open | Move focus to the search field without clearing it |
| `codes.clearSearch` | Query is non-empty | Clear query, remove results region, focus search field |

Escape maps to `codes.cancel` and works wherever focus sits while the panel is open. Because Escape means something different with the panel closed, it is resolved by `resolveEscape(panelOpen)` in `src/config/keybindings.ts` rather than read from the chord table. See excerpt-selection.md section 4.2.

There is no separate adjust-boundaries command. The panel is non-modal, so the boundary commands in `excerpt-selection.md` section 4 reach the application directly and the excerpt toolbar remains visible and operable.

Save is unavailable with an empty pending assignment. Its unavailable state carries a programmatic reason, since a disabled control with no explanation is a dead end for a screen reader user.

Chords follow the platform-conditional mapping in transcript-segment.md section 4.2.

## 3. Regions, in fixed order

1. Panel heading, naming the excerpt by size and start speaker
2. Excerpt summary, with a control to re-read the full excerpt. A summary rather than the full text, because the transcript is reachable and the panel already carries eleven regions
3. Search field
4. Search results, present only when a query is active
5. Recently used codes, collapsed by default
6. Codebook, in canonical order
7. Proposed codes, present only when the project permits provisional codes
8. Create a code
9. Pending assignment
10. Note
11. Uncertainty control
12. Save, Cancel

This order never changes. Sections 4, 5, and 7 appear and disappear, but the sections that remain never reorder around them. Search results appear in their own region rather than filtering the canonical codebook in place, so the codebook's structure stays where the user learned it.

## 4. The code list

Native checkboxes in nested lists. Not a tree widget.

Rationale: `role="tree"` with multi-selection has uneven screen reader support and requires reimplementing keyboard behavior that native controls already provide correctly. The accessibility contract prefers semantic HTML over ARIA recreation, and this is the place where that preference pays for itself. Hierarchy is conveyed through nested list structure and through each group's accessible name, so a user reaching a child code hears its parent context without needing a tree's level announcements.

- Each code is a native checkbox with a visible label.
- Child codes sit in a nested list under their parent, labeled by the parent code.
- Checking a parent does not check its children. Coding a parent is a distinct analytic act from coding its children.
- Checking a box adds the code to the pending assignment and announces the pending count. The panel does not close.
- Unchecking removes it from pending.
- Order is the project's canonical codebook order, read from the stored `canonicalOrderIndex`. The index is computed once, at codebook import or code approval, as hierarchy first and then alphabetically within each parent. It is stored rather than recomputed on render, so that renaming a code does not silently move it. Order never changes with frequency, recency, or relevance.

Each code row exposes:

- Code name
- Short definition
- Color, as a redundant channel only. Color never carries meaning that is not also in text.

There is no definition control. Per D-035 the panel carries no definition display; the full definition, inclusion criteria, and exclusion criteria are read at the Codebook destination.

## 5. Search

- Searches code name, short definition, full definition, parent path, and synonyms. Definition text remains searchable even though it is not displayed in the panel, per D-035: a coder who remembers a phrase from a definition finds the code by typing it.
- Results appear in their own region, above the canonical codebook, with a heading stating the result count.
- Results show the parent path so a matched child code is identifiable without expanding the hierarchy.
- The canonical codebook remains present and unchanged below the results.
- The query persists while codes are checked, so a user can apply several codes from one search.
- Clearing the query removes the results region and returns focus to the search field.

## 6. Definitions are not in this panel

Per D-035 there is no definition control and no definition display here. The short definition on each code row is the only definition text the panel shows.

The full definition, inclusion criteria, and exclusion criteria are read at the Codebook destination, per D-013. Definitions remain in the domain model and remain searchable, per section 5.

The consequence is that the similar-code disambiguation case resolves outside the panel. Whether a confirmed excerpt and its pending assignment survive that trip is open as C-5 in `unresolved-questions.md`.

Examples remain out of scope for v0.1 per D-019, and remain hidden from a coder during independent coding per D-022. `Code.examples` stays in the model, unwritten and unread.

## 7. Creating a provisional code

- Name and short definition are required; full definition is optional.
- A created code enters the pending assignment immediately.
- It appears in the Proposed codes region, never in the canonical codebook. The canonical structure does not change until a qualitative lead approves the code.
- Status is `provisional` until approved.
- Announce on creation that the code was created as provisional and added to pending.

## 8. Pending assignment

The pending assignment is a visible, named region, not an implicit state behind the Save button.

When the panel opens on a saved excerpt, per D-030, it opens pre-populated with that excerpt's existing assignments rather than empty. The opening announcement states that existing codes are loaded and how many, so a screen reader user does not mistake them for codes they have just applied. Save then writes the difference rather than creating a new set.

It lists every pending code with a remove control, shows the count, and is announced on change. It persists while the user searches, browses, creates codes, and edits the note.

It also carries an uncertainty control, per D-021. Marking the assignment uncertain sets `uncertaintyFlag` on every assignment written at save. The control has a visible label and a programmatic state, and its change is announced like any other pending change. Uncertainty does not affect review ordering in v0.1; whether it should is open as N-3 and belongs to slice 3.

Save writes one `CodeAssignment` per pending code, all sharing the excerpt, coder, coding round, and codebook version. Save is unavailable while the list is empty.

Pending codes survive a return to boundary adjustment. If the user invokes a boundary command from `confirmed`, the panel closes and the pending list is held until the excerpt is confirmed again.

Removing a code that was already saved sets its `CodeAssignment.status` to `superseded` rather than deleting the row. The project preserves before-and-after history rather than overwriting it, and a removed assignment is evidence about how interpretation changed. Codes checked and unchecked before a save were never written and leave no trace.

Save stays unavailable with an empty pending assignment. Emptying the list and saving is therefore not a route to deleting an excerpt; deletion is a separate explicit action, not built in v0.1. A destructive action reached by clearing a list and pressing Save is too easy to perform by accident.

Cancel discards all pending changes and the draft note, and creates no records. On a reopened excerpt, cancel leaves the saved assignments as they were. Cancel prompts for confirmation when there are unsaved changes.

## 9. Focus behavior

| Trigger | Focus destination |
|---|---|
| Panel opens | Search field |
| Check or uncheck a code | Unchanged |
| Create a code | Pending assignment region |
| Remove a pending code | Next pending code, or the pending region heading if the list is now empty |
| Save succeeds | Per `postCodingReturn`, default `excerptStartSegment` |
| Boundary command invoked from the panel | The invoked boundary control; panel closes, pending codes held |
| Save fails | The error message, with retry adjacent |
| Cancel | Command strip, excerpt still confirmed |

## 10. Screen reader information

| Event | Automatic | On request |
|---|---|---|
| Panel opens, new excerpt | Panel name, excerpt size and start speaker | Full excerpt text |
| Panel opens, saved excerpt | Panel name, excerpt size and start speaker, that existing codes are loaded and how many | Full excerpt text, code names |
| Search returns | Result count | Result list |
| Code checked | Code name, new pending count | Pending list |
| Code unchecked | Code name removed, new pending count | Pending list |
| Code created | Provisional status, added to pending | Pending list |
| Save succeeds | Codes applied, count, return location | Assignment detail |
| Save fails | What failed, that nothing was lost, that retry is available | Error detail |

Save confirmation states the return location explicitly, because the user needs to know where they are before deciding what to do next.

## 11. Visual and magnification behavior

- Fixed panel position, unchanged between invocations.
- Checked state is not conveyed by color alone; the native checkbox provides shape.
- Code color is redundant with the code name in every location it appears, including the transcript's right-hand column.
- Layout follows D-033: the narrow form is primary and the wide form derives from it. Narrow: collapsed source sidebar, command strip, transcript, this panel as a full-width labeled region below the transcript. Wide: the same sequence with the panel permitted alongside the transcript, fixed right, roughly 360 to 400 pixels at 100 percent zoom. The logical order is identical in both.
- The panel is completable without horizontal panning.
- Hierarchy indentation at high zoom uses a text indicator in addition to indent depth, since indentation past a few levels is easy to lose when only part of the panel is visible.

## 12. Persistence and error recovery

Preserved across search, browse, and note editing: excerpt boundaries, transcript position, pending codes, search query, draft note.

On save failure nothing is discarded. The excerpt stays confirmed, the pending codes stay pending, the note stays drafted, and retry is available.

## 13. Data model

```text
CodeAssignment
  assignmentId
  excerptId
  codeId
  coderId
  codingRoundId
  codebookVersionId
  status              active | provisional | superseded
  uncertaintyFlag
  visibility
  createdAt
  updatedAt

Code
  codeId
  projectId
  parentCodeId        nullable
  name
  shortDefinition
  fullDefinition
  inclusionCriteria
  exclusionCriteria
  examples
  synonyms
  colorToken
  status              approved | provisional | deprecated | merged
  canonicalOrderIndex

Note
  noteId
  authorId
  noteType
  noteText
  visibility
  status
  relatedExcerptId      populated in v0.1
  relatedAssignmentId   reserved, unused in v0.1
  relatedCodeId         reserved, unused in v0.1
  createdAt
```

`codebookVersionId` is recorded on every assignment so that a later codebook change does not retroactively alter what a coder was working from.

`CodeAssignment.status` distinguishes an assignment made against an approved code from one made against a code still awaiting approval, and marks assignments superseded by a reflexivity decision. `CodeAssignment.visibility` carries the independent-coding rule from users-and-roles.md. Neither is exercised by this pattern; both are written at save so that review and administration can read them without a migration.

`Note` is listed here for field agreement only. Note behavior, types, and visibility rules belong to note-editor.md, which is not yet written.

## 14. Acceptance criteria

**Search does not reorder the codebook.** Given a query returning three codes, when the results appear, then the canonical codebook remains present below them in unchanged order.

**Multiple codes in one pass.** Given an open panel, when the user checks three codes, then all three appear in the pending assignment and the panel has not closed.

**Query survives selection.** Given an active query and one checked result, when the user checks a second result, then the query and both selections are intact.

**Stable code order.** Given the codebook in project hierarchy, when the panel is closed and reopened, then the hierarchy and item order are unchanged.

**Parent does not cascade.** Given a parent code with two children, when the parent is checked, then only the parent enters the pending assignment.

**Provisional codes do not enter the canonical list.** Given a newly created code, when the panel is reopened, then the code appears under Proposed codes and the canonical codebook order is unchanged.

**Cancel creates nothing.** Given two pending codes and a draft note, when the user confirms cancel, then no assignment and no note exist, and the excerpt remains confirmed.

**Save failure preserves everything.** Given two pending codes and a draft note, when saving fails, then both codes, the note, and the excerpt are preserved and retry is available.

**Return location is announced.** Given a successful save, when the panel closes, then the announcement states how many codes were applied and where focus has returned.

**Not color-only.** Given the panel rendered without color, when a user identifies a code and its checked state, then both remain identifiable.

## 15. Prototype configuration

```text
codebookPresentation:  sidePanel | fullPage | centeredModal
  v0.1 assumption: sidePanel, per D-027

codeListEntry:  searchFirst | browseFirst
  v0.1 assumption: searchFirst

showRecentCodes:  true | false
  v0.1 assumption: true, collapsed by default

showExamplesDuringIndependentCoding:  true | false
  v0.1 assumption: true

allowProvisionalCodes:  true | false
  v0.1 assumption: true

showCodeFrequencies:  administratorOnly | reviewPhase | always
  v0.1 assumption: administratorOnly
```

## 16. Unresolved questions

**Placement: resolved by D-027.** A non-modal panel in a fixed position. The full-page and centered-modal variants stay behind the flag so the comparison in B-2 remains runnable, with the caveat that the modal variant needs the excerpt readout and boundary-recovery control built first.

**Search-first or browse-first?**
Owner: team. Evidence needed: session one. Temporary assumption: search field focused on open, with the full codebook visible below so browsing costs nothing. Implementation can proceed.

**Should examples be visible during independent coding?**
Owner: Angie. Evidence needed: qualitative lead interview. This is a methodological question about coder independence, not an interface question, and should not be resolved by the design team. Temporary assumption: visible. Implementation can proceed behind the flag.

**How is hierarchy represented at high zoom?**
Owner: Benji. Evidence needed: magnification session. Temporary assumption: indentation plus a text level indicator. Implementation can proceed.

**Notes: resolved by D-011.** A coding note attaches to the excerpt. File-wide notes attach to the source and live in a separate surface that is out of scope for v0.1. `relatedAssignmentId` and `relatedCodeId` stay reserved and unwritten.

**Code frequency: resolved by D-010.** `showCodeFrequencies` stays at `administratorOnly`. No count appears in this panel, and none appears in any coder-facing view during independent coding. The Hi-Fi Coded data screen currently shows a count beside every code and needs that removed for the coder view.

**Can a coder mark an assignment uncertain, and does uncertainty raise review priority?**
Owner: Angie. Evidence needed: qualitative lead interview. Temporary assumption: `uncertaintyFlag` exists in the model and is settable, and does not yet affect review ordering. Implementation can proceed.
