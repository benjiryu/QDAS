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
export type CodebookPresentation = 'sidePanel' | 'fullPage' | 'centeredModal';
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

  /**
   * Placement of the code selection panel. See D-027, which supersedes D-026
   * and reinstates D-003. The centeredModal variant needs an excerpt readout
   * and a boundary-recovery control built before it can be compared.
   */
  codebookPresentation: CodebookPresentation;
  codeListEntry: CodeListEntry;
  showRecentCodes: boolean;
  /**
   * Inert in v0.1. Examples are out of scope per D-019, so this governs nothing
   * until they are built. When they are, C-2 returns as a methodological
   * question about coder independence and belongs to the qualitative lead.
   */
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
  showExamplesDuringIndependentCoding: false,
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
  centeredModalCodebook: { codebookPresentation: 'centeredModal' },
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
