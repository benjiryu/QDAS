import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearCodingSession } from '../data/codingSessionStore';

afterEach(() => {
  cleanup();
  /*
    After `cleanup`, not before: unmounting is what hands the coder's draft and
    saved work to the session store, per D-044, so clearing first would be
    undone by the unmount that follows. Every test starts from an empty
    session, which is what they all already assume.
  */
  clearCodingSession();
});
