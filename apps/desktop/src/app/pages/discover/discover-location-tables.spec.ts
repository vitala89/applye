import { COUNTRY_DEFS, CA_PROVINCES, US_STATES } from './discover-location-tables';
import { classifyLoc } from './discover-location';

/** The seven entries the table calls region-generic pseudo-countries. */
const GENERIC = [
  'Europe',
  'North America',
  'Latin America',
  'Asia',
  'Middle East',
  'Africa',
  'Oceania',
];

describe('discover location tables', () => {
  /// `classifyLoc` walks COUNTRY_DEFS in order and returns the first name or
  /// code that matches, so a generic entry placed before a real country would
  /// silently swallow it: "Asia" appearing before Singapore turns every
  /// Singapore posting into the Asia bucket. The table says these must stay
  /// last; nothing enforced it.
  it('keeps the region-generic entries after every real country', () => {
    const firstGeneric = COUNTRY_DEFS.findIndex((d) => GENERIC.includes(d.name));
    const lastSpecific = COUNTRY_DEFS.map((d) => GENERIC.includes(d.name)).lastIndexOf(false);

    expect(firstGeneric).toBeGreaterThan(lastSpecific);
    expect(
      COUNTRY_DEFS.slice(firstGeneric)
        .map((d) => d.name)
        .sort(),
    ).toEqual([...GENERIC].sort());
  });

  /// Two countries claiming the same city token means the earlier one wins for
  /// every posting naming that city, and nothing at the call site can tell.
  it('gives no city token to two different countries', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const def of COUNTRY_DEFS) {
      for (const city of def.cities ?? []) {
        for (const token of city.tokens) {
          const prev = owner.get(token);
          if (prev && prev !== def.name) clashes.push(`${token}: ${prev} vs ${def.name}`);
          owner.set(token, def.name);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  /// Same argument for the country codes: a duplicate ISO2 makes "berlin, xx"
  /// resolve to whichever country happens to sit earlier in the table.
  it('gives no country code to two different countries', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const def of COUNTRY_DEFS) {
      for (const code of def.codes ?? []) {
        const prev = owner.get(code);
        if (prev && prev !== def.name) clashes.push(`${code}: ${prev} vs ${def.name}`);
        owner.set(code, def.name);
      }
    }
    expect(clashes).toEqual([]);
  });

  /// The two documented collisions, asserted as behaviour rather than as a
  /// comment: CA is California and not Canada, and NL is the Netherlands and
  /// not Newfoundland. Both are the reason those codes sit where they do.
  it('resolves the documented code collisions the way the tables intend', () => {
    expect(US_STATES.find((s) => s.code === 'CA')?.name).toBe('california');
    expect(CA_PROVINCES.some((p) => p.code === 'NL')).toBe(false);
    expect(classifyLoc('San Francisco, CA')).toEqual({
      country: 'United States',
      city: 'San Francisco',
      region: 'namerica',
    });
    expect(classifyLoc('Remote, NL')).toEqual({
      country: 'Netherlands',
      city: '',
      region: 'europe',
    });
  });
});
