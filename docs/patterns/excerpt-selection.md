# Pattern: Excerpt Selection

## Metadata

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08-05
- Related workflows: excerpt-selection, code-selection-and-assignment, coding-review
- Related patterns: transcript-segment, code-selection, status-feedback (not yet written)
- Research evidence: screen-reader storyboarding (backward selection), co-design workshop (flexible segmentation), magnification interview (predictable control location)

## Purpose

Let a researcher define the source range they intend to code, in a way that survives moving focus into the codebook and can be compared against another coder's range later.

The defining requirement comes from the screen-reader sessions: a researcher often recognizes a codeable idea only after hearing the end of the passage. Selection therefore has to run backward from the current position as its primary direction, not as an afterthought. Native browser text selection cannot carry this workflow, because it is lost when focus moves and because it cannot be persisted, compared, or reconstructed across sessions.

## Owns

- Excerpt boundary state and adjustment
- Confirmation and cancellation
- Boundary change feedback
- Persistence of the range while other views are open

## Does not own

- Segment identity and movement (transcript-segment.md)
- Code application (code-selection.md)
- Note creation (note-editor.md, not yet written)

## 1. Gap in the current draft

The existing prototype specification describes segment selection as choosing a unit by sentence, clause, speaker, or double-click. That is selection of an existing unit. It does not provide boundary adjustment, which is the behavior the research actually surfaced. This pattern replaces that bullet.

The accessibility contract in the same document already gives "after expanding an excerpt" as its worked example of screen reader feedback, so the contract assumes this pattern exists.

## 2. States

| State | Meaning |
|---|---|
| `idle` | No excerpt in progress |
| `anchored` | Range sits at its origin, no adjustment yet. The origin is the active segment for command entry, or the snapped selection for adoption per D-034 |
| `adjusting` | One or both boundaries have moved |
| `confirmed` | Range accepted, awaiting code assignment |
| `saved` | Range persisted with at least one code assignment |

`anchored` and `adjusting` are separate states because the first boundary change is the point at which the user has committed to editing rather than to accepting the default range. Only `adjusting` shows the revert control.

There is no `cancelled` state. Cancelling returns to `idle` and creates no record, so a distinct terminal state would never be observable.

`saved` is not terminal. Per D-030 a coded excerpt reopens for code changes, returning to `confirmed` with its assignments preloaded. The range stays locked: reopening changes codes, not boundaries, and boundary editing on a saved excerpt is still deferred under E-4.

## 3. State transitions

| Current | Action | Next | System result |
|---|---|---|---|
| `idle` | Begin excerpt, no observable selection | `anchored` | Range set to active segment; announce start sentence |
| `idle` | Begin excerpt, observable selection present | `anchored` | Selection adopted and snapped to whole sentences; native selection cleared; announce adopted size and the snap |
| `idle` | Code this excerpt, observable selection present | `confirmed` | Selection adopted, snapped, confirmed in one action; panel opens |
| `anchored` | Any boundary change | `adjusting` | Range updated; announce change |
| `adjusting` | Any boundary change | `adjusting` | Range updated; announce change |
| `anchored` or `adjusting` | Confirm | `confirmed` | Range locked; code selection opens |
| `anchored` or `adjusting` | Cancel | `idle` | Range discarded; focus returns to origin segment |
| `adjusting` | Revert | `anchored` | Range reset to origin segment; announce reset |
| `confirmed` | Close code selection | `confirmed` | Range preserved; focus returns to command strip |
| `confirmed` | Any boundary change | `adjusting` | Range reopened for editing; code selection closes with pending codes preserved |
| `confirmed` | Discard excerpt | `idle` | Range and any pending codes discarded; focus returns to origin segment |
| `confirmed` | Save with at least one code | `saved` | Excerpt and assignments persisted |
| `saved` | Open the coded excerpt | `confirmed` | Range reloaded and locked; saved assignments load into the pending assignment; panel opens |

The last four rows carry the recovery path. Closing code selection must not destroy the excerpt, because the most common reason to back out is realizing the boundaries are wrong, and the user then needs to reach adjustment without starting over. Pending codes survive that trip.

Save is unavailable while the pending assignment is empty. A saved excerpt with no code assignment satisfies no definition in this document or in transcript-segment.md, so the transition does not exist.

## 4. Actions

Commands are logical names. Chords follow the platform-conditional mapping in transcript-segment.md section 4.2.

| Command | Available in | Additional condition |
|---|---|---|
| `excerpt.begin` | `idle` | An active segment or focused turn exists |
| `excerpt.start.expand` | `anchored`, `adjusting`, `confirmed` | Start is not first sentence of source |
| `excerpt.start.contract` | `anchored`, `adjusting`, `confirmed` | Start is before end |
| `excerpt.end.expand` | `anchored`, `adjusting`, `confirmed` | End is not last sentence of source |
| `excerpt.end.contract` | `anchored`, `adjusting`, `confirmed` | End is after start |
| `excerpt.start.expandTurn` | `anchored`, `adjusting`, `confirmed` | Start is not in first turn |
| `excerpt.end.expandTurn` | `anchored`, `adjusting`, `confirmed` | End is not in last turn |
| `excerpt.read` | `anchored`, `adjusting`, `confirmed` | |
| `excerpt.contextBefore` | `anchored`, `adjusting`, `confirmed` | Start is not first sentence of source |
| `excerpt.contextAfter` | `anchored`, `adjusting`, `confirmed` | End is not last sentence of source |
| `excerpt.revert` | `adjusting` | |
| `excerpt.confirm` | `anchored`, `adjusting` | Range is valid |
| `excerpt.discard` | `anchored`, `adjusting`, `confirmed` | |
| `excerpt.open` | `idle` | The active segment falls inside at least one saved excerpt |

Invoking a boundary command from `confirmed` moves the excerpt to `adjusting` and closes code selection, preserving pending codes.

This route depends on code selection being non-modal, per D-027. A focus-trapping dialog would swallow these chords, which is what forced D-026 to invent a separate recovery control and is part of why it was reversed.

Backward expansion is bound at the same cost as forward expansion, one chord, no mode switch. Given the research finding, backward is the expected first move and should never be the more expensive one.

Every command has a visible control. Controls sit in the command strip specified by D-031: a single permanently reserved strip under the top navigation, holding the two entry controls from D-029 and the boundary controls together. The strip never appears or disappears; boundary controls are disabled with an exposed reason while no excerpt is in progress. A strip that appears would shift layout, and layout shift under magnification loses the user's place.

Each control shows its chord, generated by `describeChord`. The visible control teaches the keyboard route.

Boundaries cannot cross. Contracting a boundary past its counterpart is not a valid state; the command is unavailable and announces why on attempt.

### 4.0 Entry routes

One range, three ways to set it, per D-034. After entry, adjustment is identical for everyone.

| User | Expected primary route | Mechanism |
|---|---|---|
| Screen reader | Command | `excerpt.begin` at the active segment. The only route the application can verify, since browse-mode selection is often unobservable |
| Magnification | Either | Pointer drag adopted on the next strip control, or the command route |
| Sighted | Pointer | Native drag adopted on the next strip control |

Adoption rules:

- The adopted range is every sentence the selection touches, expanded outward to whole-sentence boundaries. Snapping never shrinks a selection.
- The announcement names the adopted size and states that boundaries were extended when they were.
- The native selection is cleared on adoption, so the application's range indicator is the only visible selection from that moment.
- Adoption is opportunistic. No behavior depends on the application observing a selection; with none observable, both strip controls behave per D-029.
- Selections reaching outside the transcript clamp to the transcript's sentences. Collapsed selections are ignored.
- Governed by `adoptNativeSelection`, default true.

### 4.1 Opening a saved excerpt

`excerpt.open` is the keyboard route to the behaviour a sighted user gets by clicking a highlight. Coded segments are not focusable, per D-002, so a command is required for parity rather than optional.

Where the active segment falls inside two or more saved excerpts, the `coded-multiple` case, the command does not guess. It presents the overlapping excerpts as a list identified by range and code count, and the coder chooses. A click landing on overlapping highlights disambiguates the same way.

Reopening does not unlock boundaries. The excerpt enters `confirmed` with the range fixed and the boundary commands unavailable.

### 4.2 Escape

Escape maps to `excerpt.discard` only in `anchored` and `adjusting`, and only while the code panel is closed.

Escape is the one chord whose meaning depends on context, so it is not a single row in the binding table. `resolveEscape(panelOpen)` in `src/config/keybindings.ts` returns `codes.cancel` when the panel is open and `excerpt.discard` when it is not. Components call that rather than branching on Escape themselves.

In `confirmed` with the code panel open, Escape belongs to the panel and closes it without discarding the excerpt. Discarding a confirmed excerpt requires the explicit toolbar control, because Escape at that point is far more likely to mean "close this panel" than "throw away the range I just defined." Confirmation is required when discarding a confirmed excerpt that has pending codes.

## 5. Announcements

After every boundary change, announce automatically, in this order:

1. The text that entered or left the range, truncated to a configurable word count
2. The new size of the excerpt

Example on expansion: "Added: and that's when I stopped using it entirely. Excerpt is now four sentences."

Example on contraction: "Removed: and that's when I stopped using it entirely. Excerpt is now three sentences."

Rationale: after expanding backward, the thing the user most needs is to hear what they just picked up. An abstract report that a boundary moved makes the user issue a second command to learn anything useful, which doubles the cost of the most frequent action in the workflow. Announcing the delta rather than the whole range keeps repeated adjustment cheap, since re-reading a growing excerpt on every keystroke becomes unusable within a few presses.

Available on request:

- Full excerpt text
- Start speaker and end speaker
- Start and end timestamps
- Context before and after, one sentence at a time, without changing the range

All announcements are polite and non-interrupting. Exact wording is provisional and is itself a candidate for testing; the specification fixes the information content, not the phrasing.

### 5.1 Size unit

Excerpt size is announced in sentences when the range sits within one speaker turn, and in sentences plus turn count when it spans turns. "Four sentences across two turns" carries more orientation than a raw sentence count once the range crosses a turn boundary.

Turns rather than speakers, because one speaker can hold several consecutive turns and the turn count is what the data model stores.

## 6. Focus behavior

| Trigger | Focus destination |
|---|---|
| Begin excerpt | Command strip, first boundary control |
| Boundary change | Unchanged; focus stays on the invoked control |
| Read context before or after | Unchanged; context is announced, focus does not move |
| Confirm | Code selection panel, search field |
| Discard from `anchored` or `adjusting` | Origin segment's turn container |
| Close code selection | Command strip, first boundary control |
| Boundary change from `confirmed` | The invoked boundary control, panel now closed |
| Discard from `confirmed` | Origin segment's turn container |
| Save | Per `postCodingReturn` flag, default `excerptStartSegment` |

Reading context must not move focus. If it did, the user would lose their place in the adjustment sequence every time they checked whether to expand further, which is the exact loop this pattern exists to support.

## 7. Visual and magnification behavior

- The pending range is visually distinct from a saved coded range and from the active segment indicator.
- Start and end boundaries carry individual markers, so a magnification user panning to one end can tell which boundary they are looking at without scrolling to find the other.
- The command strip holds a fixed position and is always present. It does not follow the selection, and it does not appear or disappear with excerpt state.
- Boundary changes scroll the changed boundary into view without moving the other, and without resetting scroll to the top of the range.
- Excerpt state is not conveyed by color alone.
- All adjustment is completable in a single panel with no horizontal panning.

## 8. Overlapping excerpts

Two excerpts by the same coder may overlap. The system stores both exactly as drawn and does not merge them.

The right-hand code column shows one entry per excerpt, ordered by start position then by creation time. Where excerpts overlap, the affected segments carry the `coded-multiple` state from transcript-segment.md and a screen reader user requesting code detail on those segments hears each excerpt described separately with its own range.

Cross-coder overlap is handled in coder-comparison.md, which is not yet written. This pattern only guarantees that the boundaries are stored precisely enough for that comparison to be possible.

## 9. Persistence and error recovery

The range persists across:

- Opening and closing code selection
- Opening and closing a code definition
- Opening and closing the note editor
- Search and filter operations inside those views
- A failed save

On save failure, the excerpt, every pending code, and any draft note are preserved and a retry control is offered. Nothing is discarded and no state is reset. This is the highest-value regression test in the prototype, because a save failure that silently drops work will end a participant session.

The range does not persist across a full page reload in v0.1. Draft state recovery is simulated infrastructure.

## 10. Data model

```text
Excerpt
  excerptId
  sourceId
  startSegmentId
  endSegmentId
  startOffset        always 0 in v0.1
  endOffset          always segment length in v0.1
  coderId
  codingRoundId
  createdAt
  updatedAt
```

Offsets are stored but unused, so that word-level precision can be added later without migrating existing excerpts.

The excerpt stores boundaries, not copied text. Copied text detaches from the source and cannot be re-expanded, re-read in context, or compared against a differently bounded excerpt from another coder.

## 11. Acceptance criteria

**Backward expansion.** Given an excerpt anchored at the active sentence, when the user expands the start backward twice, then the excerpt covers three sentences ending at the anchor, and the transcript position is unchanged.

**Delta announcement.** Given an excerpt of two sentences, when the user expands the start backward, then the newly included sentence is announced followed by the new excerpt size.

**Context does not move focus.** Given an excerpt in `adjusting`, when the user requests context before, then the preceding sentence is announced, the range is unchanged, and focus remains on the invoked control.

**Boundaries cannot cross.** Given a single-sentence excerpt, when the user contracts the start forward, then the command is unavailable and the range is unchanged.

**Excerpt survives code selection.** Given a confirmed excerpt, when code selection opens and closes, then the boundaries and the transcript position are unchanged.

**Closing code selection preserves the range.** Given a confirmed excerpt with code selection open, when the user presses Escape, then the panel closes, the excerpt remains confirmed, and focus returns to the excerpt toolbar.

**Boundaries are reachable after confirming.** Given a confirmed excerpt with two pending codes and the code panel open, when the user expands the start backward, then the panel closes, the excerpt enters `adjusting`, and both pending codes are preserved.

**Discard from adjustment creates nothing.** Given an excerpt in `adjusting`, when the user discards it, then no excerpt record exists and focus returns to the segment where the excerpt began.

**Save requires a code.** Given a confirmed excerpt with an empty pending assignment, when the user looks for Save, then Save is unavailable and the reason is available to a screen reader.

**Save failure preserves everything.** Given a confirmed excerpt, two pending codes, and a draft note, when saving fails, then all three are preserved and a retry control is available.

**Single-panel completion.** Given the application at the target zoom level, when the user completes a full excerpt adjustment, then no step requires horizontal panning.

## 12. Prototype configuration

```text
excerptInitialRange:  activeSentence | activeSpeakerTurn
  v0.1 assumption: activeSentence

boundaryChangeAnnouncement:  delta | fullRange | sizeOnly
  v0.1 assumption: delta

deltaTruncationWords:  integer
  v0.1 assumption: 25

postCodingReturn:  excerptStartSegment | excerptEndSegment | nextSegment | nextUncodedSegment
  v0.1 assumption: excerptStartSegment
```

Renamed from `codedExcerpt`, which was ambiguous between the start boundary, the end boundary, and the toolbar. After a backward expansion the start segment is not where the user began, so the value has to name a boundary explicitly.

`boundaryChangeAnnouncement` exists as a flag specifically so the three options can be compared in session rather than argued about in advance.

## 13. Unresolved questions

**Should the initial range be the active sentence or the whole active speaker turn?**
Owner: team, resolved by session one. Evidence needed: whether participants more often code a full turn or a passage within one. Temporary assumption: active sentence, on the reasoning that expanding is cheaper than contracting when the user has just heard the end of an idea. Implementation can proceed behind the flag.

**Should native browser text selection work as a secondary route?**
Owner: Benji. Evidence needed: whether sighted and low-vision participants reach for the mouse first. Temporary assumption: yes for sighted and magnification use, snapping to sentence boundaries and producing the same application-managed excerpt. Screen reader workflow never depends on it. Implementation can proceed; the snapping rule needs stating before build.

**How should a long cross-speaker excerpt be summarized on request?**
Owner: team. Evidence needed: session feedback on whether full read-back is usable past a certain length. Temporary assumption: full text on request regardless of length, with size announced first so the user can decide whether to listen. Implementation can proceed.

**Do coders need to edit boundaries of an already saved excerpt?**
Owner: Angie. Evidence needed: qualitative lead interview. Temporary assumption: yes within the same coding round, and the original boundaries are preserved in history rather than overwritten. Implementation can proceed for the create path; the edit path is deferred until this is answered.

**Does an overlap by the same coder ever need to be prevented?**
Owner: Angie. Evidence needed: qualitative lead interview. Temporary assumption: no, overlaps are permitted and stored as drawn. Implementation can proceed.
