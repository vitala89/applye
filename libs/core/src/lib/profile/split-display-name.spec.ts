import { splitDisplayName } from './split-display-name';

describe('splitDisplayName', () => {
  it('splits a plain two-token name confidently', () => {
    expect(splitDisplayName('Anna Kowalska')).toEqual({
      firstName: 'Anna',
      lastName: 'Kowalska',
      confident: true,
    });
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(splitDisplayName('  Anna   Kowalska  ')).toEqual({
      firstName: 'Anna',
      lastName: 'Kowalska',
      confident: true,
    });
  });

  it('treats a hyphenated surname as one token', () => {
    expect(splitDisplayName('Anna Nowak-Kowalska')).toEqual({
      firstName: 'Anna',
      lastName: 'Nowak-Kowalska',
      confident: true,
    });
  });

  it('splits three tokens at the last space but is not confident', () => {
    expect(splitDisplayName('Anna Maria Kowalska')).toEqual({
      firstName: 'Anna Maria',
      lastName: 'Kowalska',
      confident: false,
    });
  });

  it('leaves a mononym without a last name and is not confident', () => {
    expect(splitDisplayName('Prince')).toEqual({
      firstName: 'Prince',
      lastName: '',
      confident: false,
    });
  });

  it('returns empty parts for an empty name', () => {
    expect(splitDisplayName('')).toEqual({ firstName: '', lastName: '', confident: false });
    expect(splitDisplayName('   ')).toEqual({ firstName: '', lastName: '', confident: false });
  });
});
