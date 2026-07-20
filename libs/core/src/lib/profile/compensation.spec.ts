import { parseSalaryRange, compareCompensation, extractSalaryFromJd } from './compensation';

describe('parseSalaryRange', () => {
  it('parses a k-notation range with a currency symbol', () => {
    expect(parseSalaryRange('€80k - 100k')).toEqual({
      min: 80000,
      max: 100000,
      currency: 'EUR',
      period: '',
    });
  });

  it('parses a plain range with a code', () => {
    expect(parseSalaryRange('80000 to 100000 EUR')).toEqual({
      min: 80000,
      max: 100000,
      currency: 'EUR',
      period: '',
    });
  });

  it('parses a single value (fills both bounds)', () => {
    expect(parseSalaryRange('$120,000')).toEqual({
      min: 120000,
      max: 120000,
      currency: 'USD',
      period: '',
    });
  });

  it('parses k-notation single value', () => {
    expect(parseSalaryRange('90k USD')).toEqual({
      min: 90000,
      max: 90000,
      currency: 'USD',
      period: '',
    });
  });

  it('returns null when no number is present', () => {
    expect(parseSalaryRange('Competitive')).toBeNull();
    expect(parseSalaryRange('')).toBeNull();
    expect(parseSalaryRange(null)).toBeNull();
  });
});

describe('compareCompensation', () => {
  const target = { min: '85000', max: '110000', currency: 'EUR', period: 'year' };

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
    expect(
      compareCompensation({ min: '', max: '', currency: 'EUR', period: 'year' }, '90k EUR'),
    ).toBe('unknown');
  });

  it('treats a single-bound target as a point', () => {
    expect(
      compareCompensation({ min: '100000', max: '', currency: 'EUR', period: 'year' }, '80k EUR'),
    ).toBe('below');
  });

  it('is unknown when a target bound is non-numeric text', () => {
    expect(
      compareCompensation(
        { min: 'N/A', max: '100000', currency: 'EUR', period: 'year' },
        '50000 EUR',
      ),
    ).toBe('unknown');
    expect(
      compareCompensation({ min: 'TBD', max: '', currency: 'EUR', period: 'year' }, '90k EUR'),
    ).toBe('unknown');
  });

  it('normalizes an inverted job range to min <= max', () => {
    expect(parseSalaryRange('100000 - 80000 EUR')).toEqual({
      min: 80000,
      max: 100000,
      currency: 'EUR',
      period: '',
    });
  });
});

describe('period-aware comparison', () => {
  it('parses a per-year / per-month / per-hour period', () => {
    expect(parseSalaryRange('80k - 100k EUR per year')!.period).toBe('year');
    expect(parseSalaryRange('5000 EUR per month')!.period).toBe('month');
    expect(parseSalaryRange('50 EUR per hour')!.period).toBe('hour');
    expect(parseSalaryRange('80000 EUR')!.period).toBe('');
  });

  it('normalizes a monthly job salary to annual before comparing', () => {
    const target = { min: '85000', max: '110000', currency: 'EUR', period: 'year' };
    expect(compareCompensation(target, '8000 EUR per month')).toBe('within'); // 96000/yr
    expect(compareCompensation(target, '5000 EUR per month')).toBe('below'); // 60000/yr
  });

  it('normalizes a monthly target against an annual job', () => {
    const target = { min: '7000', max: '9000', currency: 'EUR', period: 'month' };
    expect(compareCompensation(target, '120000 EUR per year')).toBe('above'); // 84000-108000/yr
  });

  it('is unknown for daily/hourly job pay (not reliably annualized)', () => {
    const target = { min: '85000', max: '110000', currency: 'EUR', period: 'year' };
    expect(compareCompensation(target, '400 EUR per day')).toBe('unknown');
    expect(compareCompensation(target, '50 EUR per hour')).toBe('unknown');
  });
});

describe('extractSalaryFromJd', () => {
  it('extracts a currency-bearing salary line', () => {
    const jd = 'About us...\nSalary: 80,000 - 100,000 EUR per year\nBenefits: 401k plan';
    expect(extractSalaryFromJd(jd)).toContain('80,000');
    expect(extractSalaryFromJd(jd)).toContain('EUR');
  });

  it('returns null when no currency marker is present (ignores 401k plan)', () => {
    expect(extractSalaryFromJd('We offer a 401k plan and 25 days holiday.')).toBeNull();
    expect(extractSalaryFromJd('Great team of 50 engineers.')).toBeNull();
    expect(extractSalaryFromJd('')).toBeNull();
    expect(extractSalaryFromJd(null)).toBeNull();
  });

  it('prefers a line naming salary over another currency line', () => {
    const jd = 'Budget of $2M.\nCompensation: $120,000 - $150,000.';
    expect(extractSalaryFromJd(jd)).toContain('120,000');
  });
});
