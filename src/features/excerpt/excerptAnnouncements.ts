/**
 * What excerpt capture says.
 *
 * Specification: docs/patterns/excerpt-selection.md section 1.2, decision D-036.
 *
 * The two capture announcements are the most important strings in this feature.
 * A screen reader user whose browse-mode selection never reached the DOM has no
 * other way to learn that the turn fallback fired; if the two read alike, they
 * find out later, from a wrongly bounded excerpt.
 *
 * So they are built to be unmistakable rather than parallel. They share no
 * opening words, the fallback leads with the absence rather than burying it, and
 * the fallback names the turn it took instead. Section 1.2 fixes the information
 * content and leaves the phrasing open to session evidence, as elsewhere.
 *
 * Every string goes through the shared announcement service. Nothing in this
 * feature writes to a live region.
 */

import { describeExcerptSize } from '../../domain';
import type { ExcerptSize } from '../../domain';
import type { CaptureSource } from './capture';

/**
 * Where focus landed is left to the panel, which announces itself as it opens
 * per code-selection section 10. Saying it twice would push the part that
 * matters — which capture rule fired — further from the start of the utterance.
 */
export function captured(
  source: CaptureSource,
  size: ExcerptSize,
  speakerLabel: string | null,
): string {
  const description = describeExcerptSize(size);

  if (source === 'selection') {
    const from = speakerLabel ? ` from ${speakerLabel}` : '';
    // The description opens a sentence here and sits mid-sentence in the panel
    // heading, so the capital belongs at this call site rather than in the
    // phrase itself.
    return `Coding your selection. ${sentenceCase(description)}${from}.`;
  }

  // Leads with what did not happen. A user who believes they made a selection
  // has to hear that the application did not see one before anything else.
  const speaker = speakerLabel ?? 'Unknown speaker';
  return `No selection detected. Coding the current turn. ${speaker}, ${description}.`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function discarded(reopened: boolean): string {
  // A reopened excerpt is already saved, so "nothing was recorded" would be a
  // lie about the wrong object: what was discarded is this round of changes.
  return reopened
    ? 'Changes discarded. The saved excerpt is unchanged.'
    : 'Excerpt discarded. Nothing was recorded.';
}

/**
 * Why a command did nothing. Contract 2.6 requires an unavailable control to
 * explain itself rather than being a dead end, and section 1.1 step 3 requires
 * the capture commands to say so rather than failing silently.
 */
export const EXCERPT_UNAVAILABLE: Record<string, string> = {
  nothingToCapture:
    'Nothing to capture. Select some transcript text, or move focus to a speaker turn.',
  noSavedExcerptHere: 'This sentence is not inside a saved excerpt.',
  alreadyCapturing: 'A range is already captured. Save or cancel code selection first.',
};
