import type { ScanSummary } from '@applye/core';
import { consoleLabel, failureLines, resultLines, startedLines } from './scan-console';

/** Echoes the key with its placeholders substituted, so both are visible. */
const t = (key: string) => key;

const sourceResult = (over: Record<string, unknown> = {}) =>
  ({
    sourceId: 1,
    sourceName: 'Greenhouse',
    fetched: 10,
    filteredOut: 4,
    duplicates: 1,
    newJobs: 5,
    error: null,
    ...over,
  }) as never;

const summary = (sources: unknown[], totalNew = 5): ScanSummary =>
  ({ sources, totalFetched: 10, totalNew, durationMs: 1200 }) as never;

describe('consoleLabel', () => {
  it('pads to a fixed width so the console column-aligns', () => {
    expect(consoleLabel('Greenhouse')).toHaveLength(22);
    expect(consoleLabel('X')).toHaveLength(22);
  });

  it('lowercases and removes spaces from the source name', () => {
    expect(consoleLabel('Work Nomads').trim()).toMatch(/^worknomads/);
  });

  it('leaves a name too long to pad alone rather than truncating it', () => {
    // Truncating would hide which source a line belongs to.
    const long = 'A'.repeat(40);

    expect(consoleLabel(long).trim()).toContain('a'.repeat(40));
  });
});

describe('startedLines', () => {
  it('heads with the count of sources it is about to scan', () => {
    const lines = startedLines(['Greenhouse', 'Lever'], t);

    expect(lines[0]).toEqual({ text: 'discover.con_started', tone: 'header' });
  });

  it('marks every source active, because none has reported yet', () => {
    const lines = startedLines(['Greenhouse', 'Lever'], t);

    expect(lines.slice(1).map((l) => l.tone)).toEqual(['active', 'active']);
  });

  it('produces a header alone when no source is enabled', () => {
    expect(startedLines([], t)).toHaveLength(1);
  });
});

describe('resultLines', () => {
  it('reports a successful source as ok', () => {
    const lines = resultLines(summary([sourceResult()]), '1.2', t);

    expect(lines[1].tone).toBe('ok');
    expect(lines[1].text).toContain('discover.con_line_ok');
  });

  it('reports a failed source as err and never as ok', () => {
    const lines = resultLines(summary([sourceResult({ error: 'timeout' })]), '1.2', t);

    expect(lines[1].tone).toBe('err');
    expect(lines[1].text).toContain('discover.con_line_err');
    expect(lines[1].text).not.toContain('con_line_ok');
  });

  it('treats an empty error string as success, not failure', () => {
    // The Rust side returns null for success; an empty string would be a
    // failure with nothing to say, which is worse than saying it worked.
    const lines = resultLines(summary([sourceResult({ error: '' })]), '1.2', t);

    expect(lines[1].tone).toBe('ok');
  });

  it('closes with a done line carrying the elapsed time and the new count', () => {
    const lines = resultLines(summary([sourceResult()], 7), '3.4', t);

    expect(lines.at(-1)).toEqual({ text: 'discover.con_done', tone: 'done' });
  });

  it('heads with the count the scan actually reported, not what was requested', () => {
    // A source can drop out between the request and the summary; the header
    // has to describe what happened.
    const lines = resultLines(summary([sourceResult(), sourceResult({ sourceId: 2 })]), '1.0', t);

    expect(lines).toHaveLength(4);
    expect(lines[0].tone).toBe('header');
  });

  it('still produces a header and a done line when every source failed', () => {
    const lines = resultLines(summary([sourceResult({ error: 'down' })], 0), '0.5', t);

    expect(lines[0].tone).toBe('header');
    expect(lines.at(-1)?.tone).toBe('done');
  });
});

describe('failureLines', () => {
  const previous = [
    { text: 'header', tone: 'header' as const },
    { text: 'greenhouse', tone: 'active' as const },
    { text: 'lever', tone: 'ok' as const },
  ];

  it('turns every still-active line into an error, because none will now report', () => {
    // The scan died, so a line left spinning would claim work still in flight.
    const lines = failureLines(previous, 'boom', t);

    expect(lines.slice(0, 3).map((l) => l.tone)).toEqual(['header', 'err', 'ok']);
  });

  it('leaves lines that already reported alone', () => {
    expect(failureLines(previous, 'boom', t)[2]).toEqual({ text: 'lever', tone: 'ok' });
  });

  it('appends the reason rather than replacing what is on screen', () => {
    const lines = failureLines(previous, 'boom', t);

    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toEqual({ text: 'discover.con_line_err', tone: 'err' });
  });

  it('does not mutate the lines it was given', () => {
    const tones = previous.map((l) => l.tone);

    failureLines(previous, 'boom', t);

    expect(previous.map((l) => l.tone)).toEqual(tones);
  });
});
