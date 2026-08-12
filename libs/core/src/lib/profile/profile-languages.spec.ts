import { parseLanguageEntries } from './profile-languages';

describe('trailing bracket split, unbalanced input', () => {
  it('takes the innermost group when an opening bracket is unclosed', () => {
    expect(parseLanguageEntries(['Klingon (a(b)'])).toEqual([
      { language: 'Klingon', level: 'a(b' },
    ]);
  });

  it('leaves a nested group alone, since the body may not contain a bracket', () => {
    const item = 'Klingon (2019 - (2020))';
    expect(parseLanguageEntries([item])).toEqual([{ language: item, level: '' }]);
  });

  it('still splits a normal level, including with trailing spaces', () => {
    expect(parseLanguageEntries(['English (C1)  '])).toEqual([
      { language: 'English', level: 'C1' },
    ]);
  });
});
