import type { DocumentLibraryItem } from '@applye/core';
import { siblingsToUndefault } from './document-record';

function item(partial: Partial<DocumentLibraryItem> & { id: number }): DocumentLibraryItem {
  return {
    docType: 'cover_letter',
    source: 'manual',
    isDefault: false,
    regionTag: 'generic',
    ...partial,
  } as DocumentLibraryItem;
}

describe('siblingsToUndefault', () => {
  it('picks the other default rows in the same region', () => {
    const rows = [
      item({ id: 2, isDefault: true, regionTag: 'de' }),
      item({ id: 3, isDefault: true, regionTag: 'de' }),
    ];
    expect(siblingsToUndefault(rows, 1, 'de').map((r) => r.id)).toEqual([2, 3]);
  });

  it('excludes the document claiming the flag, so re-saving keeps its own', () => {
    const rows = [item({ id: 1, isDefault: true, regionTag: 'de' })];
    expect(siblingsToUndefault(rows, 1, 'de')).toEqual([]);
  });

  it('leaves defaults in other regions alone - the flag is per region', () => {
    const rows = [
      item({ id: 2, isDefault: true, regionTag: 'us' }),
      item({ id: 3, isDefault: true, regionTag: 'de' }),
    ];
    expect(siblingsToUndefault(rows, 1, 'de').map((r) => r.id)).toEqual([3]);
  });

  it('ignores rows that are not the default', () => {
    const rows = [item({ id: 2, isDefault: false, regionTag: 'de' })];
    expect(siblingsToUndefault(rows, 1, 'de')).toEqual([]);
  });

  it('returns an empty list for an empty library', () => {
    expect(siblingsToUndefault([], 1, 'de')).toEqual([]);
  });
});
