import { EMPTY_FORM, ProfileForm } from '@applye/core';
import { withBackfilledNameParts, withComposedName } from './profile-name.util';

function form(over: Partial<ProfileForm> = {}): ProfileForm {
  return { ...EMPTY_FORM, ...over };
}

describe('withBackfilledNameParts', () => {
  it('splits the display name when neither part is stored', () => {
    const out = withBackfilledNameParts(form({ name: 'Mira Halvorsen' }));
    expect(out.firstName).toBe('Mira');
    expect(out.lastName).toBe('Halvorsen');
    expect(out.name).toBe('Mira Halvorsen');
  });

  /** The stored split is the user's. Re-deriving would overwrite, for example, a
   * two-word surname they fixed by hand. */
  it('leaves a stored split alone', () => {
    const stored = form({ name: 'Mira van der Berg', firstName: 'Mira', lastName: 'van der Berg' });
    expect(withBackfilledNameParts(stored)).toEqual(stored);
  });

  it('leaves it alone when only one part is stored', () => {
    const first = form({ name: 'Mira Halvorsen', firstName: 'Mira' });
    expect(withBackfilledNameParts(first).lastName).toBe('');

    const last = form({ name: 'Mira Halvorsen', lastName: 'Halvorsen' });
    expect(withBackfilledNameParts(last).firstName).toBe('');
  });

  it('has nothing to backfill from a blank name', () => {
    const blank = form({ name: '   ' });
    expect(withBackfilledNameParts(blank)).toEqual(blank);
  });

  it('does not mutate what it is given', () => {
    const input = form({ name: 'Mira Halvorsen' });
    withBackfilledNameParts(input);
    expect(input.firstName).toBe('');
  });
});

describe('withComposedName', () => {
  /** `next` is `previous` with the part edit already made. */
  function edit(previous: ProfileForm, over: Partial<ProfileForm>): ProfileForm {
    return withComposedName(previous, { ...previous, ...over });
  }

  it('follows the parts while the name still reads as they composed', () => {
    const previous = form({ name: 'Mira Halvorsen', firstName: 'Mira', lastName: 'Halvorsen' });
    expect(edit(previous, { lastName: 'Berg' }).name).toBe('Mira Berg');
  });

  it('adopts the parts when the name was never set', () => {
    const previous = form();
    expect(edit(previous, { firstName: 'Mira' }).name).toBe('Mira');
  });

  /** A name typed by hand is deliberate and outlives later part edits. */
  it('leaves a hand-set name alone', () => {
    const previous = form({ name: 'Dr. M. Halvorsen', firstName: 'Mira', lastName: 'Halvorsen' });
    expect(edit(previous, { lastName: 'Berg' }).name).toBe('Dr. M. Halvorsen');
  });

  /** Clearing both parts must not wipe a name the user still wants on their
   * documents. */
  it('never blanks the name when both parts are cleared', () => {
    const previous = form({ name: 'Mira Halvorsen', firstName: 'Mira', lastName: 'Halvorsen' });
    const cleared = withComposedName(previous, { ...previous, firstName: '', lastName: '' });
    expect(cleared.name).toBe('Mira Halvorsen');
  });

  /** A name the user cleared counts as untouched, so it re-adopts the parts
   * rather than freezing on a blank. */
  it('re-adopts the parts after the name itself was cleared', () => {
    const previous = form({ name: '', firstName: 'Mira', lastName: 'Halvorsen' });
    expect(edit(previous, { lastName: 'Berg' }).name).toBe('Mira Berg');
  });

  it('follows the parts again once the name matches them', () => {
    const handSet = form({ name: 'Mira Halvorsen', firstName: 'Mira', lastName: 'Halvorsen' });
    expect(edit(handSet, { lastName: 'Berg' }).name).toBe('Mira Berg');
  });

  it('composes a single part without a stray separator', () => {
    expect(edit(form(), { firstName: 'Mira' }).name).toBe('Mira');
    expect(edit(form(), { lastName: 'Halvorsen' }).name).toBe('Halvorsen');
  });

  it('ignores surrounding whitespace when deciding and when composing', () => {
    const previous = form({ name: '  Mira Halvorsen  ', firstName: 'Mira', lastName: 'Halvorsen' });
    expect(edit(previous, { lastName: '  Berg  ' }).name).toBe('Mira Berg');
  });

  it('does not mutate what it is given', () => {
    const previous = form({ firstName: 'Mira' });
    withComposedName(previous, { ...previous, lastName: 'Berg' });
    expect(previous.name).toBe('');
  });
});
