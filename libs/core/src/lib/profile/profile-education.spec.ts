import { parseEducationEntries, serializeEducationEntries } from './profile-education';

describe('education entries', () => {
  it('serializes a full entry as "- Title, Institution (start - end)"', () => {
    expect(
      serializeEducationEntries([
        { title: 'BSc Computer Science', institution: 'MIT', startDate: '2015', endDate: '2019' },
      ]),
    ).toBe('- BSc Computer Science, MIT (2015 - 2019)');
  });

  it('renders an empty end date as "Present"', () => {
    expect(
      serializeEducationEntries([
        { title: 'MSc AI', institution: 'TUM', startDate: '2020', endDate: '' },
      ]),
    ).toBe('- MSc AI, TUM (2020 - Present)');
  });

  it('drops fully blank entries', () => {
    expect(
      serializeEducationEntries([{ title: '', institution: '', startDate: '', endDate: '' }]),
    ).toBe('');
  });

  it('round-trips structured entries through serialize→parse', () => {
    const entries = [
      { title: 'BSc Computer Science', institution: 'MIT', startDate: '2015', endDate: '2019' },
      { title: 'AWS Solutions Architect', institution: 'AWS', startDate: '2022', endDate: '' },
    ];
    expect(parseEducationEntries(serializeEducationEntries(entries))).toEqual(entries);
  });

  it('parses a legacy free-text line into a title-only entry', () => {
    expect(parseEducationEntries('BSc Computer Science')).toEqual([
      { title: 'BSc Computer Science', institution: '', startDate: '', endDate: '' },
    ]);
  });

  it('treats a trailing "Present" in the range as an open end', () => {
    expect(parseEducationEntries('- MSc AI, TUM (2020 - Present)')).toEqual([
      { title: 'MSc AI', institution: 'TUM', startDate: '2020', endDate: '' },
    ]);
  });
});
