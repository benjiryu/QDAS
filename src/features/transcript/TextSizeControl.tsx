import type { TextSizeApi } from './useTextSize';

/**
 * The transcript's text size control, per D-056.
 *
 * In the transcript header, and explicitly never in the prototype-support
 * surface that carries the role switcher, phase control and flag presets — the
 * D-056 addendum makes that a general rule. That surface is scaffolding for
 * running the research; a participant should never need it, and homing a
 * product feature there would put a reading preference behind a facilitator's
 * control.
 *
 * No chord. Browser zoom owns Control plus and Control minus and they are not
 * intercepted; this is a preference rather than a command, and since D-057
 * retired the blanket visible-control rule nothing asks it to carry one.
 */
export function TextSizeControl({ textSize }: { textSize: TextSizeApi }) {
  const { percent, canIncrease, canDecrease, increase, decrease } = textSize;

  return (
    /*
      A named group, so a screen reader user arriving on either button knows
      what the pair is for. The value between them is text rather than a live
      region: the announcement service owns the two the application has, per
      contract 2.3, and each step already speaks through it.
    */
    <div className="text-size" role="group" aria-label="Transcript text size">
      <span className="text-size__label" aria-hidden="true">
        Text size
      </span>

      {/*
        Unavailable rather than removed at the ends, per contract 2.6: the
        control keeps its place, stays reachable, and says why when pressed.
        A control that vanishes at the boundary moves everything beside it.
      */}
      <button
        type="button"
        className="text-size__button"
        aria-disabled={canDecrease ? undefined : true}
        data-command="textSize.decrease"
        onClick={decrease}
      >
        {/* The glyph is decoration; the name is the whole control. */}
        <span aria-hidden="true">−</span>
        <span className="visually-hidden">Decrease text size</span>
      </button>

      {/*
        The current value, and named so it is not read as a bare number. Not
        `aria-live`: the step announcement already says it, and a live region
        here would speak every change twice.
      */}
      <span className="text-size__value" data-text-size={percent}>
        {percent}%
      </span>

      <button
        type="button"
        className="text-size__button"
        aria-disabled={canIncrease ? undefined : true}
        data-command="textSize.increase"
        onClick={increase}
      >
        <span aria-hidden="true">+</span>
        <span className="visually-hidden">Increase text size</span>
      </button>
    </div>
  );
}
