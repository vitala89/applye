import { encodeLocalMarkets, LocalMarket, parseLocalMarkets } from './local-market';

describe('parseLocalMarkets', () => {
  it('reads a JSON array and drops codes outside the vocabulary', () => {
    expect(parseLocalMarkets('["de","ua"]')).toEqual(['de', 'ua']);
    expect(parseLocalMarkets('["de","atlantis"]')).toEqual(['de']);
  });

  it('drops fr as an unknown code (not a pickable market - no source yet)', () => {
    expect(parseLocalMarkets('["de","fr"]')).toEqual(['de']);
  });

  it('treats empty, null and an empty array as no local market', () => {
    expect(parseLocalMarkets(null)).toEqual([]);
    expect(parseLocalMarkets(undefined)).toEqual([]);
    expect(parseLocalMarkets('')).toEqual([]);
    expect(parseLocalMarkets('  ')).toEqual([]);
    expect(parseLocalMarkets('[]')).toEqual([]);
  });

  it('reads the legacy single scalar written by the first picker', () => {
    expect(parseLocalMarkets('de')).toEqual(['de']);
    expect(parseLocalMarkets('atlantis')).toEqual([]);
  });

  it('survives malformed JSON rather than throwing', () => {
    expect(parseLocalMarkets('{"de":true}')).toEqual([]);
    expect(parseLocalMarkets('["de",')).toEqual([]);
  });

  it('round-trips through encodeLocalMarkets', () => {
    const markets: LocalMarket[] = ['de', 'ua', 'pl'];
    expect(parseLocalMarkets(encodeLocalMarkets(markets))).toEqual(markets);
    expect(parseLocalMarkets(encodeLocalMarkets([]))).toEqual([]);
  });
});
