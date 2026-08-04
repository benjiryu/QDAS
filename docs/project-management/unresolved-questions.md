# Unresolved Questions

Consolidated register. Each entry names an owner, the evidence that would settle it, a temporary assumption, and whether implementation may proceed.

An agent encountering one of these must not resolve it. Several are methodological decisions belonging to the research team.

## Blocking

**B-1. Does the AFB data agreement cover prototype development, LLM agent exposure, and display to research participants?**
Owner: Benji with Dr. Silverman. Evidence: terms of the current arrangement; whether UCI IRB review covers this use. Assumption: none available. Build proceeds against synthetic fixtures until answered.

**B-2. Panel placement: side panel, full page, or the anchored popup in Figma?**
Owner: team. Evidence: task-based comparison with magnification and screen reader participants. Assumption: fixed side panel. All three values implemented behind `codebookPresentation`, so build proceeds.

## Transcript and segmentation

**T-1. Is the default navigation unit sentence or speaker turn?** Owner: team, settled by session one. Assumption: sentence. Behind a flag.

**T-2. Does the prototype need word-level boundary precision?** Owner: Benji with Angie. Evidence: whether AFB practice ever requires sub-sentence excerpts. Assumption: no. Offsets reserved in the model.

**T-3. How should suggested meaning units be represented?** Owner: team. Assumption: out of scope for v0.1.

**T-4. Can the qualitative lead revise segmentation mid-project?** Owner: Angie. Assumption: no, fixed at conversion.

**T-5. Which chords survive JAWS, NVDA, and VoiceOver?** Owner: whoever runs the smoke test. Evidence: hands-on verification. Assumption: the defaults in `keybindings.ts`, held in one module for cheap reassignment.

## Excerpt selection

**E-1. Is the initial range the active sentence or the whole turn?** Owner: team. Assumption: active sentence, since expanding is cheaper than contracting after hearing the end of an idea. Behind a flag.

**E-2. Should native text selection work as a secondary route for sighted and magnification users?** Owner: Benji. Assumption: yes, snapping to sentence boundaries and producing the same application-managed excerpt. The snapping rule needs stating before build.

**E-3. How is a long cross-speaker excerpt summarized on request?** Owner: team. Assumption: full text, with size announced first so the user can decide whether to listen.

**E-4. Can a coder edit boundaries of a saved excerpt?** Owner: Angie. Assumption: yes within a round, with original boundaries preserved in history. Create path proceeds; edit path deferred.

**E-5. Which boundary-change announcement is most usable?** Owner: settled by session one. Assumption: delta. All three values behind `boundaryChangeAnnouncement`.

## Code selection

**C-1. Search-first or browse-first?** Owner: team. Assumption: search focused, codebook visible below.

**C-2. Should examples be visible during independent coding?** Owner: Angie. This is a methodological question about coder independence and should not be settled by the design team. Assumption: visible, behind a flag.

**C-3. How is hierarchy represented at high zoom?** Owner: Benji. Assumption: indentation plus a text level indicator.

**C-4. Should AI suggestions appear at all in v0.1?** Owner: team. Assumption: no. If tested later, suggestions are seeded and appear in a separate region that never reorders the canonical codebook.

## Notes

**N-1. Do notes attach to excerpts, to individual assignments, or to both?** Owner: team. Blocks the note editor specification. Assumption: excerpt only in v0.1, with fields reserved.

**N-2. Which note types are required?** Owner: Angie. Assumption: free text with no type in v0.1.

**N-3. Does an uncertainty flag affect review priority?** Owner: Angie. Assumption: flag is settable and does not yet affect ordering.

## Review, overlap, and IRR

**R-1. What is the comparison unit for overlap: character, sentence, turn, or meaning unit?** Owner: Angie. Assumption: sentence.

**R-2. Is an overlap threshold needed, and who configures it?** Owner: Angie. Assumption: no threshold in v0.1; exact boundaries preserved and differences presented rather than scored.

**R-3. Should boundary differences affect a numeric IRR figure?** Owner: Angie. Assumption: IRR is not calculated in v0.1.

**R-4. What is visible before reflexivity?** Owner: Angie. Assumption: coder identities hidden until independent coding closes.

## Administration and architecture

**A-1. Which dashboard metrics are safe to show a coder?** Owner: Angie. Assumption: none; frequencies are administrator-only.

**A-2. Which project navigation item owns transcript coding?** Owner: team. Evidence: the Figma mockup shows Home active while a transcript is displayed, which is unresolved. Assumption: Data Sources owns the transcript workspace.

**A-3. Should the codebook be visible in the sidebar during coding?** Owner: team. Assumption: no; the codebook is reached through the coding panel.

**A-4. Should audio float or dock?** Owner: team. Assumption: out of scope for v0.1.
