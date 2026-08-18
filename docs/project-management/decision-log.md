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

## D-031 One command strip, permanently reserved

Date: 2026-08 | Workflow: excerpt selection, code assignment | Status: approved

The two entry controls from D-029 and the excerpt boundary controls share a single command strip under the top navigation. The strip is always present. Boundary controls are disabled while no excerpt is in progress, with the reason exposed programmatically, rather than appearing when one begins.

Reason: a toolbar that appears shifts layout, and layout shift under magnification means losing your place, which is the predictability finding again. A permanently reserved strip never reflows on state change, and the enabled and disabled pattern doubles as phase feedback: which controls are available tells any user, sighted or not, whether an excerpt is in progress, without asking.

This extends the disabled-with-reason commitment D-029 already made for the entry controls to the whole strip, one behavior instead of two.

Each control shows its chord, generated by `describeChord` in `src/config/keybindings.ts`. Every command already requires a visible control; making the control teach the chord is how a participant graduates from clicking to keying mid-session, which is itself a workflow observation worth having.

Closes F-13. Strip layout and grouping within it stay with design, per D-018.

## D-032 The top-bar Note button is removed for v0.1

Date: 2026-08 | Workflow: notes | Status: approved

The coding top bar does not carry a Note button. The excerpt note lives in the code panel, region 10.

Reason: the panel's note region is the excerpt note, and the file-wide notes surface is deferred under N-4, so a top-bar Note currently has no target that is not redundant. Same logic as D-012: a control without a real target invites participants to try it and produces findings about a feature that does not exist.

When the file-wide notes surface is built, Note returns with a distinct meaning: a note about the source, not the excerpt. Two buttons, two targets, no ambiguity.

Closes F-14.

## D-033 The narrow layout is designed first and the wide layout derives from it

Date: 2026-08 | Workflow: all layout | Status: approved

Reflow is not adapted from the wide layout; the wide layout is derived from the narrow one.

At 320 effective pixels the order is: collapsed source sidebar as a disclosure, command strip, transcript, code panel as a full-width labeled region below the transcript. The wide layout is the same sequence with the panel permitted to sit alongside the transcript, fixed right, roughly 360 to 400 pixels at 100 percent zoom, per D-027.

Reason: deriving wide from narrow guarantees the logical order never differs between the two, which is what the accessibility contract actually requires. Designing wide first is how a side panel ends up with no coherent narrow form, which is where the Hi-Fi currently is.

Closes F-7. F-12, updating the Figma, now has concrete direction: draw the 320 stack first, then the wide variant, no modal, no dimming.

## D-034 Native selection is an entry route into the application-owned range

Date: 2026-08 | Workflow: excerpt selection | Status: approved. Makes E-2 concrete; revisits and reaffirms D-001

### The reflection that produced this

The team compared the prototype against Word's F8 extend mode and asked whether building an application-owned range had drifted from augmenting native selection into replacing it.

The comparison clarified rather than reversed the decision. Word's F8 is itself a modal, unit-based expansion system, not raw selection; the difference is ownership, and Word can let the platform own the range because an editable document has a system caret every screen reader tracks. A read-only web transcript has neither: in browse mode, NVDA and JAWS hold selection in their virtual buffer, and the application often cannot observe it. The posture Word takes is not available here without `role="application"` or `contenteditable`, both of which take more from screen reader users than they give.

The nearer analogy is Excel, which AFB's own workaround is built on. Excel's model is an active cell and range extension by whole units, application-owned and announced. D-001 and D-002 are that model applied to transcript sentences. The familiarity argument cuts toward the current design, not away from it.

What the reflection did surface: native selection should be a first-class way in for the users whose selection the application can observe.

### The rule

One range, owned by the application. Three ways to set it, one way to adjust it.

- **Command route**, unchanged, primary for screen reader users because it is the only route the application can verify: `excerpt.begin` anchors at the active segment.
- **Pointer route**: a native drag selection inside the transcript is adopted when the user invokes either strip control.
- Magnification users take either route; the pointer route is expected to dominate.

After entry, everything is identical for everyone: same states, same boundary commands, same announcements, same panel.

### Adoption behavior

- **Start excerpt** with an observable non-collapsed selection inside the transcript: adopt it as the range and enter `anchored`, with the adopted range as origin. `anchored` is generalized to mean the range sits at its origin, whether that origin is the active segment or an adopted selection.
- **Code this excerpt** in `idle` with an observable selection: adopt and confirm in one action, opening the panel. One click from drag to codebook, which is the mouse user's expectation.
- **Snapping never shrinks.** The adopted range is every sentence the selection touches, expanded outward to whole-sentence boundaries. A selection covering half a sentence takes the sentence.
- **The announcement names the snap**: adopted range size, and that boundaries were extended to whole sentences when they were.
- **The native selection is cleared on adoption.** From that moment the application's range indicator is the only visible selection. Two simultaneous selection visuals is the parallel-concept confusion made worse.
- **Adoption is opportunistic, never required.** If no observable selection exists, which is the normal case in browse mode, both controls behave exactly as D-029 specified. No behavior anywhere depends on the application seeing a native selection.
- Selections reaching outside the transcript region clamp to the transcript's sentences. A collapsed selection is not a selection; clicking already sets the active segment.

Availability change to D-029: **Code this excerpt** is enabled in `idle` when an observable selection exists inside the transcript, with adoption as its action. Otherwise its disabled reason stands.

Flag: `adoptNativeSelection`, default true, so the behavior can be switched off for a comparative session.

### What would reopen this

Session evidence that the snap surprises sighted users into fighting it, or that screen reader participants attempt browse-mode selection and are confused that it does nothing. The second is partially mitigated: where a browse-mode selection does surface as an observable DOM selection, adoption works for it too.

## D-035 Definition lookup is removed from the code panel

Date: 2026-08 | Workflow: code assignment | Status: approved. Supersedes the definition disclosure specified in code-selection.md section 6 and closes F-3

The code panel carries no per-code definition control and no definition display. Opening a definition is not an action available while coding.

Reason: panel density. The panel already carries a heading, an excerpt summary, search, results, recent codes, the codebook, proposed codes, code creation, the pending assignment, a note, an uncertainty control, and save and cancel. A disclosure on every code row adds a control per code to a list of fifty, and a second layer of content inside a region a magnification user is already scrolling through in parts.

What does not change:

- **Definitions stay in the domain model.** `Code.shortDefinition`, `fullDefinition`, `inclusionCriteria`, and `exclusionCriteria` are unchanged, still authored in the seed fixture, and still required of every code.
- **Definitions stay searchable.** Search continues to match against short and full definition text, so a coder who remembers a phrase from a definition still finds the code by typing it.
- **Definitions stay viewable at the Codebook destination**, which D-013 already established as a place the codebook is read rather than a sidebar tree.

Consequence, stated plainly because it is the cost: the similar-code disambiguation case now resolves at the Codebook destination rather than in the panel. The seed fixture's deliberately similar pairs, `Water access` and `Water access rules`, `New member support` and `New member onboarding`, are told apart by reading definitions somewhere other than where the coding happens.

This makes a previously unasked question load-bearing: whether a confirmed excerpt and its pending assignment survive a trip to the Codebook destination and back. Recorded as C-5.

### What would reopen this

Session evidence that coders cannot distinguish similar codes without leaving the panel: a participant applying the wrong code of a similar pair, hesitating over one, or abandoning the round trip and guessing.

## D-036 Excerpt capture is native-selection-first; the boundary command system is removed

Date: 2026-08 | Workflow: excerpt selection | Status: approved. Defines v0.2. Supersedes the in-progress-range half of D-001, and D-016's whole-sentence boundary rule; collapses D-029, D-031, and D-034; retires E-1, E-3, and E-5

Feedback on v0.1 found the excerpt machinery too heavy: anchoring, boundary expansion and contraction, confirmation states. v0.2 removes it and tests the opposite bet.

### The model

- **Sighted and magnification users** drag a native selection and act on it through a custom right-click context menu (D-037). The selection is captured exactly as dragged.
- **Screen reader users** select natively where their screen reader surfaces a real DOM selection, then fire one shortcut, `excerpt.code`, to capture it.
- **When the shortcut fires with no observable selection** — the common NVDA and JAWS browse-mode case, since virtual-buffer selection reaches the DOM inconsistently — **the focused speaker turn is captured instead.** Turns are already focusable per D-002, so this always works, at turn granularity. The announcement states exactly what was captured: "Coding your selection, N sentences" versus "No selection detected. Coding the current turn, speaker, N sentences." A user must never believe their selection was captured when the fallback fired.
- **Boundaries are stored as exact characters** via `startOffset` and `endOffset`, reserved since v0.1. Boundary variation between coders is data, not noise; review compares at sentence granularity per R-1 while storage preserves precision.

### What is removed

Boundary expansion and contraction commands, by sentence and by turn. Revert. The `anchored` and `adjusting` states. The excerpt read-back and context commands, since native selection reads natively. Sentence snapping. The two-control entry model. The strip shrinks to navigation, position, and a single visible "Code selection" control, which is the keyboard-operability twin of `excerpt.code` required by contract 2.2.

### What survives unchanged

The stored excerpt is still application-owned: capture converts a fragile native selection into a persistent record, which was always D-001's core claim. The code panel and pending assignment (D-027, D-030). Segment navigation and position reporting (D-009). `excerpt.open` for reopening coded excerpts. The transcript's two-level structure (D-002), which the fallback now depends on.

### The bet being tested, stated honestly

The storyboarding finding that started this project — a coder recognizes a codeable idea only at its end — now rides on native backward selection and on the turn fallback, not on app commands. If v0.2 sessions show screen reader participants failing to select backward, or living on the turn fallback and finding it too coarse, that is the evidence that reopens this decision, and v0.1's machinery is preserved at tag v0.1.

Dead flags: `excerptInitialRange`, `boundaryChangeAnnouncement`, `deltaTruncationWords`, `adoptNativeSelection`. Marked deprecated rather than deleted, since v0.1 comparisons may still run.

## D-037 A custom context menu on transcript selections, superseding D-028's accelerator-only scope

Date: 2026-08 | Workflow: excerpt selection, code assignment | Status: approved

Right-clicking a native selection inside the transcript opens a custom menu: **Code selection**, which captures per D-036 and opens the panel, and **Add note**, which does the same with focus landing in the panel's note field. Elsewhere in the transcript, and everywhere else in the application, the native browser menu is untouched.

*Later: the control is named **Assign code** on screen, in the menu and on the strip together, so the word-for-word parity this decision requires is unaffected. The entries above keep the original wording, being the record of what was decided when.*

D-028 scoped a custom menu as accelerator-only. Feedback made it the primary pointer route, so that scope is superseded; D-028's conditions carry forward as requirements:

- Every menu command exists on the strip and as a chord. The menu adds no capability.
- The menu opens on Shift+F10 and the applications key when a selection exists, not only on pointer.
- Proper menu semantics, arrow navigation, Escape closes and returns focus, focus entry and return defined per contract 2.4.
- The native menu is only overridden when the pointer is over the transcript with a selection present. The cost of losing browser lookup and extension items on selections is accepted and recorded.

## D-038 The navigation command layer is retired; orientation commands answer from the focused turn

Date: 2026-08 | Workflow: transcript navigation | Status: approved. Continues D-036's downscaling; retires most of the transcript-segment command system and the active-segment visual

v0.2 feedback: the strip's navigation controls are unnecessary, and clicking sentences leaves a lingering selected-excerpt visual that fights the native-selection model. Sighted excerpt selection should mirror Taguette and NVivo: drag, right-click, code.

### What is removed

- `segment.next`, `segment.previous`, `turn.next`, `turn.previous`, `segment.repeat`, `position.return`, and their strip controls. Movement belongs to the browser and the screen reader: Tab and Shift+Tab between focusable turns, browse-mode navigation, scrolling.
- Click-to-set-active-segment and the active segment visual indicator. Clicking a turn focuses it, with nothing shown beyond the focus ring. No app-drawn selection visual exists except captured-excerpt highlights.
- The `transcriptNavigationUnit` flag and the `turnLevelNavigation` preset, deprecated not deleted.

### What remains, redefined

`segment.speaker`, `segment.timestamp`, and `position.report` remain, with visible strip controls, and now answer from the **focused speaker turn** rather than an application-tracked active sentence. Position reports turn N of M and percentage; sentence-level position is gone with the active sentence. The visible position ribbon derives from the same source, so spoken and visible reports still cannot disagree (D-009 logic preserved at coarser grain).

`excerpt.open` (D-030) now operates on the focused turn: available when the focused turn intersects at least one saved excerpt, with the existing list disambiguation when it intersects several.

The turn fallback in D-036 is unaffected; it was already defined on the focused turn.

### What this leans on, stated for the smoke test

Focus is now the only position the application knows. Screen readers generally sync DOM focus when browse-mode navigation lands on a focusable element, but behavior varies; the pre-session smoke test must confirm that a JAWS or NVDA user moving through turns in browse mode can land focus on a turn well enough for the three orientation commands and the turn fallback to answer from the right place. If browse-mode reading does not move focus for a participant, their recourse is Tab. If sessions show that is not enough, that evidence reopens this decision, not D-036.

### Consequences

- D-002's sentence layer survives only as addressing for storage offsets, position percentage, and R-1 comparison. No interactive behavior touches sentences anymore.
- `SourcePosition.activeSegmentId` now records the focused turn's first segment, for position restoration only.
- The strip now holds: Code selection, Add note, speaker, timestamp, where am I. Five controls.

## D-039 The code panel is simplified to the Select Code card

Date: 2026-08 | Workflow: code assignment | Status: approved. Continues the v0.2 downscaling; supersedes C-3's level indicator and defers D-021's uncertainty control

The panel matches the Figma Select Code card: heading "Select Code" with a close control, search field (retained per D-005, not shown in the card but not removed by this decision), the codebook as checkbox rows with color pills, a collapsed Create code disclosure, the note field, and Save & Close.

### Removed

- **The verbose heading.** The visible heading is "Select Code". It remains the panel's accessible region name.
- **The excerpt summary and read-excerpt control.** The transcript highlight is the sighted verification; the capture announcement is the screen reader verification. Consequence accepted and stated: after capture, there is no on-demand non-visual readback of the captured range. If sessions show screen reader participants losing track of what they captured, that reopens this, not D-036.
- **Visual level labels.** Hierarchy shows as indentation and pill color only. Programmatic hierarchy is unchanged: nested lists still expose level to screen readers. This supersedes C-3's "indentation plus a text level indicator"; the magnification risk C-3 guarded against, indentation depth being hard to perceive at high zoom, moves to session evidence.
- **The pending assignment region.** The checkboxes are the pending state, visible and programmatic. Check and uncheck announcements with counts remain. Save writes the checked set; Save & Close stays unavailable at zero checked, with its reason exposed. D-030 reopening pre-checks the saved codes, and its loaded-codes announcement is unchanged.
- **The uncertainty control.** `uncertaintyFlag` stays in the model, unwritten in v0.2. This defers D-021 and the data D-023 needs for review priority; slice 3 either restores the control or takes uncertainty from notes. Recorded as a deferral, not a reversal, because N-3 was answered by the qualitative lead and a scope change does not unanswer it.

### Changed

- **Create code is a progressive disclosure.** A single Create code row with a plus affordance; expanding reveals the name and definition fields and moves focus to the name field; collapsing or Escape returns focus to the row. Created codes remain provisional per the existing rules.
- **Save & Close** is the button label, per the card.

The region order, still fixed and never reordering: heading and close, search, results when a query is active, recent codes collapsed when enabled, codebook, Create code disclosure, note, Save & Close. Cancel is the close control and Escape, with the existing confirm-on-unsaved-changes rule.

## D-040 Non-visual excerpt readback and a footer uncertainty checkbox

Date: 2026-08 | Workflow: code assignment | Status: approved. Amends D-039, restoring two affordances in forms that fit the simplified card

**The captured excerpt is rendered as visually hidden text** inside the panel, immediately after the heading: "Selected excerpt: [full text]". Screen reader users re-check what they captured with their own reading commands, on demand and repeatably; nothing shows on screen. This replaces the removed summary-and-button with a mechanism that is better aligned with the interaction principles: reading belongs to the assistive technology, so re-checking needs the text to exist, not a command to exist.

Implementation constraints, both load-bearing:

- Plain visually hidden static text. Not `aria-describedby` on the panel, which would auto-announce the full excerpt on every focus entry, and not a live region, since nothing changes.
- Full text, not truncated. The reader controls pace and can stop; a truncated readback cannot answer the question it exists for.

Closes D-039's accepted-risk on post-capture verification.

**An uncertainty checkbox sits in the footer row beside Save & Close**, labeled "Mark uncertain". A checkbox because uncertainty is state modifying the save, not an action. Toggle announced. At save, `uncertaintyFlag` is written on every assignment in the set. This un-defers D-021 collection, so the data D-023 requires for slice 3 review ordering is collected in v0.2 after all.

N-3's status returns to fully resolved: answered by D-023, collected per D-021, ordered in slice 3.

## D-041 The code rail is visual-only, with a compact programmatic twin on the turn

Date: 2026-08 | Workflow: transcript display | Status: approved

Speaker turns containing coded excerpts show a color-coded list of assigned codes on the right, and a note icon when an excerpt in the turn carries a note. Both are `aria-hidden`. They are glance channels for sighted and magnification users, and injecting them into the reading stream would fragment the continuous prose D-002 protects.

Hiding a channel is only legitimate while an equivalent primary channel exists, so the turn container carries one:

- **The turn's accessible description is a compact status**: "N excerpts, M codes" plus "note" when present. Announced once when the turn takes focus, silent during continuous reading. It is the programmatic twin of the glance, not a recitation of the rail: code names do not appear in it.
- **Detail stays on request** via `excerpt.open`, which lists the turn's excerpts with codes preloaded. Three tiers: glance, brief, detail, per the progressive disclosure principle.
- The description derives from stored excerpts, the same derivation as the rail, so the two channels cannot disagree. Note indicators remain derived per D-011; nothing is stored on the turn.
- Rail pills use the tag tokens with their non-color text labels for sighted users; the rail's absence from the accessibility tree is what makes color-plus-text sufficient there.

Contract basis: every state visible and programmatic, section 2.6, satisfied by the pair rather than by either channel alone.

## D-042 Every exit from the code panel commits

Date: 2026-08 | Workflow: code assignment | Status: approved. Supersedes the cancel semantics in D-039, code-selection.md sections 2, 2.1, 7, 9, and 12, and excerpt-selection.md sections 3 and 7

**Escape, the close control, and clicking outside all do what Save & Close does.** The pending codes are written, the draft note is attached, and the panel closes. The discard confirmation is removed: with nothing destroyed on the way out, there is nothing for it to guard.

Previously the panel had two kinds of exit. One committed and three discarded, and the three asked first. That split put the most destructive outcome behind the easiest gesture — a stray click on the backdrop — and made a confirmation necessary to hold it back. One rule removes both problems: leaving the panel keeps your work.

The rule and its one exception:

- **With codes checked, closing saves.** Identical to Save & Close, including on failure: a failed save writes nothing, closes nothing, and leaves the codes, the note, and the excerpt exactly where they were, with retry adjacent. Contract 2.4 holds on these routes as much as on the button.
- **With nothing checked and no note written, closing discards the capture and creates nothing.** There is nothing to commit. This is deliberately not a refusal to close: code-selection.md section 2 keeps Escape working wherever focus sits so that nobody is stranded in a panel they opened by mistake, and that reason survives this decision intact.

  *Amended by D-055.* This originally read "with nothing checked", written when codes were the only thing an excerpt could carry. A note alone has counted since save-and-close was fixed to persist one, and Save is available on a note alone; leaving the old wording standing is what caused note-only excerpts to be re-raised as an open question long after they were built.
- **On a reopened excerpt, closing with everything unchecked leaves the saved assignments standing.** Unchecking and closing is therefore not a back route to deletion. D-030 keeps deleting a coded excerpt a separate explicit action, and its confirmation stays — that one destroys records that already exist.

**The close control is renamed "Close"**, from D-039's "Cancel", and the command `codes.cancel` becomes `codes.close`. The Escape chord is unchanged. The label is visually hidden text and is the control's entire accessible name, so a control announcing itself as Cancel while committing assignments is exactly the mismatch contract 2.6 exists to prevent. The name had to move with the meaning.

Supporting this, N-2 in `unresolved-questions.md` worries that a coder who leaves the panel to check a definition "comes back to an empty pending assignment and a discarded excerpt has been punished for checking." That punishment is now gone, which narrows the question rather than answering it.

**Accepted cost, for the team to weigh in sessions.** A note written with no code checked is now discarded without a word. The old confirmation counted a draft note as unsaved work and asked before losing it; nothing does now. There is no excerpt for such a note to attach to, so keeping it is not available, but the warning that used to catch the case is gone. If sessions show coders writing a note before choosing any code, this is where it will show up.

The footer also changes: the action group sits at the trailing edge in both states, so Save & Close no longer moves depending on whether a reopened excerpt has put Delete beside it.

## D-043 Project destinations: Codebook, Coded data, Notes

Date: 2026-08 | Workflow: navigation | Status: approved

The project sidebar carries, in fixed order: the source list, then Code book, Coded data, and Notes as destinations. Themes stays absent per D-017. The current destination is marked with `aria-current="page"` and a non-color indicator. This fills the project navigation landmark that Task 1 left as a placeholder and D-013 promised.

Scope of each page is specified in `docs/pages/destinations.md`. All three are read surfaces in this version: the codebook is browsed, not edited; coded data and notes list the coder's own work; editing continues to happen through the coding panel via `excerpt.open`.

## D-044 Coding state survives in-app navigation

Date: 2026-08 | Workflow: excerpt capture, navigation | Status: approved. Closes C-5

A captured excerpt, its checked codes, and a draft note persist while the user navigates to any destination and back, within the session.

Reason: D-035 moved definition lookup to the Codebook destination, which made leaving the coding surface mid-task a designed behavior rather than an accident. A coder who leaves to check whether a passage is Water access or Water access rules, and returns to find the capture discarded, has been punished for diligence, and the coders least able to reconstruct their place pay the most.

The panel does not follow the user across destinations. It is a region of the source page; navigating away hides it with state held, returning shows it as it was. A page reload still clears in-progress state, unchanged from D-036's scope.

## D-045 Coded data shows the coder's own per-code counts

Date: 2026-08 | Workflow: review of own work | Status: approved. Narrows D-010

The Coded data page shows a count beside each code, counting only the current coder's own assignments.

D-010's rule stands for everything else: aggregate counts, other coders' counts, and project-wide frequencies remain administrator-only, and R-4 keeps other coders' work invisible during independent coding. What this narrows is self-observation: the team accepts the self-influence risk in exchange for progress monitoring, matching the Figma's count badges.

Recorded as a known methodological trade: if reflexivity sessions surface coders steering toward already-heavy codes of their own, this is the decision to revisit.

## D-046 One open-ended definition per code

Date: 2026-08 | Workflow: code assignment, codebook reference | Status: approved. Amends destinations.md section 1 and code-selection.md section 7

**A code shows one definition, and creating one asks only for a name.**

The codebook was specified as a formal coding manual: every code carrying a short definition, a full definition, inclusion criteria, exclusion criteria, and a status, with two of those required before a coder could propose a code at all. This narrows it to a single open-ended definition paragraph, and reduces the create-code form to one field.

Reason, on the reading side: a reference page is read to answer a question, and five labelled prose fields per code across fifty codes is a structure the reader has to navigate before they can read. One paragraph is the shape a definition actually takes when someone writes one.

Reason, on the writing side: proposing a code happens mid-coding, in the middle of reading a transcript. Requiring a short definition there asks the coder to stop coding and compose a codebook entry, at the moment they are least able to. The name is what labels the excerpt; the definition belongs on the surface built for reading definitions.

**The data does not change.** `Code` keeps `shortDefinition`, `inclusionCriteria`, `exclusionCriteria`, and `status`, and all fifty seeded codes keep their content. What changed is what is collected and what is displayed. Nothing was deleted, so widening the definition set again is a display decision rather than a recovery — which is what "for now" in the request is holding open. The consequence to know: those fields are now written by nothing and read by nothing, and a code created this session carries empty strings in all four.

**Search narrows with the display.** The Codebook page's search drops the short definition and both criteria, keeping name, parent path, and the definition. The rule set when that search was widened was that this page may match more than the panel *because it displays what it matches*; once three of those fields left the page, matching them would put a code in front of a coder with the reason nowhere on screen. That is the same failure the panel was narrowed to avoid, and the rule holds in both directions.

Status stops being displayed anywhere. It is still set to `provisional` on created codes and still separates the Provisional codes section from the canonical list, so nothing depends on the removed display.

## D-047 Codebook page follows the family-card design; color is read-only; Themes stays out

Date: 2026-08 | Workflow: codebook | Status: approved. Confirms D-017 and D-043 against the updated Figma; visual reference is frame 247:357

The Codebook page renders one card per top-level code family, in canonical order. Within a card: the parent code's name and definition, children indented beneath, grandchildren beneath them — which is the D-046 record shape, so design and specification agree on content. Code names are nested headings with definition paragraphs, giving screen reader users jump-by-heading through the codebook.

**The Color selector is rendered as a read-only labeled value**, "Color: Blue" with its swatch, not as the dropdown the frame draws. A control that looks operable and is not is a trap, and worse over a screen reader, where a collapsed combobox invites interaction it will not honor. Color assignment is a codebook-formation privilege belonging to the project administrator or qualitative lead, recorded here for the roles specification and the MSE handoff; no coder-facing surface edits it.

**Overarching Themes stays out**, per D-017 and A-5, reconfirmed. The team is removing it from the Figma sidebar, which retires the last standing design-spec contradiction on navigation.

Card borders use the family's shade-1 token; the four low-contrast hues annotated in tokens.css apply to card outlines as they do to pills. The frame's surrounding chrome — Code, Write Note, Import file, Progress 10%, the audio player — is superseded by D-032, D-012, D-009, and A-4 and is not carried into the specification.

## D-048 The companion codebook: definitions beside the panel

Date: 2026-08 | Workflow: code assignment, codebook | Status: approved. Supersedes D-027; the modal panel is retained and the definition journey moves inside it

The panel's codebook region heading becomes a button, **Open Codebook**. Activating it opens the Codebook page content in a semi-collapsed companion view beside the panel: panel shifts left, companion on the right, both visible. The coder reads definitions without leaving the coding surface.

### Why this settles the modality question

The panel as built traps focus, which broke the D-044 journey to the Codebook destination. Rather than reverting modality a third time, this decision removes the journey's necessity: the codebook comes to the coder. The costs that forced D-027's reversal of D-026 are now genuinely paid or mooted: boundary commands no longer exist to cross the trap (D-036), the captured excerpt is readable via D-040's hidden text, and definitions are readable via this companion. The D-003 to D-026 to D-027 history stays in the log; this entry closes it with the costs accounted for rather than rediscovered.

### Behavior

- The companion renders the Codebook page content per D-047: family cards, nested headings, read-only color values, search included. One component, two surfaces; they cannot drift apart.
- Read-only reference. Codes are checked in the panel, never from the companion; it adds no capability.
- The companion is inside the panel's focus scope, so a modal panel and an open companion are one composite surface for keyboard and screen reader users.
- Focus on open: the companion's search field. Focus on close: the Open Codebook button. Escape layers: first Escape closes the companion, the next closes the panel per D-042.
- Companion open or closed state persists while the panel is open; reopening the panel later starts closed.
- **Narrow width and high zoom, per D-033: the companion renders below the panel in reading order**, same sequence, no horizontal panning. Side-by-side is the wide layout only. The single-panel completion rule holds: the companion is never required to finish coding.

### Consequences recorded

- The sidebar remains unreachable mid-capture. Acceptable now: the definition journey no longer needs it, and reaching Coded data or Notes mid-capture is close-then-navigate, with D-042 semantics making close commit or discard depending on checked state.
- D-044's persistence guarantee is unchanged for the navigations that still occur, and its test stands.
- Fixing a wrong range after checking codes requires unchecking all, then closing, to reach the discard path. Subtle; flagged for session observation.

## D-049 Coded data is two views, gated by role and phase

Date: 2026-08 | Workflow: review of coded work | Status: approved. Preserves D-010 and R-4 while adopting the project-wide design

The Coded data page resolves to one of two views:

- **Own work**, per D-045: the coder's excerpts, filterable by the codes they have used, with own-counts. Shown to the coder role while `Project.phase` is `independentCoding` or earlier.
- **Project-wide**, per the Figma design: every code used in the project with team-wide counts of active assignments, and all coders' excerpts across all sources, each row naming its source and coder. Shown to the qualitative lead role in any phase, and to every role once the phase passes independent coding, when R-4's veil lifts by its own terms.

The design was drawn for the lead's monitoring need and the post-independent-coding moment; the coder-during-independent-coding case is the one D-010 and A-1 answered, and it keeps the own-work view. Nothing here reverses either decision: the page simply shows different truths to different viewers at different moments, which is what the role model was for.

Requirements the gate carries:

- **The page names its view.** The count line reads "Your coded work" or "Project-wide view" so no one mistakes which truth they are reading. A participant session that accidentally ran in the wrong view would contaminate silently otherwise; the label makes it visible in recordings.
- Counts are of active assignments only; superseded assignments per D-030 are excluded.
- Role and phase come from the simulated user and `Project.phase`; the role switcher is already in prototype scope, and session scenarios control which role a participant holds.
- The count badge moves adjacent to the code name; at magnification the name and its count must be visible together, the F-4 lesson. The accessible name fuses them regardless.
- Selected code state is border plus bolded count per the style guide component, shape not color alone.

## D-050 Two announcement classes: discrete queues, continuous coalesces

Date: 2026-08 | Workflow: all announcements | Status: approved. Amends accessibility contract section 2.3. Found by manual VoiceOver testing, which is the only layer that could have found it

The no-drop queue rule was written for discrete actions, so that rapid boundary changes would not lose announcements. Applied to search-as-you-type it faithfully queues every intermediate count: "12 results for m, 8 results for mo, 8 results for mot," when only the final count is true. The intermediates are not distinct facts; they are stale drafts of one fact.

The announcer therefore carries two classes:

- **Discrete** — capture, save, check and uncheck, toggle, failure. Queue in order, never drop, never replace. Unchanged.
- **Continuous** — feedback on in-progress input, currently search result counts. Debounced until input pauses, and coalescing: a newer announcement in the same continuous channel replaces any still-pending one. The user hears the settled truth once.

Callers declare the class; the service enforces the semantics. Repeat-on-request returns the last spoken announcement of either class.

Also recorded from the same testing session, as a defect rather than a decision: focus on panel open must land in the search field such that typing works immediately in VoiceOver. If the user must interact into a group first, the criterion is failing regardless of what `document.activeElement` reports. Focus is set after paint, on the input element itself, and the manual check is typing a letter, not inspecting the DOM.

## D-051 Labels are associated, not adjacent; every workflow list is named

Date: 2026-08 | Workflow: all | Status: approved. Amends accessibility contract section 2.1. Found by manual VoiceOver testing

Two rules, one principle: relationships that exist visually must exist in the accessibility tree.

**Checkbox and code label are one control.** The pill text is the checkbox's label element, natively associated, so a screen reader announces one stop, "code name, state, checkbox," and activating the pill toggles the box. Reading them as two separate stops doubles the traversal cost of the code list and can leave the checkbox nameless. This was always D-004's intent; it is now explicit. F-4 fixed adjacency for magnification; this is the same requirement's programmatic half.

**Every list carrying workflow content has an accessible name.** Proficient screen reader users navigate structurally, by rotor and by list-jump, and arrive at lists with no preceding context. "List, 34 items" is not an answer to "what is this"; "Codebook, list, 34 items" is. Named via `aria-labelledby` where a visible heading or control exists, `aria-label` where none does. Known gap from the Task 28a finding: the panel's code list lost its name when its heading became the Open Codebook button; the button now labels the list. Applies to search results, recent codes, the pending set as expressed by checkboxes, sidebar lists, and the destination pages' filter, results, and notes lists.

Decorative or structural lists inside already-named containers need no name of their own; the rule targets lists a user would jump to.

## D-052 Coded ranges are mark elements, so reading reports them natively

Date: 2026-08 | Workflow: transcript display | Status: approved. Closes the discovery gap D-041 left in browse-mode reading

The build renders coded and captured ranges as styled spans, which are semantically invisible: a screen reader user reading continuously passes through coded text with no signal, while a sighted user sees every highlight at a glance. The D-041 turn status fires only on focus, so discovery-while-reading was a visual secret.

Coded and captured ranges therefore render as `<mark>`, the native semantic for highlighted text. NVDA and JAWS report "highlighted" on entering a mark during reading, governed by the user's own verbosity settings, which is the correct division of responsibility: the platform states what the text is, the assistive technology and its user decide how much to say about it. No announcement text is injected into the prose; continuous reading stays continuous, per D-002.

The three-tier D-041 model becomes four honest tiers: reading reports "highlighted" natively as you pass through; focus gives the turn's compact status; `excerpt.open` gives detail; the Coded data page gives the directory.

Caveats recorded:

- VoiceOver's mark reporting is the weakest of the three screen readers, the reverse of the usual risk: participants skew NVDA and JAWS, where support is solid, while VoiceOver is the development environment. Verifying what each participant's configuration actually announces joins the pre-session smoke test.
- `mark` carries no interactive semantics, and gains none: clicking a coded sentence reopening the excerpt is unchanged, and `excerpt.open` remains the keyboard route.
- Nested or overlapping ranges remain one mark with the coded-multiple treatment; marks do not nest per range.

Two things the build found on implementing this, neither settled here:

- **The note-only range is not named by this decision.** A range carrying a note and no code did not exist when D-052 was written. It is marked, on the reading that leaving it the one highlight a screen reader passes over in silence would rebuild the exact gap this decision closes. Confirm or reverse.
- **A captured range's mark cannot currently be reached.** Every command that captures opens the code panel, the panel is modal and `aria-hidden`s the transcript beneath it, and closing it with nothing to save discards the capture. So a captured range exists only while nothing can read it. The element is applied as specified and is inert. Whether the in-progress highlight should be readable at all is a question about this decision and D-026 together, recorded as V-3.

## D-053 One chord hops between the panel and the companion codebook

Date: 2026-08 | Workflow: code assignment | Status: approved. Completes D-048's route in both directions

The companion round trip was asymmetric: `codes.focusSearch` returns focus to the panel from anywhere, but reaching the companion required the button, and Escape conflated returning with dismissing. The comparison workflow the companion exists for, definition, panel, sibling definition, needs a hop, not a close.

**`codes.codebook`** is the hop, one chord, suggested Ctrl+Alt+B and Ctrl+Shift+B by platform, collision-checked against both tables:

- Companion closed: open it and focus its search. Identical to activating the button.
- Focus in the panel with the companion open: move focus to the companion search.
- Focus in the companion: move focus to the panel search.

Together with `codes.focusSearch` the pair reads as one habit: Ctrl+Alt+F always means the panel, Ctrl+Alt+B always means the codebook. Escape keeps its existing layered meaning, close companion first, panel second, and stops being the only way back.

Naming, per D-051's logic: the companion is a labeled region, "Codebook", and the two search fields carry distinct accessible names, "Search codes" in the panel and "Search codebook" in the companion, so a screen reader user always knows which of the two searches they are in. Browse-mode users additionally get the free routes: the companion's family-card headings and the labeled region make rotor and landmark jumps between the surfaces possible without any chord.

The button remains the visible control per contract 2.2, now showing the chord via describeChord like every other command.

## D-054 Lineage in the description, and typing in the list reaches search

Date: 2026-08 | Workflow: code assignment | Status: approved. First decisions driven by participant interview findings, both workflow-class

Two findings from screen reader participant interviews on the panel's code list.

**Hierarchy was imperceptible in speech.** Nested lists and indentation carry the family structure visually, but screen readers flatten nested lists in form contexts and lineage never reached the ear. A participant proposed name-first order: the code, then its parents.

Resolution, the D-041 twin pattern applied to hierarchy: the visual channel is unchanged, parent above, children indented, the spatial family tree intact. Programmatically, each checkbox's accessible **name remains the pure code name** and its accessible **description carries the lineage**: "Rules, unchecked, checkbox, in Water access." Specific before general is the correct temporal idiom for speech, which cannot be skimmed; left-to-right general-before-specific remains the correct spatial idiom for vision. The channels say the same relation in their own grammar, and description verbosity stays under the user's own screen reader settings. Grandchildren describe the full path, "in Water access, Rules".

The D-051 test amends accordingly: the accessible name is exactly the code name; the lineage is in the description, never the name, so search, sorting, and the redirect below all operate on clean names.

**First-letter navigation was expected and absent.** Type-ahead is a property of widget roles, listboxes and menus and trees, which D-004 deliberately declined to imitate; label association could not restore what the widget type never had. The participants' underlying need, jump-by-typing from within the list, is met by search, and the finding exposed the seam between list and search rather than a missing widget.

Resolution: **typing a printable character while focus is anywhere in the code list moves focus to the search field with that character beginning the query**, announced by the existing continuous search count per D-050. Type-ahead in spirit, the search machinery in fact, no ARIA recreation. Browse-mode users are unaffected, their letter keys belong to their screen reader, and they retain search and `codes.focusSearch`. Space and Enter keep their native checkbox meanings; only printable characters redirect.

Classified per the contract's taxonomy: both were workflow findings, not access blockers. Participants completed tasks; the structure under-communicated and an expectation went unmet.

## D-055 The isolated note panel, and note-only excerpts become legal

Date: 2026-08 | Workflow: notes | Status: approved. Driven by screen reader session evidence: reaching the note field through the full code panel was too costly

**The note panel** is a dedicated small panel in the code panel's container style: a heading naming the excerpt, one paragraph text field, Save and Close. Nothing else. It opens with focus in the field.

**Add note** (`excerpt.note`, existing chord) changes destination: it captures per the standard capture rule and opens the note panel, not the code panel. The code panel's own note region stays for the combined flow, and when the code panel is already open, `excerpt.note` focuses that region as before. The context menu's Add note item follows the new destination.

**Open note** (`note.open`, new command, suggested Ctrl+Alt+M and Ctrl+Shift+M, collision-guard verified) opens the same panel loaded with the existing note. Available when the focused turn intersects an excerpt carrying a note; several notes in one turn present a list identified by excerpt range, the excerpt.open disambiguation pattern reused. The pointer twin: the note icon in the rail becomes clickable, mirroring click-a-coded-sentence from D-030. The icon stays `aria-hidden` per D-041; the command is the non-visual route and the icon is the pointer route, twins as usual.

**Close semantics, the D-042 idiom applied to notes:** every way out commits. Closing with text saves the note; closing an existing note with the field emptied deletes it; closing a fresh capture with no text and no codes discards the capture. Focus returns to the invoking turn or control per contract 2.4.

**Note-only excerpts: codified, not created.** This rule was already decided and built when the team fixed save-and-close to persist a capture carrying a note with no codes; note-only ranges already render with the gray highlight and underline treatment, the underline serving as the non-color channel. It was never logged, and the D-042 entry's "closing with nothing checked discards" text remained standing, which caused this decision to be re-raised as if open. Recorded now: an excerpt persists with at least one code assignment or a note; `saved` means either; the gray highlight and underline is the note-only treatment; D-052's mark applies to note-only ranges as well. The D-042 banner text is amended to match the build.

Process note, for the working habits section of the build sequence: a behavior change negotiated inside a Claude Code fix session is a decision, and it reaches this log or it will be re-litigated by whoever reads the log in good faith. That is what happened here.

One panel at a time: the note panel and code panel do not stack. The isolated panel serves the direct routes from the transcript; the code panel's note region serves the combined coding flow. Editing via either surface edits the same note.

## D-056 Transcript text sizing, a per-user reading preference

Date: 2026-08 | Workflow: transcript display | Status: approved

The transcript gains a text size control: plus and minus buttons in the transcript header near the position ribbon, stepping between roughly 100 and 250 percent, each step announced discretely as "Text size N percent". The preference persists per user across sessions and applies to the transcript reading surface, including highlights and the rail's alignment, not to application chrome.

This is the Word document-zoom model and it was in the original requirements: the handoff's user preference list carries Text size separately from Browser zoom. The two compose rather than compete: zoom scales the whole interface; text sizing grows only the reading surface, so a magnification user can run moderate zoom with large transcript text and keep chrome compact.

Why the architecture makes this cheap: D-002 rejected line as a unit because wrapping changes with zoom, so nothing depends on line geometry; excerpt boundaries are character offsets, unmoved by text size; marks are DOM ranges that reflow. Text grows and every research object stays put.

Constraints:

- Implemented as `font-size` on the transcript container with relative units inside, never `transform: scale()`, which zooms without reflowing and recreates the horizontal panning failure the contract prohibits.
- Placed in the transcript header, not the command strip, which D-038 pins at five controls.
- No chords. Browser zoom owns Ctrl+plus and Ctrl+minus and they are not intercepted.
- The 400 percent reflow smoke test item runs once at maximum text size as well; the combination must not scroll horizontally.
- The setting is recorded in session notes like the flag preset, since it changes what a magnification participant experienced.

## D-057 The blanket visible-control rule is retired

Date: 2026-08 | Workflow: all commands | Status: approved. Decided by Benji directly, including the CLAUDE.md edit; recorded here so the change carries its author and rationale

The rule "every keyboard command has a visible control" is removed from CLAUDE.md, the accessibility contract, and the pattern specifications. Rationale: as the command set grew context-dependent commands, `excerpt.open`, `note.open`, the rule generated more exceptions than protection, and D-038's five-control strip left them no home. A rule that is mostly exceptions is not a rule.

What replaces it, the discoverability floor:

- `help.shortcuts` lists every command with its platform-correct chord. This is now the canonical visible surface for the command vocabulary.
- Context commands are taught where their context is: the turn's D-041 description may name the chord where an action applies, and pointer twins, the clickable coded sentence and note icon, remain.
- Commands that initiate primary work keep their strip controls as designed, five per D-038 plus the panel's own controls; nothing built is removed.

Reconciled in the same change: contract section 2.2 and excerpt-selection.md section 4 no longer assert the blanket rule.

Process note: this and the note-only fix were both legitimate team decisions that reached the record late, one from a fix session and one from a direct edit. The lesson is the same and is not about authority: an unrecorded change reads identically whether the author was the team or the agent, so decisions carry their author by being logged.

## D-056 addendum: placement principle

The text size control lives in the transcript header per D-056, and explicitly never in the prototype-support surface that carries the role switcher, phase control, and flag presets. That surface is scaffolding for running the research, not product; participants should never need it, and product features must never be homed there. Recorded as a general rule for future controls.

## D-058 File-wide and project-wide notes return; the Notes page is their home

Date: 2026-08 | Workflow: notes | Status: approved. Partially supersedes D-017's deferral and the destinations.md scope decision

N-4 said file-wide notes might arrive as a later page. The Notes page is that page. Two non-excerpt tiers exist: notes attached to a source file, which D-011 reserved `relatedSourceId` for, and notes attached to the project, which is new. A note's scope is derived, not stored: excerpt if `relatedExcerptId` is set, else source if `relatedSourceId` is set, else project.

**The page.** Left column is a filter list mirroring the Coded Data pattern exactly: "All notes" default, then Project notes, then each source in source order, own-note counts fused into each control's accessible name, selection shown by border and bolded count, stacking above the list at narrow width per D-033. The Figma frame's code-list column is wrong and is not followed; recorded against F-12 along with its other stale chrome, the Overarching Themes destination, Import file, and the Write Note toolbar.

**Creation.** A "New note" button on the page opens the D-055 isolated note panel with a scope field, defaulting to the active filter: filtered to a source, the note attaches there; All notes or Project notes, it attaches to the project. Focus still lands in the text field; the scope field precedes it in reading order. D-042 close semantics unchanged: every way out commits, empty discards.

**The read-surface rule survives restated** rather than excepted: destination pages edit nothing themselves; all editing routes through a panel. Excerpt notes reopen through `note.open` as before. Non-excerpt notes reopen into the note panel by activating the entry, since they have no turn to land on.

**R-4 unchanged.** Own notes only during independent coding, all scopes. The Figma's cross-coder attribution ("Alyssa" under Arielle's excerpt) renders only when the phase lifts.

## D-058 addendum: one channel per fact on the Notes page

Date: 2026-08 | Status: approved

The first build rendered the per-entry source title and both code channels visibly, duplicating what the section heading and the pills already say. Corrected by finishing the D-041 split: every fact renders once per channel, never twice in one.

- The source is the section heading visually; programmatically it lives in each entry link's accessible name ("Note on [speaker], [source]"), so link-by-link navigation across sections keeps context. No visible per-entry source line.
- The codes are the pills visually, aria-hidden as the transcript rail already does; the compact "Codes:" text is programmatic-only. The pills carry code names as text, so the visual channel is not color alone.

## D-059 Sidebar visual refinement, and the project files label becomes a destination

Date: 2026-08 | Workflow: navigation | Status: approved. Amends D-043's sidebar rules

**Visual, per the Figma:** the sidebar is flush to the viewport's top and left edges, unrounded, no white gap. Item underlines are replaced by the hover treatment: white pill, dark blue text (the text moves from black to the dark blue token). A hovered item and the current destination wear the same pill; this is acceptable because hover is transient and pointer-tied — keyboard and screen reader users never encounter it, and `aria-current` plus the visible focus ring carry current state. Do not diverge from the Figma to disambiguate hover.

**Structural:** "Project 1 Files" ceases to be a non-focusable group label and becomes a link to a new Project overview page, reversing that part of the sidebar spec. It remains the nested source list's `aria-labelledby` target — one element, both jobs. The Project overview page is Slice 1 getting its first real surface: project name as `h1` with focus on entry, a plain-text summary line (phase, source count, codebook version — data the domain model already holds), then the sources as a linked list, each landing on that source's transcript view. Read surface, own counts, explicit empty state. Richer summary content is an open extension point owned by the team.

## D-060 The native selection stays visually native through the context menu

Date: 2026-08 | Workflow: excerpt capture | Status: approved. Corrects a build fix that overreached

Users reported the drag selection losing its highlight when the context menu opened. The cause is browser painting, not selection loss: focus moving into the menu repaints the native selection in the browser's inactive style. The first fix applied an application-colored highlight while the menu was open — rejected, because it puts an application visual on an uncaptured range, breaching the D-001/D-036 ownership split: before capture the range is the browser's, and the application highlight is defined as the only visual after capture. An uncaptured range must never look captured.

The correction: an author `::selection` style on the transcript, matching native selection appearance, which browsers also use for inactive selections — so the one native visual persists unchanged while focus is in the menu. Guards: the menu's open, navigation, and close paths never alter the DOM selection; menu mousedown is prevented from collapsing it; Escape's focus return leaves it intact. No second highlight system exists before capture.

*Addendum, from implementing this.* The stated cause is incomplete, and the prescribed fix alone does not work. Measured in Chromium: React Aria's popover puts `inert` on the rest of the document while the menu is open, and inert content has its selection neither painted nor reported — `getSelection().toString()` returns empty while the range itself survives. An authored `::selection` cannot paint inside an inert subtree, so the stylesheet change is necessary and not sufficient. The menu is therefore non-modal, which removes the inert background; a menu is not a dialog, so that is the more correct treatment regardless. The `::selection` rule stays and does the job this decision describes, for the inactive repaint that remains once the background is selectable again. Both halves are load-bearing and each is covered by a test that fails without it.

## D-061 Text sizing scales reading content everywhere, not surfaces

Date: 2026-08 | Workflow: reading preferences | Status: approved. Extends D-056 on session evidence

A magnification participant found the transcript text sizing a success and wanted it in the codebook panel. The extension is a reclassification, not a second control: D-056's real rule was that reading content scales and chrome does not, and the transcript was merely the only surface then classified as reading content. Session evidence corrects the classification — a coder reads code names and definitions as data.

**Reading content, scales:** transcript text; code names wherever they appear, including pill labels in the panel, the rail, and the destination pages; codebook definitions in the companion and on the Codebook page; note text and the note panel's field; excerpt and note text on Coded Data and Notes; text the user types in search fields.

**Chrome, never scales:** the sidebar, the strip, action buttons (Save, Close, New note), page headings, the position ribbon, the filter-list scaffolding around its code-name labels.

**One preference.** The existing header control and its persisted value drive both; no per-surface settings.

**Implementation rule:** a root `--reading-scale` custom property set by the control; reading surfaces opt in with font-size calc against it; pills use em-based padding and radius so they grow proportionally around their labels, as the rail icon already does. The panel reflows vertically at 250 percent, internal scroll, never horizontal panning; checkbox targets grow with their rows.

## D-062 The Coded Data filter list: alphabetical by family, hierarchy in three matched channels

Date: 2026-08 | Workflow: coded data | Status: approved. Amends D-049's filter list; deliberate divergence from canonical order

**Ordering.** Families alphabetical by top-level code name; within a family, depth-first with siblings alphabetical, so a family is exhausted before the next begins. This diverges from the canonical authored order deliberately and only here: the codebook and panel teach the vocabulary in authored order, while the filter list is a lookup surface, and lookup wants alphabet. The divergence is scoped to this page.

**Hierarchy, one channel per audience.** Visual: indentation by level, the structural channel the panel and codebook already use, reinforced by family shading — parent pill filled in the family hue, child and grandchild in progressively lighter shades from the hue's three-shade token set. Shading is reinforcement; indentation is the non-color channel, so level is never conveyed by color alone. Programmatic: D-054 reused verbatim — the accessible name stays the pure code name plus count, lineage lives in the accessible description, name first. Icons and tree glyphs rejected as noise or redundancy.

**Colors restored.** Filter pills carry family hues throughout, which they had lost.

**Frequency unchanged.** Counts stay visible and stay fused into the accessible name per D-049.

**Own-view edge.** A child whose ancestors are unused renders at its full indentation depth with its lineage description naming the absent ancestors; no disabled placeholder rows.

## D-065 The transcript command strip is removed

Date: 2026-08 | Workflow: transcript display | Status: approved. Decided by Benji directly as the prototype tidies up for real use; recorded here so the change carries its author and its cost. Reverses D-038's five-control strip and D-057's preservation clause

The command strip and its five controls — Speaker, Timestamp, Where am I, Assign code, Add note — are removed from the transcript page. Every command they carried keeps its chord, and capture is also on the context menu, which becomes the only pointer route to it.

Two things survive the removal. The disambiguation chooser stays, because D-030 forbids guessing which of several overlapping excerpts was meant, so `excerpt.open`, `note.open` and a click on a coded passage all have to ask; it renders nothing until there is a choice pending. The excerpt state readout goes: the selection-blue band is the visible representation of a capture and the announcement is the programmatic one, so contract 2.6 holds without a line of text restating it.

**The cost, recorded rather than discovered in a session.** D-057 retired the blanket visible-control rule and replaced it with a discoverability floor whose first item is that `help.shortcuts` "lists every command with its platform-correct chord" and is "the canonical visible surface for the command vocabulary". That command has a chord in the binding table, no handler, and no user interface. So after this change **nothing on screen teaches any command on the transcript page**: a participant who does not already know the chords has the context menu for capture and nothing at all for the three orientation commands.

D-057 also said explicitly that "commands that initiate primary work keep their strip controls as designed, five per D-038 plus the panel's own controls; nothing built is removed." This reverses that clause knowingly.

Two consequences that follow and are implemented with it: D-028's condition that the menu adds no capability, carried forward by D-037, used to be satisfied twice over because every item was also on the strip — it now rests on the chords alone, and the menu is load-bearing in a way D-037 did not assume. And the Coded data empty state, which told a coder to "choose Assign code", now names the routes that exist.

Building the shortcuts help is the obvious next step, and until it exists this is a session gate rather than a tidy-up: a participant briefed on the chords will manage, and one who is not cannot code at all by keyboard.

**Gate closed by Task 45.** The shortcuts help exists. It lists every command in the binding table with its platform-correct chord, grouped by where the chord applies, and its content is derived from the table at runtime rather than written out, so it cannot drift from the keys that work. A test asserts every command in the union has a row, which is D-057's completeness claim made checkable.

It is reached two ways, and the second is the one that actually closes the gate: a **"Keyboard shortcuts" control in the application banner**, chrome on every route, after the navigation so asking for help does not push the way out of the page further back. A help surface reachable only by `Ctrl` plus a key teaches chords to people who already know one, which would have left the gate open under a different name.

Escape layers. With the help open above the code panel, Escape closes the help and **the panel neither commits nor discards** — its pending codes and its note text are exactly as they were, and the next Escape reaches the panel. `resolveEscape` gained the layer and now returns which layer owns the key rather than a `Command`: a `help.close` command would need a row in both binding tables, Escape already belongs to `codes.close` there, and the collision guard would reject the pair.

## D-064 The Coded Data filter list drops pills for underlines, and gains a search

Date: 2026-08 | Workflow: coded data | Status: approved. Decided by Benji directly; recorded here so the change carries its author and rationale. Reverses the visual half of D-062 and its amendment

The filter list's code pills are removed. A code name is plain text wearing its family's colour as an underline, and a search field sits above the list, matching by the same rule the code assignment panel uses so a coder typing the same letters on either surface finds the same codes.

Scoped deliberately: the result rows keep their pills and their `aria-hidden` text twin, so D-041's treatment there is untouched. The search narrows which filters are offered and never the results below, which are the selected filter's business.

**What this gives up, recorded rather than discovered later.** D-062 gave level a visual channel — indentation — and its amendment replaced that channel with pill fill treatment rather than removing it. Both are now gone. A sighted reader sees a flat alphabetical list with no indication that "Rules" sits under "Water access". The D-054 lineage description still carries level, so the loss falls on sighted and magnification users, who are the population this page serves. Session-evidence flag, alongside the amendment's own: if participants cannot follow the hierarchy, indentation is what returns.

Family grouping survives without colour, which is what keeps this off "colour alone": D-062's ordering keeps a family contiguous and alphabetical, so position carries the grouping and the underline reinforces it.

**Measured.** The underline uses `--code-strong`, the most visible of a family's three shades on white, and for four families it stays faint — yellow 1.69:1, light green 2.00:1, sea green 2.37:1, orange 2.41:1, against the 3:1 a non-text indicator would need. Not a contrast failure, since the name is text and carries the identity, but a real limit on how well the colour reads. Pinned per family by a browser test so a token change is reported rather than absorbed.

Worth naming so the divergence is deliberate: the transcript went the other way for the same reason. D-041's rail uses one grey underline for every family precisely because per-family shade-1 underlines measured under 3:1 there.

The search field is new behaviour that destinations.md section 2 did not specify; section 2 is amended to match.

## D-063 The confirmed-state highlight wears native selection blue

Date: 2026-08 | Workflow: excerpt capture | Status: approved. Extends D-060; retires the purple confirmed highlight

Participants found the panel-open highlight jarring: native selection blue through drag and menu, then a sudden purple at capture. The fix is continuity of appearance, not of mechanism. Keeping the literal native selection through the panel was considered and rejected: focusing or typing in the panel's search field destroys the document selection, so a native-dependent visual would die mid-coding. Capture still converts the range to the application-owned highlight per rule 1.1.

The confirmed-state highlight adopts the same blue token as D-060's author `::selection` style. One continuous visual from drag through menu into the open panel; the ownership handoff at capture is invisible. The same treatment applies when `excerpt.open` or `note.open` reopens a saved excerpt: while a panel addresses a range, that range wears selection blue. On save-or-commit close, the coded family-color treatment (or the note-only gray and underline) appears; that transition is meaningful and stays visible.

Known collision, accepted: blue is also a family hue. Defused by the selection token being distinct from the family blue tokens, the confirmed state existing only while a panel is open, and coded highlights carrying their non-color channel. Session confusion is the reopening evidence.

## D-062 amendment: flat alignment, fill-treatment hierarchy

Date: 2026-08 | Status: approved. Amends D-062's visual channels; the Figma filter-list component is the visual reference

Indentation is removed from the Coded Data filter list; all pills left-align. The visual hierarchy channel becomes the fill treatment the Figma shows: parent solid-filled in the family hue, child tinted in a lighter shade, grandchild white-filled with a colored outline. Fill density survives grayscale, so level is not conveyed by hue alone; the D-054 lineage description remains the programmatic channel unchanged.

Recorded honestly: fill-treatment steps are subtler than indentation for low-vision users, the population this page serves. This ships as the design with a session-evidence flag; if magnification participants misread levels, indentation or a stronger non-color channel returns.

Also per the Figma: the "All codes" pill is plain gray, not multicolor; pill padding increases, staying in em units so D-061 scaling preserves proportions. The four low-contrast shade-1 borders noted in tokens.css matter most at the grandchild outline level; the gray row background provides the shape contrast there, and the smoke test checks the yellow and orange families specifically.

*Measured on implementing this, and the last sentence does not hold.* The gray row background does not provide the shape contrast: a white pill is **1.21:1** against the selected row's grey-100, and against the white page behind an unselected row it has no boundary at all. So the grandchild pill's shape rests on its outline alone, and four families' shade-1 outlines are under the 3:1 a non-text indicator needs — yellow **1.69:1**, light green **2.00:1**, sea green **2.37:1**, orange **2.41:1**. For those four the grandchild level has no reliable visual, and since this amendment also removes indentation there is no second visual channel to fall back on.

Shipped as designed under this amendment's own session-evidence flag rather than quietly adjusted, so the design reaches a session intact. Two things bound the risk: the D-054 lineage description carries level programmatically whatever the pills do, and a browser test records the per-family figures, so a token change is reported rather than absorbed. If magnification participants misread levels, these numbers are the first place to look.

## D-059 addendum: one pill shape, and the user title block

Date: 2026-08 | Status: approved

The build gave hover a rounded rectangle and current-page fully circular sides. D-059 says the two wear the same pill; the shapes unify on the hover treatment, the rounded rectangle, so the earlier hover-equals-current acceptance is literally true.

A user title block is added at the top of the nav landmark: static text, not a link and not a heading, reading the seeded user's title, "AFB Researcher" in the prototype, with the divider below it per the Figma. The string comes from the seed user record, never hardcoded in the component. The Figma's home icon remains unspecified and is not built.

## D-066 Same-excerpt is defined, and the project-wide view names it in one line

Date: 2026-08 | Workflow: coded data, review | Status: approved. Team methodology decision by Benji; full comparison stays Slice 3

**The definition.** Two excerpts by different coders are the same excerpt when their sentence sets overlap at Jaccard 0.5 or above: the sentences both touch, divided by the sentences either touches, per R-1's sentence-granularity comparison rule. Character boundaries stay untouched as stored data per D-036. The threshold is a provisional named constant in the domain layer, `SAME_EXCERPT_JACCARD`, tuned by session evidence, never hardcoded in a component.

**The poke.** Project-wide rows only: an excerpt meeting the threshold with another coder's gains one plain-text line, "Also coded by [name]", in the row's reading order and accessible to screen readers as text, never icon-only. Multiple coders list all names. No conflict language, no badge, no ReviewItem creation, no resolution affordance: the neighboring row already shows the other coder's codes, so differing code choices on the same excerpt become readable as adjacent data — the reflexivity posture, disagreement as data rather than error. Phase and role gating come free from D-049's project-wide view. (Renumbered from a drafting collision with D-065, the strip removal.)

**What stays Slice 3:** ReviewItem materialization, any agreement or disagreement classification, resolution recording, and any surface that asks coders to reconcile. Comparison matters most during review and reflexivity, and that is where the full treatment lives.

**Built by Task 44**, with three things this decision left open resolved as follows and recorded here rather than in code alone.

*The sentence set is the one already spoken.* "Touches" is `excerptSegments`, which is what `excerptSize.sentenceCount` counts and therefore what a coder is told at capture. A boundary sentence the offsets cover zero characters of is counted, even though `excerptText` drops it, so the comparison uses the set the coder heard about rather than introducing a second number for one range.

*Only rows count.* An excerpt whose assignments have all been superseded, or that carries a note and no code, cannot trigger the line. This decision's own reasoning is that the reader looks at the neighbouring row to see what the other coder chose; pointing at a row that is not on the page would send them hunting, and "also coded by" would be naming somebody with no standing code.

*Several names read alphabetically.* This decision requires all names and gives no order. Record order would put whichever excerpt was captured first at the front, which is not information the reader has any use for. The comma join matches the row's existing "Codes: a, b"; both are wording and provisional in the sense `describeExcerptSize` is.

**A conflict this opens, for the team and not for the build.** R-2 in `unresolved-questions.md` reads, still marked RESOLVED: "No overlap threshold in v0.1. Exact boundaries are preserved and differences are presented rather than scored." This decision introduces an overlap threshold in v0.1. The two are arguably compatible in substance — nothing is scored, no agreement is classified, R-3's no-IRR rule is untouched and boundaries are still stored to the character — but the register says one thing and the build now does another. Amending a resolved research question belongs to the research team, so it is recorded here and left. The amendment that would fit: *"R-2. AMENDED by D-066. No scoring and no IRR; a provisional sentence-set threshold groups two coders' work as the same excerpt for presentation only."*

## D-067 The note indicator becomes a disclosure

Date: 2026-08 | Workflow: coded data | Status: approved. From usability sessions: participants who saw "has a note" wanted the note there, not a page away

The note indicator on Coded Data rows becomes a disclosure button revealing the note text inline, a line below within the row, toggleable per row. The native pattern, and the Notes page already uses disclosure for truncated excerpts, so no new lesson.

Requirements that make it accessible rather than merely clickable: a real button with `aria-expanded`, its accessible name constant ("Note") with the attribute carrying state, never a show/hide label swap; the revealed region immediately after the button in DOM and reading order; focus stays on the button across toggling; no live-region announcement, since the attribute and the adjacent text are the feedback. Structural rule: the row is a link, and the disclosure button must be its sibling within the row, never nested inside it. The note text is reading content and scales per D-061.

Visibility unchanged: the disclosure reveals what the indicator already promises. Where R-4 or note visibility means the viewer cannot read the note, no indicator renders, as today. Expansion state is per row and per session; it does not persist.

**Built by Task 46, and the visibility clause above was not true of the build.** "As today" described something this page did not do. `codedDataView` derived its note indicator from every note it was handed — no author rule, no `visibility` rule, and no `status` rule — while the Notes page filtered on author and status. The Coded data page also concatenated seeded and session notes where the Notes page shadow-merges them by `noteId`, so a deletion, which is written as a session record carrying the seeded note's id and a `deleted` status, left the original standing beside its own tombstone. Deleting a note therefore left "Has a note" on its row, and a disclosure built on that flag would have opened onto the text of a deleted note.

Closed rather than carried. The merge is now one shared `mergeSessionNotes` used by both pages, and readability is one domain predicate, `canReadNote`: a deleted note is nobody's, including its author's; your own is always yours; another coder's only once identities are visible, and never where `visibility` is `private`. `identitiesVisible` is the project-wide view's own condition, so phase and role gating come free from D-049 exactly as D-066's does.

**The rule for another coder's note was chosen, not found.** No decision states who may read one, and the Notes page's own-notes-only rule would have emptied the lead's project-wide review view of every note indicator, all five seeded excerpt notes belonging to other coders. Readable in the project-wide view where R-4 has lifted, and never when private, is the rule this build adopts; it is a methodological choice and is recorded as one.

The row's link is no longer wrapped in a paragraph, so that it and the button are literally siblings rather than cousins, which is what the structural rule says. `CodedResult.hasNote` became `noteText: string | null`, which makes "no indicator where the viewer cannot read the note" structural: there is nothing to disclose, so there is nothing to render.

**Carried, not fixed:** `turnCoding` in the domain derives the transcript rail's note indicator with the same absence of any author, status, or visibility filter. `canReadNote` is the predicate it wants, but adopting it changes what the rail shows on the transcript, which is a different surface with its own tests and is not this decision's.

**Worth watching in a session:** the constant name means a page of rows presents many buttons all called "Note", told apart only by the row around them. The decision is explicit and the build follows it.

## D-068 The banner flattens: no nested landmark, no one-item list

Date: 2026-08 | Workflow: navigation | Status: approved. VoiceOver smoke-test finding by Benji

Landmark-jumping to the banner landed on a wrapper announced "Application, navigation", then "list", then — one interaction deeper — the project link, while the shortcuts button sat one stop away as a direct banner child. The wrapper nav and its list are removed: banner children are the product link, the project link, and the shortcuts button as siblings, each one stop.

The principle, since this will recur: a navigation landmark marks a navigation system, not a link; a one-item list announces "list, one item" — two words, zero information; and every wrapper a screen reader must enter is a cost paid on every visit. D-051 was cited in the code as justification for naming the wrapper's list — correctly applied to a structure that should not have existed. D-051 governs how lists are named, not whether something deserves to be one.

After the flatten the rotor shows one navigation landmark, the sidebar, which is a navigation system. The existing role="application" guard test held; the word VoiceOver spoke was the wrapper's label.

**Built by Task 47, and it amended the accessibility contract.** Contract section 2.1 required "one `navigation` for application-level navigation, a second labeled `navigation` for project-level navigation", which this decision contradicts and did not say it was amending — unlike D-051, which carries the clause for the same section. Amended by the task that built this, since the contract outranks the decision log in this repository's source-of-truth order and a contract line the build knowingly violates is worse than either.

Two tests carried the old structure as their assertion and now carry the new one: the shell's landmark test, which counted two navigation landmarks, and the list-naming test, which named the wrapper's list. `.nav-list` was used by nothing else and went with the element. Nothing about tab order or pointer behaviour moved: the removed wrappers held no tab stop, and the banner was already a flex row whose three items are the same three.

## D-069 Notes page entries: two voices, each named in both channels

Date: 2026-08 | Workflow: notes | Status: approved. Session finding: readers could not tell excerpt text from note text

The excerpt disclosure is removed; the excerpt renders in full. An entry interleaves two voices — the participant's quoted words and the coder's own — and each now carries identity in both channels rather than styling alone.

Visual: the excerpt keeps its gray background block; the note keeps the edge-bar card. Programmatic: the excerpt is a `blockquote`, which is semantically true and announced at default verbosity; the note text is preceded by a visually-hidden "Note:" prefix. Since blockquote announcements ride the user's verbosity setting, the prefix is the load-bearing programmatic marker: plain text, cannot be turned off. The speaker name continues to head the excerpt.

Removing the disclosure also removes a control from the middle of every entry, per D-068's cost principle. Long excerpts render whole; the turn fallback's whole-turn captures are accepted as the cost.

**Built by Task 48.** Entry order is speaker, excerpt, note, codes: the note moved up from last, so the two voices are adjacent and the codes read as a coda to both rather than as an interruption between them.

**The prefix is scoped to excerpt entries**, which this decision implies and does not say. Its own reasoning is two voices; a file-wide or project note has one, with nothing to distinguish itself from. There is a second reason in the build: a non-excerpt entry renders its text inside the button that opens it, so a prefix there would land in an accessible name the D-058 addendum composed as "[text], [source]" — announcing a distinction that is not being drawn while changing a name that was.

The `blockquote` needs `margin: 0`. A user agent gives it `margin: 1em 40px`, and eighty pixels of horizontal margin in a 320px column is the reflow failure contract 2.5 forbids; long words break for the same reason, since nothing truncates any more and a captured passage can now carry an unbroken token to the page whole. Both are held by a browser test, jsdom having no layout to answer with.

Nothing tested the entry's structure before this: no assertion anywhere touched the disclosure, the truncation, or the excerpt's rendered text. The tests added here are coverage rather than repair.

## D-070 The codebook becomes editable: creation, coder proposal, and acceptance

Date: 2026-08 | Workflow: codebook formation | Status: approved. Supersedes the prototype-scope exclusion of codebook editing; team answers by Benji

The most drag-and-drop-bound workflow in commercial QDAS becomes keyboard-first: every major tool edits hierarchy by dragging, which is exactly what blind researchers cannot do. Hierarchy here is chosen, not dragged.

**Gating.** Editing belongs to the qualitative lead role, only while no coding round is open: setup, review, recoding. The codebook version bumps at the phase boundary when edits occurred, so a round always references one stable version. Mid-round vocabulary drift is structurally impossible.

**The editor panel.** A "Create new code" button at the top of the Codebook page opens a code editor panel; the page itself never edits, per the read-surface rule. Fields: name, required, unique codebook-wide case-insensitive; definition, open-ended per D-046; parent, a combobox of eligible codes carrying the D-054 lineage treatment, offering only families and children so depth caps at grandchild; color, present only when no parent is chosen, a pick from the unused named token hues, never a free color wheel. New codes append after their siblings in canonical order. **Close model, a recorded exception to D-042:** explicit Save creates; closing any other way discards; validation blocks save, never close. A half-defined code is nothing, unlike a half-written note.

**Coder proposal.** During coding, the panel's empty search result offers "Propose '[query]' as a new code": name prefilled from the query, created provisional, and checked for the current excerpt in one action. The affordance lives at the failure point rather than as standing chrome, so the validated panel gains nothing participants must learn unless the vocabulary fails them. Provisionals are marked in both channels, sit in their labeled section, and are fully usable for coding until resolved.

**Resolution: Accept only.** Each provisional entry offers Accept to the gated lead, opening the editor prefilled; save moves it into the canonical hierarchy, its assignments following automatically since the code keeps its identity. Merge and reject migrate other coders' assignments and are registered as Slice 3 work.

**The codebook half is built by Task 49.** Four things this decision left to the build, recorded rather than left in code alone.

*The parent field is a native `select`.* It maps to role `combobox`, carries typeahead without recreating it, and is what three other fields in this build already use; React Aria has never supplied a form control here and a combobox would have been the first. The cost is that the D-054 lineage rides in each option's text rather than in a description, because an `option` has no description channel — the wording is still `lineageDescription`'s, so the two surfaces cannot word the relation differently.

*The canonical index of a new code is a fraction.* The seeded order is dense, global and depth-first, so "append after their siblings" read literally would renumber thirty-six records to add one. Nothing requires that: `byCanonicalOrder` is a subtraction, so the new index only has to fall between the last index in its parent's subtree and the next index outside it. Worth knowing which half of this is visible — the cards are built from the tree and each sibling list sorts independently, so a child renders inside its family whatever index it carries. The flat order is what the fraction protects.

*Three hues are offered, not seven.* The `code-color-*` namespace was closed at the six families in use, so "the unused named token hues" meant new tokens. Violet, pink and rose are added and measured; orange, yellow, light green and sea green are withheld, their shade-1 borders being under the 3:1 a non-text boundary needs on white, which is not a hue to offer in a picker on this instrument. The three are named for the ramp they draw, unlike the six legacy tokens where `code-color-moss` renders red — a wart `familyHues.ts` already records and which three more lies would have deepened.

*On Accept the placement fields are offered; on an edit they are not.* This decision's immutability clause names editing a code already in the hierarchy. A provisional is not in it yet, and choosing a parent is precisely how it enters — so Accept can place, and only a canonical edit is frozen.

**The coder half is built by Task 50, and it reverses D-039.** "Create code is a progressive disclosure" and item 8 of that decision's fixed region order are both gone: this decision puts the affordance at the failure point "rather than as standing chrome", and a standing disclosure beside an empty-state button would be two ways to do one thing. code-selection.md sections 3 and 7 are amended to match.

Three failures found while building it, all silent, all now closed. The **transcript rail** dropped a provisional's pill while the turn description went on counting the assignment — one turn saying "1 excerpt, 1 code" and drawing nothing, two channels D-041 built to agree disagreeing at the moment right after the coder saved; the workspace now reads the panel's own lookup, which merges proposals, rather than a second map built from the codebook alone. **Coded data** lost not the pill but the row: an excerpt coded only provisionally produced no codes, was filtered out of the results, and left the count. **Notes** rendered such an excerpt as though it were note-only, which is a different thing entirely. All three now merge proposed codes the way the Codebook page already did.

*Marking, in both channels.* `code.status` was read by no component anywhere; every surface told a provisional apart by grey, under two stylesheet comments reading "a proposed code is marked in words, never by colour alone" — the words did not exist. On a code row the mark rides the D-054 description channel beside the lineage, never the name, which D-051 pins to the code name alone; the visible half sits outside the label where it cannot join that name. On a codebook record it is text after the heading, so the code's identity does not move and a deep link or rotor jump still arrives with it. Downstream pills carry it in the pill and in the readback line alike.

*Search covers proposals now.* Without that, a coder searching for a code they had proposed found nothing and would have been offered the chance to propose it a second time — two codes with one name and no way to tell them apart from the panel. The codebook region still renders the canonical tree only, so section 7's rule that a proposal never joins the canonical list holds.

*And a Task 49 defect this closes:* accepting a provisional wrote an approved copy under the same identifier while the append-only proposal store kept the original, so the code sat in the canonical list and the provisional section at once. Task 49 tested that it arrived and never that it left.

**Left unbuilt, for the team to place.** Editing an existing canonical code's name and definition works and has no entry point: destinations.md section 1 describes only Create and Accept, and a control on every code card is a visible change to a read surface D-047 keeps read-only. Accept exercises the same path meanwhile.

**Contained deliberately:** no re-parenting of existing canonical codes, since moving a code across families changes its hue and every existing pill — a version-migration problem, deferred. Family cards keep their read-only color display; color is assigned only in the editor. Editing an existing code's name and definition uses the same panel; parent and color are immutable there.

## D-071 The sidebar title becomes the role switcher, knowingly

Date: 2026-08 | Workflow: navigation, session support | Status: approved. Reverses the D-059 addendum's static-text rule for the title block; prototype-only placement

Role-dependent behavior is now part of what the prototype tests — D-049's views, D-070's gated editing — and there was no reachable way to switch roles. The sidebar title block becomes a native select labeled "Role", options "AFB Researcher" (coder) and "Qualitative Lead" (qualitativeLead); reviewer stays unoffered. The displayed title is the select's value, so the name updates by definition.

Recorded honestly: this is scaffolding placed in product chrome, the inverse of the D-056 addendum's rule, allowed because role switching is a facilitator's session tool, not a product feature — a real deployment takes the role from authentication and returns this block to static text per the D-059 addendum. The select is marked as simulation in the prototype-scope sense.

Behavior: role change announces discretely ("Role: Qualitative Lead"); focus stays on the select; controls appearing or vanishing elsewhere never take focus. D-070's gate remains role and phase together — a lead mid-round still cannot edit, which is the design working. Phase switching stays in the prototype-support surface deliberately.
