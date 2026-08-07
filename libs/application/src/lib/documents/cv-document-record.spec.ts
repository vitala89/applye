import { CV_STYLE_DEFAULT, type CvSection, type DocumentLibraryItem } from '@applye/core';
import { buildCvUpsert, cvSiblingsToUndefault } from './cv-document-record';

function doc(over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  return {
    id: 7,
    docType: 'cv',
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

const sections = [{ key: 'summary', order: 0, visible: true, text: 'Hi.' } as CvSection];

describe('buildCvUpsert', () => {
  const built = buildCvUpsert(doc(), {
    label: 'New label',
    sections,
    style: { ...CV_STYLE_DEFAULT, fontSizePt: 13 },
    themeId: 2,
    regionTag: 'us',
    isDefault: true,
  });

  it('takes the editor-owned fields from the save, not from the loaded row', () => {
    expect(built.label).toBe('New label');
    expect(built.themeId).toBe(2);
    expect(built.regionTag).toBe('us');
    expect(built.isDefault).toBe(true);
    expect(JSON.parse(built.contentJson as string)).toEqual({ sections });
    expect(JSON.parse(built.styleJson as string).fontSizePt).toBe(13);
  });

  it('carries the rest of the row over from the document', () => {
    expect(built).toMatchObject({
      id: 7,
      docType: 'cv',
      source: 'generated',
      templateId: 3,
      language: 'en',
      archetypeTag: 'generalist',
      inputHash: 'hash-in',
      modelUsed: 'model-x',
      tokensInput: 11,
      tokensOutput: 22,
    });
  });

  it('OMITS isApplicationDraft, so editing a wizard draft never promotes the row', () => {
    // The loaded row is a draft; the built input must not mention the flag at
    // all - `undefined` would not do, the key has to be absent.
    expect('isApplicationDraft' in built).toBe(false);
  });
});

describe('cvSiblingsToUndefault', () => {
  // Asymmetric on purpose: each row differs from "must be displaced" by exactly
  // ONE of the three conditions, so dropping any single check fails on its own
  // row rather than being hidden by a sibling that already fails another.
  const siblings: DocumentLibraryItem[] = [
    doc({ id: 1, isDefault: true, regionTag: 'de' }), // displaced
    doc({ id: 2, isDefault: true, regionTag: 'us' }), // wrong region
    doc({ id: 3, isDefault: false, regionTag: 'de' }), // not a default
    doc({ id: 7, isDefault: true, regionTag: 'de' }), // the document itself
    doc({ id: 4, isDefault: true, regionTag: 'de' }), // displaced
  ];

  it('displaces only same-region defaults that are not this document', () => {
    expect(cvSiblingsToUndefault(siblings, 7, 'de').map((s) => s.id)).toEqual([1, 4]);
  });

  it('never displaces the document itself, even when it already holds the flag', () => {
    expect(cvSiblingsToUndefault(siblings, 7, 'de').some((s) => s.id === 7)).toBe(false);
  });

  it('treats the region as significant - a different region displaces nothing here', () => {
    expect(cvSiblingsToUndefault(siblings, 7, 'uk')).toEqual([]);
  });

  it('returns an empty list rather than throwing when there are no siblings', () => {
    expect(cvSiblingsToUndefault([], 7, 'de')).toEqual([]);
  });
});
