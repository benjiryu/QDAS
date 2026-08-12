# Pages: Project Destinations

## Metadata

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08
- Decisions: D-043 (scope and sidebar), D-044 (state survives navigation), D-045 (own counts), with D-013, D-017, D-035, D-041, R-4 in force
- The Figma wireframe decides visual language; this document decides structure and behavior

## Shared rules, all three pages

**Sidebar.** Fixed order: source list, then Code book, Coded data, Notes. No Themes. The current destination carries `aria-current="page"` and a non-color indicator. The sidebar collapses to a disclosure at narrow width per D-033, and the reading order is identical in both layouts.

**Entry.** Each page has one `h1` naming it; focus lands on the `h1` on navigation, per the Task 5a precedent and contract 2.4. Each page states its count in plain text near the `h1` ("34 codes", "12 coded excerpts", "5 notes"), which doubles as the screen reader's orientation on arrival.

**Coding state persists** across every navigation in this document, per D-044. Leaving the source page mid-capture and returning restores the panel exactly as it was. No destination page ever discards coding state.

**Own work only.** Coded data and Notes show the current coder's work. Other coders' assignments and notes stay invisible during independent coding per R-4; the seeded second coder's material does not appear on these pages.

**Read surfaces.** Nothing on these pages edits anything. All editing routes through the coding panel via `excerpt.open`. Codebook editing remains out of scope per prototype-scope.

**Empty, loading, and error states** are explicit: an empty Coded data page says the coder has not coded anything in this project yet and names the route to start; it is never a blank region.

## 1. Codebook page

The destination D-035 pointed definition lookup at. Its job: let a coder read any code in full without touching coding state.

**Regions, fixed order:** heading and count, search field, search results (only while a query is active), the codebook.

- The codebook renders in canonical order from `canonicalOrderIndex`, as nested lists, hierarchy by indentation, tag pill treatment per tokens with the pill decorative and the code name as text.
- ~~Every code shows its full record inline: name, short definition, full definition, inclusion criteria, exclusion criteria, status, codebook version.~~ **Amended by D-046:** a record shows its name and one open-ended definition. The short definition, both criteria, and the status are still on the `Code` record and in the seed; they are no longer displayed. The codebook version is stated once beside the count rather than per record, since every code here shares one. The rest of this bullet stands: this page is where the detail lives, so no disclosure per row; the page is long and that is fine. Deep-linkable: each code has a stable fragment id so future surfaces can link to one code.
- Search matches name, parent path, and the definition — what the page displays, per D-046, which is narrower than "name, definitions, and criteria" and no longer the panel's semantics either, since the panel matches name and parent path only. Results in their own region above the unchanged canonical list; query persists within the session.
- Provisional codes appear in a separate labeled section after the canonical list, never interleaved.

**Acceptance criteria.**
Given a captured excerpt with two codes checked, when the coder visits the Codebook and returns, then the capture, the checked codes, and any draft note are exactly as left (D-044).
Given a query, when results render, then the canonical list below is present and unreordered.
Given the page at 400 percent zoom, when the coder reads a code record, then no horizontal panning is required.

## 2. Coded data page

The coder's own coded work, browsable by code. This is the "review personal work" completion criterion made into a page.

**Regions, fixed order:** heading and count, code filter list, results list.

- The filter list shows every code the coder has used, in canonical order, each with its own-count per D-045 ("Water access, 4"). Codes the coder has not used do not appear; an "All codes" entry at the top is the default selection.
- The count is part of the control's accessible name, not a separate visual-only badge.
- The results list shows the coder's excerpts for the selected filter, in source order then position order: excerpt text, source title, assigned codes, and a note indicator. Code pills follow D-041: pills `aria-hidden`, with a compact text equivalent in the row's accessible content.
- Each result is a link. Activating it navigates to the source page and moves focus to the speaker turn containing the excerpt's start, where `excerpt.open` is available for editing. This focus destination is the page's most important behavior: landing at the top of the transcript instead of at the excerpt makes the page useless.
- The selected filter persists within the session.

**Acceptance criteria.**
Given a result for an excerpt in the second source, when activated, then the second source's page opens with focus on the turn containing the excerpt start, and its status description reflects the coded state.
Given the coder has used three codes, when the filter list renders, then it holds All codes plus those three, in canonical order, with counts in the accessible names.
Given independent coding, when the page renders, then nothing attributable to another coder appears (R-4).

## 3. Notes page

A directory of the coder's excerpt notes, per the scope decision: excerpt notes only, file-wide notes stay deferred under D-017.

**Regions, fixed order:** heading and count, notes list.

- Notes group by source, in source order, then by excerpt position. Each entry: the note text in full, the excerpt text truncated with full text available by disclosure, the source title, and the assigned codes as compact text.
- Each entry links to the transcript with the same focus behavior as Coded data: focus lands on the turn containing the excerpt start.
- Editing a note routes through `excerpt.open` on that turn; this page does not edit.

**Acceptance criteria.**
Given a note entry, when activated, then the transcript opens with focus on the turn containing the noted excerpt.
Given no notes, when the page renders, then the empty state names how a note is created rather than showing a blank region.

## Unresolved questions

**Does the Codebook page need per-code linking from the panel?** Owner: team. A "view in codebook" affordance per panel row would make D-035's round trip one activation, at the cost of a control per row in a panel the team just simplified. Assumption: not in this version; the sidebar route suffices until session evidence says otherwise.

**Should Coded data offer a by-source view?** Owner: session evidence. Assumption: by-code only, matching the wireframe; source order within results partially covers it.
