import { parseSalaryRange, compareCompensation } from './compensation';

describe('parseSalaryRange', () => {
  it('parses a k-notation range with a currency symbol', () => {
    expect(parseSalaryRange('€80k - 100k')).toEqual({ min: 80000, max: 100000, currency: 'EUR' });
  });

  it('parses a plain range with a code', () => {
    expect(parseSalaryRange('80000 to 100000 EUR')).toEqual({
      min: 80000,
      max: 100000,
      currency: 'EUR',
    });
  });

  it('parses a single value (fills both bounds)', () => {
    expect(parseSalaryRange('$120,000')).toEqual({ min: 120000, max: 120000, currency: 'USD' });
  });

  it('parses k-notation single value', () => {
    expect(parseSalaryRange('90k USD')).toEqual({ min: 90000, max: 90000, currency: 'USD' });
  });

  it('returns null when no number is present', () => {
    expect(parseSalaryRange('Competitive')).toBeNull();
    expect(parseSalaryRange('')).toBeNull();
    expect(parseSalaryRange(null)).toBeNull();
  });
});

describe('compareCompensation', () => {
  const target = { min: '85000', max: '110000', currency: 'EUR' };

  it('is within when ranges overlap', () => {
    expect(compareCompensation(target, '90k - 105k EUR')).toBe('within');
  });

  it('is above when the job pays over the target max', () => {
    expect(compareCompensation(target, '120000 - 140000 EUR')).toBe('above');
  });

  it('is below when the job pays under the target min', () => {
    expect(compareCompensation(target, '60k - 70k EUR')).toBe('below');
  });

  it('is unknown when currencies differ', () => {
    expect(compareCompensation(target, '$120,000')).toBe('unknown');
  });

  it('is unknown when the job salary does not parse', () => {
    expect(compareCompensation(target, 'Competitive')).toBe('unknown');
  });

  it('is unknown when the target has no numbers', () => {
    expect(compareCompensation({ min: '', max: '', currency: 'EUR' }, '90k EUR')).toBe('unknown');
  });

  it('treats a single-bound target as a point', () => {
    expect(compareCompensation({ min: '100000', max: '', currency: 'EUR' }, '80k EUR')).toBe(
      'below',
    );
  });

  it('is unknown when a target bound is non-numeric text', () => {
    expect(compareCompensation({ min: 'N/A', max: '100000', currency: 'EUR' }, '50000 EUR')).toBe(
      'unknown',
    );
    expect(compareCompensation({ min: 'TBD', max: '', currency: 'EUR' }, '90k EUR')).toBe(
      'unknown',
    );
  });

  it('normalizes an inverted job range to min <= max', () => {
    expect(parseSalaryRange('100000 - 80000 EUR')).toEqual({
      min: 80000,
      max: 100000,
      currency: 'EUR',
    });
  });
});
