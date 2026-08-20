import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useAnnouncer } from '../../a11y';
import { clearCodebookEdits } from '../../data/codebookStore';
import { clearCodingSession } from '../../data/codingSessionStore';
import { clearSourcePositions } from '../../data/sourcePositionStore';
import {
  clearSimulatedSession,
  readSimulatedSession,
  subscribeToSimulatedSession,
} from '../../data/simulatedSession';
import { clearTextSizes } from '../../data/textSizeStore';
import { clearShortcutsHelp } from '../help/shortcutsHelpStore';
import { changePhase } from '../codebook/phaseBoundary';
import { PHASE_LABELS } from '../../domain';
import type { Id, ProjectPhase } from '../../domain';

/**
 * The session controls: the project phase, and the reset between participants.
 *
 * Specification: decision D-072.
 *
 * Scaffolding, and the surface several decisions referenced before one existed.
 * The D-056 addendum's rule still stands: participants should never need this,
 * and product features never live here.
 */

export interface SessionControlsApi {
  phase: ProjectPhase;
  setPhase: (phase: ProjectPhase) => void;
  /** True once the reset has asked and before it has been answered. */
  resetPending: boolean;
  requestReset: () => void;
  confirmReset: () => void;
  keepSession: () => void;
  setTriggerElement: (node: HTMLButtonElement | null) => void;
}

export function useSessionControls({
  projectId,
  seededVersionLabel,
  onReset,
}: {
  projectId: Id;
  /** What the codebook label returns to; the bump reads it at the boundary. */
  seededVersionLabel: string;
  /** Performed after the stores are cleared. See `confirmReset`. */
  onReset: () => void;
}): SessionControlsApi {
  const announcer = useAnnouncer();
  const session = useSyncExternalStore(
    subscribeToSimulatedSession,
    readSimulatedSession,
    readSimulatedSession,
  );

  const [resetPending, setResetPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const setTriggerElement = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  const setPhase = useCallback(
    (phase: ProjectPhase) => {
      if (phase === readSimulatedSession().phase) return;

      /*
        Through `changePhase` rather than straight to the session, because
        D-070's codebook version bump lives at the boundary: a round always
        references one stable version, and a bump left to each caller is a line
        somebody forgets the next time a phase can change.
      */
      changePhase(projectId, phase, seededVersionLabel);

      // Discrete and from the handler, like the role switcher beside it: each
      // change is its own act, and an effect would speak again on every
      // re-render the store caused.
      announcer.announce(`Project phase: ${PHASE_LABELS[phase]}`);
    },
    [announcer, projectId, seededVersionLabel],
  );

  const requestReset = useCallback(() => {
    setResetPending(true);
    // Assertive, because contract 2.3 reserves that region for save failures
    // and destructive confirmations, and this is the second of those.
    announcer.announce(
      'Reset the session for the next participant? This discards the coding work, the ' +
        'proposed and edited codes, and the reading preference. Nothing is reset until you confirm.',
      'assertive',
      'destructiveConfirmation',
    );
  }, [announcer]);

  const keepSession = useCallback(() => {
    setResetPending(false);
    announcer.announce('Nothing was reset.');
    /*
      Back to the trigger. The delete confirmation this is modelled on does not
      do this — its buttons vanish and focus falls to the body — which is a gap
      rather than a precedent. Contract 2.4: a temporary view returns focus
      where it came from.
    */
    queueMicrotask(() => triggerRef.current?.focus?.());
  }, [announcer]);

  const confirmReset = useCallback(() => {
    setResetPending(false);

    /*
      Every store that documents itself as part of this reset. D-072 names only
      `clearSimulatedSession`, which discards role and phase and no coding work
      at all — so a confirmation guarding it alone would warn about a loss that
      does not happen. These six are what the comments anticipate.
    */
    clearCodingSession();
    clearCodebookEdits();
    clearSourcePositions();
    clearTextSizes();
    clearShortcutsHelp();
    clearSimulatedSession();

    announcer.announce('Session reset. The seeded scenario is back.');
    onReset();
  }, [announcer, onReset]);

  return {
    phase: session.phase,
    setPhase,
    resetPending,
    requestReset,
    confirmReset,
    keepSession,
    setTriggerElement,
  };
}
