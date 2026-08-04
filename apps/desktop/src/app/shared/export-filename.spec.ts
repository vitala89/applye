import { exportFileBase, exportFileName } from './export-filename';

describe('exportFileName', () => {
  /// The reported name. The old rule kept hyphens and turned spaces into
  /// underscores, so every " - " in the label came out as "_-_".
  it('keeps the words of a job label and drops the punctuation between them', () => {
    expect(exportFileName('JetBrains - Senior Software Developer - Tailored CV', 'cv', 'pdf')).toBe(
      'JetBrains Senior Software Developer Tailored CV.pdf',
    );
  });

  it('leaves no underscores or hyphens behind, whichever the label used', () => {
    for (const label of [
      'Acme - Backend Engineer',
      'Acme_-_Backend_Engineer',
      'Acme---Backend___Engineer',
      'Acme  -  Backend   Engineer',
    ]) {
      expect(exportFileBase(label)).toBe('Acme Backend Engineer');
    }
  });

  /// "JetBrains" is a name; "jetbrains" is not. A recruiter reads this.
  it('preserves case and non-ASCII letters', () => {
    expect(exportFileBase('Zürich Insurance - Größer Rolle')).toBe('Zürich Insurance Größer Rolle');
    expect(exportFileBase('MongoDB - iOS Developer')).toBe('MongoDB iOS Developer');
  });

  /// A colon or a slash in a company name must not reach the filesystem, and
  /// must not leave a widened gap where it used to be.
  it('removes characters a filesystem refuses without splitting the words', () => {
    expect(exportFileBase('Yahoo! Inc: R&D / Platform')).toBe('Yahoo! Inc R&D Platform');
    expect(exportFileBase('a\\b<c>d|e?f*g"h')).toBe('abcdefgh');
  });

  /// Windows silently trims a trailing dot or space, so a name ending in one is
  /// a name that differs depending on where it lands.
  it('never starts or ends with a dot or a space', () => {
    expect(exportFileBase('  . Acme - Role . ')).toBe('Acme Role');
    expect(exportFileName('...', 'cover_letter', 'pdf')).toBe('cover letter.pdf');
  });

  it('caps the length and does not leave a dangling space at the cut', () => {
    const base = exportFileBase(`${'x'.repeat(119)} tail`);
    expect(base.length).toBeLessThanOrEqual(120);
    expect(base).not.toMatch(/\s$/);
  });

  /// The label is user-editable and can be emptied; the caller's fallback is
  /// the document type, which can itself be nothing but separators.
  it('falls back rather than producing a name that is only an extension', () => {
    expect(exportFileName('', 'cv', 'pdf')).toBe('cv.pdf');
    expect(exportFileName('', '', 'pdf')).toBe('document.pdf');
    expect(exportFileName('   ', '-_-', 'docx')).toBe('document.docx');
  });
});
