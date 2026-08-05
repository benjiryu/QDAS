# Decision Log

Every entry records what was decided, why, what it displaced, and what would reopen it. Decisions that contradict the Figma prototype are marked, because an unrecorded contradiction gets quietly reversed at the next design review.

## D-001 Excerpt selection is application-managed

Date: 2026-08 | Workflow: excerpt selection | Status: approved for prototype

Excerpt ranges are owned by the application, not by native browser text selection.

Reason: the range must survive focus moving into the codebook, must persist across views, and must be comparable against another coder's differently bounded range. Native selection is lost on focus change and cannot be stored or compared.

Alternatives: native selection only; native selection with a copy-on-confirm. Both fail the persistence requirement.

Accessibility implication: the application maintains an active segment rather than inferring position from the screen reader cursor, which it cannot know.

## D-002 Two-level segmentation

Date: 2026-08 | Workflow: transcript navigation | Status: approved for prototype, and a primary target of usability testing

Speaker turn is the focusable DOM unit. Sentence is the addressing and boundary unit, reachable by command, not independently focusable.

Reason: making every sentence focusable fragments continuous reading, since the screen reader announces each as a separate object. Making the turn the only addressable unit makes backward expansion too coarse, as a turn can run several minutes.

Alternatives: sentence-level focusable elements; turn-level addressing only; line as a unit, rejected because wrapping changes with zoom.

Reopened by: evidence from session one that participants navigate primarily by turn.

This is a core process under test rather than a settled implementation detail, and the comparison is already runnable. The `turnLevelNavigation` preset in `src/config/flags.ts` sets `transcriptNavigationUnit` to `speakerTurn` and `excerptInitialRange` to `activeSpeakerTurn`, so a session can be run against either model without a separate build. Record which preset a session used; a navigation finding is not interpretable without it.

Participant scenarios should include a task that requires backward expansion across a turn boundary, since that is where the two models diverge most and where sentence-level addressing either earns its cost or does not.

Consequence for D-016: word-level reading is free only because turns are continuous prose. If this decision is ever reversed toward per-sentence focusable elements, D-016 has to be reopened with it.

## D-003 Code panel is not anchored to the selected text

Date: 2026-08 | Workflow: code assignment | Status: proposed, contradicts the Figma prototype

The code selection panel occupies a fixed position rather than appearing adjacent to the selected excerpt.

Reason: an anchored popup lands in a different screen location for every excerpt. Under magnification only part of the interface is visible at once, and a control that moves forces the user to pan and re-locate. This is the predictability finding from the magnification interview.

Alternatives: anchored popup, as currently in Figma; full-page code selection. All three are retained as values of `codebookPresentation` so the comparison can be made in session rather than in argument.

Reopened by: task-based comparison showing magnification users are not disadvantaged by anchoring.

## D-004 Code list uses native checkboxes, not a tree widget

Date: 2026-08 | Workflow: code assignment | Status: approved for prototype

Codes are native checkboxes in nested lists. Hierarchy comes from list structure and group labels.

Reason: multi-selectable `role="tree"` has uneven screen reader support and requires reimplementing keyboard behavior native controls already provide. The accessibility contract prefers semantic HTML over ARIA recreation.

Alternatives: ARIA tree with multi-select; flat list with parent path in each label.

## D-005 Search is required in the code panel

Date: 2026-08 | Workflow: code assignment | Status: approved for prototype

The panel opens with a search field focused, with the full codebook visible below.

Reason: with a codebook of realistic size, browse-only navigation consumes most of a session and the resulting finding is about scrolling rather than coding. Search results appear in a separate region so the canonical codebook order never changes.

Contradicts: the current prototype specification, which gives the popup a create-code field and a code list with no search.

## D-006 Keyboard chords are platform-conditional

Date: 2026-08 | Workflow: all | Status: approved for prototype

Commands are named logically. Chord assignment differs by platform and lives in one configuration module.

Reason: no single modifier family is clear across the three target configurations. Alt+Arrow is browser Back and Forward on Windows; Alt+Shift triggers Firefox accesskeys and switches input language; Ctrl+Option is the VoiceOver modifier on macOS.

Known cost: Ctrl+Alt is AltGr on non-US layouts, acceptable for a US-based study and blocking for wider use.

## D-007 Real AFB data stays out of version control

Date: 2026-08 | Workflow: all | Status: proposed, blocked pending AFB confirmation

Deidentified AFB transcripts and codebook load from a gitignored local directory. Committed fixtures are synthetic.

Reason: the repository will be shared with a UCI MSE team and hosted remotely. Git history is permanent. Contributors without a data agreement should not receive the data by cloning.

Displaces: the handoff document's assumption of synthetic data throughout, which the team has revised in favor of real deidentified material for realism.

Blocked by: confirmation that the existing agreement covers development use, agent exposure, and display to research participants.

## D-008 Commit before running any generator in the repository

Date: 2026-08 | Workflow: process | Status: approved

Nothing is run against the working tree until the tree is committed.

Reason: `npm create vite` offers a "remove existing files" option that deletes an uncommitted working tree without recovery. This happened once during setup and cost a full restore.

Implication: the build sequence commits the specifications before the scaffold step, not after.

## D-009 The position indicator reports reading position, not coding completion

Date: 2026-08 | Workflow: transcript navigation | Status: approved

The indicator in the transcript header reports where the reader is in the source. It does not report how much of the source has been coded.

Reason: orientation is the need the research surfaced. A coder needs to know where they are before deciding what to do next. Coding completion is a different question, is administrator-facing, and belongs to progress reporting rather than to the reading surface.

Displaces: the Hi-Fi label `Progress 10%`, which reads as completion, and the earlier Home frame's `4:39/1:32:12 (53%)`, which reports audio elapsed time. Three different models existed across frames.

Implementation implications:

- The label changes. "Progress" implies completion and should not be used for position.
- The value derives from the active segment, never from scroll offset and never from audio time, so the spoken and visible reports cannot disagree. See `transcript-segment.md` section 5.
- For a screen reader user, reading position means the active segment, because the browse cursor position is not knowable to the application.
- Reported values: sentence index, turn index, percentage through the source, and timestamp when the source has audio.

## D-010 Code frequency is administrator-only

Date: 2026-08 | Workflow: code assignment | Status: approved

Code usage counts are not shown to a coder during independent coding.

Reason: seeing that a code has been applied twenty times can pull a coder toward or away from it. That is a methodological contamination, not a display preference.

Displaces: the Hi-Fi Coded data screen, which shows a count beside every code in the coder-facing filter list.

Flag: `showCodeFrequencies` remains at `administratorOnly`. Closes A-1.

## D-011 Notes attach to excerpts; file-level notes are a separate surface

Date: 2026-08 | Workflow: notes | Status: approved

On the coding page a note attaches to an excerpt. Broader notes about a whole source are created in a separate location and attach to the source.

Reason: a note written while coding is about the passage being coded, and detaching it from the range loses the thing it refers to. A note about the source as a whole has no excerpt to attach to and needs its own home.

Displaces: the Hi-Fi transcript row components, whose `Note=True` and `Note=False` variants attach notes to speaker turns.

Implementation implications:

- `Note.relatedExcerptId` is written for coding notes.
- `Note.relatedSourceId` is added to the domain model for file-level notes.
- A speaker turn shows a note indicator when it contains a coded excerpt that carries a note. The indicator is derived, not stored on the turn.
- The row component variants need rework, since a turn is no longer the thing a note belongs to.

Closes N-1. Note types, visibility rules, and the file-level notes surface remain open.

## D-012 File import is not a primary toolbar action

Date: 2026-08 | Workflow: navigation | Status: approved

Import is removed from the coding toolbar.

Reason: import is simulated for the prototype, and a primary control that does nothing invites participants to try it and produces findings about a feature that does not exist. The toolbar should carry only actions the coding workflow uses.

Displaces: the Hi-Fi top toolbar, which reads `Code | Note | Import file`.

## D-013 The codebook is a navigation destination, not a sidebar tree

Date: 2026-08 | Workflow: navigation | Status: approved, from the Hi-Fi

The sidebar lists sources. The codebook is reached as a destination and, during coding, through the code selection panel.

Reason: the earlier mockup carried an expandable code hierarchy in the sidebar alongside the file list, which put two different tree structures in one region and made the sidebar the tallest thing on the page at high zoom.

Closes A-3.

## D-014 Audio is docked, not floating

Date: 2026-08 | Workflow: transcript workspace | Status: approved, from the Hi-Fi

The audio player is docked full width at the bottom of the workspace.

Reason: a floating player overlaps content unpredictably and is difficult to locate at high magnification. Docking gives it a stable location.

Closes A-4. Audio remains out of scope for v0.1, so the docked player is designed but not built.

## D-015 Coding is an action on the open source, not a separate destination

Date: 2026-08 | Workflow: navigation | Status: approved, from the Hi-Fi

A coder opens a source from the sidebar and codes in place through a toolbar action. There is no separate coding workspace destination.

Reason: the alternative requires the user to navigate to a coding page and then choose a source, which duplicates the selection they already made. It also resolves the inconsistency in the earlier mockup, where Home appeared active while a transcript was displayed.

Closes A-2.

## D-016 Word-level precision belongs to the screen reader, not the application

Date: 2026-08 | Workflow: transcript navigation, excerpt selection | Status: approved

The application does not implement word-level navigation. Excerpt boundaries remain whole-sentence.

Reason: transcript text sits in the DOM as continuous prose, so every screen reader can already read and move by character, word, and line. Rebuilding that is precisely the duplication the interaction principles forbid. Assistive technology handles perception and reading; the platform handles research objects and workflow state.

This decision depends on D-002. Because speaker turns are continuous prose rather than a series of focusable per-sentence elements, word-level reading works with no application involvement. Had sentences been individually focusable, this decision would not have been available.

Two capabilities that sound alike and are not:

- **Word-level reading** is free. It works today, from the DOM, with no application code.
- **Word-level boundaries** are not free. A boundary is application state, and the application can only set one where it has an addressable unit. It also cannot observe where the screen reader's word cursor sits, for the same reason it cannot observe the browse cursor. So a user who has navigated to a word by ear cannot begin an excerpt at that word.

Consequence: a screen reader user can hear any word they like, and can start an excerpt only at a sentence. The team accepts that boundary. `Excerpt.startOffset` and `endOffset` remain in the model, always written at full segment bounds, so that word-level boundaries could be added later without migrating stored excerpts.

Closes T-2.

## D-017 Themes and file-wide notes are deferred to a later version

Date: 2026-08 | Workflow: notes | Status: approved

Neither the Themes page nor a file-wide notes surface is built in v0.1. A later version may carry a single page holding file-wide notes and emergent themes together.

Reason: both sit outside the three workflows the prototype evaluates. The Hi-Fi Themes page is a free-text box with no defined entity, no workflow, and no research question attached to it.

Implementation implications: `Note.relatedSourceId` exists in the model so that the later surface does not require a migration. No `Theme` entity is defined, because defining one before the workflow is understood would fix a shape the research has not yet justified.

Closes N-4 and A-5.

## D-018 Agent latitude on excerpt selection covers presentation, not behavior

Date: 2026-08 | Workflow: excerpt selection | Status: approved

The Hi-Fi contains no design for excerpt selection, so the coding agent has latitude to work out how the feature presents itself. The team then evaluates the result and iterates.

Where the latitude sits:

**Open to the agent.** Toolbar placement and grouping, control labels and affordances, how the pending range is visually indicated, how boundary markers are drawn, layout at each width, the visual relationship between the toolbar and the transcript.

**Not open to the agent.** The state machine and its transitions, what each command does to the range, boundary validity rules, the information content of announcements, focus entry and return destinations, what survives a cancel or a failed save, the acceptance criteria.

Reason: those second items are the research instrument. `excerpt-selection.md` already specifies them, drawn from the screen reader storyboarding sessions. If the agent invents them, a participant session tests the agent's guess rather than the team's design, and any workflow finding becomes uninterpretable, because nobody can say what was being evaluated. This is also rule 8 in `CLAUDE.md` and the standing instruction not to let a coding agent invent core product behavior.

The distinction is worth stating because "there is no design for this" and "there is no specification for this" are different situations, and only the first is true here.

Closes F-1.
