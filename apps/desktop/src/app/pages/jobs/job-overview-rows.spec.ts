import { ANALYSED_STATUS, isRowVisible, rowStatus } from './job-overview-rows';

const claimed = (status?: string) => ({ id: 1, claimed: true, status }) as never;
const analysed = (status?: string) => ({ id: 2, claimed: false, status }) as never;

describe('rowStatus', () => {
  it('shows the application status of a claimed job', () => {
    expect(rowStatus(claimed('interview'))).toBe('interview');
  });

  it('reads a claimed job with no status yet as saved, which is what claiming means', () => {
    expect(rowStatus(claimed(undefined))).toBe('saved');
  });

  it('never reads an unclaimed job as saved', () => {
    // The ambiguity that let these rows go unnoticed: an unclaimed job is not
    // saved and never was.
    expect(rowStatus(analysed(undefined))).toBe(ANALYSED_STATUS);
  });

  it('ignores a stray status on an unclaimed row rather than trusting it', () => {
    // There is no application row behind an unclaimed job, so any status on
    // one is a leftover, not a fact about it.
    expect(rowStatus(analysed('applied'))).toBe(ANALYSED_STATUS);
  });
});

describe('isRowVisible', () => {
  it('always shows a claimed job', () => {
    expect(isRowVisible(claimed('saved'), false)).toBe(true);
    expect(isRowVisible(claimed('saved'), true)).toBe(true);
  });

  it('hides an unclaimed job until the filter is turned on', () => {
    expect(isRowVisible(analysed(), false)).toBe(false);
    expect(isRowVisible(analysed(), true)).toBe(true);
  });
});
