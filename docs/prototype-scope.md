# Prototype Scope

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08-03

## Purpose of the prototype

Let blind, low-vision, magnification, and sighted researchers evaluate whether the proposed qualitative workflow makes sense and supports real analytic work.

The research question is not whether the prototype is fully accessible. It is whether the workflow is coherent. Accessibility has to be good enough that participants reach the workflow without fighting the interface, which is a floor, not the object of study.

## The rule the build may not cross

Anything on the simulated list below is out of scope until the team changes this document. An agent encountering a gap in a simulated area should leave the gap and note it, not fill it.

## Real

Implemented with genuine state and genuine consequences.

- Application and project navigation
- Transcript rendering and segment navigation
- Active segment tracking and position restoration
- Excerpt boundary selection, adjustment, confirmation, cancellation
- Code search, browse, and definition display
- Pending assignment and code application
- Provisional code creation
- Notes attached to excerpts
- Persistent front-end state within a session
- Focus entry and return behavior
- Status and error feedback
- Review filters and coder comparison, in slice 3
- Context retrieval around an excerpt
- Resolution recording, in slice 3
- Role-based visibility, simulated through a role switcher

## Simulated

Present enough to keep the workflow coherent, not built.

- Authentication. A role and user switcher stands in.
- File import. Sources are converted offline and loaded as seeded data. Per D-012, import is not a control in the coding toolbar. A simulated feature given a primary control invites participants to try it and produces findings about something that does not exist.
- Automatic segmentation. Segmentation is produced by the offline conversion step.
- Live collaboration and cloud sync. A second coder's work is seeded.
- Notifications.
- AI segmentation and AI code suggestion. If tested at all, suggestions are seeded, not generated.
- Inter-rater reliability calculation. A simplified review-oriented display only.
- Production exports.
- Production permissions and security.

## Out of scope for v0.1

- Survey response coding. The data model accommodates it; no interface is built.
- Codebook editing, approval, versioning, and change propagation.
- Audio playback and transcript-audio synchronization. Docked per D-014 when it is built.
- Administrator dashboard.
- Home and dashboard beyond a minimal route into a project.
- Overarching Themes. Present in the Hi-Fi, absent from every specification and from the domain model. See A-5.
- File-level notes. Coding notes are in scope; the separate file-wide notes surface is not. See D-011 and N-4.
- Code examples. Definitions carry short definition, full definition, inclusion criteria, and exclusion criteria only. See D-019.
- Note types. A note is free text. See D-020.

Survey, audio, themes, and file-level notes all appear in the current Figma prototype. They are deliberately excluded here so that the build stays inside the interactions the research is testing.

## Completion criteria

The prototype is ready for a participant session when a participant can, unassisted:

1. Enter the application and identify their assigned work.
2. Open an assigned transcript.
3. Navigate the transcript by sentence and by speaker turn.
4. Establish position on request.
5. Begin an excerpt at their current position.
6. Expand the excerpt backward, then adjust either boundary.
7. Review the selected excerpt and its surrounding context without losing the selection.
8. Open code selection with the excerpt intact.
9. Search or browse the codebook and read a definition.
10. Apply one or more codes.
11. Create a provisional code.
12. Add a note.
13. Save and land at a predictable transcript position.
14. Recover from a simulated save failure with no work lost.

Steps 6, 7, 8, and 14 are the ones that distinguish this prototype from a clickable mockup. If any of them is faked, the session produces no usable finding.

Slice 3 adds: open a review workspace, compare two coders' boundaries and codes, read their notes, retrieve context, and record a resolution.

## Versioning

Named versions, deployed per research round.

- 0.1 baseline coding
- 0.2 revisions from session one
- 0.3 revised codebook interaction
- 0.4 review and comparison

Each version records which decisions changed it.
