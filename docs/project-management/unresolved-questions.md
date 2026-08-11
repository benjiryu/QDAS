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

**F-12. The Figma does not yet reflect D-027, D-031, D-032, and D-033.** Owner: Benji. One drawing settles it: design the 320 pixel stack first, collapsed source sidebar as a disclosure, command strip, transcript, code panel as a full-width region below. Then derive the wide variant, the same sequence with the panel alongside, fixed right, roughly 360 to 400 pixels. No modal, no dimming, no Note button in the top bar. Deriving wide from narrow guarantees the logical order never differs, which is what the contract requires.

### Awaiting evidence from a session or from a design pass

**V-1. Does native backward selection carry the recognize-at-the-end workflow?** Owner: session evidence, v0.2. The storyboarding finding that motivated the v0.1 boundary system now rides on native shift-selection and the turn fallback. Reopens D-036 if participants cannot select backward to the start of an idea.

**V-2. Is turn-level capture too coarse as the screen reader mainline?** Owner: session evidence, v0.2. Where browse-mode selection never reaches the DOM, the fallback is the route, at turn granularity. If NVDA and JAWS participants live on it and fight it, that is evidence for restoring minimal boundary adjustment.

**C-5. Does a confirmed excerpt and its pending assignment survive navigating to the Codebook destination and back?**

Owner: team. Opened by D-035, which moves definition lookup out of the code panel.

The persistence rules in `code-selection.md` section 12 and `excerpt-selection.md` section 9 cover what survives inside the panel: search, browse, note editing, a failed save. Neither covers leaving the coding surface for another destination and returning, because until D-035 there was no reason to leave mid-coding. There now is: reading a definition requires it.

If the answer is no, checking a definition costs the coder their work. A coder who cannot tell `Water access` from `Water access rules`, leaves to read them, and comes back to an empty pending assignment and a discarded excerpt has been punished for checking. That is worse than the density D-035 removed, and it would land on exactly the participants least able to reconstruct where they were.

Not answered here. What settles it is a decision about whether the coding surface holds state across destinations, which is a question about the application's state model rather than about this panel.


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

**E-1. RETIRED by D-036.** There is no initial range; capture takes the selection or the focused turn.

**E-2. SUPERSEDED by D-036.** Native selection was a secondary route with sentence snapping; it is now the primary capture route with exact-character storage and no snapping.

**E-3. RETIRED by D-036.** Read-back commands removed; native selection reads natively.

**E-4. RESOLVED.** A coder may edit boundaries of a saved excerpt within the same round. Original boundaries are preserved in history rather than overwritten. The create path proceeds now; the edit path is later work.

**E-5. RETIRED by D-036.** No boundary changes exist to announce.

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

**F-7. RESOLVED, D-033.** The narrow layout is primary and the wide layout derives from it. Sidebar collapses to a disclosure, command strip, transcript, panel below; wide is the same order with the panel alongside.

**F-13. RESOLVED, D-031.** One permanently reserved command strip holds the entry controls and the boundary controls. Nothing appears or disappears; availability is the phase signal.

**F-14. RESOLVED, D-032.** No Note button in v0.1. The excerpt note is the panel's region 10. Note returns with a distinct file-wide meaning when that surface is built.

**F-1. RESOLVED, D-018.** The agent has latitude on how excerpt selection is presented. The behavior specified in `excerpt-selection.md` is not latitude. See D-018 for where the line sits and why.

**F-2. RESOLVED.** Search is added to the code panel as the first control, results in a separate region above an unchanged canonical codebook.

**F-3. SUPERSEDED by D-035.** The earlier resolution built a definition disclosure in Task 9, on the reasoning that "Return from definition" was a core focus-preservation criterion that could not be deferred. D-035 removes definition lookup from the panel entirely, so the disclosure is not built and the criterion no longer exists. Definitions stay in the domain model and in the seed fixture, stay searchable, and are read at the Codebook destination. Loading the real AFB codebook remains later work.

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
