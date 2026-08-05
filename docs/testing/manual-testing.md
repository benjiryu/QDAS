# Manual Testing During Development

- Status: Working document
- Version: 0.1
- Last updated: 2026-08-04

Automated tests catch regressions in behavior that was already specified. They do not catch a workflow that is correct on paper and wrong in practice. This document covers the checks a person runs by hand after each task.

The reviewer's leverage here is behavioral, not code-level. Every check below maps to an acceptance criterion in a pattern specification.

## 1. The loop

Two terminals, both open on the repository.

```
Terminal 1:  claude
Terminal 2:  npm run dev
```

Vite hot-reloads, so changes appear in the browser without restarting anything. In VS Code, split the integrated terminal rather than switching windows.

Order per task: plan, approve, let it write and run tests, then run the manual checks below against that task's acceptance criteria, then commit.

Do not run the full check list every task. Run the criteria for the task in hand. The full list runs before a participant session.

## 2. Four checks per task

### 2.1 Keyboard only

Move your hands off the mouse. Tab through the feature.

- Can you reach every control?
- Is the focus indicator visible at every stop, against every background it lands on?
- Can you get out of everything you can get into?
- Does focus land where the specification says after each transition, or does it jump to the top of the document?

Focus return is the most common regression and the least visible one, because it looks fine when you use a mouse.

### 2.2 Zoom and reflow

The real test for WCAG 1.4.10: set the browser window to 1280 pixels wide, then zoom to 400 percent. That yields a 320 pixel effective viewport, which is the requirement.

- Command and plus to zoom. Chrome shows the percentage in the address bar.
- Check for a horizontal scrollbar at the page level. There should not be one.
- Check nothing is cut off or unreachable.
- Complete the task at that zoom. If any step needs you to pan sideways between two regions, it fails the single-panel rule.

Quicker proxy during development: the responsive design mode in Firefox or the device toolbar in Chrome, set to 320 wide. It catches layout breakage but not text scaling, so use the real method before a session.

### 2.3 VoiceOver

Command and F5 toggles VoiceOver. Use Safari; it is the best-supported pairing on macOS and the most likely to behave the way the specification assumes.

The VO key is Control plus Option. Commands worth knowing:

| Command | Does |
|---|---|
| VO + A | Read continuously from the cursor |
| Control | Stop speaking |
| VO + Right or Left | Next or previous item |
| VO + U | Open the rotor |
| VO + Command + H | Jump to next heading |
| VO + Shift + Down | Interact with a group |
| VO + Shift + Up | Stop interacting |
| VO + Space | Activate the item |
| Tab | Move between focusable controls only |

**Turn on the caption panel.** VoiceOver Utility, Visuals, Caption Panel, or VO plus Command plus F10. It prints what VoiceOver is saying as text on screen. For a sighted reviewer this changes everything: you can read announcements instead of catching them by ear, and you can copy the exact wording into a bug report rather than paraphrasing it.

**The rotor is the fastest structural check.** VO plus U, then left and right arrows to switch between Headings, Landmarks, Links, and Form Controls. If the heading list is not the outline you expect, or a landmark is missing, or a control appears with no name, you have found a defect in seconds without reading any markup.

### 2.4 Announcements

For any action that changes state, check that something is said, that it says the right thing, and that repeated actions do not silently drop messages.

Expand a boundary five times quickly. All five should speak. If only the last one does, the announcement queue is broken, and that failure is silent, which is why it needs deliberate checking.

## 3. What VoiceOver will not tell you

VoiceOver testing catches structural problems: missing accessible names, wrong heading order, lost focus, absent announcements. It does not predict JAWS or NVDA behavior, and the gaps matter for this project.

- Browse mode differs. NVDA and JAWS intercept single keys for quick navigation; VoiceOver does not work this way, so keyboard conflicts will not surface here.
- Live region handling differs across all three, particularly for queued and rapid announcements.
- AFB participants are more likely to use JAWS or NVDA on Windows than VoiceOver.

A clean VoiceOver pass is necessary and not sufficient. Verify chords and announcements on the participant's actual configuration before a session, per the accessibility contract section 4.

## 4. Build the announcement log

Worth asking Claude Code for once, early, right after the live region service exists:

```
Add a development-only announcement log. When import.meta.env.DEV is true,
render a visible panel listing every message passed to the announcement
service, in order, with a timestamp and its politeness level. Cap it at the
last 50 entries and provide a clear control.

It must not render in a production build and must not be inside any landmark
or announced by a screen reader itself.
```

This makes the invisible visible. Dropped and clobbered announcements are the failure most likely to end a participant session, and the symptom is silence, which is nearly impossible to notice while you are also driving the interface. A visible log turns it into something you can read at a glance.

## 5. Reporting a failure back to the agent

Quote the acceptance criterion. Do not describe the symptom.

Good:

> The acceptance criterion "Context does not move focus" in
> docs/patterns/excerpt-selection.md section 11 fails. After requesting context
> before, focus lands on the transcript container rather than staying on the
> invoked control.

Poor:

> focus is jumping around when I check the context

The first produces a fix aimed at the specified behavior. The second produces a guess. If the caption panel is on, paste the announcement text verbatim as well; the exact wording is often the fastest route to the cause.

## 6. Recording

Screen recording with audio, through QuickTime, captures VoiceOver speech alongside the screen. Useful for showing the team a defect rather than describing it, and for keeping a record of a behavior before it is changed.

## 7. Before every participant session

The per-task checks above are not the session gate. Run the full twelve-item smoke test in `docs/accessibility-contract.md` section 4, on the participant's own browser and screen reader combination, with test data reset to a known state.
