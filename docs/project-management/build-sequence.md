# Build Sequence

- Status: Working document
- Version: 0.2
- Last updated: 2026-08-03

Ordered tasks for building slice 2 with a repository-level coding agent. Each task is small enough to review, has a stated definition of done, and leaves the repository working.

The instruction that matters most: never ask for the prototype. Ask for one behavior with acceptance criteria. An agent given a large open task will invent core product behavior, and inventions are expensive to find later because they look like decisions.

## Phase 0. Environment

### 0.1 Commit before running anything

Commit the working tree before running any generator, installer, or scaffolding command.

```bash
git add -A
git commit -m "Specifications and configuration"
```

`npm create vite` offers a "remove existing files" option that deletes an uncommitted tree with no recovery path. This is decision D-008. It is first in the sequence because it is the only step whose omission loses work.

### 0.2 Node

```bash
node --version
```

If this errors or reports below 20, install it. On macOS with Homebrew, `brew install node`. Otherwise use the LTS installer from nodejs.org.

### 0.3 Project baseline

Already generated. Recorded here for anyone repeating the setup.

```bash
npm create vite@latest . -- --template react-ts
```

The generator asks several questions. Exact prompts vary by version.

| Prompt | Answer | Why |
|---|---|---|
| Directory is not empty | Ignore files and continue | "Remove existing files" deletes the specifications. Choosing it once cost a full restore |
| Package name | `qdas-prototype` | npm package names cannot contain uppercase letters, so it cannot derive one from `QDAS` |
| Linter and formatter | ESLint and Prettier | ESLint carries `eslint-plugin-jsx-a11y`, which catches accessibility mistakes at lint time rather than in a session. Prettier keeps agent diffs showing behavior changes rather than reformatting |
| Anything else | Conventional default | No remaining option affects the specifications |

### 0.4 Remaining installs

```bash
npm install react-aria-components
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm install -D @playwright/test @axe-core/playwright
npm install -D eslint-plugin-jsx-a11y
npx playwright install
```

Add the jsx-a11y recommended config to `eslint.config.js`. It will not catch focus behavior, announcement correctness, or anything about workflow, but it removes a class of avoidable mistakes before they reach a participant.

### 0.5 Confirm it runs

```bash
npm run build
npm run dev
```

The build must pass before any feature work. Fix errors here rather than carrying them forward.

### 0.6 Claude Code

Use the native installer rather than a global npm install:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

The npm route writes to `/usr/local/lib/node_modules`, which is not user-writable on a default macOS Node install, and fails with `EACCES`. Do not work around that with `sudo`; the Claude Code documentation warns against it, and it leaves root-owned files in your npm tree. The native installer puts the binary in `~/.local/bin` instead, which you own, and auto-updates.

Then verify and start:

```bash
claude --version
cd ~/"Coding Projects/QDAS"
claude
```

Note the quote placement. `cd "~/Coding Projects/QDAS"` fails, because a tilde inside quotes is a literal character rather than your home directory. Put the tilde outside: `cd ~/"Coding Projects/QDAS"`.

Run it from the repository root so it can read `CLAUDE.md` and `/docs`. Do not run `/init`; `CLAUDE.md` already exists and `/init` would overwrite it.

## How to work

**Commit before and after each task.** A clean tree before, a single commit after. This is the recovery path for everything.

**Plan before writing.** Press Shift+Tab to reach plan mode before each task. Read the plan against the relevant specification. Approve only when the plan matches the spec. A plan that mentions behavior not in the spec is the agent inventing, which is the failure this process exists to prevent.

**One task, one commit.** Never batch. A commit you cannot describe in one sentence is too large to review.

**Clear context between tasks.** Run `/clear` after each commit. Carried context from a finished task makes the agent reference decisions from work it can no longer see accurately.

**Run tests after every change.** This is in `CLAUDE.md`, but check that it actually happened rather than assuming.

**Review behaviorally, not by reading code.** Your leverage as a reviewer is the acceptance criteria, which is why the specifications carry them. After each task, work through the Given-When-Then statements in the relevant pattern spec by hand: keyboard only, 400% zoom, VoiceOver, and focus destination at every transition.

Procedures, VoiceOver commands, the caption panel, and what VoiceOver will not catch are in `docs/testing/manual-testing.md`. Run the criteria for the task in hand, not the whole list every time.

If a criterion fails, quote the criterion back to the agent rather than describing the symptom. "Acceptance criterion 'Context does not move focus' in excerpt-selection.md fails" produces a better fix than "focus is jumping around."

**Watch for silent resolution.** `CLAUDE.md` rule 8 requires the agent to stop and surface specification conflicts rather than choosing. When it makes a decision instead of raising it, say so and ask it to record the conflict in the decision log. This behavior degrades over long sessions and needs reinforcing.

**Stop and ask when a task touches an open question.** The register in `unresolved-questions.md` contains methodological decisions belonging to the research team. If the agent proposes an answer to one, that is not progress.

## Phase 1. Foundation

Nothing here is a feature. All of it blocks features.

### Task 1. Application shell

```
Build the application shell only. No features.

Requirements:
- Routes for /projects, /projects/:projectId, /projects/:projectId/sources/:sourceId
- Landmark structure per docs/accessibility-contract.md section 2.1: one banner,
  a navigation landmark for application-level navigation, a second labeled
  navigation for project-level navigation, one main
- One h1 per route naming the page
- Skip link to main content
- No positive tabindex, no role="application"

Do not build page content. Placeholder headings only.
Add a unit test asserting the landmark and heading structure of each route.
```

Done when: `npm run build` passes, the routes render, and tab order reaches the skip link first.

### Task 2. Live region service

```
Implement the shared announcement service at src/a11y/announcer.ts, per
docs/accessibility-contract.md section 2.3.

Requirements:
- Exactly two live regions for the whole application, one polite, one assertive
- A React provider mounting them once at the app root
- An announce(message, politeness) API
- Successive announcements queue rather than replace. An announcement issued
  while another is pending must not overwrite it
- Every announcement is retrievable for repeat-on-request
- Assertive is reserved for save failure and destructive confirmation

Add unit tests covering: queueing under rapid successive calls, that no message
is dropped, and that repeat returns the last message.
```

Done when: tests pass, and rapid repeated announcements all speak in VoiceOver rather than only the last one.

This task is worth extra care. Dropped announcements are the failure most likely to end a participant session, and the symptom is silence, which is hard to notice in review.

### Task 3. Synthetic seed fixture

```
Create a synthetic transcript and codebook fixture in src/data/seed/, matching
the shape requirements in docs/testing/seed-data.md section 4.

- 300+ sentences across 60+ speaker turns, 2 speakers, at least three turns of
  8 or more sentences
- 30+ codes, three levels deep, every code carrying a full definition,
  inclusion criteria, and exclusion criteria
- At least one pair of similarly named codes
- 15+ excerpts with code assignments attributed to a second coder
- At least 4 pairs of overlapping excerpts with differing boundaries
- Types from src/domain/types.ts. Stable opaque identifiers.

Content is invented and about a neutral topic. This fixture is committed and
must contain no real research material.
```

Done when: the fixture typechecks against the domain types and meets every count above.

Generate this rather than hand-writing it. Realistic length is the point; a short fixture makes every later finding wrong.

### Task 4. Domain layer for segments and excerpts

```
Implement pure domain functions in src/domain/. No React, no DOM.

- Resolve a source into ordered turns and segments
- Given a segment id, return next and previous segment, next and previous turn
- Position report: sentence index, turn index, percentage
- Excerpt operations: create at segment, expand and contract each boundary by
  segment and by turn, validity check that boundaries cannot cross
- Excerpt size description, sentences and turn count, per
  docs/patterns/excerpt-selection.md section 5.1
- The delta between two excerpt ranges: what text entered or left

Unit test each. Boundary cases: first segment, last segment, single-segment
excerpt, contraction past the counterpart boundary, expansion across a turn.
```

Done when: tests pass. This is the layer where correctness is cheapest to establish and most expensive to retrofit.

## Phase 2. Coding workflow

### Task 5. Transcript rendering

```
Render a transcript from the seed fixture, per docs/patterns/transcript-segment.md
sections 1 and 7. Display only, no navigation commands yet.

- Speaker turns as focusable list items containing continuous prose
- Sentences are not independently focusable, but are individually addressable
  and individually styleable
- Speaker and timestamp presented so they collapse into the turn's leading text
  at narrow width rather than requiring horizontal panning
- Coded segments carry a non-color indicator alongside color
- coded-multiple visually distinct from coded

Add a Playwright test asserting a screen reader reads one turn as continuous
prose rather than as separate per-sentence objects.
```

Done when: at 400% zoom nothing scrolls horizontally, and VoiceOver reads a full turn without per-sentence interruption.

### Task 6. Segment navigation and position

```
Implement navigation per docs/patterns/transcript-segment.md sections 2, 4, 5, 6.

- activeSegmentId tracked per source
- Commands wired from src/config/keybindings.ts. Never hardcode a chord
- Every command has a visible control
- Scroll never sets the active segment
- Position ribbon derived from the active segment, not from scroll
- Return to active segment control appears when it scrolls out of view
- Announcements through the shared service, per the table in section 6

Acceptance criteria: "Scroll does not move the active segment" and
"Position agreement" in transcript-segment.md section 10.
```

Done when: both criteria pass by hand, and the position ribbon and the spoken report never disagree.

### Task 7. Excerpt selection

```
Implement excerpt selection per docs/patterns/excerpt-selection.md.

There is no visual design for this feature. Per D-018 you have latitude on how
it presents: toolbar placement and grouping, control labels, how the pending
range is indicated, how boundary markers are drawn, layout at each width.
Propose your approach in the plan.

You do not have latitude on behavior. Implement exactly:

- The state machine in section 3, including the confirmed to adjusting
  transition and the confirmed to idle discard
- Commands and availability per section 4, including the Escape rule in 4.1
- Delta announcements per section 5
- Focus behavior per section 6, including that reading context does not move focus
- A toolbar position that is fixed and does not follow the selection

If any of the above seems wrong, say so rather than changing it.

Do not implement code selection. On confirm, announce and stop.

Add tests for every acceptance criterion in section 11 that does not depend on
code selection.
```

Done when: you can hear the end of a passage, expand backward twice, check the context before, and still be exactly where you were.

### Task 8. Code panel, search and browse

```
Implement code selection per docs/patterns/code-selection.md sections 2 to 5.

- A dialog centered in the viewport with a dimmed backdrop, per D-026. Use
  React Aria Components for focus trap, focus restore, escape, and scroll lock
- The excerpt readable in full inside the dialog, with context before and after
- An Adjust boundaries control that closes the dialog, returns the excerpt to
  adjusting, and preserves pending codes. Boundary chords cannot reach through
  a focus trap, so this is the only route back
- The dialog resizes and scrolls internally; it does not hold fixed dimensions
- Region order per section 3, never reordering
- Native checkboxes in nested lists, not a tree widget
- Search results in their own region above the canonical codebook, which stays
  present and unchanged
- Checking a parent does not check its children
- Order read from stored canonicalOrderIndex

Do not implement definitions, provisional codes, notes, or save yet.

Acceptance criteria: "Search does not reorder the codebook", "Stable code order",
"Parent does not cascade", "Query survives selection".
```

### Task 9. Definitions and provisional codes

```
Add code definitions and provisional code creation per
docs/patterns/code-selection.md sections 6 and 7.

- Definitions are inline disclosures, not nested overlays
- A definition shows short definition, full definition, inclusion criteria, and
  exclusion criteria. Not examples: they are out of scope per D-019
- Closing a definition returns focus to the control that opened it, with the
  search query and every pending selection intact
- Created codes are provisional, enter pending immediately, and appear in the
  Proposed codes region, never in the canonical codebook

Acceptance criteria: "Return from definition", "Provisional codes do not enter
the canonical list".
```

### Task 10. Pending assignment, note, save, and return

```
Complete the coding workflow per docs/patterns/code-selection.md sections 8, 9,
12 and docs/patterns/excerpt-selection.md section 9.

- Pending assignment as a visible named region, announced on change
- An uncertainty control on the pending assignment, per D-021. Sets
  uncertaintyFlag on every assignment written at save. Does not affect ordering
- Save unavailable while pending is empty, with a programmatic reason
- One note per excerpt, plain text, no note type. Types are deferred to the
  notes page specification per D-020
- Save writes one CodeAssignment per pending code, recording codebookVersionId
- Return per postCodingReturn, announcing where focus landed
- Cancel discards and confirms first when pending is non-empty
- Pending codes survive a return to boundary adjustment

Acceptance criteria: all remaining criteria in code-selection.md section 14.
```

### Task 11. Failure recovery

```
Implement save failure handling.

- The simulateSaveFailure flag forces the next save to fail
- On failure: the excerpt stays confirmed, every pending code stays pending, the
  draft note is preserved, retry is available, and the assertive live region
  announces what failed and that nothing was lost

Add an end-to-end test: confirm an excerpt, add two codes and a note, force a
failure, assert all three survive, retry, assert the save succeeds.
```

Done when: the test passes. This is the single highest-value regression test in the prototype.

## Phase 3. Session readiness

### Task 12. Accessibility smoke test harness

```
Add a Playwright suite covering docs/accessibility-contract.md section 4.

- axe scan on each route, no critical or serious violations
- Full coding workflow completed by keyboard alone
- Heading and landmark structure on each route
- Every interactive element has an accessible name
- No keyboard traps
- Reflow at 400% with no horizontal scrolling
- Test data resets to a known state via a single command
```

Automated checks will catch a fraction of real problems and none of the workflow ones. The manual list in the contract is still run before every session.

### Task 13. Regression suite

Automate the transitions whose failure would invalidate a session:

- Source position restoration
- Excerpt persistence while the code panel opens and closes
- Search query persistence while a definition opens and closes
- Pending code add and remove
- Note association
- Cancel creating no records
- Save failure preserving everything
- Focus restoration at every transition

### Task 14. Participant scenarios

Write `docs/testing/participant-scenarios.md`: the tasks a participant is asked
to perform, in order, with the observable behavior that counts as completion.

Write these before session one and after the workflow is real, so the scenarios
describe what exists rather than what was hoped for.

## Before the first session

- Verify chords against JAWS, NVDA, and VoiceOver on real hardware. Reassign in
  `src/config/keybindings.ts` if any collide
- Resolve B-1 in `unresolved-questions.md`, the AFB data agreement
- Convert the real transcripts offline, spot-check the sentence splitting, and
  place output in `data-local/`
- Run the full smoke test in `accessibility-contract.md` section 4
- Deploy and name the version, 0.1 baseline coding
- Record which flag preset the session runs under

## Failure modes to watch for

**The agent builds something simulated.** Point it at `prototype-scope.md`. File import, authentication, and IRR are not gaps to fill.

**The agent answers an open question.** Point it at `unresolved-questions.md`. Ask it to record the conflict rather than resolve it.

**A component creates its own live region.** Announcements start disappearing. Grep for `aria-live` outside `src/a11y`.

**A chord gets hardcoded in a component.** Grep for `key ===` outside `src/config`.

**Focus return drifts.** The most common regression and the least visible one, since it looks fine with a mouse. It is why the acceptance criteria name a destination for every transition.

**Tasks grow.** If a diff touches more than a few files, stop and split it.
