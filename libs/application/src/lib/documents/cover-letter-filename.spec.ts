import { suggestCoverLetterFilename } from './cover-letter-filename';

describe('suggestCoverLetterFilename', () => {
  /** Hyphens are already safe, so they survive; the spaces around them do not.
   * That is the original behaviour, kept deliberately. */
  it('lowercases and collapses everything the filesystem should not carry', () => {
    expect(suggestCoverLetterFilename('Acme GmbH - Anschreiben', 'pdf')).toBe(
      'acme_gmbh_-_anschreiben.pdf',
    );
    expect(suggestCoverLetterFilename('Résumé für Acme!', 'pdf')).toBe('r_sum_f_r_acme.pdf');
  });

  it('keeps the characters that are already safe', () => {
    expect(suggestCoverLetterFilename('cover-letter_v2', 'docx')).toBe('cover-letter_v2.docx');
  });

  it('falls back for an unlabelled document', () => {
    expect(suggestCoverLetterFilename(null, 'pdf')).toBe('cover-letter.pdf');
    expect(suggestCoverLetterFilename('', 'pdf')).toBe('cover-letter.pdf');
  });

  /**
   * A deliberate difference from the code this replaced: a label made entirely
   * of punctuation collapsed to an empty stem and suggested a file called
   * `.pdf`, which most systems treat as hidden and nameless.
   */
  it('falls back when the label collapses to nothing', () => {
    expect(suggestCoverLetterFilename('***', 'pdf')).toBe('cover-letter.pdf');
  });
});
