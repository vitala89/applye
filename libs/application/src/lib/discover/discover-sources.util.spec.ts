import {
  MarketFilterable,
  narrowBuiltinsByMarkets,
  sourceServesMarkets,
} from './discover-sources.util';

function src(geoTagsJson: string | null, isEnabled = false): MarketFilterable {
  return { geoTagsJson, isEnabled };
}

describe('sourceServesMarkets', () => {
  it('matches a source tagged for one of the selected markets', () => {
    expect(sourceServesMarkets(src('["de"]'), ['de'])).toBe(true);
    expect(sourceServesMarkets(src('["de"]'), ['pl', 'de'])).toBe(true);
    expect(sourceServesMarkets(src('["de"]'), ['pl'])).toBe(false);
  });

  it('always matches a worldwide source', () => {
    expect(sourceServesMarkets(src('["worldwide"]'), ['ua'])).toBe(true);
    expect(sourceServesMarkets(src('["us","worldwide"]'), ['ru'])).toBe(true);
  });

  it('treats a missing or unreadable tag list as serving no market', () => {
    expect(sourceServesMarkets(src(null), ['de'])).toBe(false);
    expect(sourceServesMarkets(src('[]'), ['de'])).toBe(false);
    expect(sourceServesMarkets(src('not json'), ['de'])).toBe(false);
    expect(sourceServesMarkets(src('{"de":true}'), ['de'])).toBe(false);
  });
});

describe('narrowBuiltinsByMarkets', () => {
  const de = src('["de"]');
  const ua = src('["ua"]');
  const worldwide = src('["worldwide"]');

  it('does not narrow when no market is selected', () => {
    expect(narrowBuiltinsByMarkets([de, ua, worldwide], [])).toEqual([de, ua, worldwide]);
  });

  it('keeps sources for the selected markets plus worldwide ones', () => {
    expect(narrowBuiltinsByMarkets([de, ua, worldwide], ['de'])).toEqual([de, worldwide]);
    expect(narrowBuiltinsByMarkets([de, ua, worldwide], ['de', 'ua'])).toEqual([de, ua, worldwide]);
  });

  it('never hides an enabled source, whatever its tags', () => {
    // The scan runs every enabled source, so one hidden here would keep
    // fetching with no way for the user to see or stop it.
    const enabledElsewhere = src('["ru"]', true);
    expect(narrowBuiltinsByMarkets([de, enabledElsewhere], ['de'])).toEqual([de, enabledElsewhere]);
    // Even an untagged source stays visible while it is on.
    const enabledUntagged = src(null, true);
    expect(narrowBuiltinsByMarkets([enabledUntagged], ['de'])).toEqual([enabledUntagged]);
  });

  it('hides a disabled source that serves none of the selected markets', () => {
    expect(narrowBuiltinsByMarkets([de, ua], ['de'])).toEqual([de]);
  });
});
