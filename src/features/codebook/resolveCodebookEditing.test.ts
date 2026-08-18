import { describe, expect, it } from 'vitest';
import { canEditCodebook } from './resolveCodebookEditing';
import type { ProjectPhase, UserRole } from '../../domain';

/** Specification: decision D-070's gate. */

const PHASES: ProjectPhase[] = [
  'setup',
  'pilot',
  'independentCoding',
  'review',
  'reflexivity',
  'recoding',
  'closed',
];
const ROLES: UserRole[] = ['coder', 'reviewer', 'qualitativeLead'];

describe('who may edit the codebook', () => {
  it('lets the lead edit in the three phases with no round open', () => {
    for (const phase of ['setup', 'review', 'recoding'] as ProjectPhase[]) {
      expect(canEditCodebook('qualitativeLead', phase), phase).toBe(true);
    }
  });

  it('stops the lead while a round could be open', () => {
    /*
      The structural half of D-070: a codebook that cannot change while a round
      is open means the round references one stable version throughout. Pilot
      and independent coding are rounds; reflexivity and closed are not editing
      moments either.
    */
    for (const phase of ['pilot', 'independentCoding', 'reflexivity', 'closed'] as ProjectPhase[]) {
      expect(canEditCodebook('qualitativeLead', phase), phase).toBe(false);
    }
  });

  it('never lets anyone else edit, in any phase', () => {
    for (const role of ROLES.filter((candidate) => candidate !== 'qualitativeLead')) {
      for (const phase of PHASES) {
        expect(canEditCodebook(role, phase), `${role} in ${phase}`).toBe(false);
      }
    }
  });
});
