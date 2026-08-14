import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAnnouncer } from '../../a11y';
import {
  clampTextSize,
  readTextSize,
  subscribeToTextSize,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
  writeTextSize,
} from '../../data/textSizeStore';
import type { Id } from '../../domain';

/**
 * The reading scale, per D-056 as extended by D-061.
 *
 * The Word document-zoom model: browser zoom scales the whole interface, this
 * grows only reading content, and the two compose. A magnification participant
 * can run moderate zoom with large reading text and keep the chrome compact,
 * which neither control alone allows.
 *
 * D-061 moved this out of the transcript, which is why the file did too. The
 * rule was always "reading content scales, chrome does not"; the transcript was
 * simply the only surface then classified as reading content, and a coder reads
 * code names and definitions as data. One preference, one control, every
 * surface — so the value is written to the root element rather than to any one
 * region, and pages with no transcript on them are reached the same way.
 *
 * The store keeps its `qdas.textSize.v1` key. It holds a participant's saved
 * preference, and renaming it would silently discard one.
 */

export interface TextSizeApi {
  /** Percent, 100 to 250. */
  percent: number;
  canIncrease: boolean;
  canDecrease: boolean;
  increase: () => void;
  decrease: () => void;
}

export function useReadingScale(userId: Id): TextSizeApi {
  const announcer = useAnnouncer();
  /*
    From the store, so every caller sees one value.

    The control renders in the transcript header and the shell applies the
    preference on every route, including those with no control on them. Held in
    component state those two would drift; subscribed, they cannot.
  */
  const percent = useSyncExternalStore(
    subscribeToTextSize,
    () => readTextSize(userId),
    () => readTextSize(userId),
  );

  const step = useCallback(
    (delta: number) => {
      const next = clampTextSize(percent + delta);

      if (next === percent) {
        /*
          Unavailable, and it says why rather than doing nothing, per contract
          2.6. A control that is visibly there and silently inert is a dead end
          for a screen reader user.
        */
        announcer.announce(
          delta > 0
            ? `Text size is already at its maximum, ${TEXT_SIZE_MAX} percent.`
            : `Text size is already at its minimum, ${TEXT_SIZE_MIN} percent.`,
        );
        return;
      }

      writeTextSize(userId, next);

      /*
        Discrete, per D-050, and this is the side of that decision worth being
        explicit about. Search counts coalesce because the intermediates are
        drafts of one fact that is still settling. Each press here is its own act
        by the user, and a run of presses that reported only its last value would
        leave them unable to tell whether the middle ones registered.
      */
      announcer.announce(`Text size ${next} percent.`);
    },
    [announcer, percent, userId],
  );

  /*
    The one place the preference reaches the page.

    A custom property on the root rather than a font-size on a container, so
    every surface that opts in is reached wherever it renders — including the
    destination pages, which is the whole of D-061. Written in an effect
    because it is a DOM side effect rather than state, and nothing re-renders
    because of it.
  */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reading-scale', String(percent / 100));
    root.dataset.readingScale = String(percent);
  }, [percent]);

  return {
    percent,
    canIncrease: percent < TEXT_SIZE_MAX,
    canDecrease: percent > TEXT_SIZE_MIN,
    increase: useCallback(() => step(TEXT_SIZE_STEP), [step]),
    decrease: useCallback(() => step(-TEXT_SIZE_STEP), [step]),
  };
}
