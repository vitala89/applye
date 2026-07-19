import { encodeGeoScopes, parseGeoScopes } from './geo-scope';

describe('parseGeoScopes', () => {
  it('parses a JSON array of known keys', () => {
    expect(parseGeoScopes('["europe","asia"]')).toEqual(['europe', 'asia']);
  });

  it('drops unknown keys from a JSON array', () => {
    expect(parseGeoScopes('["europe","bogus","asia"]')).toEqual(['europe', 'asia']);
  });

  it('empty/null/whitespace means worldwide (no restriction)', () => {
    expect(parseGeoScopes('')).toEqual([]);
    expect(parseGeoScopes(null)).toEqual([]);
    expect(parseGeoScopes(undefined)).toEqual([]);
    expect(parseGeoScopes('   ')).toEqual([]);
    expect(parseGeoScopes('[]')).toEqual([]);
  });

  describe('legacy scalar back-compat', () => {
    it.each([
      ['europe', ['europe']],
      ['eu', ['europe']],
      ['usa', ['namerica']],
      ['asia', ['asia']],
      ['worldwide', []],
      ['custom', []],
    ])('%s -> %o', (input, expected) => {
      expect(parseGeoScopes(input)).toEqual(expected);
    });
  });
});

describe('encodeGeoScopes', () => {
  it('round-trips through parseGeoScopes', () => {
    const scopes = encodeGeoScopes(['samerica', 'oceania']);
    expect(parseGeoScopes(scopes)).toEqual(['samerica', 'oceania']);
  });

  it('encodes an empty selection as an empty array', () => {
    expect(encodeGeoScopes([])).toBe('[]');
  });
});
