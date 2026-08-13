import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearCodingSession } from '../data/codingSessionStore';
import { clearSimulatedSession } from '../data/simulatedSession';
import { clearTextSizes } from '../data/textSizeStore';

afterEach(() => {
  cleanup();
  /*
    After `cleanup`, not before: unmounting is what hands the coder's draft and
    saved work to the session store, per D-044, so clearing first would be
    undone by the unmount that follows. Every test starts from an empty
    session, which is what they all already assume.
  */
  clearCodingSession();
  // The simulated role and phase, back to the seeded scenario. D-049 resolves
  // the Coded data view from these, so a test that switched them would
  // otherwise decide the next one's view.
  clearSimulatedSession();
  // A reading preference in `localStorage`, so unlike the in-memory stores it
  // would otherwise survive into the next test and resize its transcript.
  clearTextSizes();
});
