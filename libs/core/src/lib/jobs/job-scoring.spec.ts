import { SKILL_DICT, computeRawScore, detectSkills } from './job-scoring';

describe('detectSkills', () => {
  it('finds the technologies a posting names', () => {
    expect(detectSkills('We use Angular and PostgreSQL, with Docker for local dev.')).toEqual([
      'Angular',
      'PostgreSQL',
      'Docker',
    ]);
  });

  it('returns them in dictionary order, not order of appearance', () => {
    // Docker sits after Angular in SKILL_DICT; the posting names it first.
    expect(detectSkills('Docker, then Angular.')).toEqual(['Angular', 'Docker']);
  });

  /**
   * Three characters is the cutoff, and `SQL` sits exactly on it: whole-word, so
   * "MySQL" names MySQL and not also SQL. One character either way in that
   * comparison changes what a posting is read as saying.
   */
  it('treats a three-letter name as whole-word', () => {
    expect(detectSkills('MySQL only')).toEqual(['MySQL']);
    expect(detectSkills('SQL and MySQL')).toEqual(['SQL', 'MySQL']);
  });

  it('is case-insensitive for ordinary names', () => {
    expect(detectSkills('angular, TYPESCRIPT')).toEqual(['Angular', 'TypeScript']);
  });

  /**
   * Substring matching is what lets a longer name find its variants, and is
   * safe precisely because those names are long enough not to collide.
   */
  it('matches a longer name inside a word', () => {
    expect(detectSkills('ReactJS on the front end')).toContain('React');
  });

  /**
   * The other half of the rule, and the reason it exists. `Go`, `C#` and `.NET`
   * would be everywhere as substrings, so they match only as whole words - and
   * against the raw text, so a lowercase word can never trigger an uppercase
   * token by accident.
   */
  it('matches short and symbol-carrying names only as whole words', () => {
    expect(detectSkills('We are going to Django-fy the app.')).toEqual([]);
    expect(detectSkills('Go and C# and .NET')).toEqual(['Go', 'C#', '.NET']);
    expect(detectSkills('golang')).toEqual([]);
    expect(detectSkills('dotnet')).toEqual([]);
  });

  it('caps the list at ten', () => {
    expect(detectSkills(SKILL_DICT.join(' ')).length).toBe(10);
  });

  it('finds nothing in a posting that names nothing', () => {
    expect(detectSkills('A great opportunity for a motivated individual.')).toEqual([]);
    expect(detectSkills('')).toEqual([]);
  });
});

describe('computeRawScore', () => {
  const KW = ['angular', 'typescript'];

  /**
   * Null is not zero. "We cannot say" is what an empty profile means, and the
   * detail screen renders that differently from a poor match.
   */
  it('declines to score a profile with no keywords', () => {
    expect(computeRawScore('angular typescript', [], [], 'primary')).toBeNull();
  });

  it('scores coverage of the profile keywords over the posting', () => {
    const none = computeRawScore('a posting about nothing', KW, [], null);
    const half = computeRawScore('angular', KW, [], null);
    const full = computeRawScore('angular typescript', KW, [], null);
    expect(none).toBeLessThan(half as number);
    expect(half).toBeLessThan(full as number);
  });

  it('matches keywords case-insensitively', () => {
    expect(computeRawScore('ANGULAR TYPESCRIPT', KW, [], null)).toBe(
      computeRawScore('angular typescript', KW, [], null),
    );
  });

  /**
   * The *denominator* saturates at ten, so a profile listing twenty keywords
   * does not need twenty hits to score well - ten of twenty scores exactly what
   * ten of ten does.
   */
  it('measures coverage against at most ten keywords', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    const ten = twenty.slice(0, 10);
    expect(computeRawScore(ten.join(' '), twenty, [], null)).toBe(
      computeRawScore(ten.join(' '), ten, [], null),
    );
  });

  /**
   * The numerator does not saturate with it, so matching more than ten keywords
   * puts coverage above 1 and the score above its formula range. The clamp is
   * what absorbs that, and it is the only thing that does.
   */
  it('lets a match beyond ten keywords run into the ceiling rather than past it', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    expect(computeRawScore(twenty.slice(0, 10).join(' '), twenty, [], null)).toBe(85);
    expect(computeRawScore(twenty.join(' '), twenty, [], null)).toBe(97);
  });

  it('adds a bonus per detected skill, up to six of them', () => {
    const bare = computeRawScore('angular', KW, [], null) as number;
    const three = computeRawScore('angular', KW, ['a', 'b', 'c'], null) as number;
    const six = computeRawScore('angular', KW, ['a', 'b', 'c', 'd', 'e', 'f'], null) as number;
    const nine = computeRawScore(
      'angular',
      KW,
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      null,
    ) as number;
    expect(three - bare).toBe(9);
    expect(six - bare).toBe(18);
    expect(nine).toBe(six);
  });

  /**
   * Each tier is worth a different amount, and asserting only one of them would
   * let every tier collapse onto that value while the ordering still read right.
   */
  it('boosts by archetype tier: primary 12, secondary 6, adjacent 0', () => {
    const at = (fit: 'primary' | 'secondary' | 'adjacent' | null) =>
      computeRawScore('a posting about nothing', KW, [], fit) as number;
    expect(at('primary') - at(null)).toBe(12);
    expect(at('secondary') - at(null)).toBe(6);
    expect(at('adjacent')).toBe(at(null));
  });

  /**
   * Nothing deterministic claims a perfect fit - the AI score is what earns the
   * top of the range.
   *
   * The written clamp is `20..97`, but **the floor is unreachable**: the formula
   * starts at 30 and every other term is non-negative, so the worst possible
   * posting scores 30. This pins the floor that actually occurs, so that a
   * change to the base or to a term that could drop below it fails here.
   */
  it('bottoms out at 30 for a posting matching nothing, and tops out at 97', () => {
    expect(computeRawScore('nothing here', ['zzz'], [], null)).toBe(30);

    const ceiling = computeRawScore(
      'angular typescript',
      KW,
      ['a', 'b', 'c', 'd', 'e', 'f'],
      'primary',
    );
    expect(ceiling).toBe(97);
  });

  it('returns a whole number', () => {
    const score = computeRawScore('angular', KW, ['a'], 'secondary') as number;
    expect(Number.isInteger(score)).toBe(true);
  });
});
