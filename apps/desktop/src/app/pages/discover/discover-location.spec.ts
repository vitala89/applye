import { classifyLoc } from './discover-location';

/**
 * These lock the location recognition rules that kept regressing: US cities and
 * states must land in North America (not Other), South America must be its own
 * region (not Other), and ambiguous 2-letter codes must not cross-classify.
 */
describe('classifyLoc', () => {
  describe('United States', () => {
    it.each([
      ['New York, NY', 'New York'],
      ['San Francisco, CA', 'San Francisco'],
      ['Chicago, IL', 'Chicago'],
      ['Austin, TX', 'Austin'],
      ['Seattle, WA', 'Seattle'],
    ])('city %s -> United States', (input, city) => {
      const loc = classifyLoc(input);
      expect(loc.country).toBe('United States');
      expect(loc.region).toBe('namerica');
      expect(loc.city).toBe(city);
    });

    it.each(['Denver, CO', 'Boise, ID', 'Columbus, OH', 'Remote - Ohio', 'Portland, OR'])(
      'unlisted city with US state %s -> United States',
      (input) => {
        const loc = classifyLoc(input);
        expect(loc.country).toBe('United States');
        expect(loc.region).toBe('namerica');
      },
    );

    it('CA resolves to the US (California), not Canada', () => {
      expect(classifyLoc('Los Angeles, CA').country).toBe('United States');
    });

    it('spelled-out and code country names', () => {
      expect(classifyLoc('Remote (USA)').country).toBe('United States');
      expect(classifyLoc('United States').country).toBe('United States');
    });
  });

  describe('Canada', () => {
    it.each([
      ['Toronto, ON', 'Toronto'],
      ['Vancouver, BC', 'Vancouver'],
      ['Montreal, QC', 'Montreal'],
    ])('%s -> Canada', (input, city) => {
      const loc = classifyLoc(input);
      expect(loc.country).toBe('Canada');
      expect(loc.region).toBe('namerica');
      expect(loc.city).toBe(city);
    });

    it('bare province code -> Canada', () => {
      expect(classifyLoc('Calgary, AB').country).toBe('Canada');
    });
  });

  describe('South America', () => {
    it.each([
      ['Sao Paulo, Brazil', 'Brazil'],
      ['São Paulo, Brasil', 'Brazil'],
      ['Buenos Aires, Argentina', 'Argentina'],
      ['Montevideo, Uruguay', 'Uruguay'],
      ['Santiago, Chile', 'Chile'],
      ['Bogota, Colombia', 'Colombia'],
    ])('%s -> %s / samerica', (input, country) => {
      const loc = classifyLoc(input);
      expect(loc.country).toBe(country);
      expect(loc.region).toBe('samerica');
    });

    it('LATAM generic -> Latin America / samerica', () => {
      const loc = classifyLoc('Remote - LATAM');
      expect(loc.region).toBe('samerica');
      expect(loc.country).toBe('Latin America');
    });
  });

  describe('Europe', () => {
    it.each([
      ['Berlin, Germany', 'Germany', 'Berlin', 'europe'],
      ['Munich', 'Germany', 'Munich', 'europe'],
      ['Berlin, DE', 'Germany', 'Berlin', 'europe'],
      ['Oslo, Norway', 'Norway', 'Oslo', 'europe'],
      ['Oslo', 'Norway', 'Oslo', 'europe'],
      ['London, UK', 'United Kingdom', 'London', 'europe'],
      ['Amsterdam, NL', 'Netherlands', 'Amsterdam', 'europe'],
    ])('%s -> %s/%s', (input, country, city, region) => {
      const loc = classifyLoc(input);
      expect(loc.country).toBe(country);
      expect(loc.city).toBe(city);
      expect(loc.region).toBe(region);
    });

    it('generic Europe / EU', () => {
      expect(classifyLoc('Remote (Europe)').region).toBe('europe');
      expect(classifyLoc('EMEA').region).toBe('europe');
    });
  });

  describe('other regions', () => {
    it('Asia, Oceania, MENA, Africa', () => {
      expect(classifyLoc('Bangalore, India').region).toBe('asia');
      expect(classifyLoc('Sydney, Australia').region).toBe('oceania');
      expect(classifyLoc('Dubai, UAE').region).toBe('mena');
      expect(classifyLoc('Cape Town, South Africa').region).toBe('africa');
    });
  });

  describe('Other bucket (unrecognized)', () => {
    it.each(['', null, '   ', 'Remote', 'Anywhere', 'Worldwide', 'Remote - Global', 'Other'])(
      '%s -> empty country / other region',
      (input) => {
        const loc = classifyLoc(input);
        expect(loc.country).toBe('');
        expect(loc.region).toBe('other');
      },
    );
  });

  describe('no false positives from short codes / substrings', () => {
    it('English words that contain codes do not trigger a country', () => {
      // "in" (India), "is" (Iceland), "no" (Norway), "or" (Oregon) as bare words
      expect(classifyLoc('Engineering role, hybrid preferred').country).toBe('');
      expect(classifyLoc('This is a remote or hybrid position').country).toBe('');
    });

    it('city tokens match whole words only', () => {
      // "rio" must not match inside "priorities"
      expect(classifyLoc('Team priorities lead').country).toBe('');
    });
  });
});
