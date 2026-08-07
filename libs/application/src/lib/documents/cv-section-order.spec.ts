import type { CvSection, CvSectionKey } from '@applye/core';
import {
  isCvSectionLocked,
  LOCKED_SECTION_KEYS,
  moveCvSection,
  pinLockedSections,
  reorderCvSections,
  replaceCvSection,
} from './cv-section-order';

function sec(key: CvSectionKey, order: number, over: Record<string, unknown> = {}): CvSection {
  return { key, order, visible: true, ...over } as CvSection;
}

/** Reads a list back as `key:order` pairs, so both the sequence and the
 * reindexing are asserted at once - a reorder that forgets to reassign `order`
 * looks identical if only the keys are compared. */
const shape = (list: readonly CvSection[]): string =>
  list.map((s) => `${s.key}:${s.order}`).join(' ');

describe('isCvSectionLocked', () => {
  it('locks exactly the two header sections', () => {
    expect(LOCKED_SECTION_KEYS).toEqual(['photo', 'personal_details']);
    expect(isCvSectionLocked('photo')).toBe(true);
    expect(isCvSectionLocked('personal_details')).toBe(true);
    // Asymmetric on purpose: the two locked keys are asserted separately from
    // several unlocked ones, so a predicate that locks everything - or only the
    // first of the pair - fails rather than being masked.
    expect(isCvSectionLocked('summary')).toBe(false);
    expect(isCvSectionLocked('experience')).toBe(false);
    expect(isCvSectionLocked('skills')).toBe(false);
  });
});

describe('pinLockedSections', () => {
  it('pulls both header sections to the top in canonical order and reindexes', () => {
    // Deliberately scrambled, and personal_details before photo: a function that
    // preserves their relative order would pass a fixture that already had them
    // the right way round.
    const list = [
      sec('summary', 0),
      sec('personal_details', 1),
      sec('experience', 2),
      sec('photo', 3),
    ];
    expect(shape(pinLockedSections(list))).toBe(
      'photo:0 personal_details:1 summary:2 experience:3',
    );
  });

  it('skips a locked section the document does not have', () => {
    const list = [sec('summary', 0), sec('personal_details', 1)];
    expect(shape(pinLockedSections(list))).toBe('personal_details:0 summary:1');
  });

  it('handles the other locked section missing too', () => {
    const list = [sec('summary', 0), sec('photo', 1)];
    expect(shape(pinLockedSections(list))).toBe('photo:0 summary:1');
  });

  it('does not mutate the list it is given', () => {
    const list = [sec('summary', 0), sec('photo', 1)];
    const before = shape(list);
    pinLockedSections(list);
    expect(shape(list)).toBe(before);
  });
});

describe('reorderCvSections', () => {
  const base = [
    sec('photo', 0),
    sec('personal_details', 1),
    sec('summary', 2),
    sec('experience', 3),
    sec('skills', 4),
  ];

  it('moves an item down and reindexes', () => {
    expect(shape(reorderCvSections(base, 2, 4))).toBe(
      'photo:0 personal_details:1 experience:2 skills:3 summary:4',
    );
  });

  it('moves an item up', () => {
    expect(shape(reorderCvSections(base, 4, 2))).toBe(
      'photo:0 personal_details:1 skills:2 summary:3 experience:4',
    );
  });

  it('re-pins when a drag would put a section above a locked header', () => {
    // Dropping summary at index 0 must not leave it above photo.
    expect(shape(reorderCvSections(base, 2, 0))).toBe(
      'photo:0 personal_details:1 summary:2 experience:3 skills:4',
    );
  });

  it('re-pins when a drag would move a locked header itself', () => {
    expect(shape(reorderCvSections(base, 0, 4))).toBe(
      'photo:0 personal_details:1 summary:2 experience:3 skills:4',
    );
  });

  it('leaves the list intact for an out-of-range index rather than dropping a section', () => {
    expect(shape(reorderCvSections(base, 2, 9))).toBe(shape(base));
    expect(shape(reorderCvSections(base, -1, 2))).toBe(shape(base));
    expect(reorderCvSections(base, 2, 9)).toHaveLength(base.length);
  });
});

describe('moveCvSection', () => {
  const base = [
    sec('photo', 0),
    sec('personal_details', 1),
    sec('summary', 2),
    sec('experience', 3),
    sec('skills', 4),
  ];

  it('nudges a section down', () => {
    expect(shape(moveCvSection(base, 'summary', 1))).toBe(
      'photo:0 personal_details:1 experience:2 summary:3 skills:4',
    );
  });

  it('nudges a section up', () => {
    expect(shape(moveCvSection(base, 'skills', -1))).toBe(
      'photo:0 personal_details:1 summary:2 skills:3 experience:4',
    );
  });

  it('refuses to move a locked section', () => {
    expect(shape(moveCvSection(base, 'personal_details', 1))).toBe(shape(base));
    expect(shape(moveCvSection(base, 'photo', 1))).toBe(shape(base));
  });

  it('refuses to swap the first movable section past the locked header above it', () => {
    // summary is at index 2; moving it up would swap with personal_details.
    expect(shape(moveCvSection(base, 'summary', -1))).toBe(shape(base));
  });

  it('refuses to move past the end, and refuses an unknown key', () => {
    expect(shape(moveCvSection(base, 'skills', 1))).toBe(shape(base));
    expect(shape(moveCvSection(base, 'languages', -1))).toBe(shape(base));
  });

  it('returns a copy even when it refuses, so the caller can set it unconditionally', () => {
    const refused = moveCvSection(base, 'photo', 1);
    expect(refused).not.toBe(base);
    expect(shape(refused)).toBe(shape(base));
  });

  // Every fixture above is already pinned and reindexed, which makes a refusal
  // and a fall-through produce the same list - so the lock checks read as dead
  // code against them. On a list whose `order` values have drifted the two
  // differ: refusing returns it verbatim, falling through would reindex it.
  // These are the cases that actually pin the checks down.
  describe('on a list that is not already normalized', () => {
    const drifted = [sec('photo', 5), sec('personal_details', 6), sec('summary', 9)];

    it('refusing to move a locked section leaves the drifted orders untouched', () => {
      expect(shape(moveCvSection(drifted, 'photo', 1))).toBe(
        'photo:5 personal_details:6 summary:9',
      );
    });

    // `photo` above is a weak case: its neighbour is locked too, so the
    // neighbour check would refuse even if the locked-key check were gone.
    // `personal_details` moving DOWN lands on `summary`, which is not locked -
    // so the locked-key check is the only thing that can refuse it.
    it('refuses to move a locked section even when its neighbour is movable', () => {
      expect(shape(moveCvSection(drifted, 'personal_details', 1))).toBe(
        'photo:5 personal_details:6 summary:9',
      );
    });

    it('refusing to swap past a locked header leaves the drifted orders untouched', () => {
      expect(shape(moveCvSection(drifted, 'summary', -1))).toBe(
        'photo:5 personal_details:6 summary:9',
      );
    });

    it('an allowed move DOES reindex, which is what makes the two distinguishable', () => {
      const withTwoMovable = [...drifted, sec('skills', 12)];
      expect(shape(moveCvSection(withTwoMovable, 'summary', 1))).toBe(
        'photo:0 personal_details:1 skills:2 summary:3',
      );
    });
  });
});

describe('replaceCvSection', () => {
  it('swaps one section by key and leaves the others identical', () => {
    const base = [sec('summary', 0), sec('experience', 1)];
    const updated = sec('summary', 0, { text: 'Rewritten.' });
    const next = replaceCvSection(base, updated);
    expect(next[0]).toBe(updated);
    expect(next[1]).toBe(base[1]);
  });

  it('is a no-op for a key that is not present', () => {
    const base = [sec('summary', 0)];
    expect(replaceCvSection(base, sec('skills', 1))).toEqual(base);
  });
});
