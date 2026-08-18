# Pages: Project Destinations

## Metadata

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08
- Decisions: D-043 (scope and sidebar), D-044 (state survives navigation), D-045 (own counts), D-047 (codebook family cards), with D-013, D-017, D-035, D-041, D-046, R-4 in force
- Codebook visual reference: Figma frame 247:357, content region only; its chrome is superseded
- The Figma wireframe decides visual language; this document decides structure and behavior

## Shared rules, all three pages

**Sidebar.** One project navigation landmark, solid blue (`--color-blue-100`), flush to the viewport's top and left edges with no rounding or white gap per D-059, fixed full-height at wide layout with its own internal scroll; collapses to a disclosure at narrow width and high zoom per D-033, never fixed there, with identical reading order in both layouts.

Content order: a **project files group**, then Code book, Coded data, Notes. No Themes. The group's header ("Project 1 Files") is a link to the Project overview page per D-059, and remains the nested source list's `aria-labelledby` target — one element, both jobs. Sources render as a nested list within the group; the current source carries `aria-current="page"` with the design's edge-bar indicator. The current destination carries `aria-current="page"` and the white active pill, shape plus color. Hover uses the same white pill with dark blue text, replacing underlines, per D-059; hover being visually identical to current is accepted there, and per the D-059 addendum the two share one shape, the hover treatment's rounded rectangle. Above the project files group, the role switcher per D-071: a native select labeled "Role", options AFB Researcher and Qualitative Lead, its value serving as the displayed user title, divider beneath, per the Figma's title placement. Prototype-only scaffolding in product position; role changes announce discretely and never move focus. The focus ring must be visible against the blue background; the default ring color is not assumed sufficient.

**Banner.** The application banner carries a **"Keyboard shortcuts"** control, last of the banner's three children, which opens the shortcuts help on any route. Those three — the product link, the Projects link, and this control — are siblings, per D-068: no navigation landmark and no list stands between the banner and any of them. It is chrome and never scales with the reading scale. This is the visible half of D-057's discoverability floor and what closed D-065's gate: the help lists every command in the binding table with its platform-correct chord, derived at runtime, so it cannot drift from the keys that work, and reaching it never requires already knowing a chord. With the help open above the code panel, Escape closes the help alone and the panel keeps its pending codes and note.

**Entry.** Each page has one `h1` naming it; focus lands on the `h1` on navigation, per the Task 5a precedent and contract 2.4. Each page states its count in plain text near the `h1` ("34 codes", "12 coded excerpts", "5 notes"), which doubles as the screen reader's orientation on arrival.

**Coding state persists** across every navigation in this document, per D-044. Leaving the source page mid-capture and returning restores the panel exactly as it was. No destination page ever discards coding state.

**Own work only.** Coded data and Notes show the current coder's work. Other coders' assignments and notes stay invisible during independent coding per R-4; the seeded second coder's material does not appear on these pages.

**Read surfaces, restated per D-058.** These pages edit nothing themselves; all editing routes through a panel — the coding panel via `excerpt.open`, or the isolated note panel via `note.open`, a note entry, or the Notes page's New note button, or the code editor panel via the Codebook page's Create new code button and per-provisional Accept, per D-070. The editor panel is the one panel with explicit-save close semantics, a recorded D-042 exception.

**Empty, loading, and error states** are explicit: an empty Coded data page says the coder has not coded anything in this project yet and names the route to start; it is never a blank region.

## 0. Project overview page

Slice 1's first real surface, per D-059: where the project files link lands, and where a researcher orients before opening a source.

**Regions, fixed order:** heading and summary, source list.

- The `h1` is the project name; focus lands on it on navigation per the shared entry rule. The summary line beneath is plain text from data the domain model already holds: phase, source count, codebook version ("Independent coding. 2 sources. Codebook v3."). Richer summary content is an open extension point owned by the team.
- Sources render as a linked list in source order, each entry the source title, landing focus on that source's transcript per the shared entry behavior.
- Read surface: nothing here edits anything.

**Acceptance criteria.**
Given the "Project 1 Files" sidebar link, when activated, then this page opens with focus on the `h1`, and a screen reader still hears the sidebar's nested source list named by that same element.
Given a source entry, when activated, then that source opens with its entry focus behavior.
Given a project with no sources, when the page renders, then an explicit empty state names how a source arrives rather than showing a blank region.

## 1. Codebook page

The destination D-035 pointed definition lookup at. Its job: let a coder read any code in full without touching coding state. Per D-048 the same content also renders as the panel's companion view; this page and the companion are one component, so they cannot drift.

**Regions, fixed order:** heading and count, search field, search results (only while a query is active), the codebook.

- The codebook renders as one card per top-level family, in canonical order from `canonicalOrderIndex`, per D-047 and frame 247:357. Within a card, the parent's name and definition, children indented beneath, grandchildren beneath them.
- Code names are headings, nested by level: family cards begin at `h2`, children `h3`, grandchildren `h4`, each followed by its definition paragraph. This is the structure that makes a long page navigable: a screen reader user jumps by heading; a sighted user scans indentation. Record content per D-046: name and one open-ended definition. The codebook version is stated once beside the count.
- Each card carries its family color as a read-only labeled value, "Color: [name]" with the swatch — not a control, per D-047. Card borders use the family shade-1 token; the four low-contrast hues noted in tokens.css apply here too, mitigated by the color name being text.
- Deep-linkable: each code has a stable fragment id.
- Search is retained per the standing structure rule even though the frame omits it: matches name, parent path, and definition; results in their own region above the unchanged canonical cards; query persists within the session.
- Provisional codes appear in a separate labeled section after the canonical list, never interleaved. Per D-070 each provisional entry offers Accept to the qualitative lead during setup, review, or recoding, opening the code editor prefilled; the Create new code button at the top of the page is gated identically. Outside the gate neither control renders.

**Acceptance criteria.**
Given a captured excerpt with two codes checked, when the coder visits the Codebook and returns, then the capture, the checked codes, and any draft note are exactly as left (D-044).
Given a query, when results render, then the canonical list below is present and unreordered.
Given the page at 400 percent zoom, when the coder reads a code record, then no horizontal panning is required, and the color value sits in the reading order rather than requiring a pan to the card's far edge.
Given a screen reader listing headings, when the codebook renders, then every code name appears at the heading level matching its depth.
Given the color value, when a screen reader reaches it, then it reads as a labeled static value and not as a collapsed control.

## 2. Coded data page

Two views behind one destination, resolved by role and phase per D-049. The page names its view in the count line, "Your coded work" or "Project-wide view", so the viewer always knows which truth they are reading.

**View resolution.** Coder role during `independentCoding` or earlier: own work. Qualitative lead role: project-wide, any phase. Any role after independent coding closes: project-wide, since R-4 lifts by its own terms.

**Regions, fixed order, both views:** heading, view label and count, code filter list, results list. At narrow width and 400 percent zoom the filter list stacks above the results per D-033; no horizontal panning.

**The filter list.** Ordered per D-062: families alphabetical by top-level code name, then depth-first within a family with siblings alphabetical — a deliberate, page-scoped divergence from canonical order, since this is a lookup surface. Own view: only codes the coder has used, own-counts. Project-wide view: every code with an active assignment in the project, team-wide counts. Counts count active assignments only, exclude superseded, and sit adjacent to the code name, fused into the control's accessible name ("Water access, 20"). Per D-064 the pills are gone: a code name is plain text wearing its family's colour as an underline, and "All codes" wears none. There is no visual level channel — neither indentation nor fill treatment — so level reaches a screen reader only, through the D-054 lineage description; the name and count stay pure in the accessible name. Family grouping is carried by position, since the ordering keeps a family contiguous. A child with unused ancestors renders normally, its description naming them. Session-evidence flag: if participants cannot follow the hierarchy, indentation returns. A search field heads the list, matching by name or ancestor name as the code assignment panel does, narrowing which filters are offered and never the results below; its count announces in the continuous class per D-050. "All codes" heads the list as default. Selected state is border plus bolded count, per the style guide component, never color alone.

**The results list.** Excerpts for the selected filter, source order then position. Every row: excerpt text, source title, codes as D-041 compact text with pills aria-hidden, and per D-067 a note disclosure where a readable note exists: a button, constant name "Note", `aria-expanded`, sibling of the row's link, revealing the note text inline directly after it in reading order. Project-wide rows additionally name the coder, and per D-066 a row whose excerpt meets the same-excerpt threshold with another coder's carries one plain-text line, "Also coded by [name]" — text in reading order, never icon-only, no conflict framing. Each row is a link landing focus on the speaker turn containing the excerpt start, where excerpt.open is available; landing at the top of the transcript instead makes the page useless.

**Persistence.** Selected filter persists within the session, per view.

**Acceptance criteria.**
Given a coder during independent coding, when the page renders, then it is the own-work view, labeled, and nothing attributable to another coder appears (R-4, D-010).
Given the qualitative lead role, when the page renders, then it is the project-wide view, labeled, with team-wide counts and coder attribution per row.
Given the phase set past independent coding, when a coder opens the page, then the project-wide view renders.
Given a result for an excerpt in the second source, when activated, then that source opens with focus on the turn containing the excerpt start.
Given a superseded assignment, when counts render, then it is not counted.
Given 320 pixel width, when the page renders, then the filter list precedes the results in one column.

## 3. Notes page

The coder's notes across all three scopes, per D-058: excerpt notes, file-wide notes on a source (`relatedSourceId`, reserved by D-011), and project-wide notes. The Figma frame's visual language holds — the note card with its edge bar, excerpt context above, pills below — but its left column of codes is wrong and is not followed.

**Regions, fixed order:** heading and count, the New note button, source filter list, notes list. At narrow width and 400 percent zoom the filter stacks above the list per D-033.

**The filter list.** The Coded Data pattern, reused: "All notes" heads the list as default, then Project notes, then each source in source order. Counts are own-note counts, fused into the accessible name ("Transcript 1, 4 notes"). Selected state is border plus bolded count, never color alone. Selection persists within the session.

**The notes list.** Under All notes: a Project notes section first, then one section per source, `h2` headings, matching the filter order. Entries newest last within a section, by excerpt position where there is one.

- **Excerpt note entry:** per D-069, the excerpt context first — speaker, then the excerpt in full, a `blockquote` on the gray background block, no truncation or disclosure — then the note text in the edge-bar card, its text preceded by a visually-hidden "Note:" prefix; then the assigned codes as pills, aria-hidden, with the compact "Codes:" text programmatic-only, per the D-058 addendum. One channel per fact: the source appears visually only as the section heading, programmatically only in the entry link's accessible name ("Note on [speaker], [source]"); no visible per-entry source line. Note-only excerpts show no codes in either channel, per D-055. Activating the entry's link lands focus on the turn containing the excerpt start, where `note.open` and `excerpt.open` apply.
- **File-wide note entry:** the note text; the source is the section heading visually and the entry's accessible name programmatically. No excerpt context, no codes.
- **Project note entry:** the note text alone.
- Non-excerpt entries have no turn to land on: activating one opens the isolated note panel loaded with that note. This is the edit route and stays consistent with the read-surface rule — the page itself edits nothing, the panel does.

**New note.** The button opens the D-055 note panel with a scope field defaulting to the active filter (a source filter attaches there; All notes or Project notes attaches to the project). Focus lands in the text field; the scope field precedes it in reading order. Close semantics are D-042's: every way out commits, empty discards.

**Own work only,** all scopes, during independent coding, per R-4.

**Acceptance criteria.**
Given an excerpt note entry, when activated, then the transcript opens with focus on the turn containing the noted excerpt.
Given a project note entry, when activated, then the note panel opens loaded with that note, and closing it returns focus to the entry.
Given the New note button with the filter on a source, when the panel opens, then the scope field shows that source, and saving attaches the note there.
Given a note-only excerpt's entry, when it renders, then no codes appear in either channel.
Given an excerpt note entry, when a screen reader reads its link outside any heading context, then the accessible name carries speaker and source; and when the codes are reached, then they are one compact stop, not one stop per pill.
Given no notes anywhere, when the page renders, then the empty state names both routes: noting an excerpt in the transcript, and the New note button.
Given 320 pixel width, when the page renders, then the filter list precedes the notes list in one column.

## Unresolved questions

**Does the Codebook page need per-code linking from the panel?** Owner: team. A "view in codebook" affordance per panel row would make D-035's round trip one activation, at the cost of a control per row in a panel the team just simplified. Assumption: not in this version; the sidebar route suffices until session evidence says otherwise.

**Should Coded data offer a by-source view?** Owner: session evidence. Assumption: by-code only, matching the wireframe; source order within results partially covers it.

**Does the lead's project-wide view show coder attribution during independent coding, or only after?** Owner: Angie. The lead monitoring coverage arguably needs names; D-049 assumes yes for the lead role. If the team prefers the lead to see counts without attribution mid-round, the row simply omits the coder name until phase close.
