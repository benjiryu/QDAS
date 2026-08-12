# Accessibility Contract

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08-03

This document holds the rules that no single pattern owns, and the completeness gate every pattern specification must pass. Per-pattern focus, announcement, and magnification behavior lives in the pattern specifications, not here.

## 1. What this contract does not claim

The prototype does not claim WCAG conformance and must not be described to participants or to the client as an accessible product. It commits to a functional floor sufficient for a participant to complete the tested workflows with their own assistive technology.

This boundary exists so that effort goes into the workflow behaviors the research depends on rather than into conformance work that does not change a session outcome. Where a conformance requirement and a research need diverge, record the divergence in the decision log.

## 2. Global rules

### 2.1 Structure

- Semantic HTML first. ARIA only where no native element carries the semantics.
- No `role="application"` on the application shell, the transcript, or any region containing readable prose.
- No positive `tabindex`. Use `0` and `-1` only.
- One `h1` per page, naming the page. Heading levels descend without skipping.
- Landmarks: one `banner`, one `navigation` for application-level navigation, a second labeled `navigation` for project-level navigation, one `main`, and labeled `region` elements for the transcript, the code panel, the companion codebook, and the review workspace. The companion is a region per D-053, so a browse-mode user reaches it by landmark and its family cards by heading without knowing the hop chord at all — the chord is the fast route, not the only one.
- Reading order in the DOM matches the intended workflow order at every viewport width. Regions may stack or unstack; they may not reorder.
- Per D-051: form controls and their visible labels are natively associated, one stop, one announcement, label activates control. Every list carrying workflow content has an accessible name, because structural navigation arrives without context; a list's identity must never depend on reading order.

### 2.2 Keyboard

- Every action is keyboard operable.
- No single unmodified character keys as application commands. Screen readers consume them in browse mode.
- Chords are platform-conditional and defined only in `src/config/keybindings.ts`. See `docs/patterns/transcript-segment.md` section 4.2 for why no single modifier family works across targets.
- No keyboard traps. Every container is exitable by keyboard alone.
- Chord assignments are verified against JAWS, NVDA, and VoiceOver before each participant session. This is a session gate, not an implementation detail.

### 2.3 Live regions and announcements

This is the rule most likely to be violated by accident, and the failure is silent.

- The application has exactly two live regions, both owned by the shared announcement service in `src/a11y`. One polite, one assertive.
- Components never create their own live regions and never write to the DOM node directly. They call the service.
- The assertive region is reserved for save failures and destructive-action confirmations. Nothing else interrupts.
- Successive announcements queue. An announcement issued while another is still speaking must not replace it, because repeated boundary adjustments would otherwise drop everything except the last one. Per D-050 this rule governs **discrete** announcements: reports of completed acts. **Continuous** announcements, feedback on in-progress input such as search result counts, are the opposite case: intermediates are stale drafts, so they debounce until input pauses and coalesce, newest replacing any still pending. Callers declare the class.
- Every announcement is repeatable on request. A user who missed it must be able to hear it again without redoing the action.
- Announcement wording is not fixed by specification unless the wording itself is being tested. Specifications fix the information content.

### 2.4 Focus

Every workflow and pattern specification states:

1. Where focus begins on entry
2. What causes focus to move
3. Where focus moves
4. Where focus returns when a view closes
5. Where focus goes when the view is cancelled rather than completed
6. What state is preserved across the move

Focus is never moved without a user action. Focus is never moved on load, on data arrival, or on a background update.

Focus indicators are visible against every background they can appear on, and remain visible at high magnification. Indicator thickness and contrast are treated as functional requirements, not styling.

### 2.5 Visual and magnification

- Content reflows without horizontal scrolling at 400% zoom, equivalent to a 320 CSS pixel viewport width, per WCAG 1.4.10.
- Every core workflow is completable in a single panel, with no step requiring horizontal panning between two simultaneously visible regions.
- Multi-panel layouts are optional presentations, never a requirement for task completion.
- No information is conveyed by color alone. Every color-coded state carries a text or shape channel.
- Scroll position and viewport position are preserved when returning from any overlay, panel, or detail view.
- Fixed headers do not consume enough vertical space to obstruct reading at high zoom.
- Respect `prefers-reduced-motion`. No animation is required to understand a state change.

### 2.6 State and recovery

- Every dynamic state has both a visible and a programmatic representation.
- Errors state what happened, what was preserved, and how to recover.
- No user work is discarded as a side effect of an error.
- Disabled controls expose the reason they are disabled. A disabled control with no explanation is a dead end for a screen reader user.

## 3. Completeness gate for pattern specifications

A pattern specification is not ready for implementation until it defines all of:

- Purpose, and what it does not own
- States, with a transition table that has no unreachable states and no dead ends
- Actions, with availability conditions stated per state
- Keyboard commands, as logical names
- Focus entry, movement, return, and cancel-return
- Announcements, split into automatic and on-request
- Visual and magnification behavior
- Persistence, including what survives a failed save
- Error recovery
- Data model
- Acceptance criteria as Given-When-Then
- Unresolved questions, each with an owner, the evidence needed, a temporary assumption, and whether implementation may proceed

A specification missing any of these is incomplete. Reviewers should check the list rather than reading for plausibility.

## 4. Pre-session smoke test

Run before every participant session. A failure here invalidates workflow findings from that session.

1. Every task in the session scenario completable by keyboard alone
2. Heading and landmark structure intact on every page in the scenario
3. Every interactive element has an accessible name
4. Focus entry and return correct at every view transition in the scenario
5. Announcements fire, queue correctly, and are repeatable
6. No keyboard traps
7. Every state identifiable without color
8. Reflow at 400% with no horizontal scrolling
9. Every task completable in a single panel
10. Simulated save failure preserves all work
11. Chords verified against the participant's screen reader and browser
12. Test data reset to a known state
13. Reading through a coded passage reports it as highlighted, per D-052

Item 13 is verified per configuration rather than once. Coded ranges are `mark`
elements, and what a screen reader makes of one is its own decision at its own
verbosity setting: NVDA and JAWS report it, VoiceOver's support is the weakest
of the three, and the build cannot make any of them speak. A session where
highlights go unreported is still usable — the turn status on focus and the
Coded data page both remain — so this is recorded rather than blocking, and the
result belongs in the session notes.

## 5. Separating findings

Two categories, recorded separately.

**Access blocker.** The participant cannot complete the task because focus, semantics, or announcements failed. Fix before interpreting any workflow feedback from that session.

**Workflow finding.** The participant completed the task but expected a different sequence, information, or return behavior. Synthesize across participants before acting.

Conflating the two produces redesigns of workflows that were never actually tested.
