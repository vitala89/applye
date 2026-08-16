import { isRemote, srcLabel, workTypeOf } from './discover-row-view';

describe('isRemote', () => {
  // Substring matching is the rule, because boards write the marker inside
  // parentheses and after hyphens far more often than as a bare word.
  it('recognises the marker in the shapes boards actually use', () => {
    expect(isRemote('Remote')).toBe(true);
    expect(isRemote('Remote (EU)')).toBe(true);
    expect(isRemote('Remote - US')).toBe(true);
    expect(isRemote('Anywhere in Europe')).toBe(true);
    expect(isRemote('Fully distributed team')).toBe(true);
  });

  it('is false for an office location, and for nothing at all', () => {
    expect(isRemote('Berlin, Germany')).toBe(false);
    expect(isRemote('')).toBe(false);
    expect(isRemote(null)).toBe(false);
  });
});

describe('workTypeOf', () => {
  it('reads an office location as onsite', () => {
    expect(workTypeOf('Berlin, Germany')).toBe('onsite');
    expect(workTypeOf(null)).toBe('onsite');
  });

  it('reads a remote marker as remote', () => {
    expect(workTypeOf('Remote (EU)')).toBe('remote');
  });

  /**
   * The ordering is the rule, not an implementation detail. A hybrid posting
   * usually names remote days too, and reading it as fully remote would put it
   * in a filter the user chose specifically to exclude the office from.
   */
  it('reads hybrid as hybrid even when it also says remote', () => {
    expect(workTypeOf('Hybrid - Berlin (remote 2 days)')).toBe('hybrid');
    expect(workTypeOf('HYBRID / Anywhere in Germany')).toBe('hybrid');
  });
});

describe('srcLabel', () => {
  it('upper-cases the source name', () => {
    expect(srcLabel('remoteok')).toBe('REMOTEOK');
  });

  // The full name does not fit the badge at any weight.
  it('abbreviates We Work Remotely, whatever its casing', () => {
    expect(srcLabel('We Work Remotely')).toBe('WWR');
    expect(srcLabel('we work remotely')).toBe('WWR');
  });

  it('renders nothing for a row with no source', () => {
    expect(srcLabel(null)).toBe('');
    expect(srcLabel('')).toBe('');
  });
});
