import type { ScanSummary } from '@applye/core';

export type ConsoleTone = 'header' | 'ok' | 'err' | 'done' | 'active';

export interface ConsoleLine {
  text: string;
  tone: ConsoleTone;
}

/** Column width the scan console aligns its source names to. */
const LABEL_WIDTH = 22;

/**
 * A source's name as the console prints it: lowercased, spaces removed, and
 * dot-padded to a fixed width so the outcomes line up in a column.
 *
 * A name too long to pad is left whole rather than truncated - the label is
 * what says which source a line belongs to.
 */
export function consoleLabel(name: string): string {
  return `  ${name.toLowerCase().replace(/\s+/g, '')} `.padEnd(LABEL_WIDTH, '.');
}

/**
 * What the console shows the moment a scan starts: a header naming how many
 * sources are about to run, then one line per source marked `active`, because
 * none has reported yet.
 */
export function startedLines(sourceNames: string[], t: (key: string) => string): ConsoleLine[] {
  return [
    { text: t('discover.con_started').replace('{n}', String(sourceNames.length)), tone: 'header' },
    ...sourceNames.map<ConsoleLine>((name) => ({ text: consoleLabel(name), tone: 'active' })),
  ];
}

/**
 * The console rewritten from the finished scan: a header, one line per source
 * result, and a closing line with the elapsed time and how many jobs are new.
 *
 * The header counts the sources the **summary** reported, not the ones that
 * were requested. A source can drop out in between, and the console has to
 * describe what happened rather than what was asked for.
 */
export function resultLines(
  summary: ScanSummary,
  seconds: string,
  t: (key: string) => string,
): ConsoleLine[] {
  return [
    {
      text: t('discover.con_started').replace('{n}', String(summary.sources.length)),
      tone: 'header',
    },
    ...summary.sources.map<ConsoleLine>((r) => ({
      text:
        consoleLabel(r.sourceName) +
        ' ' +
        (r.error
          ? t('discover.con_line_err').replace('{err}', r.error)
          : t('discover.con_line_ok')
              .replace('{fetched}', String(r.fetched))
              .replace('{filtered}', String(r.filteredOut))
              .replace('{new}', String(r.newJobs))),
      tone: r.error ? 'err' : 'ok',
    })),
    {
      text: t('discover.con_done').replace('{s}', seconds).replace('{n}', String(summary.totalNew)),
      tone: 'done',
    },
  ];
}

/**
 * The console after the scan itself failed: every line still marked `active`
 * becomes an error, because nothing is going to report now and a line left
 * spinning claims work that is not happening. Lines that already reported keep
 * their outcome, and the reason is appended rather than replacing what is on
 * screen.
 */
export function failureLines(
  previous: readonly ConsoleLine[],
  error: string,
  t: (key: string) => string,
): ConsoleLine[] {
  return [
    ...previous.map((line) => ({ ...line, tone: line.tone === 'active' ? 'err' : line.tone })),
    { text: t('discover.con_line_err').replace('{err}', error), tone: 'err' },
  ];
}
