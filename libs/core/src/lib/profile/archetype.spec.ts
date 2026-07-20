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

import { archetypeWords, archetypeKeywordBag, tierRank, matchArchetype } from './archetype';

describe('archetypeWords', () => {
  it('lowercases, drops <3-char words and stopwords, dedupes', () => {
    expect(archetypeWords('Senior Frontend Engineer and the FE')).toEqual([
      'senior',
      'frontend',
      'engineer',
    ]);
  });
  it('keeps +/# tokens of length >=3, drops <3-char tokens, [] for empty', () => {
    // "go" (2) dropped, "and" stopword dropped, "c++" (3) kept
    expect(archetypeWords('C++ and Go')).toEqual(['c++']);
    expect(archetypeWords('')).toEqual([]);
  });
});

describe('archetypeKeywordBag', () => {
  it('flattens name words across archetypes and dedupes', () => {
    const bag = archetypeKeywordBag([
      { name: 'Frontend Engineer', fit: 'primary', sellWhen: '' },
      { name: 'Backend Engineer', fit: 'secondary', sellWhen: '' },
    ]);
    expect(bag).toEqual(['frontend', 'engineer', 'backend']);
  });
});

describe('tierRank', () => {
  it('ranks primary > secondary > adjacent', () => {
    expect(tierRank('primary')).toBeGreaterThan(tierRank('secondary'));
    expect(tierRank('secondary')).toBeGreaterThan(tierRank('adjacent'));
  });
});

describe('matchArchetype', () => {
  const list: Archetype[] = [
    { name: 'Frontend Engineer', fit: 'secondary', sellWhen: 'react design systems' },
    { name: 'Staff Engineer', fit: 'primary', sellWhen: 'platform scale' },
    { name: 'Product Designer', fit: 'adjacent', sellWhen: '' },
  ];

  it('returns null when no archetype name hits (sellWhen alone never matches)', () => {
    expect(matchArchetype('React design systems specialist', list)).toBeNull();
  });

  it('returns null when there are no archetypes', () => {
    expect(matchArchetype('Frontend Engineer', [])).toBeNull();
  });

  it('picks the strongest tier when several names match', () => {
    // both "Frontend Engineer" (secondary) and "Staff Engineer" (primary) share "engineer"
    const m = matchArchetype('Staff Frontend Engineer', list);
    expect(m?.fit).toBe('primary');
    expect(m?.name).toBe('Staff Engineer');
  });

  it('within the same tier, higher coverage wins', () => {
    const same: Archetype[] = [
      { name: 'Frontend Engineer', fit: 'primary', sellWhen: '' }, // partial: only "engineer" hits -> 1/2
      { name: 'Senior Engineer', fit: 'primary', sellWhen: '' }, // full: both hit -> 2/2
    ];
    const m = matchArchetype('Senior Engineer role', same);
    expect(m?.name).toBe('Senior Engineer');
    expect(m?.coverage).toBe(1);
  });

  it('reports coverage in 0..1', () => {
    const m = matchArchetype('Product Designer at Acme', list);
    expect(m?.fit).toBe('adjacent');
    expect(m?.coverage).toBeGreaterThan(0);
    expect(m?.coverage).toBeLessThanOrEqual(1);
  });
});

describe('matchArchetype word-boundary matching', () => {
  const dataEng: Archetype[] = [{ name: 'Data Engineer', fit: 'primary', sellWhen: '' }];

  it('does not substring-match a name word inside a longer word', () => {
    // "data" must not hit "database"; "engineer" absent -> no match at all
    expect(matchArchetype('Database Administrator', dataEng)).toBeNull();
  });

  it('matches a name word on a whole-word boundary', () => {
    expect(matchArchetype('Senior Data Engineer', dataEng)?.fit).toBe('primary');
  });

  it('matches symbol-carrying tokens like c++ as whole words', () => {
    const list: Archetype[] = [{ name: 'C++ Engineer', fit: 'primary', sellWhen: '' }];
    expect(matchArchetype('Senior C++ Engineer', list)?.fit).toBe('primary');
  });
});

describe('matchArchetype sellWhen tie-break', () => {
  // Same tier, identical name coverage (both names fully hit) -> the archetype
  // whose sellWhen words also appear wins. Ordered so that WITHOUT the sellWhen
  // bonus the first entry would win the tie; the bonus must flip it to the second.
  const list: Archetype[] = [
    { name: 'Platform Engineer', fit: 'primary', sellWhen: '' },
    { name: 'Backend Engineer', fit: 'primary', sellWhen: 'platform' },
  ];

  it('breaks an equal-coverage tie toward the archetype whose sellWhen matches', () => {
    const m = matchArchetype('Senior Backend Platform Engineer', list);
    expect(m?.name).toBe('Backend Engineer');
    expect(m?.fit).toBe('primary');
  });
});
