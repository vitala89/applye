import { Archetype, parseArchetypes, serializeArchetypes, archetypeNames } from './archetype';

describe('archetype', () => {
  it('wraps legacy string[] into objects with defaults', () => {
    expect(parseArchetypes('["Senior FE","Staff FE"]')).toEqual([
      { name: 'Senior FE', fit: 'primary', sellWhen: '' },
      { name: 'Staff FE', fit: 'primary', sellWhen: '' },
    ]);
  });

  it('round-trips the object shape', () => {
    const list: Archetype[] = [
      { name: 'Senior AI Eng', fit: 'secondary', sellWhen: 'JD wants agents' },
    ];
    expect(parseArchetypes(serializeArchetypes(list))).toEqual(list);
  });

  it('accepts a mixed legacy+object array', () => {
    const out = parseArchetypes('["Legacy",{"name":"New","fit":"adjacent","sellWhen":"x"}]');
    expect(out).toEqual([
      { name: 'Legacy', fit: 'primary', sellWhen: '' },
      { name: 'New', fit: 'adjacent', sellWhen: 'x' },
    ]);
  });

  it('coerces missing/invalid fit to primary and missing sellWhen to empty', () => {
    const out = parseArchetypes('[{"name":"A"},{"name":"B","fit":"weird"}]');
    expect(out).toEqual([
      { name: 'A', fit: 'primary', sellWhen: '' },
      { name: 'B', fit: 'primary', sellWhen: '' },
    ]);
  });

  it('returns [] for malformed, empty, or non-array input; skips nameless entries', () => {
    expect(parseArchetypes('not json')).toEqual([]);
    expect(parseArchetypes('')).toEqual([]);
    expect(parseArchetypes(null)).toEqual([]);
    expect(parseArchetypes(undefined)).toEqual([]);
    expect(parseArchetypes('{"name":"x"}')).toEqual([]); // object, not array
    expect(parseArchetypes('[{"fit":"primary"},{"name":"  "}]')).toEqual([]); // no usable names
  });

  it('serializeArchetypes drops blank-name entries and trims', () => {
    const json = serializeArchetypes([
      { name: '  Keep ', fit: 'primary', sellWhen: 'y' },
      { name: '   ', fit: 'primary', sellWhen: '' },
    ]);
    expect(JSON.parse(json)).toEqual([{ name: 'Keep', fit: 'primary', sellWhen: 'y' }]);
  });

  it('archetypeNames returns trimmed non-empty names', () => {
    expect(
      archetypeNames([
        { name: ' A ', fit: 'primary', sellWhen: '' },
        { name: '', fit: 'primary', sellWhen: '' },
      ]),
    ).toEqual(['A']);
  });
});
