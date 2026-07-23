import { formatLetterDate, stripSubjectLabel } from './letter-format';

describe('formatLetterDate', () => {
  it('renders an ISO date the German way', () => {
    expect(formatLetterDate('2026-07-23', 'de')).toBe('23.07.2026');
  });

  it('leaves every other language alone', () => {
    expect(formatLetterDate('2026-07-23', 'en')).toBe('2026-07-23');
  });

  it('never touches a date the user wrote themselves', () => {
    expect(formatLetterDate('Berlin, 23.07.2026', 'de')).toBe('Berlin, 23.07.2026');
    expect(formatLetterDate('23. Juli 2026', 'de')).toBe('23. Juli 2026');
  });

  it('handles empty and missing values', () => {
    expect(formatLetterDate('', 'de')).toBe('');
    expect(formatLetterDate(null, 'de')).toBe('');
    expect(formatLetterDate(undefined, 'de')).toBe('');
  });
});

describe('stripSubjectLabel', () => {
  it('drops the label DIN 5008 abolished', () => {
    expect(stripSubjectLabel('Betreff: Bewerbung als Frontend Entwickler')).toBe(
      'Bewerbung als Frontend Entwickler',
    );
    expect(stripSubjectLabel('BETREFF:  Bewerbung')).toBe('Bewerbung');
    expect(stripSubjectLabel('Subject: Application')).toBe('Application');
  });

  it('keeps a subject that only starts with the word', () => {
    expect(stripSubjectLabel('Betreffend Ihre Anzeige vom 1. Juli')).toBe(
      'Betreffend Ihre Anzeige vom 1. Juli',
    );
  });

  it('handles empty and missing values', () => {
    expect(stripSubjectLabel('')).toBe('');
    expect(stripSubjectLabel(null)).toBe('');
  });
});
