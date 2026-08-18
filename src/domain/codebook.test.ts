import { describe, expect, it } from 'vitest';
import { createSeedFixture } from '../data/seed';
import {
  applyDraft,
  codeFromDraft,
  eligibleParents,
  familyColorToken,
  MAX_CODE_DEPTH,
  nextCanonicalIndex,
  validateCodeDraft,
} from './codebook';
import type { CodeDraft } from './codebook';
import type { Code, Id } from './types';

/**
 * Specification: decision D-070, and D-046 for what a code record holds.
 *
 * The seeded codebook is what these run against wherever placement is at stake.
 * It is fifty codes in six families with a dense, depth-first canonical order,
 * which is the shape the insertion rule has to survive; a synthetic three-code
 * tree would let a wrong rule pass.
 */

const fixture = createSeedFixture();
const codes = fixture.codes;
const byId = new Map(codes.map((code) => [code.codeId, code]));

function draft(overrides: Partial<CodeDraft> = {}): CodeDraft {
  return {
    name: 'Compost queue',
    definition: 'Waiting for a compost bay.',
    parentCodeId: null,
    colorToken: 'code-color-violet',
    ...overrides,
  };
}

/** A family, a child of it, and a grandchild, from the real fixture. */
const family = codes.find((code) => code.parentCodeId === null)!;
const child = codes.find((code) => code.parentCodeId === family.codeId)!;
const grandchild = codes.find((code) => code.parentCodeId === child.codeId)!;

describe('what makes a draft valid', () => {
  it('requires a name', () => {
    expect(validateCodeDraft(draft({ name: '   ' }), codes)).toContain('nameMissing');
  });

  it('refuses a name already in the codebook, whatever its case', () => {
    // D-070: unique codebook-wide, case-insensitive. Two codes a coder cannot
    // tell apart by name are two codes they will use interchangeably.
    const taken = codes[3].name;

    expect(validateCodeDraft(draft({ name: taken }), codes)).toContain('nameTaken');
    expect(validateCodeDraft(draft({ name: taken.toUpperCase() }), codes)).toContain('nameTaken');
  });

  it('counts provisional codes as taken too', () => {
    const proposed: Code = { ...codes[0], codeId: 'cd-prov', name: 'Compost queue', status: 'provisional' };

    expect(validateCodeDraft(draft({ name: 'compost queue' }), [...codes, proposed])).toContain(
      'nameTaken',
    );
  });

  it('does not collide a code with itself when it is the one being edited', () => {
    const existing = codes[3];

    expect(validateCodeDraft(draft({ name: existing.name }), codes, existing.codeId)).not.toContain(
      'nameTaken',
    );
  });

  it('requires a colour on a family and never on a descendant', () => {
    // A family with no hue renders in the provisional grey and reads as
    // unapproved; a descendant wears its family's, so it has none to choose.
    expect(validateCodeDraft(draft({ colorToken: null }), codes)).toContain('colorMissing');
    expect(
      validateCodeDraft(draft({ parentCodeId: family.codeId, colorToken: null }), codes),
    ).not.toContain('colorMissing');
  });

  it('reports every problem at once rather than the first', () => {
    // A form that reports one error, then another after the fix, makes the
    // reader do the work twice.
    expect(validateCodeDraft(draft({ name: '', colorToken: null }), codes)).toEqual([
      'nameMissing',
      'colorMissing',
    ]);
  });
});

describe('which codes may be a parent', () => {
  const eligible = eligibleParents(codes);
  const eligibleIds = new Set(eligible.map((code) => code.codeId));

  it('offers families and their children', () => {
    expect(eligibleIds.has(family.codeId)).toBe(true);
    expect(eligibleIds.has(child.codeId)).toBe(true);
  });

  it('never offers a grandchild, which is what caps depth', () => {
    /*
      D-070 caps depth at grandchild by narrowing this list rather than by
      refusing a deeper choice afterwards — a control that cannot express the
      mistake beats one that reports it.
    */
    expect(eligibleIds.has(grandchild.codeId)).toBe(false);
    expect(MAX_CODE_DEPTH).toBe(2);
  });

  it('never offers a provisional code', () => {
    // One has no canonical position, so a canonical code beneath it would hang
    // off something that is not in the codebook.
    const proposed: Code = { ...codes[0], codeId: 'cd-prov', status: 'provisional' };

    expect(
      eligibleParents([...codes, proposed]).some((code) => code.codeId === 'cd-prov'),
    ).toBe(false);
  });
});

describe('where a new code lands in canonical order', () => {
  const sortedIds = (all: readonly Code[]) =>
    [...all]
      .filter((code) => code.status !== 'provisional')
      .sort((a, b) => a.canonicalOrderIndex - b.canonicalOrderIndex)
      .map((code) => code.codeId);

  /** The codes under a family, including it, in canonical order. */
  const subtreeOf = (rootId: Id) => {
    const ids = new Set<Id>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const code of codes) {
        if (code.parentCodeId && ids.has(code.parentCodeId) && !ids.has(code.codeId)) {
          ids.add(code.codeId);
          grew = true;
        }
      }
    }
    return ids;
  };

  it('places a new child after its family’s whole subtree, before the next family', () => {
    /*
      Not merely after the last sibling: the order is depth-first, so the last
      sibling is followed by its own descendants, and landing between them would
      put the new code inside a subtree it does not belong to.
    */
    const index = nextCanonicalIndex(codes, family.codeId);
    const subtree = subtreeOf(family.codeId);

    const lastInside = Math.max(
      ...codes.filter((code) => subtree.has(code.codeId)).map((code) => code.canonicalOrderIndex),
    );
    const firstOutsideAfter = Math.min(
      ...codes
        .filter((code) => !subtree.has(code.codeId) && code.canonicalOrderIndex > lastInside)
        .map((code) => code.canonicalOrderIndex),
    );

    expect(index).toBeGreaterThan(lastInside);
    expect(index).toBeLessThan(firstOutsideAfter);
  });

  it('renumbers nothing, so every existing code keeps its place', () => {
    /*
      The reason the index is a fraction. The seeded order is dense and global,
      so an integer insert would mean rewriting every code after it — and each
      of those rewrites is a chance to move something that should not move.
    */
    const before = sortedIds(codes);
    const created = codeFromDraft(
      draft({ parentCodeId: family.codeId, colorToken: null }),
      { codeId: 'cd-new', projectId: fixture.project.projectId },
      nextCanonicalIndex(codes, family.codeId),
      familyColorToken(codes, family.codeId),
    );

    const after = sortedIds([...codes, created]);

    expect(after.filter((id) => id !== 'cd-new')).toEqual(before);
    expect(after.indexOf('cd-new')).toBeGreaterThan(after.indexOf(family.codeId));
  });

  it('appends a new family past the end', () => {
    const highest = Math.max(...codes.map((code) => code.canonicalOrderIndex));

    expect(nextCanonicalIndex(codes, null)).toBeGreaterThan(highest);
  });

  it('ignores provisional codes, whose index is a placeholder', () => {
    // A provisional carries -1, which is not a position and must not become the
    // maximum a new family is measured against.
    const proposed: Code = { ...codes[0], codeId: 'cd-prov', status: 'provisional', canonicalOrderIndex: -1 };

    expect(nextCanonicalIndex([...codes, proposed], null)).toBe(nextCanonicalIndex(codes, null));
  });
});

describe('a draft as a record', () => {
  it('gives a family the hue it chose and a descendant its family’s', () => {
    // The transcript's family highlight is what this is for: every code in a
    // family paints the same, so the hue has to come from the root.
    const asFamily = codeFromDraft(draft(), { codeId: 'cd-a', projectId: 'pr' }, 99, null);
    expect(asFamily.colorToken).toBe('code-color-violet');

    const asChild = codeFromDraft(
      draft({ parentCodeId: child.codeId, colorToken: null }),
      { codeId: 'cd-b', projectId: 'pr' },
      99,
      familyColorToken(codes, child.codeId),
    );
    expect(asChild.colorToken).toBe(family.colorToken);
  });

  it('creates approved, since only the lead reaches this', () => {
    expect(codeFromDraft(draft(), { codeId: 'cd-a', projectId: 'pr' }, 99, null).status).toBe(
      'approved',
    );
  });

  it('keeps a code’s identity when applied to it, which is what carries assignments', () => {
    /*
      Accept costs nothing because of this. A provisional's assignments already
      name its `codeId`, so moving it into the hierarchy takes them along
      without touching one assignment record.
    */
    const proposed: Code = {
      ...codes[0],
      codeId: 'cd-prov',
      name: 'Compost queue',
      status: 'provisional',
      parentCodeId: null,
      canonicalOrderIndex: -1,
    };

    const accepted = applyDraft(
      proposed,
      draft({ name: 'Compost queue', parentCodeId: child.codeId, colorToken: null }),
      nextCanonicalIndex(codes, child.codeId),
      familyColorToken(codes, child.codeId),
    );

    expect(accepted.codeId).toBe('cd-prov');
    expect(accepted.status).toBe('approved');
    expect(accepted.parentCodeId).toBe(child.codeId);
    expect(accepted.colorToken).toBe(family.colorToken);
  });
});

describe('the hue a family wears', () => {
  it('walks up to the family, however deep the code sits', () => {
    expect(familyColorToken(codes, grandchild.codeId)).toBe(family.colorToken);
    expect(familyColorToken(codes, family.codeId)).toBe(family.colorToken);
  });

  it('is null where there is no code to ask about', () => {
    expect(familyColorToken(codes, null)).toBeNull();
    expect(familyColorToken(codes, 'cd-nope')).toBeNull();
  });

  it('agrees with the fixture on every code', () => {
    // The invariant the transcript depends on: a family and its descendants
    // paint one hue.
    for (const code of codes) {
      let root = code;
      while (root.parentCodeId) root = byId.get(root.parentCodeId)!;
      expect(familyColorToken(codes, code.codeId)).toBe(root.colorToken);
    }
  });
});
