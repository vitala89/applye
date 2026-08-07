import {
  COVER_LETTER_STYLE_DEFAULT,
  type CoverLetterContent,
  type DocumentLibraryItem,
} from '@applye/core';
import { buildCoverLetterUpsert } from './cover-letter-record';

function doc(over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  return {
    id: 7,
    docType: 'cover_letter',
    source: 'generated',
    label: 'Old label',
    templateId: 3,
    themeId: 1,
    regionTag: 'de',
    language: 'en',
    archetypeTag: 'generalist',
    isDefault: false,
    isApplicationDraft: true,
    inputHash: 'hash-in',
    modelUsed: 'model-x',
    tokensInput: 11,
    tokensOutput: 22,
    ...over,
  } as DocumentLibraryItem;
}

const content = {
  subject: 'Application',
  bodyParagraphs: ['One.'],
} as CoverLetterContent;

describe('buildCoverLetterUpsert', () => {
  const built = buildCoverLetterUpsert(doc(), {
    label: 'New label',
    content,
    style: { ...COVER_LETTER_STYLE_DEFAULT, fontSizePt: 13 },
    regionTag: 'us',
    isDefault: true,
  });

  it('takes the editor-owned fields from the save, not from the loaded row', () => {
    expect(built.label).toBe('New label');
    expect(built.regionTag).toBe('us');
    expect(built.isDefault).toBe(true);
  });

  it('serializes the letter as-is, with no wrapper around it', () => {
    expect(JSON.parse(built.contentJson as string)).toEqual(content);
  });

  it('serializes the style the editor holds', () => {
    expect(JSON.parse(built.styleJson as string).fontSizePt).toBe(13);
  });

  it('carries the untouched row fields over from the document', () => {
    expect(built.id).toBe(7);
    expect(built.source).toBe('generated');
    expect(built.language).toBe('en');
    expect(built.archetypeTag).toBe('generalist');
    expect(built.inputHash).toBe('hash-in');
    expect(built.modelUsed).toBe('model-x');
    expect(built.tokensInput).toBe(11);
    expect(built.tokensOutput).toBe(22);
  });

  it('always writes the cover_letter type, whatever the row claimed', () => {
    expect(
      buildCoverLetterUpsert(doc({ docType: 'cv' }), {
        label: '',
        content,
        style: COVER_LETTER_STYLE_DEFAULT,
        regionTag: 'de',
        isDefault: false,
      }).docType,
    ).toBe('cover_letter');
  });

  it('omits templateId and themeId - a letter has neither', () => {
    expect('templateId' in built).toBe(false);
    expect('themeId' in built).toBe(false);
  });

  it('omits isApplicationDraft, so reviewing a wizard draft does not promote it', () => {
    expect('isApplicationDraft' in built).toBe(false);
  });
});
