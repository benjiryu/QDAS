import type { TranscriptOrientation } from './useTranscriptOrientation';

/**
 * Where the reader is in the source.
 *
 * Specification: docs/patterns/transcript-segment.md section 5.
 *
 * Per D-009 this reports reading position and not coding completion, so no
 * label here says "Progress", and since D-038 the value is derived from the
 * focused speaker turn rather than from scroll offset or audio time. It is
 * built from the same fields the spoken report uses, so the two cannot
 * disagree.
 *
 * The return-to-position control went with `position.return`. There is nothing
 * to return to that the reader did not put focus on themselves, and a browser
 * returns focus to where it was without being asked.
 *
 * Not a live region. The application has exactly two, both owned by the
 * announcement service (contract 2.3), and this is read on request rather than
 * announced on every movement, which section 5 rules out as unusable verbosity.
 */
export function PositionRibbon({ orientation }: { orientation: TranscriptOrientation }) {
  const { fields } = orientation;

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
          <span className="position-ribbon__field">No speaker turn focused</span>
        )}
      </p>
    </div>
  );
}
