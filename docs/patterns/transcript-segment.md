# Pattern: Transcript Segment

## v0.2 revision, D-038

The navigation command layer described in sections 2 and 4 is retired. Movement belongs to the browser and the screen reader: Tab and Shift+Tab between focusable turns, browse-mode navigation, scrolling. Clicking a turn focuses it and draws nothing beyond the focus ring; click-to-set-active-segment and the active segment visual are removed.

Three orientation commands survive, with visible strip controls, answering from the focused speaker turn: `segment.speaker`, `segment.timestamp`, and `position.report`. Position reports turn N of M and percentage; the ribbon derives from the same source, so spoken and visible reports cannot disagree. `SourcePosition` records the focused turn for restoration only.

Sections 1 (segmentation model and identity), 7 (visual and reflow, minus the active segment indicator), 8, and 9 remain in force. Sections 2 through 6 below describe the v0.1 model and are retained as history; where they conflict with this banner, the banner governs. The full v0.1 pattern is at tag `v0.1`.

## Metadata

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08-03
- Related workflows: transcript-navigation-and-segmentation, excerpt-selection, code-selection-and-assignment
- Related patterns: excerpt-selection, code-selection, status-feedback (not yet written)
- Research evidence: co-design workshop (segmentation units), magnification interview with Carmel (predictable location), screen-reader storyboarding (orientation and position)

## Purpose

Define the addressable unit that every other coding behavior depends on. Excerpt boundaries, code assignments, coder comparison, and position restoration are all expressed in segment identifiers, so segment identity has to be settled before anything downstream can be specified.

## Owns

- Segment identity and stability
- The active segment
- Movement between segments
- Position reporting
- Speaker and timestamp disclosure

## Does not own

- Excerpt boundaries and boundary adjustment (excerpt-selection.md)
- Code application (code-selection.md)
- Source import and initial segmentation, which is simulated in v0.1 through seeded data

## 1. Segmentation model

The transcript is modeled at two levels at once.

**Speaker turn** is the DOM and reading unit. One focusable container per turn, marked up as a list item, containing continuous prose.

**Sentence** is the addressing and boundary unit. Every sentence carries a stable identifier and can be made active through an application command, but is not an independently focusable DOM element.

Rationale: making every sentence focusable fragments continuous reading, because the screen reader announces each one as a separate object and the user loses the ability to read a turn straight through. Making the speaker turn the only addressable unit makes backward excerpt expansion too coarse, since a single turn can run for several minutes of speech. Separating the reading unit from the addressing unit resolves the conflict without requiring either compromise.

Line is rejected as a unit because wrapping changes with zoom level and viewport width, which would make excerpt boundaries unstable across users and across sessions for the same user.

Clause is out of scope for v0.1. Reliable clause segmentation requires parsing that the prototype does not need in order to answer its research questions, and clause boundaries in spoken transcript text are frequently ambiguous.

### 1.1 Identity rules

- `segmentId` is assigned once, at import, and is never recomputed.
- Identifiers are opaque strings, not array positions. Position-derived identifiers break every stored excerpt as soon as segmentation is revised.
- If segmentation is ever revised for a source, new identifiers are issued and a migration record maps old to new. Excerpts referencing retired identifiers are flagged for review rather than silently remapped.
- Segment order within a source is fixed and is the project's canonical order.

## 2. The active segment

The application maintains `activeSegmentId` for each user and source. This value is the anchor for excerpt selection, position reporting, and return-from-view behavior.

### 2.1 What sets it

- Activating a speaker turn container, which makes the turn's first sentence active
- Invoking any movement command
- Clicking or tapping a sentence. This is a pointer affordance only; every position it can reach is also reachable through the movement commands, so it adds convenience without becoming a keyboard-inaccessible path
- Confirming or cancelling an excerpt
- Saving a code assignment, per the `postCodingReturn` flag
- Restoring a saved position on source entry

Cancelling code selection does not set the active segment. The excerpt and the transcript position both survive the cancel unchanged.

### 2.2 What does not set it

- Scroll position. Scrolling is not a statement of intent, and treating it as one causes the active segment to drift while a magnification user pans to read surrounding context.
- Screen reader browse cursor movement. The application cannot know where the virtual cursor sits. Some screen readers sync system focus to focusable elements during browse-mode navigation, and where that happens the resulting `focus` event may be used to update the active segment. Treat this as an enhancement that improves the experience when it occurs. No behavior may depend on it.

### 2.3 Consequence for excerpt start

Because the active segment cannot be inferred from reading position, the command that begins an excerpt has to work from wherever the user is without assuming they first performed an explicit selection. Behavior:

- If an active segment exists, the excerpt begins at that sentence.
- If no active segment exists but focus sits inside a speaker turn, the excerpt begins at the last sentence of that turn. Last rather than first, because a user who has just read the turn straight through is at its end.
- If neither exists, the command announces that no position is set and offers to begin at the top of the source.
- The command always announces which sentence it started from. This is the user's confirmation that the application's idea of position matches theirs.

## 3. States

| State | Meaning |
|---|---|
| `inactive` | Segment is present, not active, not part of any excerpt |
| `active` | Segment is the current `activeSegmentId` |
| `in-pending-excerpt` | Segment falls within an unconfirmed excerpt range |
| `in-confirmed-excerpt` | Segment falls within a confirmed but unsaved excerpt range |
| `coded` | Segment falls within at least one saved excerpt carrying a code assignment |
| `coded-multiple` | Segment falls within two or more saved excerpts |

`active` is orthogonal to the excerpt and coded states. A segment can be active and coded at the same time and must be distinguishable as both.

## 4. Actions and keyboard behavior

Commands are specified as logical names. Chords are a separate, platform-conditional mapping, for the reason given in 4.2.

Single unmodified character keys must not be used, because screen readers in browse mode consume them for their own quick navigation and the keystroke never reaches the application. Every command also has a visible control, so no participant is blocked by a binding that fails on their setup.

### 4.1 Commands

| Command | Result |
|---|---|
| `segment.next` | Active segment advances one sentence; announce sentence text |
| `segment.previous` | Active segment moves back one sentence; announce sentence text |
| `turn.next` | Active segment becomes first sentence of next turn; announce speaker then text |
| `turn.previous` | Active segment becomes first sentence of previous turn; announce speaker then text |
| `segment.repeat` | Re-announce current sentence without moving |
| `position.report` | Announce position summary (section 5) |
| `segment.speaker` | Announce speaker of active segment |
| `segment.timestamp` | Announce timestamp of active segment |
| `excerpt.begin` | Hands off to excerpt-selection.md |
| `position.return` | Scroll active segment into view, move focus to its turn container |

### 4.2 Why the chords are platform-conditional

No single modifier family is clear across the three target configurations.

- `Alt+letter` opens browser menus on Windows and Linux. `Alt+Left` and `Alt+Right` are Back and Forward, which would destroy prototype state mid-session. On macOS, Option+letter produces dead keys and accented characters.
- `Alt+Shift+letter` triggers page accesskeys in Firefox, and pressing Alt+Shift alone switches input language on Windows when more than one layout is installed.
- `Ctrl+Option` on macOS is the VoiceOver modifier and is unusable.
- `Ctrl+Shift+letter` collides with several browser commands, including reopen closed tab and open private window.

Default mapping, subject to verification:

| Platform | Modifier family | Notes |
|---|---|---|
| Windows, Linux | `Ctrl+Alt+key` | Not claimed by JAWS or NVDA, both of which use Insert-based modifiers. Known risk: `Ctrl+Alt` is AltGr on many non-US layouts, so accented-character entry breaks. Acceptable for a US-based study, blocking for wider use |
| macOS | `Ctrl+Shift+key` | Avoids the VoiceOver modifier. Verify against Safari and Chrome menu bindings |

Bindings live in one configuration module so reassignment after the smoke test is a single edit. Confirming these against JAWS, NVDA, and VoiceOver is a required item in the accessibility smoke test before the first session, not an implementation detail.

## 5. Position reporting

Position is derived from `activeSegmentId` in all cases, for all users, so that the spoken report and the visible ribbon can never disagree.

Reported on request:

- Sentence N of M in the source
- Speaker turn N of M
- Percentage through the source, by sentence count
- Timestamp of the active segment, when the source has associated audio

Not reported automatically. Announcing position on every movement is the kind of verbosity that makes continuous reading unusable.

Per D-009 the indicator reports reading position, not coding completion. The label must not say "Progress," which reads as completion. The Hi-Fi currently shows `Progress 10%`, and an earlier frame shows `4:39/1:32:12 (53%)`, which is audio elapsed time. Neither is this value.

### 5.1 Change from the current draft

The existing prototype specification defines the progress indicator as reflecting "the word selected for a screen reader and the top line viewable for a sighted user." Both halves need revising. The application cannot know the screen reader's reading position, and defining the sighted value from scroll produces a number that contradicts the spoken one whenever a user scrolls without acting.

Replacement behavior:

- The ribbon reports the active segment's position.
- When the active segment scrolls out of view, a "Return to active segment" control appears in the ribbon. This also gives magnification users a cheap way back after panning for context.
- "Page X of Y" is dropped. Transcripts have no pages. Sentence index and percentage carry the same orientation value and are computable.

## 6. Screen reader information

| Event | Automatic | On request |
|---|---|---|
| Move to next or previous sentence | Sentence text | Speaker, timestamp, position |
| Move to next or previous turn | Speaker name, then sentence text | Timestamp, position |
| Enter a coded segment | Coded status and code count | Code names, coder, notes |
| Enter source | Source title, speaker count, restored position if any | Full orientation summary |

Under the default `timestampVerbosity` of `onRequest`, timestamps are not announced automatically, matching the current draft and the workshop finding. Speaker is announced automatically only on turn change, not on every sentence within a turn.

Announcements use a polite live region. None of these interrupt.

Reading through a coded range is not in this table, because nothing in the build says anything. Coded ranges are `mark` elements per D-052, and a screen reader reports a mark as highlighted on its own, at whatever verbosity its user has set. That is the point: the table above is what happens on focus and on request, and passing through a highlight while reading continuously is neither. No text is injected into the prose, so the continuous reading this pattern's section 1 protects is untouched.

## 7. Visual and magnification behavior

- Active segment carries a persistent visible indicator that is distinct from browser focus ring and from excerpt highlighting. Three states have to be separable at a glance.
- Coded segments carry a non-color indicator in addition to color. Color alone fails the contract, and code color is already load-bearing in the codebook.
- `coded-multiple` is visually distinct from `coded`. Overlapping highlights that simply layer color become unreadable at high zoom and unparseable by screen reader.
- The speaker and timestamp column collapses into the turn's leading text at narrow width, preserving reading order rather than requiring horizontal panning.
- Page-level reflow follows D-033: the narrow stack is primary, sidebar collapsed to a disclosure, command strip, transcript, code panel below. The wide layout is the same sequence with the panel alongside.
- Scroll position is preserved when returning from any overlay or panel.

## 8. Persistence

| Value | Scope |
|---|---|
| `activeSegmentId` | Per user, per source, across sessions |
| Scroll offset | Per user, per source, within session |
| Timestamp verbosity preference | Per user, across sessions and sources |
| Segment identifiers and order | Per source, permanent |

## 9. Data model

```text
TranscriptSegment
  segmentId          stable opaque identifier
  sourceId
  turnId             identifier of containing speaker turn
  sequenceIndex      integer, canonical order within source
  speakerId
  startTimeMs        nullable, present when source has audio
  endTimeMs          nullable
  text

SpeakerTurn
  turnId
  sourceId
  speakerId
  sequenceIndex
  segmentIds         ordered

SourcePosition
  userId
  sourceId
  activeSegmentId
  updatedAt
```

## 10. Acceptance criteria

**Stable identity.** Given a source with stored excerpts, when the application reloads, then every excerpt resolves to the same sentences it referenced before the reload.

**Scroll does not move the active segment.** Given an active segment, when the user scrolls to the end of the transcript without invoking a command, then the reported position is unchanged and a return control is available.

**Position agreement.** Given any active segment, when the user requests a spoken position report, then the values announced match the values shown in the visible ribbon.

**Turn reading is continuous.** Given a speaker turn of five sentences, when a screen reader user reads the turn with their own continuous reading command, then the turn is announced as continuous prose with no per-sentence object boundaries.

**Excerpt start is confirmable.** Given the user invokes begin excerpt, when the command runs, then the application announces which sentence the excerpt started from.

**Coded state is not color-only.** Given a coded segment, when color is removed from the rendering, then the coded state remains identifiable.

## 11. Prototype configuration

```text
transcriptNavigationUnit:  sentence | speakerTurn
  v0.1 assumption: sentence

timestampVerbosity:  never | onRequest | always
  v0.1 assumption: onRequest

positionReportDetail:  brief | full
  brief = sentence index and percentage
  full  = sentence index, turn index, percentage, timestamp
  v0.1 assumption: brief
```

Entities referenced but owned elsewhere: `Speaker`, `Source`, `CodingRound`, and the segmentation migration record. Their fields are specified in domain-model.md.

## 12. Unresolved questions

**Word-level precision: resolved by D-016.** The application does not implement word-level navigation. Continuous prose in the DOM already gives every screen reader word-level reading at no cost, and rebuilding it would duplicate assistive technology.

Excerpt boundaries stay whole-sentence. Word-level *reading* and word-level *boundaries* are different capabilities: the first comes free from the DOM, the second is application state the application can only place at an addressable unit, and it cannot observe where a screen reader's word cursor sits in any case. A user can hear any word and can begin an excerpt only at a sentence. Offsets stay in the model, always written at full segment bounds.

**Meaning units: resolved.** Out of scope for v0.1. Sentence and speaker turn only.

**Which modifier chord survives contact with JAWS, NVDA, and VoiceOver?**
Owner: whoever runs the accessibility smoke test. Evidence needed: hands-on verification with each screen reader before the first session. Temporary assumption: Alt-based chords as listed. Implementation can proceed, with the binding table held in one configuration file so reassignment is a single edit.

**Segmentation revision: resolved.** No. Segmentation is fixed at conversion and the qualitative lead cannot revise it mid-project.
