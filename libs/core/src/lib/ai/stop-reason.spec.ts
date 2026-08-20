import { isTruncatedStopReason } from './stop-reason';

describe('isTruncatedStopReason', () => {
  it('recognises the Anthropic spelling', () => {
    expect(isTruncatedStopReason('max_tokens')).toBe(true);
  });

  it('recognises the OpenAI-compatible spelling', () => {
    expect(isTruncatedStopReason('length')).toBe(true);
  });

  it('does not treat a clean finish as truncation', () => {
    expect(isTruncatedStopReason('end_turn')).toBe(false);
    expect(isTruncatedStopReason('stop')).toBe(false);
  });

  // The value crosses an IPC boundary from JSON this app does not control.
  it('trims and lowercases before comparing', () => {
    expect(isTruncatedStopReason('  MAX_TOKENS  ')).toBe(true);
    expect(isTruncatedStopReason('Length')).toBe(true);
  });

  // Absent is a third case, not a synonym for "finished cleanly" - every
  // CLI-bridge answer is absent, including the ones that really were cut off.
  it('answers false when the provider did not say', () => {
    expect(isTruncatedStopReason(null)).toBe(false);
    expect(isTruncatedStopReason(undefined)).toBe(false);
    expect(isTruncatedStopReason('')).toBe(false);
  });

  it('does not match an unrelated reason', () => {
    expect(isTruncatedStopReason('content_filter')).toBe(false);
    expect(isTruncatedStopReason('tool_use')).toBe(false);
  });
});
