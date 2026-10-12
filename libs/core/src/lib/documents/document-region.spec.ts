import { type DocumentRegionTag, inferDocumentRegion } from './document-region';

describe('inferDocumentRegion', () => {
  it('uses German document conventions for a German posting', () => {
    const region: DocumentRegionTag = inferDocumentRegion({ language: 'de' });

    expect(region).toBe('de');
  });

  it('uses the neutral conventions for every other language', () => {
    expect(inferDocumentRegion({ language: 'en' })).toBe('generic');
    expect(inferDocumentRegion({ language: 'us' })).toBe('generic');
    expect(inferDocumentRegion({ language: 'uk' })).toBe('generic');
    expect(inferDocumentRegion({ language: 'DE' })).toBe('generic');
    expect(inferDocumentRegion({})).toBe('generic');
  });

  it('uses the neutral conventions when there is no posting', () => {
    expect(inferDocumentRegion(null)).toBe('generic');
  });
});
