# Unresolved Questions

Each entry names an owner, the evidence that would settle it, a temporary assumption, and whether implementation may proceed.

An agent encountering an open question must not resolve it. Several are methodological decisions belonging to the research team.

Resolved entries are retained with their resolution so that a settled question is not reopened by someone who was not in the room. Decisions with implementation consequences are written up in `decision-log.md`.

## Still open

### Blocking

**B-3. Does the AFB agreement cover deploying real transcripts to a public URL?**

Owner: Benji with Dr. Silverman. Opened by D-025, which secured session use, and by the deployment question.

A private repository protects the source. It does not protect a deployed site: anyone with the URL can open it. A prototype built with real transcripts and deployed for a remote session puts deidentified interview material on the open internet with no authentication, which is a materially wider exposure than showing a transcript to a participant during a session. The two are easy to conflate and worth separating explicitly.

Options, in order of how much they ask of AFB:

- Deploy the synthetic fixture and use real data only where the session is run on a machine the team controls. Costs the ecological validity that D-025 just bought back.
- Deploy real data behind access control. Cloudflare Access is free for up to fifty users and gates a site by email address, which fits a participant study.
- Confirm the agreement covers public deployment. Least work if the answer is yes, and the answer should be obtained rather than assumed.

Assumption until answered: real data is not deployed to an unauthenticated public URL. Implementation is unaffected either way, since the loader reads from `data-local/` regardless of what is in it.

### Awaiting a design pass

**F-13. The excerpt toolbar and the coding toolbar are two objects and the specifications treat them as one.** Owner: Benji. `excerpt-selection.md` specifies an excerpt toolbar holding the boundary controls, fixed position, not following the selection. The Hi-Fi has a separate top bar reading `Code | Note`, which D-012 and D-015 lean on without specifying. D-029 settles what the two controls do; where they live, and whether they are one bar or two, is a design question.

**F-14. The top bar carries a Note button and the code panel carries a note region.** Owner: Benji. Either these are two different things or one is redundant, and nothing says which. `code-selection.md` region 10 is a note on the excerpt; a top-bar Note during coding has no specified target. Related to N-4, the deferred file-wide notes surface.

**F-12. The Figma shows a centered modal; the specification says non-modal fixed panel.** Owner: Benji. Opened by D-027. The design needs updating back: fixed panel, no dimmed backdrop, transcript live alongside. Not a behavioral question, but an unrecorded contradiction between design and specification is exactly what gets quietly reversed at a design review.

### Awaiting evidence from a session or from a design pass

**F-7. What is the reflow behavior?** Owner: Benji. The Hi-Fi has a fixed 384 pixel sidebar with no collapsed state, and Coded data places three regions side by side. Neither survives 400 percent zoom under the single-panel rule. Evidence needed: a design decision about what collapses, what becomes sequential, and in what order. Assumption: sidebar collapses, code panel becomes a full-width region in the same reading position, logical order unchanged. Implementation can proceed on the assumption; the design needs to catch up.

**F-9. Figma frame hygiene.** Owner: Benji. The frame named `Project` contains the login form, the frame named `Log in` holds only the wordmark, and three hidden `Home` frames carry conflicting taxonomies from different generations. Not behavioral. Resolution: clean before the MSE handoff.

## Resolved

### Data and hosting

**B-1. RESOLVED, D-025.** A data agreement is secured with AFB. Real deidentified transcripts and the real codebook may be used in participant sessions. D-007 still stands: real data stays out of version control, committed fixtures stay synthetic, and development runs against the fixture. Public deployment is carved out as B-3.

**B-2. RESOLVED, D-027.** Code selection is a non-modal panel in a fixed position. D-026 briefly made it a centered modal; D-027 reversed that and reinstated D-003. The reversal is recorded rather than erased, because the reason for it is evidence about the pattern: modality was never required for predictable placement, and it cost the live transcript and the boundary-recovery route.

### Transcript and segmentation

**T-1. RESOLVED.** Default navigation unit is the sentence.

**T-5. RESOLVED for development, D-024.** The routine smoke test runs in VoiceOver on Safari. Chord verification against a participant's own screen reader stays a per-session gate, because VoiceOver does not surface browse-mode key interception and NVDA and JAWS do. NVDA is free.

**T-2. RESOLVED, D-016.** The application does not implement word-level navigation. Continuous prose in the DOM already lets a screen reader read and move by word, and recreating that is the kind of duplication the interaction principles rule out. Excerpt boundaries remain whole-sentence. See D-016 for why word-level reading and word-level boundaries are different capabilities.

**T-3. RESOLVED.** Suggested meaning units are out of scope for v0.1.

**T-4. RESOLVED.** Segmentation is fixed at conversion. The qualitative lead cannot revise it mid-project.

### Excerpt selection

**E-1. RESOLVED.** Initial range is the active sentence. May be revisited after session one; the flag stays.

**E-2. RESOLVED.** Native text selection works as a secondary route for sighted and magnification users, snapping to sentence boundaries and producing the same application-managed excerpt. The screen reader workflow never depends on it.

**E-3. RESOLVED.** A long cross-speaker excerpt reads in full on request, with size announced first so the user can decide whether to listen. May be revisited.

**E-4. RESOLVED.** A coder may edit boundaries of a saved excerpt within the same round. Original boundaries are preserved in history rather than overwritten. The create path proceeds now; the edit path is later work.

**E-5. RESOLVED.** Boundary changes announce the delta. All three values stay behind `boundaryChangeAnnouncement` for comparison.

### Code selection

**C-1. RESOLVED.** Search field focused on open, full codebook visible below. May be revisited.

**C-2. RESOLVED, D-022.** Examples are not visible during independent coding. Methodological, not scope: an example is a prior coder's interpretation, and reading it makes an independent judgment less independent. Examples remain out of v0.1 for scope reasons; the flag stays `false` for a reason that does not expire.

**C-3. RESOLVED.** Hierarchy at high zoom is indentation plus a text level indicator.

**C-4. RESOLVED.** No AI suggestions in v0.1.

### Notes and themes

**N-1. RESOLVED, D-011.** Coding notes attach to excerpts. File-wide notes attach to the source.

**N-3. RESOLVED, D-023.** Uncertainty raises an item's review priority. The flag is written in v0.1 per D-021; the ordering behavior lands in slice 3.

**N-2. RESOLVED, D-020.** A note in v0.1 is free text with no type. Note types and their visibility rules are specified in the notes page specification, written later.

**N-4. RESOLVED, D-017.** The file-wide notes surface is out of scope for v0.1. A later version may carry a single page for file-wide notes and emergent themes together.

**A-5. RESOLVED, D-017.** The Themes page is not built. Theme capture may join the file-wide notes page in a later version.

### Review, overlap, and IRR

**R-1. RESOLVED.** Comparison unit for overlap is the sentence.

**R-2. RESOLVED.** No overlap threshold in v0.1. Exact boundaries are preserved and differences are presented rather than scored.

**R-3. RESOLVED.** IRR is not calculated in v0.1.

**R-4. RESOLVED.** Coder identities are hidden until independent coding closes.

### Administration and architecture

**A-1. RESOLVED, D-010.** Code frequency is administrator-only.

**A-2. RESOLVED, D-015.** Coding is a toolbar action on the open source.

**A-3. RESOLVED, D-013.** The codebook is a navigation destination; the sidebar lists sources only.

**A-4. RESOLVED, D-014.** Audio is docked. Out of scope for v0.1 regardless.

### Figma and specification conflicts

**F-1. RESOLVED, D-018.** The agent has latitude on how excerpt selection is presented. The behavior specified in `excerpt-selection.md` is not latitude. See D-018 for where the line sits and why.

**F-2. RESOLVED.** Search is added to the code panel as the first control, results in a separate region above an unchanged canonical codebook.

**F-3. RESOLVED, partially deferred.** The definition disclosure mechanism is built in Task 9, because "Return from definition" is one of the core focus-preservation criteria and cannot be deferred without removing a tested behavior. The real AFB codebook content is not needed for that; synthetic definitions in the seed fixture are sufficient. Loading the actual codebook is later work.

**F-4. RESOLVED.** The checkbox sits adjacent to its code label.

**F-5. RESOLVED.** Code group identity carries a text or shape channel in addition to color.

**F-6. RESOLVED.** An active segment indicator is specified, visually distinct from the focus ring and from excerpt highlighting.

**F-10 and F-11. RESOLVED, D-027.** The code dialog lacked excerpt text and a boundary-recovery control. Both were consequences of modality, and returning to a non-modal panel removes the cause rather than satisfying the requirement: the excerpt is readable in the live transcript, and boundary commands reach the application directly.

**F-8. RESOLVED.** Timestamps are visible to sighted and magnification users and are not announced automatically. `timestampVerbosity` governs speech only.

## Appendix: retained analysis

### B-2, code panel placement

Resolved by D-026 as a dialog centered in the viewport. The analysis is kept because the comparison it describes remains runnable behind `codebookPresentation`, and because the reasoning about repeated cost applies to any future change here.

*Why this one was worth the attention.* Code selection is the highest-frequency interaction in the workflow after navigation itself. A coder may open it eighty times in a session, so any cost built into it is paid eighty times. It is also the clearest case in the project where the three access modes pull in different directions, which makes it the first real test of the commitment to one shared workflow with adapted presentation rather than separate products.

*The options and what each costs.*

**Centered modal**, the chosen option. Lands in the same viewport position on every invocation, which is the predictability property the anchored popup failed. Single unambiguous focus context. The cost is that it traps focus, so re-reading the excerpt and retrieving context have to be rebuilt inside the dialog, and the route back to boundary adjustment needs an explicit control. Those consequences are specified in D-026.

**Fixed side panel.** The transcript stays readable while codes are chosen, so re-reading the excerpt in context costs nothing. A fixed location is learnable. The costs: the transcript column narrows, and at high zoom two side-by-side regions cannot both be visible, so the layout has to collapse to sequential anyway.

**Full page.** Structurally the simplest, and probably the strongest at 400 percent zoom, because there are no competing regions. The cost is that the transcript is gone while coding, and a full view transition is imposed on a high-frequency action.

**Anchored popup**, as in the earlier Figma. Proximity to the passage helps sighted users and eye travel is minimal. The cost falls on magnification: the panel lands somewhere different for every excerpt, so each invocation begins with re-locating it. Rejected.

*What would settle a future comparison.* Not a preference ranking. Asking which one people like produces the one that looks best in a screenshot, and this is a question about repeated cost rather than first impression.

- The same coding task under two configurations, order counterbalanced across participants.
- Measures: whether the task completes, how many actions it takes to apply two codes and check one definition, whether the participant can state their transcript position afterward, whether they land back where they expect, and self-reported effort.
- Run at the participant's own zoom level and with their own assistive technology. This question is close to meaningless tested at 100 percent zoom with no screen reader.
- Two configurations per participant, not three. Fatigue will dominate the third.
