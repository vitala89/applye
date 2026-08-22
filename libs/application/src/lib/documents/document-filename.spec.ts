import {
  documentFilenameBase,
  suggestCoverLetterFilename,
  suggestCvFilename,
} from './document-filename';

describe('documentFilenameBase', () => {
  /// The reported name. The old rule kept hyphens and turned spaces into
  /// underscores, so every " - " in the label came out as "_-_".
  it('leaves no underscores or hyphens behind, whichever the label used', () => {
    for (const label of [
      'Acme - Backend Engineer',
      'Acme_-_Backend_Engineer',
      'Acme---Backend___Engineer',
      'Acme  -  Backend   Engineer',
    ]) {
      expect(documentFilenameBase(label)).toBe('Acme Backend Engineer');
    }
  });

  /// "JetBrains" is a name; "jetbrains" is not. A recruiter reads this.
  it('preserves case and non-ASCII letters', () => {
    expect(documentFilenameBase('Zürich Insurance - Größer Rolle')).toBe(
      'Zürich Insurance Größer Rolle',
    );
    expect(documentFilenameBase('MongoDB - iOS Developer')).toBe('MongoDB iOS Developer');
  });

  /// A colon or a slash in a company name must not reach the filesystem, and
  /// must not leave a widened gap where it used to be.
  it('removes characters a filesystem refuses without splitting the words', () => {
    expect(documentFilenameBase('Yahoo! Inc: R&D / Platform')).toBe('Yahoo! Inc R&D Platform');
    expect(documentFilenameBase('a\\b<c>d|e?f*g"h')).toBe('abcdefgh');
  });

  /// Windows silently trims a trailing dot or space, so a name ending in one is
  /// a name that differs depending on where it lands.
  it('never starts or ends with a dot or a space', () => {
    expect(documentFilenameBase('  . Acme - Role . ')).toBe('Acme Role');
  });

  it('caps the length and does not leave a dangling space at the cut', () => {
    const base = documentFilenameBase(`${'x'.repeat(119)} tail`);
    expect(base.length).toBeLessThanOrEqual(120);
    expect(base).not.toMatch(/\s$/);
  });

  it('returns empty when nothing survives, for the caller to fall back on', () => {
    expect(documentFilenameBase('***')).toBe('');
    expect(documentFilenameBase('   ')).toBe('');
  });
});

describe('suggestCvFilename', () => {
  const deContent = (fullName: string): string =>
    JSON.stringify({
      sections: [{ key: 'personal_details', order: 0, visible: true, fullName }],
    });

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

  it('falls back to the label when a German CV has only one name part', () => {
    expect(
      suggestCvFilename(
        { label: 'Backend DE', regionTag: 'de', contentJson: deContent('Cher') },
        'pdf',
      ),
    ).toBe('Backend DE.pdf');
  });

  it('falls back to the label when the stored content is not parseable', () => {
    expect(
      suggestCvFilename({ label: 'Broken DE', regionTag: 'de', contentJson: '{oops' }, 'pdf'),
    ).toBe('Broken DE.pdf');
  });

  it('keeps the label as-is for every other region', () => {
    expect(suggestCvFilename({ label: 'Senior Engineer - US', regionTag: 'us' }, 'docx')).toBe(
      'Senior Engineer US.docx',
    );
  });

  it('falls back to cv when there is no label at all', () => {
    expect(suggestCvFilename({}, 'pdf')).toBe('cv.pdf');
    expect(suggestCvFilename({ label: '***' }, 'pdf')).toBe('cv.pdf');
  });
});

describe('suggestCoverLetterFilename', () => {
  it('keeps the words of the label, dropping punctuation between them', () => {
    expect(suggestCoverLetterFilename('Acme GmbH - Anschreiben', 'pdf')).toBe(
      'Acme GmbH Anschreiben.pdf',
    );
  });

  it('preserves case and non-ASCII letters', () => {
    expect(suggestCoverLetterFilename('Résumé für Acme', 'pdf')).toBe('Résumé für Acme.pdf');
  });

  it('falls back for an unlabelled document', () => {
    expect(suggestCoverLetterFilename(null, 'pdf')).toBe('cover-letter.pdf');
    expect(suggestCoverLetterFilename('', 'pdf')).toBe('cover-letter.pdf');
  });

  /**
   * A label made entirely of punctuation collapses to an empty stem, which
   * would suggest a file called `.pdf` - most systems treat that as hidden
   * and nameless, so it falls back instead.
   */
  it('falls back when the label collapses to nothing', () => {
    expect(suggestCoverLetterFilename('***', 'pdf')).toBe('cover-letter.pdf');
  });
});
