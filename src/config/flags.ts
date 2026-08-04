/**
 * Single source for prototype feature flags.
 *
 * Never branch on a flag value inline in a component without reading it from
 * here. These exist so that a configuration can be changed between participant
 * sessions without maintaining separate builds.
 *
 * Specification: docs/patterns/*.md, "Prototype configuration" sections.
 */

export type TranscriptNavigationUnit = 'sentence' | 'speakerTurn';
export type TimestampVerbosity = 'never' | 'onRequest' | 'always';
export type PositionReportDetail = 'brief' | 'full';
export type ExcerptInitialRange = 'activeSentence' | 'activeSpeakerTurn';
export type BoundaryChangeAnnouncement = 'delta' | 'fullRange' | 'sizeOnly';
export type PostCodingReturn =
  | 'excerptStartSegment'
  | 'excerptEndSegment'
  | 'nextSegment'
  | 'nextUncodedSegment';
export type CodebookPresentation = 'sidePanel' | 'fullPage' | 'anchoredPopup';
export type CodeListEntry = 'searchFirst' | 'browseFirst';
export type CodeFrequencyVisibility = 'administratorOnly' | 'reviewPhase' | 'always';
export type LayoutPreference = 'singlePanel' | 'multiPanel';

export interface PrototypeFlags {
  /** Addressing unit for navigation and excerpt boundaries. See T-1. */
  transcriptNavigationUnit: TranscriptNavigationUnit;
  timestampVerbosity: TimestampVerbosity;
  positionReportDetail: PositionReportDetail;

  /** What becomes the excerpt when selection begins. See E-1. */
  excerptInitialRange: ExcerptInitialRange;
  /** What is announced after a boundary moves. See E-5. */
  boundaryChangeAnnouncement: BoundaryChangeAnnouncement;
  /** Words before truncation when announcing an added or removed range. */
  deltaTruncationWords: number;
  /** Where focus lands after a successful save. */
  postCodingReturn: PostCodingReturn;

  /** Placement of the code selection panel. See B-2 and decision D-003. */
  codebookPresentation: CodebookPresentation;
  codeListEntry: CodeListEntry;
  showRecentCodes: boolean;
  /** Methodological, not cosmetic. See C-2. Owner: Angie. */
  showExamplesDuringIndependentCoding: boolean;
  allowProvisionalCodes: boolean;
  showCodeFrequencies: CodeFrequencyVisibility;

  layoutPreference: LayoutPreference;

  /** Forces the next save to fail, for testing recovery. Not a research variable. */
  simulateSaveFailure: boolean;
}

export const defaultFlags: PrototypeFlags = {
  transcriptNavigationUnit: 'sentence',
  timestampVerbosity: 'onRequest',
  positionReportDetail: 'brief',

  excerptInitialRange: 'activeSentence',
  boundaryChangeAnnouncement: 'delta',
  deltaTruncationWords: 25,
  postCodingReturn: 'excerptStartSegment',

  codebookPresentation: 'sidePanel',
  codeListEntry: 'searchFirst',
  showRecentCodes: true,
  showExamplesDuringIndependentCoding: true,
  allowProvisionalCodes: true,
  showCodeFrequencies: 'administratorOnly',

  layoutPreference: 'singlePanel',

  simulateSaveFailure: false,
};

/**
 * Named configurations for comparative testing. Record which one a session ran
 * under; a finding is not interpretable without it.
 */
export const flagPresets: Record<string, Partial<PrototypeFlags>> = {
  baseline: {},
  anchoredPopup: { codebookPresentation: 'anchoredPopup' },
  fullPageCodebook: { codebookPresentation: 'fullPage' },
  turnLevelNavigation: {
    transcriptNavigationUnit: 'speakerTurn',
    excerptInitialRange: 'activeSpeakerTurn',
  },
  verboseBoundaries: { boundaryChangeAnnouncement: 'fullRange' },
};

export function resolveFlags(presetName = 'baseline'): PrototypeFlags {
  const preset = flagPresets[presetName];
  if (!preset) {
    throw new Error(
      `Unknown flag preset "${presetName}". Known presets: ${Object.keys(flagPresets).join(', ')}`,
    );
  }
  return { ...defaultFlags, ...preset };
}
