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

Date: 2026-08 | Workflow: code assignment | Status: superseded by D-026, then reinstated by D-027

The position this decision took is the current one. D-026 briefly replaced it with a centered modal; D-027 reversed that and returned here. The round trip is recorded rather than erased, because the reason for the reversal is evidence about the pattern.

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

Date: 2026-08 | Workflow: all | Status: approved. No longer blocked; see D-025

Deidentified AFB transcripts and codebook load from a gitignored local directory. Committed fixtures are synthetic.

Reason: the repository will be shared with a UCI MSE team and hosted remotely. Git history is permanent. Contributors without a data agreement should not receive the data by cloning.

Displaces: the handoff document's assumption of synthetic data throughout, which the team has revised in favor of real deidentified material for realism.

Unblocked by D-025. The agreement is secured, and this decision stands regardless: permission to use the data is not a reason to commit it, because git history is permanent and the MSE team who will clone the repository are not party to the agreement.

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

## D-019 Code examples are out of scope for v0.1

Date: 2026-08 | Workflow: code assignment | Status: approved

The definition disclosure shows short definition, full definition, inclusion criteria, and exclusion criteria. Examples are not shown, and no example content is required in the fixture.

Reason: scope. Examples add content to author and a region to lay out, and the disambiguation behavior the panel is being tested for is carried by the definition and the inclusion and exclusion criteria.

Important distinction, so this is not later mistaken for a settled question. C-2 asked whether examples should be visible *during independent coding*, which is a methodological question about coder independence and belongs to Angie. This decision does not answer it. It removes examples from v0.1, so the methodological question does not yet arise. When examples are built, C-2 returns and still needs a methodological answer.

Implementation implications:

- `Code.examples` stays in the domain model, unwritten and unread in v0.1.
- `showExamplesDuringIndependentCoding` defaults to `false` and governs nothing until examples exist.
- The seed fixture still requires full definitions with inclusion and exclusion criteria for every code, and still requires a pair of similarly named codes. Definitions carry the disambiguation case on their own.

## D-020 Note types are deferred to the notes page specification

Date: 2026-08 | Workflow: notes | Status: approved

A note in v0.1 is free text with no type. Note types, and the visibility rules that go with them, will be specified in a notes page specification written later.

Reason: typed notes only earn their cost once there is somewhere that filters or routes by type, and that surface does not exist in v0.1. Choosing a type list now would fix a taxonomy before the workflow that consumes it is understood.

Implementation implications:

- `Note.noteType` stays nullable and is written as null.
- A notes page specification becomes an expected document. It owns note types, visibility rules, the file-wide notes surface from D-011 and D-017, and how notes are searched and filtered.

Closes N-2.

## D-021 A coder can mark an assignment uncertain

Date: 2026-08 | Workflow: code assignment | Status: approved

The coding panel carries a control that marks the pending assignment uncertain. The flag is stored and does not affect review ordering in v0.1.

Reason: uncertainty was raised in the co-design workshop both as a thing coders want to record in the moment and as a filter for review. Recording it costs one control; reconstructing it after the fact is impossible.

Implementation implications, because this is not currently in the build sequence:

- Task 10 gains an uncertainty control on the pending assignment.
- `CodeAssignment.uncertaintyFlag` is written at save. `PendingAssignment.uncertaintyFlag` already exists in `src/domain/types.ts`.
- The control has a visible label and a programmatic state, and its change is announced like any other pending-assignment change.
- Review ordering ignores it for now. Whether uncertainty raises review priority stays open as N-3 and belongs to Angie.

Closes the implementation half of N-3.

## D-022 Code examples are hidden during independent coding

Date: 2026-08 | Workflow: code assignment | Status: approved

When examples are built, they are not visible to a coder during independent coding. They may be visible in other phases.

Reason: methodological. An example is a prior coder's interpretation of the code, and reading it during independent coding imports that interpretation into a judgment that is supposed to be made independently. That contaminates the disagreement the review phase exists to examine, because two coders who both read the same example are no longer coding independently.

This supersedes the scope-only reasoning in D-019. Examples remain out of v0.1 for scope reasons, and when they arrive `showExamplesDuringIndependentCoding` stays `false` for a methodological reason that does not expire.

Implementation implication: the flag governs visibility by phase, not globally. Examples appear in review, reflexivity, and any training or onboarding surface, and not in the coding panel during independent coding.

Closes C-2.

## D-023 Uncertainty raises review priority

Date: 2026-08 | Workflow: review and reflexivity | Status: approved, implemented in slice 3

An assignment marked uncertain raises the priority of its review item.

Reason: a coder flagging uncertainty is the cheapest and most reliable signal the system has about where interpretation is unsettled. Discovering the same thing later by comparing disagreement patterns is slower and less specific, and misses the case where two coders were both uncertain and happened to agree, which looks like consensus and is not.

Implementation implications:

- `uncertaintyFlag` is written at save in v0.1 per D-021, so the data exists before the consuming behavior does.
- Review ordering in slice 3 raises items containing at least one uncertain assignment.
- No conflict with R-4. Coder identities stay hidden until independent coding closes, and review ordering only applies after it does. Uncertainty never becomes visible to another coder during independent work.
- Agreement plus mutual uncertainty is a distinct state from agreement plus confidence, and review should be able to tell them apart.

Closes N-3.

## D-024 The development smoke test runs in VoiceOver

Date: 2026-08 | Workflow: process | Status: approved, with a stated coverage limit

The routine accessibility smoke test during development runs in VoiceOver on macOS with Safari.

Reason: it is the configuration available to the team, and it catches the majority of structural defects: missing accessible names, wrong heading order, lost focus, absent announcements.

Coverage this does not provide, stated so that a clean pass is not over-read:

- Browse mode. NVDA and JAWS intercept single keys for quick navigation; VoiceOver does not work this way, so keyboard collisions will not surface.
- Live region behavior under rapid successive announcements differs across all three.
- AFB participants are more likely to use JAWS or NVDA on Windows than VoiceOver.

Consequence: item 11 of the pre-session smoke test, chord verification against the participant's own screen reader and browser, remains a per-session gate and is not satisfied by the development smoke test. NVDA is free and runs on any Windows machine or virtual machine, which makes closing this gap cheap for participants who use it.

Closes T-5 for development. The session gate stays open by design.

## D-025 Real deidentified AFB data is approved for participant sessions

Date: 2026-08 | Workflow: all | Status: approved, with one sub-question carved out

A data agreement is secured with AFB. Real deidentified transcripts and the real codebook may be used in participant sessions.

Closes B-1 as a session gate. The prototype no longer has to run session one on the synthetic fixture, and the ecological validity concern recorded against that fallback goes away.

What does not change:

- **D-007 stands.** Real data still stays out of version control. Permission to use the data is not a reason to commit it, because git history is permanent and the repository will be cloned by a UCI MSE team who are not party to the agreement. Real material continues to load from gitignored `data-local/`.
- **Committed fixtures stay synthetic.** Tests, CI, and any contributor without data access continue to run against the fixture.
- **The agent still does not read real transcripts.** Development happens against the fixture. This was never only a permission question; it is also a practical one, since transcript content in an agent's context is content sent to a model provider.

Carved out, because permission to show a transcript to a participant is not the same permission as publishing one:

- **Public web deployment is a separate question.** A deployed prototype is reachable by anyone with the URL even when the repository is private. If the session build contains real transcripts, those transcripts are on the open internet without authentication. Whether the agreement covers that is recorded as B-3.

## D-026 Code selection is a centered modal dialog

Date: 2026-08 | Workflow: code assignment | Status: SUPERSEDED by D-027. Retained because its consequence analysis is what produced the reversal

The code selection panel opens as a dialog centered in the viewport, with the surrounding view dimmed. It closes on save and close, or on exit.

Supersedes D-003, which specified a fixed non-modal side panel, and closes B-2.

Reason: a viewport-centered dialog lands in the same place on every invocation, which satisfies the predictability finding from the magnification interview that the anchored popup failed. It also gives an unambiguous single focus context.

Consequences, because this reverses the non-modal choice that several specified behaviors depended on:

**The transcript is no longer reachable while coding.** `code-selection.md` chose non-modal specifically so a coder could re-read the excerpt and retrieve surrounding context without leaving the panel. A dialog traps focus, correctly, so those behaviors have to move inside the dialog and work from stored excerpt state:

- The excerpt text is readable inside the dialog, not only summarized.
- Context before and context after are retrievable from inside the dialog.
- Without both, a coder who realizes mid-selection that they need to re-read the passage has to cancel out and start again.

**The route from confirmed back to boundary adjustment has to change.** `excerpt-selection.md` had a boundary command invoked from `confirmed` close the panel and return to `adjusting`. A focus-trapping dialog will not receive those chords. The dialog therefore carries an explicit control that closes it and returns to boundary adjustment, preserving pending codes. That recovery path is not optional; realizing the boundaries are wrong is the most common reason to back out of code selection.

**Dialog size is not fixed.** The Hi-Fi panel is 441 by 568. At 400 percent zoom that cannot fit, so the dialog resizes and scrolls internally rather than holding fixed dimensions. Centering is relative to the viewport, not the document, so a magnified user panned into a corner still finds it.

**Dimming is decoration, not information.** No state may be conveyed by the backdrop alone, and the dimmed backdrop must not reduce the contrast of anything a user still needs to read.

**Use React Aria Components here.** A dialog with correct focus trapping, restore-on-close, escape handling, and scroll locking is one of the few genuinely hard controls to hand-roll, and `CLAUDE.md` reserves React Aria for exactly this case.

**The design does not yet meet this.** The updated Figma has neither the excerpt text nor an adjust-boundaries control in the dialog. Tracked as F-10 and F-11. Both are consequences of modality rather than oversights, and Task 8 cannot be built to specification until the design supplies them or the container changes.

**Flag values change.** `codebookPresentation` becomes `centeredModal | fullPage | sidePanel`, defaulting to `centeredModal`. The alternatives are retained because the test design recorded against B-2 remains valid, and this is a high-frequency interaction where a comparison is still worth running.

## D-027 Code selection returns to a fixed non-modal panel

Date: 2026-08 | Workflow: code assignment | Status: approved. Supersedes D-026 and reinstates D-003

The code selection panel is non-modal and occupies a fixed position. The backdrop is not dimmed.

Reason: D-026 chose a centered modal for predictable placement, and predictable placement was the right goal. Modality was not required to reach it. A fixed non-modal panel lands in the same place every time and keeps the transcript live, which a focus trap forecloses.

What the reversal recovers, both of which D-026 had to reintroduce as new work and which the updated Figma did not carry:

- **Reading the excerpt.** A coder mid-selection who wants to check whether the last sentence is included reads it in the transcript. Under the modal, with the transcript dimmed and focus trapped, the only route was to cancel and start again, and a screen reader user had no route at all.
- **Returning to boundary adjustment.** Boundary commands reach the application directly, so the `confirmed` to `adjusting` transition works as originally specified. The modal required inventing a dedicated recovery control because chords cannot cross a focus trap.

Closes F-10 and F-11 by removing their cause rather than by satisfying them.

Consequences of non-modality that the pattern now handles explicitly:

- The panel is a labeled region, findable in browse mode without tabbing.
- `codes.focusSearch` returns focus to the panel from anywhere, which matters because focus can legitimately sit in the transcript while the panel is open.
- Escape cancels the panel wherever focus sits, so a user who moved into the transcript is not stranded.
- No dimming. A dimmed backdrop asserts the content behind is unavailable; with focus untrapped that is false for a keyboard or screen reader user. Visual and interaction modality have to agree.

What this costs: no single unambiguous focus context. A user can be in the panel or in the transcript while both are active, and the pattern relies on the labeled region and the return-to-panel command to keep that navigable. That is the trade accepted.

Flag values: `codebookPresentation` becomes `sidePanel | fullPage | centeredModal`, defaulting to `sidePanel`. The modal stays in the enum, but comparing it in a session is no longer free, because it would first need the excerpt readout and boundary-recovery control that D-026 identified.

The updated Figma shows the centered modal and now contradicts this decision. Tracked as F-12.

## D-028 Right-click keeps the native browser menu

Date: 2026-08 | Workflow: excerpt selection, code assignment | Status: approved

The application does not override the browser context menu. Right-click does what the browser does.

A custom context menu may be added later, scoped as an accelerator for sighted and magnification users. It is never a primary route.

Reason: overriding the context menu removes functionality some users depend on, including spell check, dictionary lookup, extensions, and speech commands installed at the browser or system level. That cost is paid by everyone, to add a second path to commands the excerpt toolbar already provides.

Consistent with the interaction principles: assistive technology and the browser handle their own affordances, and the platform adds only what they cannot understand. A context menu duplicating existing controls is not that.

Conditions on the accelerator, if it is built:

- Every command in it is also reachable from the excerpt toolbar. It adds no capability.
- It responds to Shift+F10 and the applications key, not only to a pointer event. A menu that opens only on right-click is a mouse-only path and fails keyboard operability.
- It is understood to carry the anchored-popup problem that D-003 and D-027 rejected: a context menu appears at the pointer, so it lands somewhere different every time and may open outside the visible region at high magnification. That is tolerable for an accelerator and was not tolerable for the primary code panel.
- Scoped to sighted and magnification use, consistent with E-2 treating the mouse route as secondary. The screen reader workflow never depends on it.

Closes the right-click half of the question raised against the toolbar specification. Two related gaps stay open, recorded as F-13 and F-14.

## D-029 Two controls enter the coding flow, not one context-sensitive control

Date: 2026-08 | Workflow: excerpt selection, code assignment | Status: approved

The coding toolbar carries two separate controls, both always present.

- **Start excerpt.** Anchors an excerpt at the active segment. Maps to `excerpt.begin`.
- **Code this excerpt.** Locks the range and opens the code panel. Maps to `excerpt.confirm`.

Each is disabled when unavailable, and the disabled state exposes its reason programmatically, per accessibility contract section 2.6.

Reason: a single `Code` button would mean "begin an excerpt here" to a keyboard user with no range in progress, and "confirm this selection and open the panel" to a mouse user who has just dragged across three sentences. One control with two meanings depending on how the user arrived is the kind of thing the predictability principle exists to prevent, and it is worse for a screen reader user, who cannot see which situation they are in.

Two stable controls also give phase feedback for free. Which control is available tells the user whether an excerpt is in progress, without asking.

Resolves the ambiguity in the Hi-Fi top toolbar, which shows a single `Code` button. Note is a separate question, recorded as F-14.

## D-030 A saved excerpt can be reopened to change its codes

Date: 2026-08 | Workflow: code assignment | Status: approved

Selecting a coded excerpt reopens the code panel with that excerpt's existing codes already in the pending assignment. The coder adds or removes codes and saves.

Reason: applying a code and immediately wanting to add a second is ordinary. Without this, `saved` is a terminal state and the only route to a second code is to build a duplicate excerpt over the same range, which corrupts the comparison data that review depends on.

### Reaching it without a mouse

Highlight plus click is the sighted route. Coded segments are not focusable, per D-002, so a command is required for parity:

`excerpt.open` opens the saved excerpt containing the active segment. Available whenever the active segment falls inside at least one saved excerpt.

Where the active segment falls inside two or more excerpts, the `coded-multiple` case the fixture already contains, the command does not guess. It presents the overlapping excerpts as a list identified by range and code count, and the coder chooses. The same disambiguation applies to a click landing on overlapping highlights.

### What the panel does differently

- The pending assignment opens pre-populated with the saved assignments rather than empty.
- The opening announcement states that existing codes are loaded and how many, so a screen reader user does not mistake them for codes they just added.
- Save writes the difference rather than creating a new set.
- Focus still lands in the search field.

### Removal supersedes rather than deletes

Removing a saved code sets `CodeAssignment.status` to `superseded`. The row is retained.

Reason: the project's standing commitment is that the system preserves before-and-after history rather than overwriting earlier results. A removed assignment is evidence about how interpretation changed, and it is exactly what review and reflexivity need. Deleting it makes "what did this coder originally apply here" unanswerable.

This costs nothing in v0.1, where nothing reads `superseded`, and means the data is already correct when slice 3 arrives. Codes checked and unchecked before a save were never written and leave no trace.

### Removing the last code

Save stays unavailable with an empty pending assignment, per the existing rule. Removing every code and saving is therefore not a route to deleting an excerpt.

Deleting a coded excerpt is a separate explicit action, and is not built in v0.1. A destructive action reached by emptying a list and pressing Save is too easy to perform by accident.

### What this does not open

Boundary editing on a saved excerpt stays deferred, per E-4. Reopening changes codes only. The excerpt returns to `confirmed` with its range locked, and the boundary commands are unavailable until the edit path is specified.
