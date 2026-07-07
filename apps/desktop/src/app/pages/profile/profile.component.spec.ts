import { serializeProfileForm, parseProfileMd, EMPTY_FORM } from '@applye/core';

describe('ProfileComponent form/md sync (unit-level contract)', () => {
  it('form → md → form is stable for a filled form', () => {
    const form = {
      ...EMPTY_FORM,
      name: 'Jane',
      title: 'Dev',
      location: 'EU',
      skills: ['Go'],
    };
    expect(parseProfileMd(serializeProfileForm(form))).toEqual(form);
  });

  it('toggling to raw and back preserves an unknown section', () => {
    const md = '# Jane\nDev · EU\n\n## Awards\nPrize';
    const roundTripped = serializeProfileForm(parseProfileMd(md));
    expect(roundTripped).toContain('## Awards');
    expect(roundTripped).toContain('Prize');
  });
});
