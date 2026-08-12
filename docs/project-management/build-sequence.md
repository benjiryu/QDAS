# Build Sequence

- Status: Working document
- Version: 0.3
- Last updated: 2026-08-05

Progress: v0.1 complete and tagged. Phase 4 defines v0.2. Tasks 18 through 29 have landed, including 27r, 28r and 28a, and Tasks 31, 32 and 33 have landed out of order; Task 30, the Notes page, is next and is the last in the sequence. Open findings, none blocking: reading through a coded passage is now a manual check per screen reader, smoke test item 13, and no automated test replaces it (Task 33); D-052 does not name the note-only range, which is marked on the reasoning recorded under the decision (Task 33); a captured range's mark cannot be reached, because the modal panel `aria-hidden`s the transcript for the whole time a capture exists, recorded as V-3 (Task 33); the D-033 narrow-width sidebar disclosure is still unbuilt, and more visible now that the sidebar is solid blue (Tasks 27 and 27r); the sidebar holds its place with `sticky` rather than `fixed`, which keeps it in the flex row (Task 27r); search behaves differently in the panel and on the Codebook page, deliberately and per section 1 (Task 28); the fixture's colour tokens no longer describe their hues, so a name map in `familyHues.ts` carries what the swatch is called, guarded by a drift test (Task 28r); the panel's codebook region no longer has a heading, since D-048 made it the Open Codebook button (Task 28a); D-049 does not say which view a reviewer gets during independent coding, resolved conservatively to own work (Task 29); the Codebook search now announces its result count, which is new behaviour destinations.md section 1 does not specify (Task 31); panel-open focus could not be reproduced as a defect in Chromium, so the manual VoiceOver finding needs a re-check by whoever found it (Task 31); Task 32 names two things absent from the build — recent codes, removed from the panel earlier, and the Notes list, still unbuilt — and D-051's double-stop could not be demonstrated in Chromium, where every labelled control exposes its label text whether the label wraps or not, so that half needs the VoiceOver re-check (Task 32); and the unnamed dialog on the context menu popover is still open (Task 26). D-048 closed the Task 27 finding about the D-044 journey: the companion removes its necessity.

Update this line when a task lands. An agent reading a stale progress line will rebuild finished work.

Ordered tasks for building slice 2 with a repository-level coding agent. Each task is small enough to review, has a stated definition of done, and leaves the repository working.

The instruction that matters most: never ask for the prototype. Ask for one behavior with acceptance criteria. An agent given a large open task will invent core product behavior, and inventions are expensive to find later because they look like decisions.

## Phase 0. Environment

Complete. Retained because anyone repeating the setup needs it, and because 0.1 is the step whose omission cost a full restore.

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
| Package name | lowercase, no spaces. This repository used `qdas-package` | npm package names cannot contain uppercase letters, so it cannot derive one from `QDAS` |
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

Outstanding: `eslint-plugin-jsx-a11y`, Prettier, and `@vitest/ui` are listed here but are not in `package.json`, and `eslint.config.js` does not extend the jsx-a11y config. Phase 0 is otherwise complete. Finish these before Task 5, since the lint rules are worth having in place before the first markup-heavy task.

`eslint-plugin-jsx-a11y` fails to install against ESLint 10 with an `ERESOLVE` peer conflict. The plugin declares support only through ESLint 9 and has not shipped a v10 peer range, though it works with v10 in practice. Resolve it with an override in `package.json` rather than `--legacy-peer-deps`, which is a flag every future install has to remember:

```json
"overrides": {
  "eslint-plugin-jsx-a11y": {
    "eslint": "$eslint"
  }
}
```

If it resists, drop it and record that here. The plugin catches static JSX mistakes; every failure mode this prototype turns on, focus return, announcement queuing, reflow, and boundary state, is invisible to static linting.

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

Complete, commit `8f46a78`.

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

Complete, commit `6af29f8`. The manual check remains outstanding: fire five rapid announcements in VoiceOver with the caption panel on and confirm all five speak.

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

Complete.

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
- 2+ sources in the project. Assignment and navigation are degenerate with one
- Types from src/domain/types.ts. Stable opaque identifiers.

Content is invented and about a neutral topic. This fixture is committed and
must contain no real research material.
```

Done when: the fixture typechecks against the domain types and meets every count above.

Generate this rather than hand-writing it. Realistic length is the point; a short fixture makes every later finding wrong.

### Task 4. Domain layer for segments and excerpts

Complete. If the excerpt-to-segment state derivation below is missing, add it before Task 5.

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
- Derive per-segment display state from stored excerpts: which segments are
  coded, and which fall inside two or more excerpts and are therefore
  coded-multiple. Task 5 renders these and nothing else produces them

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

Add a Playwright test asserting the accessibility tree shape: one focusable
node per turn containing its sentences, and no per-sentence focusable elements.
```

Done when: at 400% zoom nothing scrolls horizontally, and VoiceOver reads a full turn without per-sentence interruption.

The automated test asserts structure, not speech. No tool can observe what a screen reader says, so the continuous-reading criterion in transcript-segment.md section 10 stays manual.

### Task 5a. Minimal route into a source

Lettered rather than numbered because it was inserted after the sequence was written, and renumbering would break references in commits and the decision log.

Steps 1 and 2 of the completion criteria in `prototype-scope.md` are "enter the application and identify their assigned work" and "open an assigned transcript". No task built either. The transcript is currently reachable only by typing a source identifier into the address bar, which blocks manual review of every remaining task as well as any participant session.

`prototype-scope.md` puts "Home and dashboard beyond a minimal route into a project" out of scope, so the minimal route is in scope and this is the whole of it.

```
Fill the placeholder content on the projects and project routes so a source can
be reached by keyboard from the application root.

/projects
- List the projects in the fixture, each a link to its project route

/projects/:projectId
- Project name as the h1, already present
- List the sources assigned to the current user, each a link to its source
  route, showing title, kind, and segment count
- State the coding round and the user's role in plain text

This is a functional route, not the designed Home page. No dashboard, no
cards, no progress summaries, no counts of other coders' work. Home is
specified after the downstream workflows are concrete, so that its contents
lead to real tasks rather than hypothetical ones.

Per D-010 no code frequency appears here. Per R-4 no other coder's identity or
assignments appear during independent coding.

Focus on entry goes to the h1 of each route, per the accessibility contract
section 2.4. Add a unit test asserting a source is reachable from /projects by
following links alone.
```

Done when: you can tab from the application root to a transcript without touching the address bar.

### Task 6. Segment navigation and position

```
Implement navigation per docs/patterns/transcript-segment.md sections 2, 4, 5, 6.

- activeSegmentId tracked per source
- Commands wired from src/config/keybindings.ts. Never hardcode a chord
- Every command has a visible control
- Scroll never sets the active segment
- Position ribbon derived from the active segment, not from scroll and not from
  audio time. Per D-009 it reports reading position, so it is not labelled
  "Progress", which reads as completion
- Return to active segment control appears when it scrolls out of view
- activeSegmentId persists per user per source and is restored on source entry,
  per transcript-segment.md sections 2.1, 6 and 8. Task 13 tests this and
  nothing else builds it
- Announcements through the shared service, per the table in section 6

Acceptance criteria: "Scroll does not move the active segment" and
"Position agreement" in transcript-segment.md section 10.
```

Done when: both criteria pass by hand, and the position ribbon and the spoken report never disagree.

### Task 7. Excerpt selection

```
Implement excerpt selection per docs/patterns/excerpt-selection.md.

Per D-031 the boundary controls live in a single permanently reserved command
strip under the top navigation, together with the two entry controls from
D-029. The strip never appears or disappears; controls are disabled with an
exposed reason when unavailable. Each control shows its chord via
describeChord. Within those constraints, D-018 latitude applies: grouping,
labels, how the pending range is indicated, boundary markers. Propose your
approach in the plan.

You do not have latitude on behavior. Implement exactly:

- The state machine in section 3, including the confirmed to adjusting
  transition and the confirmed to idle discard
- Commands and availability per section 4, including the Escape rule in 4.1
- Delta announcements per section 5
- Focus behavior per section 6, including that reading context does not move focus
- The strip does not move with the selection and does not appear or disappear
  with excerpt state

If any of the above seems wrong, say so rather than changing it.

Do not implement code selection. Three rows in those specifications are defined
in terms of a panel that does not exist yet, so defer them to Task 8 and use
this interim behavior instead:

- On confirm, announce the confirmed range and move focus to the excerpt
  toolbar. The specified destination is the panel search field
- Escape maps to excerpt.discard while no panel exists. Once Task 8 lands,
  Escape belongs to the panel, per excerpt-selection.md section 4.1
- The confirmed to adjusting transition applies without the panel-closing half

Add tests for every acceptance criterion in section 11 that does not depend on
code selection.
```

Done when: you can hear the end of a passage, expand backward twice, check the context before, and still be exactly where you were.

### Task 7b. Native selection adoption

Implements D-034 and excerpt-selection.md section 4.0. Lettered for the same
reason as 5a and 10a.

```
Implement native selection adoption per docs/patterns/excerpt-selection.md
section 4.0 and decision D-034.

- Observe the document selection via selectionchange and window.getSelection().
  Map the selection's start and end nodes to segment ids through the segment
  DOM structure; anchorNode/focusNode order is not document order, so normalize
- Start excerpt with an observable non-collapsed selection inside the
  transcript: adopt it, snapped outward to whole sentences, and enter anchored
  with the adopted range as origin. Announce adopted size and that boundaries
  were extended, when they were
- Code this excerpt in idle with an observable selection: adopt, snap, confirm,
  open the panel, one action. Update its enabled state and disabled reason
- Clear the native selection on adoption via selection.removeAllRanges()
- Selections reaching outside the transcript clamp to transcript sentences.
  Collapsed selections are ignored. Selection in the code panel or strip is not
  a transcript selection
- Read adoptNativeSelection from flags; when false, controls behave per D-029
  with no selection observation at all
- Do not preventDefault any selection event and do not touch user-select.
  Native selection keeps working natively until the moment of adoption

Tests: partial-sentence drag adopts whole sentences and never shrinks; a drag
across a turn boundary adopts across it; adoption clears the native selection;
Code this excerpt from a drag lands confirmed with the panel open and focus in
the search field; with the flag off, no selection listener is attached; with no
selection, both controls behave exactly as before this task.
```

Done when: drag across two and a half sentences, click Code this excerpt, and land in the panel with a three-sentence excerpt announced, while the command route is byte-for-byte unchanged.

### Task 8. Code panel, search and browse

```
Implement code selection per docs/patterns/code-selection.md sections 2 to 5.

- A non-modal panel in a fixed position, per D-027. Not a dialog, no focus
  trap, no dimmed backdrop. The transcript stays reachable while it is open
- Layout per D-033: full-width region below the transcript at narrow width,
  alongside it fixed right at roughly 360 to 400 pixels when space permits,
  same logical order in both
- No Note button in the top bar, per D-032. The excerpt note is region 10
- The panel is a labeled region so it is findable in browse mode
- Escape cancels wherever focus sits; codes.focusSearch returns focus to it
- The panel resizes and scrolls internally; it does not hold fixed dimensions
- Region order per section 3, never reordering
- Native checkboxes in nested lists, not a tree widget
- Search results in their own region above the canonical codebook, which stays
  present and unchanged
- Checking a parent does not check its children
- Order read from stored canonicalOrderIndex

Also implement the panel-open focus destination in code-selection.md section 9:
the panel opens with focus in the search field, which is the destination
excerpt-selection.md section 6 names for confirm. Wire confirm to open it.

Include region 5, recently used codes, collapsed by default per showRecentCodes.

Do not implement definitions, provisional codes, notes, save, or the
uncertainty control yet. Their regions occupy their positions in the section 3
order so later tasks add content without moving anything. Regions 4 and 7 are
conditional and must stay absent rather than empty: search results appear only
with an active query, proposed codes only when the project permits them. An
always-present empty region is one more thing to browse past.

Acceptance criteria: "Search does not reorder the codebook", "Stable code order",
"Parent does not cascade", "Query survives selection".
```

### Task 9. Provisional codes

Narrowed by D-035, which removes definition lookup from the code panel. The
definition disclosure this task originally carried is not built, and the
"Return from definition" criterion no longer exists.

```
Add provisional code creation per docs/patterns/code-selection.md section 7.

- Created codes are provisional, enter pending immediately, and appear in the
  Proposed codes region, never in the canonical codebook
- Name and short definition are required; full definition is optional
- Status is provisional until approved
- Announce on creation that the code was created as provisional and added to
  pending

The panel carries no definition control and no definition display, per D-035.
Definitions stay in the domain model, stay searchable per section 5, and are
read at the Codebook destination.

Acceptance criteria: "Provisional codes do not enter the canonical list".
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

### Task 10a. Reopening a coded excerpt

Lettered for the same reason as Task 5a: inserted after numbering, and renumbering would break references.

```
Implement D-030, reopening a saved excerpt to change its codes.

- excerpt.open opens the saved excerpt containing the active segment. Available
  in idle whenever the active segment falls inside at least one saved excerpt
- Clicking a coded highlight does the same thing
- Where the active segment falls inside two or more saved excerpts, present them
  as a list identified by range and code count and let the coder choose. Do not
  guess. The fixture contains overlapping pairs, so this path is reachable
- The excerpt enters confirmed with its range locked. Boundary commands stay
  unavailable: reopening changes codes, not boundaries, per E-4
- The panel opens with the saved assignments already in the pending assignment
- The opening announcement states that existing codes are loaded and how many,
  so a screen reader user does not mistake them for codes they just applied
- Removing a saved code sets CodeAssignment.status to superseded. Do not delete
  the row
- Save remains unavailable with an empty pending assignment. Emptying and saving
  is not a delete route; deletion is a separate action and is not in v0.1
- Cancel leaves the saved assignments untouched

Tests: reopen an excerpt and confirm its codes load; add a code and confirm both
persist; remove a code and confirm the row is superseded rather than gone;
confirm the overlap case offers a choice; confirm boundary commands are
unavailable while reopened.
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

### Task 12. Data reset

```
Add a single command that returns seeded data to a known state.

Nothing else in the sequence creates this, and item 12 of the pre-session smoke
test depends on it. A participant must never meet the previous participant's
codes.
```

### Task 13. Accessibility smoke test harness

```
Add a Playwright suite covering the automatable part of
docs/accessibility-contract.md section 4.

- axe scan on each route, no critical or serious violations
- Full coding workflow completed by keyboard alone
- Heading and landmark structure on each route
- Every interactive element has an accessible name
- No keyboard traps
- Reflow at 400% with no horizontal scrolling
```

Six of the contract's twelve items are automatable here. Focus entry and return, announcement behaviour, non-colour state, single-panel completion, chord verification, and data reset stay manual or belong to other tasks. Automated checks catch a fraction of real problems and none of the workflow ones.

### Task 14. Regression suite

Automate the transitions whose failure would invalidate a session:

- Source position restoration
- Excerpt persistence while the code panel opens and closes
- Search query persistence while a definition opens and closes
- Pending code add and remove
- Note association
- Cancel creating no records
- Save failure preserving everything
- Focus restoration at every transition

### Task 15. Transcript converter and local data loader

```
Two pieces, both currently unbuilt and both required before real material can be
used in a session.

The converter, in scripts/, per docs/testing/seed-data.md section 3:
- Parse speaker turns from a source document
- Split each turn into sentences
- Assign stable opaque identifiers to every turn and sentence
- Preserve speaker identity and timestamps
- Emit JSON matching src/domain/types.ts
- Re-running on unchanged input produces identical identifiers. Without that,
  every excerpt recorded in a prior session breaks

The loader:
- Reads converted sources from data-local/ at runtime when present
- Falls back to the synthetic fixture when the directory is absent, so the
  repository is runnable by anyone without data access

Write and test both against synthetic input only.
```

Running the converter over real transcripts, and the manual spot-check of its sentence splitting, are done by a person outside any agent session. D-025 and `CLAUDE.md` both hold that an agent does not read real transcript content, because content in an agent's context is content sent to a model provider. That constraint is unaffected by the data agreement.

### Task 16. Participant scenarios

Write `docs/testing/participant-scenarios.md`: the tasks a participant is asked
to perform, in order, with the observable behaviour that counts as completion.

Write these before session one and after the workflow is real, so the scenarios
describe what exists rather than what was hoped for.

Per D-002, include a task that requires expanding an excerpt backward across a
speaker turn boundary. That is where sentence-level and turn-level addressing
diverge most, and it is the evidence that decision waits on. Record which
`flagPresets` configuration each session ran under; a navigation finding is not
interpretable without it.

### Task 17. Deployment

Nothing else in the sequence stands the prototype up anywhere, and participants
reach it by URL in their own browser with their own assistive technology. That
is not a convenience: a screen-shared or remote-controlled demo would test the
team's setup rather than the participant's, and screen sharing is the thing this
project identified as inaccessible in the first place.

```
Configure deployment to Netlify or Cloudflare Pages from the repository.

- SPA fallback so a deep link or a mid-task reload does not 404. Routes are real
  paths such as /projects/p-1/sources/s-1. On Netlify this is a _redirects file
  containing: /* /index.html 200
- Confirm the build serves at the root, so no Vite base path is needed
- Confirm each deploy gets its own immutable URL
```

GitHub Pages is not the choice here. Pages from a private repository requires a
paid plan, and the alternative is making the repository public, which exposes
the specifications and the decision log. Netlify and Cloudflare Pages both
deploy from a private repository on their free tiers.

The immutable per-deploy URL matters more than it sounds. `prototype-scope.md`
calls for a named version per research round, and a session has to run against a
frozen build while development continues on main. One URL that always reflects
the latest push would let the instrument change mid-round.

Access control depends on B-3. Until that is answered, deploy the synthetic
fixture only. A private repository protects the source, not the deployed site.

Remote session delivery, once deployment exists:

- Participants receive a URL and open it in their own browser with their own
  assistive technology. No install, no account, no setup. Their configuration
  is the object of interest; a lab machine cannot stand in for it
- Send the frozen per-deploy URL, never the main URL, so every participant in a
  round sees an identical build regardless of what lands on main between
  sessions. Record the deploy URL and the flag preset per session; findings are
  not comparable without both
- The automatic deploys ship only the synthetic fixture, structurally: real
  data lives in gitignored `data-local/` and never reaches the repository the
  deploys build from. When a session requires real transcripts, run
  `netlify deploy --prod` from a working tree containing `data-local/`. The
  data rides that one deploy without entering version control. Whether that
  deploy needs access control is B-3, and access control costs one emailed
  code of participant friction; raise the tradeoff with AFB in those terms
- Screen share alone conveys silence for a blind participant. Ask for computer
  audio alongside the screen, and suggest NVDA users enable Speech Viewer,
  which prints speech as on-screen text so observers can quote announcements
  verbatim

## Before the first session

- Verify chords against the participant's own screen reader and browser, not
  only VoiceOver. Per D-024 the development smoke test runs in VoiceOver, which
  does not surface browse-mode key interception; NVDA is free and runs on any
  Windows machine or virtual machine. Reassign in `src/config/keybindings.ts` if
  anything collides
- Resolve B-3, whether the agreement covers deploying real transcripts to a
  public URL. B-1 is settled: real deidentified material is approved for
  sessions per D-025
- Run the Task 15 converter over the real transcripts and spot-check the
  sentence splitting by hand. Both steps are performed by a person, not in an
  agent session, per D-025. Place the output in `data-local/`
- Run the full twelve-item smoke test in `accessibility-contract.md` section 4
- Deploy and name the version, 0.1 baseline coding
- Record which flag preset the session runs under

## Phase 4. Version 0.2, post-feedback rework

v0.1 is tagged and its deploy permalink recorded; findings trace to it. Phase 4
implements D-036 and D-037. Same discipline: plan mode, one task one commit,
behavioral review, update the progress line.

### Task 18. Excerpt capture rework

```
Implement the v0.2 excerpt capture model per docs/patterns/excerpt-selection.md
(rewritten) and decision D-036. Read both fully; the pattern changed shape, not
details.

Remove: boundary expand/contract commands and their strip controls, revert,
anchored and adjusting states, excerpt read-back and context commands, sentence
snapping, the Start excerpt control, and the D-034 adoption listener as a
separate mechanism.

Add: excerpt.code and excerpt.note commands with the three-step capture rule in
section 1.1, exact-character storage using startOffset/endOffset, the focused-
turn fallback, and the two distinguishable capture announcements in 1.2. The
strip keeps navigation, position, Code selection, and Add note controls with
visible chords.

Keybindings: remove dead commands, add excerpt.note. Flags: mark
excerptInitialRange, boundaryChangeAnnouncement, deltaTruncationWords, and
adoptNativeSelection deprecated with a comment pointing at D-036; do not
delete them.

The capture announcement distinction is the most important behavior in this
task: selection capture and turn fallback must be unmistakably different.

Update tests to the section 7 criteria. Remove tests for deleted behavior
rather than keeping them skipped.
```

Done when: a mid-sentence drag captures exactly, the fallback announces itself
as a fallback, and the panel flow from capture to save is unchanged.

### Task 19. Context menu

```
Implement the custom context menu per docs/patterns/excerpt-selection.md
section 2 and decision D-037.

- Opens on contextmenu over the transcript only while a non-collapsed selection
  intersects it; native menu everywhere else and with no selection
- Also opens on Shift+F10 and the applications key when a selection exists
- Two items: Code selection, Add note, invoking the same capture as the
  commands. Menu role, arrow navigation, Escape closes and returns focus
- Use React Aria Menu rather than hand-rolling

Tests: menu appears only with selection over transcript; keyboard opening
works; Escape returns focus; native menu untouched elsewhere.
```

Done when: right-click on a selection offers Code selection, right-click on
plain text shows the browser menu, and Shift+F10 does what right-click does.

### Task 20. Retire the navigation layer

```
Implement D-038. Read it and the v0.2 banner in transcript-segment.md first.

Remove: segment.next, segment.previous, turn.next, turn.previous,
segment.repeat, position.return, their chords and strip controls, the
click-to-set-active-segment behavior, and the active segment visual indicator.
Clicking a turn focuses it; only the focus ring shows.

Rework: segment.speaker, segment.timestamp, and position.report answer from
the focused speaker turn. Position reports turn N of M and percentage. The
ribbon derives from the focused turn. excerpt.open availability keys on the
focused turn intersecting a saved excerpt. SourcePosition records the focused
turn.

Deprecate transcriptNavigationUnit and the turnLevelNavigation preset with a
comment pointing at D-038; do not delete. Remove tests for deleted behavior;
update orientation and reopen tests to the focused-turn source.

The strip afterward holds exactly: Code selection, Add note, speaker,
timestamp, where am I.
```

Done when: Tab walks the turns, the three orientation controls answer for the
turn you are on, clicking leaves no lingering highlight, and a captured
excerpt's highlight is the only app-drawn selection visual anywhere.

### Task 21. Simplify the code panel to the Select Code card

```
Implement D-039. Read it fully; it lists what is removed, what is changed, and
what is deliberately retained.

Remove: the verbose heading (visible heading becomes "Select Code", still the
region's accessible name), the excerpt summary and read-excerpt control, the
visual level labels (nested list structure and indentation stay), and the
pending assignment region (checkboxes are the pending state; count
announcements stay; Save & Close disabled at zero checked with reason).

Add, per D-040: the captured excerpt as visually hidden static text after the
heading, "Selected excerpt: [full text]" — not aria-describedby, not a live
region, not truncated. And a "Mark uncertain" checkbox in the footer beside
Save & Close, announced on toggle, writing uncertaintyFlag on every assignment
at save.

Change: Create code becomes a collapsed disclosure row; expanding focuses the
name field, collapse and Escape return focus to the row. The save button label
is "Save & Close".

Retain: the search field per D-005, the note field, recent codes behind its
flag, canonical order, and the D-030 reopen behavior with pre-checked boxes.

Update tests: remove pending-region tests, add disclosure focus tests, add
the hidden excerpt text presence test, keep uncertainty writing at save, the
zero-checked save rule, and reopen tests.
```

Done when: the panel reads like the Figma card, checking boxes is the only
pending state, and a screen reader hears the same check and count announcements
as before.

## Phase 5. Visual design

Applies the extracted tokens surface by surface. Two rules govern every task
in this phase, and both belong in every prompt:

1. The Figma decides visual language; the specifications decide structure and
   behavior. No task in this phase reintroduces anything the decision log
   removed.
2. CSS-only diffs. Component CSS references tokens from src/styles/tokens.css,
   never raw values. If a visual requirement seems to need a DOM change, stop
   and say so rather than making it.

Per-surface verification, after every task, ten minutes: text and control
contrast against the new palette; the focus indicator visible on every new
background it can land on; a greyscale screenshot to confirm nothing became
color-only; 400 percent zoom to confirm the new spacing did not break reflow.
For magnification participants this styling is the interface, not polish.

### Task 22. Token foundation

```
Wire the design tokens into the application.

- Import src/styles/tokens.css globally, before all other styles
- Download Luciole from luciole-vision.com into public/fonts, add @font-face
  declarations for regular and bold with font-display: swap, and apply
  --font-family and the weight tokens to the base body styles
- Replace every raw color, radius, border-width, spacing, and shadow value in
  existing CSS with the corresponding token. Where no token fits, stop and
  list the orphans rather than inventing tokens
- Add a unit test that fails if any file under src/ other than tokens.css
  contains a hex color literal. This is the enforcement for the tokens-only
  rule; it makes drift a test failure instead of a review catch
```

Done when: the app renders in Luciole, the hex-literal test passes, and
nothing has visibly moved, only recolored.

### Task 23. Transcript surface

```
Style the transcript per the wireframe and tokens: turn rows, speaker and
timestamp treatment, the captured-excerpt highlight, coded and coded-multiple
segment treatments, and the focus ring on turn containers.

The highlight and coded treatments must keep their non-color channel. The
focus ring uses a token and must be visible against every row background,
including inside highlights.

Per D-041, add the code rail: assigned code pills on the right of coded turns
and a note icon when a note exists, both aria-hidden. The turn container gains
a compact accessible description derived from the same stored excerpts:
"N excerpts, M codes" plus "note" when present. Announced on focus, silent in
continuous reading, no code names. Test both: the rail absent from the
accessibility tree, and the description present and correct on a turn with
overlapping excerpts.
```

### Task 24. Command strip and context menu

```
Style the five-control strip and the selection context menu: button levels
per the token mappings (primary, secondary, tertiary), disabled treatment
with the exposed reason unchanged, chord labels, hover shadow, and menu
item treatment. Respect prefers-reduced-motion for any transition.
```

**Only the context menu half of this task applies.** The strip is prototype
scaffolding, not a product surface: it exists so a sighted observer can see
which keyboard chords are available and what the screen reader can do during a
session, and it will not ship. It was styled and then reverted; leave it in its
plain treatment. What has to hold is that every control still carries its chord
label, which `orientation.test.tsx` covers.

The context menu is product, per D-037, and stays styled.

### Task 25. Select Code panel

```
Style the panel to the Select Code card: tag pills with shade-2 fill,
shade-1 border, black text; hierarchy indentation; checkbox treatment;
Create code disclosure; Save & Close as primary button; Mark uncertain
checkbox. Tag hue is assigned per top-level code family from the thirteen
token families. The four annotated low-contrast borders (orange, yellow,
light green, sea green) are used last in the assignment order.
```

### Task 26. Shell, project pages, and remaining chrome

```
Style the banner, navigation, source lists, and any remaining unstyled
surface. Then run the full per-surface verification on every surface in one
pass, since interactions between surfaces (focus ring against new banner
color, highlight against new row background) only show when everything is
styled.
```

**"Any remaining unstyled surface" excludes the command strip.** It is
scaffolding rather than product, per the note on Task 24, and is unstyled on
purpose. Verify it like any other surface; do not restyle it.

## Phase 6. Project destinations

Implements docs/pages/destinations.md and decisions D-043 to D-045. Phase 5
rules stay in force: tokens only, and the wireframe decides visual language
while the specifications decide structure and behavior.

### Task 27. Sidebar destinations and state persistence

```
Implement the sidebar and routes per docs/pages/destinations.md shared rules
and decision D-044.

- Sidebar order: source list, Code book, Coded data, Notes. No Themes.
  aria-current="page" plus a non-color indicator on the current destination
- Routes and page shells with one h1 each; focus moves to the h1 on
  navigation; count line near the h1
- Coding state survives navigation: capture, checked codes, and draft note
  are held while the user visits any destination and restored on return. The
  panel is hidden, not unmounted or reset
- Update the stale placeholder comment in the project navigation region

Test: capture an excerpt, check two codes, draft a note, visit all three
destinations, return, and assert all three survive. This is the D-044
regression test and the most important thing in this task.
```

### Task 28. Codebook page

```
Implement the Codebook page per docs/pages/destinations.md section 1 and
decision D-047. Visual language from Figma frame 247:357, content region only;
its toolbar, progress label, and player are superseded chrome.

Family cards in canonical order, code names as nested headings (h2/h3/h4 by
depth) with definition paragraphs, read-only "Color: [name]" value with swatch
rendered as static text and never as a control, card borders from family
shade-1 tokens, stable fragment ids, search retained with results above the
unchanged cards, provisional codes in their own section. Read-only throughout.
Acceptance criteria as written, including the D-044 round trip and the
heading-level and static-color criteria.
```

### Task 28r. Codebook page revision to D-047

Task 28 landed before D-047 rewrote its specification, so the built component
implements the superseded structure. This revision brings it to the current
docs/pages/destinations.md section 1 before the companion reuses it.

```
Revise the Codebook page component to docs/pages/destinations.md section 1 as
amended by D-047. The visual reference is Figma frame 247:357, content region
only.

- One card per top-level family, canonical order, family shade-1 border token
- Code names as nested headings, h2 for family, h3 children, h4 grandchildren,
  each followed by its definition paragraph per D-046
- The family color as a read-only labeled value, "Color: [name]" with swatch,
  static text, never a control
- Search, fragment ids, provisional section, and the D-044 behavior unchanged
- Update tests to the amended acceptance criteria, including heading levels
  and the static color value
```

Done when: a screen reader's heading list reads as the codebook's hierarchy,
and nothing on the page is operable except search and links.

### Task 28a. Companion codebook

```
Implement D-048 and code-selection.md section 2.2, the companion codebook.

- The panel's codebook region heading becomes the Open Codebook button
- Activating it renders the Codebook page component per D-047 beside the panel
  at wide widths, panel shifted left; below the panel in reading order at
  narrow width and 400 percent zoom. Reuse the Task 28 component; do not fork it
- Companion is read-only and inside the panel's focus scope. Focus to companion
  search on open, back to the button on close. Escape closes companion first,
  panel second, preserving D-042 close semantics
- Companion state persists while the panel is open; a reopened panel starts
  with it closed

Tests: focus round trip button to search to button; layered Escape; the
codebook content beside the panel matches the destination page for the same
fixture; at 320 width the companion sits below the panel with no horizontal
scrolling; checking codes is impossible from the companion.
```

Done when: mid-capture, a coder can read any definition and return to the
checkbox they were on without losing anything, and Escape behaves in layers.

### Task 27r. Sidebar structure and visual pass

```
Revise the sidebar per the amended Sidebar rule in
docs/pages/destinations.md shared rules. Visual language from the Figma
sidebar; structure from the spec.

- Solid --color-blue-100 background, fixed full-height at wide layout with
  internal scroll; the D-033 narrow disclosure behavior is unchanged and the
  sidebar is never fixed at narrow width or high zoom
- "Project 1 Files" as a group label at the same visual weight as the
  destination links, non-focusable, with the nested source list
  aria-labelledby it. It is not a link and not a button
- Sources as a nested list inside the group; current source and current
  destination each carry aria-current="page" with their non-color indicators
  (edge bar, white pill)
- Verify the focus ring is visible against the blue; use a token-based ring
  if the default fails
- White-on-blue text pairs pass contrast per the token audit; do not introduce
  new pairs without checking

Tests: the group label is absent from the tab order and exposed as the source
list's accessible name; both aria-current values present; at 320 width the
disclosure behavior still passes the existing Task 27 tests.
```

Done when: tabbing through the sidebar never stops on "Project 1 Files", and
a screen reader announces the source list by that name.

### Task 29. Coded data page

```
Implement the Coded data page per docs/pages/destinations.md section 2 and
decision D-049. Two views behind one destination, resolved by role and phase:
own work for coders during independent coding, project-wide for the
qualitative lead always and for everyone after the phase closes.

The page labels its view in the count line. Counts are active assignments
only, adjacent to the code name and fused into its accessible name. Selected
state is border plus bolded count. Project-wide rows name source and coder.
Result links land focus on the turn containing the excerpt start. Filter list
stacks above results at narrow width.

If the role switcher or a phase control does not yet exist in the prototype,
build the minimal simulated version scoped in prototype-scope.md rather than
inventing authentication.

Acceptance criteria as written in section 2, all six.
```

Done when: switching the simulated role or phase flips the view and its label,
and a coder mid-independent-coding can find no trace of the seeded second
coder anywhere on the page.

### Task 30. Notes page

```
Implement the Notes page per docs/pages/destinations.md section 3.

Excerpt notes only, grouped by source, full note text with the excerpt behind
a disclosure, links landing focus on the noted turn. Read-only; editing routes
through excerpt.open. Explicit empty state.
```

### Task 31. Announcement classes and panel focus fix

Two findings from manual VoiceOver testing, per D-050.

```
1. Amend the announcement service per D-050 and accessibility-contract.md
   section 2.3: announce(message, politeness, kind) where kind is discrete or
   continuous. Discrete keeps the existing queue-never-drop semantics
   untouched. Continuous debounces until input pauses (roughly 600ms) and
   coalesces, newest replacing any pending continuous announcement. Move the
   search result-count announcements in the panel and the Codebook page to
   continuous. Repeat-on-request returns the last spoken of either kind.

2. Fix panel-open focus: focus the search input element itself, after paint,
   not during render. The criterion is that typing works immediately under
   VoiceOver without interacting into a group first. Check the input is not
   wrapped in a container that VoiceOver requires interaction to enter.

Tests: with fake timers, five rapid continuous announcements speak once with
the final value while five rapid discrete announcements all speak in order;
existing announcer tests unchanged and green. For focus, assert activeElement
is the input element itself after open, and note in the test that the real
criterion is the manual VoiceOver typing check.
```

Done when: typing "motivation" into panel search under VoiceOver yields one
count announcement after the pause, and typing works the moment the panel
opens with no VO interaction step.

### Task 32. Label association and list naming

```
Implement D-051 across the application.

1. In the code panel and everywhere a checkbox pairs with a code pill, make
   the pill the checkbox's label element, natively associated. One screen
   reader stop announcing name, state, and role; clicking the pill toggles.
   Remove any duplicate text stop the old structure produced.

2. Name every workflow list: the panel's code list (labeled by the Open
   Codebook button per the Task 28a finding), search results with their
   count, recent codes, the sidebar source and destination lists (source list
   already labeled, verify), the codebook page's family card lists, and the
   Coded data and Notes filter, results, and notes lists. aria-labelledby
   where a visible heading or control exists, aria-label otherwise.

Tests: each checkbox's accessible name is its code name; toggling via a click
on the label text works; every named list exposes its name in the
accessibility tree, asserted with Testing Library role queries with the name
option.
```

Done when: in VoiceOver's rotor list menu, every list reads as what it is, and
arrowing through the code list yields one stop per code.

### Task 33. Mark semantics for coded ranges

```
Implement D-052: coded and captured ranges in the transcript render as mark
elements instead of styled spans. Styling, data attributes, click-to-reopen,
and the D-041 turn description are unchanged; only the element changes.
Overlapping ranges stay one mark with the coded-multiple treatment.

Tests: coded runs expose the mark role in the accessibility tree; the turn
still reads as continuous prose with no per-sentence focus stops; existing
transcript and capture tests green.
```

Done when: NVDA or JAWS reading through a coded passage reports it as
highlighted at the user's verbosity setting, and VoiceOver behavior is
recorded in the smoke test notes whatever it turns out to be.

### Task 34. Companion hop command

```
Implement D-053 and the amended code-selection.md section 2.2.

- Add codes.codebook to the Command type and both binding tables, Ctrl+Alt+B
  and Ctrl+Shift+B, and confirm the collision guard passes
- Behavior: companion closed, open and focus its search; focus in panel with
  companion open, jump to companion search; focus in companion, jump to panel
  search. Escape layering unchanged
- The companion is a labeled region named Codebook; the panel search is
  named Search codes and the companion search Search codebook
- The Open Codebook button shows the chord via describeChord

Tests: the three-way hop behavior; chord collision guard green; both searches
distinguishable by accessible name; region name exposed.
```

Done when: from a checkbox in the panel, one chord lands you in the codebook
search, the same chord brings you back to the panel search, and Escape still
closes in layers.

## Failure modes to watch for

**The agent builds something simulated.** Point it at `prototype-scope.md`. File import, authentication, and IRR are not gaps to fill.

**The agent answers an open question.** Point it at `unresolved-questions.md`. Ask it to record the conflict rather than resolve it.

**A component creates its own live region.** Announcements start disappearing. Grep for `aria-live` outside `src/a11y`.

**A chord gets hardcoded in a component.** Grep for `key ===` outside `src/config`.

**Focus return drifts.** The most common regression and the least visible one, since it looks fine with a mouse. It is why the acceptance criteria name a destination for every transition.

**Tasks grow.** If a diff touches more than a few files, stop and split it.
