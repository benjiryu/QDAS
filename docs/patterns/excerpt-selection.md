# Pattern: Excerpt Capture

## Metadata

- Status: v0.2 rewrite per D-036 and D-037, superseding the v0.1 boundary-command pattern
- Version: 0.2
- Last updated: 2026-08
- Related workflows: excerpt-selection, code-selection-and-assignment
- Related patterns: transcript-segment, code-selection
- The v0.1 pattern, with anchoring, boundary expansion, and the adjustment state machine, is preserved at tag `v0.1`. D-036 records why it was removed and what evidence would bring it back.

## Purpose

Let a researcher mark the source range they intend to code, with as little machinery as the three access modes allow, and convert that fragile native selection into a persistent application-owned record at the moment of capture.

Ownership splits at capture: before it, the range belongs to the browser or the screen reader; after it, to the application. That after-half is what survives of D-001, and it is still load-bearing, since a native selection cannot persist across the panel, be stored, or be compared across coders.

## 1. Capture routes

| User | Route |
|---|---|
| Sighted | Native drag, then the context menu (section 2), the strip's Assign code control, or `excerpt.code` |
| Magnification | Same as sighted |
| Screen reader | Native selection where the screen reader surfaces a real DOM selection, then `excerpt.code`. Where it does not, the turn fallback below |

### 1.1 The capture rule

`excerpt.code` and both menu items resolve the range in this order:

1. **An observable, non-collapsed DOM selection intersecting the transcript**: captured exactly as dragged, character-precise, clamped to transcript content. The native selection is cleared on capture; the application highlight replaces it.
2. **Otherwise, the focused speaker turn**: captured whole. Turns are focusable per D-002, so this always resolves.
3. **Focus outside the transcript and no selection**: the command announces that there is nothing to capture, and does nothing.

### 1.2 The announcement names which rule fired

- Selection captured: "Coding your selection. N sentences from [speaker]."
- Fallback: "No selection detected. Coding the current turn. [Speaker], N sentences."

The two must be unmistakably different. A screen reader user whose browse-mode selection never reached the DOM must learn that from the announcement, not from discovering the wrong excerpt later. This is the honesty requirement the whole model rests on: NVDA and JAWS virtual-buffer selections reach the DOM inconsistently, and the application must never pretend otherwise.

## 2. Context menu

Per D-037. Right-click over the transcript while a selection exists opens a custom menu:

1. **Assign code** — capture, open the panel, focus in search
2. **Add note** — capture, open the panel, focus in the note field

Requirements carried from D-028: the menu adds no capability, every item exists on the strip and as a chord; it opens on Shift+F10 and the applications key when a selection exists, not only on pointer; menu semantics with arrow navigation; Escape closes it and returns focus where it was. Right-click anywhere else, or with no selection, shows the untouched native browser menu.

Per D-060, the menu never alters the native selection or its appearance. The transcript defines an author `::selection` style matching native selection blue, which browsers also apply to inactive selections, so the selection paints identically while focus is in the menu. No application highlight exists before capture; the menu's open, navigation, and close paths leave the DOM selection untouched, and Escape's focus return leaves it intact.

## 3. States

| State | Meaning |
|---|---|
| `idle` | No capture in progress |
| `confirmed` | A range is captured and the panel is open |
| `saved` | Range persisted with at least one code assignment |

Transitions: `idle` → `confirmed` on capture. `confirmed` → `saved` on save with a non-empty pending assignment, or per D-055 with a saved note: an excerpt persists with at least one code or a note. `confirmed` → `idle` on closing with neither, which discards the capture; with codes checked, closing commits, per D-042; in the note panel, closing with text commits the note. `saved` → `confirmed` via `excerpt.open` per D-030, range locked, assignments preloaded. Note-only excerpts reopen through `note.open` into the note panel, and **clicking** one opens the note panel as well: a click means "open what is here", so it answers with whatever is there.

`excerpt.open` deliberately does not route that way. It reopens for coding whatever the excerpt carries, and it is the only path by which a passage noted before it was coded can gain codes: re-capturing the same range creates a second excerpt rather than editing the first. The three routes each mean something distinct — the click asks what is here, `excerpt.open` asks to code, `note.open` asks for the note.

There is no adjustment phase. Fixing a wrong range means cancelling and reselecting, which native selection makes cheap. If sessions show that cancel-and-reselect is not cheap for screen reader users, that is D-036's reopening evidence.

## 4. Commands

| Command | Available | Result |
|---|---|---|
| `excerpt.code` | Always | Capture per 1.1, open panel, focus in search |
| `excerpt.note` | Always | Capture per 1.1, open the isolated note panel per D-055; if the code panel is already open, focus its note region instead |
| `excerpt.open` | `idle`, focused turn intersects a saved excerpt | Reopen per D-030, list disambiguation when several intersect |
| `note.open` | `idle`, focused turn intersects an excerpt carrying a note | Open the isolated note panel loaded with the note, list disambiguation when several intersect. Pointer twin: clicking the rail's note icon |

`excerpt.code` and `excerpt.note` have strip controls showing their chords. `excerpt.open` and `note.open` are context commands per D-057: discoverable through the shortcuts help and the turn's status description, with the clickable coded sentence and note icon as pointer twins. The strip stays at D-038's five controls.

## 5. Storage

Boundaries are exact characters: `startSegmentId` + `startOffset` through `endSegmentId` + `endOffset`. The turn fallback stores the turn's full range. Nothing snaps to sentence boundaries; boundary variation between coders is preserved as data, and review compares at sentence granularity per R-1 without altering what was stored.

## 6. Visual behavior

- The application highlight is the only selection visual after capture; native selection is cleared. Per D-063 the confirmed-state highlight uses the same blue token as the author `::selection` style, so drag, menu, and open panel read as one continuous visual; the purple confirmed treatment is retired. A saved range reopened by `excerpt.open` or `note.open` wears the same selection blue while its panel is open, returning to its saved treatment on close.
- It is also the selection visual **while the context menu is open**, painted from the snapshot the menu took. Opening the menu moves focus out of the transcript, and how a browser paints a selection that no longer has focus is not something this pattern can rest on — which is what made the highlight vanish in some scenarios and not others. The menu's preview is the lighter band rather than the confirmed one: nothing is captured until an item is chosen, and dismissing the menu removes the preview and puts the native selection back, so a coder who changed their mind about the menu has not lost the passage.
- A captured range may begin or end mid-sentence. The highlight shows exactly what will be coded.
- Highlight state is not conveyed by color alone.
- Note-only ranges render with the gray highlight and underline treatment, distinct from coded highlights; the underline is the non-color channel. Per D-055's codification of the existing build behavior.
- The panel, strip, and reflow behavior are unchanged from D-027, D-031, and D-033.

## 7. Acceptance criteria

**Exact capture.** Given a drag from mid-sentence to mid-sentence, when the user invokes Assign code, then the stored offsets match the drag exactly and the highlight matches the stored range.

**Fallback fires honestly.** Given focus on a speaker turn and no observable selection, when `excerpt.code` fires, then the whole turn is captured and the announcement states that no selection was detected and names the turn.

**Fallback never masquerades.** Given an observable selection, when `excerpt.code` fires, then the selection announcement is used and the turn fallback does not run.

**Menu parity.** Given a selection, when the menu is opened by Shift+F10, then the same items appear as on right-click, and Escape returns focus to where it was.

**Selection survives the menu unchanged.** Given a drag selection, when the menu opens, then the selection's visual appearance is unchanged, no application highlight appears, and closing the menu without choosing leaves the same DOM selection ready for capture. D-060.

**Native menu preserved.** Given no selection, when the user right-clicks the transcript, then the native browser menu appears.

**Closing with no code checked discards.** Given a captured range with the panel open and nothing checked, when the user closes it, then no excerpt record exists and the highlight is removed. With a code checked, closing writes the excerpt instead. D-042.

**Capture survives the panel.** Given a captured range, when the user searches, checks codes, and saves, then the stored range is unchanged throughout.

## 8. Unresolved questions

**Does native backward selection carry the recognize-at-the-end workflow?** Owner: session evidence. The storyboarding finding rides on shift-selection backward and on the turn fallback. Assumption: yes for v0.2. Reopens D-036 if not.

**Is turn-level capture too coarse when the fallback is a screen reader user's main route?** Owner: session evidence. Assumption: acceptable for v0.2. If NVDA and JAWS participants live on the fallback and fight its granularity, that is the strongest possible evidence for restoring some boundary adjustment.
