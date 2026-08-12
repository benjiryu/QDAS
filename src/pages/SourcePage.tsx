import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { defaultFlags, resolveFlags } from '../config/flags';
import { createSeedFixture } from '../data/seed';
import { CURRENT_CODER_ID } from '../data/seed/project';
import { resolveSource } from '../domain';
import { TranscriptWorkspace } from '../features/transcript/TranscriptWorkspace';

/**
 * Route /projects/:projectId/sources/:sourceId.
 *
 * Display only: the transcript and the coded state of its sentences. Segment
 * navigation, position reporting, and excerpt selection arrive in later tasks.
 *
 * The fixture is built once per mount. Reading it here rather than through a
 * store is deliberate for now; where session state lives is a question the
 * excerpt and coding tasks will settle, and inventing an answer here would fix
 * it before anything needs it.
 */
export function SourcePage() {
  const { sourceId } = useParams();
  const [searchParams] = useSearchParams();

  /**
   * The flag preset this session runs under, named in the URL.
   *
   * The pre-session checklist requires recording which preset a session ran
   * under, and `?preset=` is how a facilitator selects one. An unknown name
   * falls back to the defaults rather than blanking the page mid-session.
   */
  const flags = useMemo(() => {
    const preset = searchParams.get('preset');
    if (!preset) return defaultFlags;
    try {
      return resolveFlags(preset);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      return defaultFlags;
    }
  }, [searchParams]);

  const view = useMemo(() => {
    const fixture = createSeedFixture();
    const source = fixture.sources.find((candidate) => candidate.sourceId === sourceId);
    if (!source) return null;

    const resolved = resolveSource({
      source,
      segments: fixture.segments,
      turns: fixture.turns,
      speakers: fixture.speakers,
    });

    /*
      Every stored excerpt counts as coded, including the seeded second coder's.
      Whether a participant should see another coder's work during independent
      coding is an open research question, so the filter stays at the call site
      where it can be changed, rather than inside the derivation. The workspace
      merges these with whatever the coder saves during the session.
    */
    return {
      resolved,
      seedExcerpts: fixture.excerpts,
      seedNotes: fixture.notes,
      seedAssignments: fixture.codeAssignments,
      codingRoundId: fixture.codingRound.codingRoundId,
      codebookVersionId: fixture.codebookVersion.codebookVersionId,
      codes: fixture.codes,
      projectId: fixture.project.projectId,
    };
  }, [sourceId]);

  if (!view) {
    return (
      <>
        <h1 tabIndex={-1}>Source not found</h1>
        <p>No source in the seeded project has the identifier {sourceId}.</p>
      </>
    );
  }

  return (
    <>
      <h1 tabIndex={-1}>{view.resolved.source.title}</h1>
      <TranscriptWorkspace
        key={view.resolved.source.sourceId}
        resolved={view.resolved}
        seedExcerpts={view.seedExcerpts}
        seedNotes={view.seedNotes}
        seedAssignments={view.seedAssignments}
        codingRoundId={view.codingRoundId}
        codebookVersionId={view.codebookVersionId}
        codes={view.codes}
        projectId={view.projectId}
        userId={CURRENT_CODER_ID}
        flags={flags}
      />
    </>
  );
}
