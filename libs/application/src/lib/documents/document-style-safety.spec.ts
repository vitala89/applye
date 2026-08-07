import type { StyleNote } from '@applye/core';
import { STYLE_CHECK_DEBOUNCE_MS, dedupeStyleNotes } from './document-style-safety';

function note(kind: StyleNote['kind'], detail: string): StyleNote {
  return { kind, detail } as StyleNote;
}

describe('STYLE_CHECK_DEBOUNCE_MS', () => {
  it('is long enough to collapse a burst and short enough to feel attached', () => {
    expect(STYLE_CHECK_DEBOUNCE_MS).toBe(400);
  });
});

describe('dedupeStyleNotes', () => {
  it('leaves a list with no duplicates alone', () => {
    const notes = [note('font_ats_risk', 'Papyrus'), note('size_out_of_range', '4pt')];
    expect(dedupeStyleNotes(notes)).toEqual(notes);
  });

  it('collapses the same warning reported three times', () => {
    const notes = [
      note('weight_unavailable_risk', '300'),
      note('weight_unavailable_risk', '300'),
      note('weight_unavailable_risk', '300'),
    ];
    expect(dedupeStyleNotes(notes)).toEqual([note('weight_unavailable_risk', '300')]);
  });

  // Asymmetric on the two halves of the key: same kind with different details,
  // and same detail under different kinds. Collapsing on either half alone
  // would silence a warning the user needs.
  it('keys on kind AND detail, not on either alone', () => {
    const sameKind = [note('font_ats_risk', 'Papyrus'), note('font_ats_risk', 'Comic Sans')];
    expect(dedupeStyleNotes(sameKind)).toHaveLength(2);

    const sameDetail = [note('font_ats_risk', '300'), note('weight_unavailable_risk', '300')];
    expect(dedupeStyleNotes(sameDetail)).toHaveLength(2);
  });

  // The list is rendered in the order the checker produced it, so the first
  // occurrence is the one that must survive.
  it('keeps the first occurrence and preserves order', () => {
    const notes = [
      note('font_ats_risk', 'Papyrus'),
      note('size_out_of_range', '4pt'),
      note('font_ats_risk', 'Papyrus'),
      note('color_readability_risk', '#eee'),
    ];

    expect(dedupeStyleNotes(notes)).toEqual([
      note('font_ats_risk', 'Papyrus'),
      note('size_out_of_range', '4pt'),
      note('color_readability_risk', '#eee'),
    ]);
  });

  it('handles an empty list', () => {
    expect(dedupeStyleNotes([])).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const notes = [note('font_ats_risk', 'Papyrus'), note('font_ats_risk', 'Papyrus')];
    dedupeStyleNotes(notes);
    expect(notes).toHaveLength(2);
  });
});
