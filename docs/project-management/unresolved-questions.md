# Unresolved Questions

Each entry names an owner, the evidence that would settle it, a temporary assumption, and whether implementation may proceed.

An agent encountering an open question must not resolve it. Several are methodological decisions belonging to the research team.

Resolved entries are retained with their resolution so that a settled question is not reopened by someone who was not in the room. Decisions with implementation consequences are written up in `decision-log.md`.

## Still open

### Blocking

**B-1. Does the AFB data agreement cover using real deidentified material in a participant session?**

Owner: Benji with Dr. Silverman. Evidence: terms of the current arrangement, and whether UCI IRB review covers this use.

*Narrowed by the synthetic fixture, not closed by it.* The original question had three parts. Building against a synthetic fixture settles two of them: development use and LLM agent exposure both stop being questions, because no real material is present while the prototype is built and the agent never reads a real transcript. Development is unblocked and stays unblocked.

The third part survives untouched. Loading real deidentified transcripts for a session means showing one person's interview to a different person, and that is the part that needs the agreement checked. No fixture removes it, because the fixture is precisely what is being replaced at that moment.

*Two components with different risk profiles.* Worth separating rather than treating as one permission:

- **Transcripts.** Interview text carries re-identification risk that survives name removal, higher in a small community. This is the sensitive half.
- **The codebook.** Code names, definitions, and criteria are analytic apparatus rather than participant speech, and likely carry far less risk. Confirming the codebook separately may be quick, and it is the half that drives the search and browse findings the code panel is being tested for.

*A fallback that de-risks the schedule.* Session one can run entirely on the synthetic fixture if the fixture meets the shape requirements in `seed-data.md` section 4. What that costs is ecological validity: a qualitative researcher given invented text may code it as an exercise rather than bringing real analytic judgment, and that is a genuine threat to workflow findings. A middle path is the synthetic transcript with the real codebook, which recovers most of the codebook realism at much lower risk.

The decision to make deliberately: whether session one waits on B-1 or runs on the fixture. Waiting produces better data. Running does not stall the research.

**B-2. Panel placement: side panel, full page, or anchored popup?**

Owner: team, with evidence from session one. Assumption: fixed side panel, per D-003. All three values exist behind `codebookPresentation`, so implementation is not blocked.

*Why this one is worth the attention.* Code selection is the highest-frequency interaction in the workflow after navigation itself. A coder may open this panel eighty times in a session, so any cost built into it is paid eighty times. It is also the clearest case in the project where the three access modes pull in different directions, which makes it the first real test of the commitment to one shared workflow with adapted presentation rather than separate products.

*The three options and what each actually costs.*

**Fixed side panel.** The transcript stays readable while codes are chosen, so re-reading the excerpt in context costs nothing. A fixed location is learnable, which is the property Carmel's interview identified as load-bearing. The costs: the transcript column narrows, and at high zoom two side-by-side regions cannot both be visible, so the layout has to collapse to sequential anyway. If it is built as literally side-by-side without that collapse, it fails the no-horizontal-panning rule.

**Full page.** Structurally the simplest, and probably the strongest at 400 percent zoom, because there are no competing regions at all. The cost is that the transcript is gone while coding, so "read the excerpt again" has to work from stored excerpt state rather than from the live source, and retrieving surrounding context becomes a second trip. It also imposes a full view transition on a high-frequency action, which is where the eighty-times figure starts to matter.

**Anchored popup**, as currently in Figma. Proximity to the passage is a real advantage for sighted users, and eye travel is minimal. The cost falls almost entirely on magnification: the panel lands somewhere different for every excerpt, and at high zoom the user may not see the anchor and the panel together, so each invocation begins with re-locating the panel. Focus return is also harder to keep predictable when the panel's position moves.

*What would settle it.* Not a preference ranking. Asking which one people like produces the one that looks best in a screenshot, and this is a question about repeated cost rather than first impression. The comparison has to be task-based:

- The same coding task under two configurations, order counterbalanced across participants.
- Measures: whether the task completes, how many actions it takes to apply two codes and check one definition, whether the participant can state their transcript position afterward, whether they land back where they expect, and self-reported effort.
- Run at the participant's own zoom level and with their own assistive technology. This question is close to meaningless tested at 100 percent zoom with no screen reader.
- Two configurations per participant, not three. Three is too long, and fatigue will dominate the third.

*A cheaper decision available now.* The anchored popup already conflicts with a recorded research finding, and the team could reasonably drop it to a two-way comparison before build. That would remove one presentation from the implementation and testing burden. The argument for keeping it is that it is what the Figma shows and the sighted benefit is genuine. Worth deciding deliberately rather than by default, because carrying three presentations means building and maintaining three.

*What it blocks downstream.* Focus entry and return destinations, whether the transcript remains readable during code selection, whether excerpt re-reading needs a stored copy, and the review workspace later, which will likely reuse whatever pattern wins. F-7 is entangled with this: what reflows depends on whether there are two regions to begin with.

### Awaiting evidence from a session or from a design pass

**F-7. What is the reflow behavior?** Owner: Benji. The Hi-Fi has a fixed 384 pixel sidebar with no collapsed state, and Coded data places three regions side by side. Neither survives 400 percent zoom under the single-panel rule. Evidence needed: a design decision about what collapses, what becomes sequential, and in what order. Assumption: sidebar collapses, code panel becomes a full-width region in the same reading position, logical order unchanged. Implementation can proceed on the assumption; the design needs to catch up.

**F-9. Figma frame hygiene.** Owner: Benji. The frame named `Project` contains the login form, the frame named `Log in` holds only the wordmark, and three hidden `Home` frames carry conflicting taxonomies from different generations. Not behavioral. Resolution: clean before the MSE handoff.

## Resolved

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

**F-8. RESOLVED.** Timestamps are visible to sighted and magnification users and are not announced automatically. `timestampVerbosity` governs speech only.
