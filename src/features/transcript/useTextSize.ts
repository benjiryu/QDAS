import { useCallback, useState } from 'react';
import { useAnnouncer } from '../../a11y';
import {
  clampTextSize,
  readTextSize,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
  writeTextSize,
} from '../../data/textSizeStore';
import type { Id } from '../../domain';

/**
 * The transcript's text size, per D-056.
 *
 * The Word document-zoom model: browser zoom scales the whole interface, this
 * grows only the reading surface, and the two compose. A magnification
 * participant can run moderate zoom with large transcript text and keep the
 * chrome compact, which neither control alone allows.
 */

export interface TextSizeApi {
  /** Percent, 100 to 250. */
  percent: number;
  canIncrease: boolean;
  canDecrease: boolean;
  increase: () => void;
  decrease: () => void;
}

export function useTextSize(userId: Id): TextSizeApi {
  const announcer = useAnnouncer();
  // Read once, lazily, so a reload finds the preference already in place rather
  // than rendering at the default and correcting itself from an effect.
  const [percent, setPercent] = useState(() => readTextSize(userId));

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

      setPercent(next);
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

  return {
    percent,
    canIncrease: percent < TEXT_SIZE_MAX,
    canDecrease: percent > TEXT_SIZE_MIN,
    increase: useCallback(() => step(TEXT_SIZE_STEP), [step]),
    decrease: useCallback(() => step(-TEXT_SIZE_STEP), [step]),
  };
}
