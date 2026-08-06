import type { TranscriptNavigation } from './useTranscriptNavigation';

/**
 * Where the reader is in the source.
 *
 * Specification: docs/patterns/transcript-segment.md section 5.
 *
 * Per D-009 this reports reading position and not coding completion, so no
 * label here says "Progress", and the value is derived from the active segment
 * rather than from scroll offset or audio time. It is built from the same
 * fields the spoken report uses, so the two cannot disagree.
 *
 * Not a live region. The application has exactly two, both owned by the
 * announcement service (contract 2.3), and this is read on request rather than
 * announced on every movement, which section 5 rules out as unusable verbosity.
 */
export function PositionRibbon({ navigation }: { navigation: TranscriptNavigation }) {
  const { fields, isActiveInView, run } = navigation;

  return (
    <div className="position-ribbon">
      <p className="position-ribbon__reading">
        <span className="position-ribbon__title">Reading position</span>{' '}
        {fields ? (
          fields.map((field) => (
            <span key={field.name} className="position-ribbon__field">
              <span className="position-ribbon__label">{field.label}</span>{' '}
              <span className="position-ribbon__value">{field.value}</span>
            </span>
          ))
        ) : (
          <span className="position-ribbon__field">Not set</span>
        )}
      </p>

      {/*
        Offered only once the active segment has scrolled out of view, per
        section 5. It is also the cheap way back for a magnification user who
        panned away to read context.
      */}
      {fields && !isActiveInView ? (
        <button
          type="button"
          className="position-ribbon__return"
          onClick={() => run('position.return')}
        >
          Return to active segment
        </button>
      ) : null}
    </div>
  );
}
