import { suggestCvFilename } from './cv-filename';

const deContent = (fullName: string): string =>
  JSON.stringify({
    sections: [{ key: 'personal_details', order: 0, visible: true, fullName }],
  });

describe('suggestCvFilename', () => {
  it('follows the German convention when a full name is available', () => {
    expect(
      suggestCvFilename({ regionTag: 'de', contentJson: deContent('Anna Maria Schmidt') }, 'pdf'),
    ).toBe('Schmidt_Anna_Maria_Lebenslauf.pdf');
  });

  it('matches the region case-insensitively', () => {
    expect(suggestCvFilename({ regionTag: 'DE', contentJson: deContent('Jan Meyer') }, 'pdf')).toBe(
      'Meyer_Jan_Lebenslauf.pdf',
    );
  });

  it('falls back to the label slug when a German CV has only one name part', () => {
    expect(
      suggestCvFilename(
        { label: 'Backend DE', regionTag: 'de', contentJson: deContent('Cher') },
        'pdf',
      ),
    ).toBe('backend_de.pdf');
  });

  it('falls back to the label slug when the stored content is not parseable', () => {
    expect(
      suggestCvFilename({ label: 'Broken DE', regionTag: 'de', contentJson: '{oops' }, 'pdf'),
    ).toBe('broken_de.pdf');
  });

  it('slugs the label for every other region', () => {
    expect(suggestCvFilename({ label: 'Senior Engineer - US', regionTag: 'us' }, 'docx')).toBe(
      'senior_engineer_us.docx',
    );
  });

  it('falls back to cv when there is no label at all', () => {
    expect(suggestCvFilename({}, 'pdf')).toBe('cv.pdf');
  });
});
