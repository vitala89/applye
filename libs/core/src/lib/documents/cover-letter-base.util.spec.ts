import { buildTailoredContent, emptyBaseLetter, readBaseLetter } from './cover-letter-base.util';

describe('readBaseLetter', () => {
  it('returns the defaults when there is no document', () => {
    expect(readBaseLetter(undefined)).toEqual(emptyBaseLetter());
  });

  it('returns the defaults rather than throwing on unparseable content', () => {
    const doc = { id: 1, contentJson: '{not json' } as never;

    expect(readBaseLetter(doc)).toEqual(emptyBaseLetter());
  });

  it('carries availability and salary over from the base letter', () => {
    const doc = {
      id: 1,
      regionTag: 'de',
      contentJson: JSON.stringify({
        bodyParagraphs: ['P1'],
        earliestStart: '2026-09-01',
        salaryExpectation: '90000',
        noticePeriod: '3 months',
        tone: 'Friendly',
        length: 'Concise',
      }),
    } as never;

    expect(readBaseLetter(doc)).toMatchObject({
      paragraphs: ['P1'],
      regionTag: 'de',
      tone: 'Friendly',
      length: 'Concise',
      earliestStart: '2026-09-01',
      salaryExpectation: '90000',
      noticePeriod: '3 months',
    });
  });
});

describe('buildTailoredContent', () => {
  it('strips contact detail the AI appended to the signature', () => {
    const base = { ...emptyBaseLetter(), signature: 'Jane Doe\njane@example.com' };

    expect(buildTailoredContent(base, ['P'], 'JD', '2026-08-02').signature).not.toContain('@');
  });

  it('keeps the base addressing and replaces only the body', () => {
    const base = { ...emptyBaseLetter(), subject: 'SUBJ', greeting: 'Dear X', closing: 'Regards' };

    expect(buildTailoredContent(base, ['NEW'], 'JD', '2026-08-02')).toMatchObject({
      subject: 'SUBJ',
      greeting: 'Dear X',
      closing: 'Regards',
      bodyParagraphs: ['NEW'],
      date: '2026-08-02',
      jobDescription: 'JD',
    });
  });
});
