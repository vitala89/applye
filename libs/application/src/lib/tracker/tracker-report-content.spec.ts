import type { TrackerRow } from '@applye/core';
import { ReportColumn } from './tracker-report';
import {
  buildTrackerCsv,
  buildTrackerReportText,
  trackerContactDisplay,
  trackerCsvCell,
  trackerReportBaseName,
} from './tracker-report-content';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, ...over };
}

function col(over: Partial<ReportColumn> = {}): ReportColumn {
  return { id: 'company', label: 'Firma', type: 'text', width: 34, ...over };
}

/** Stands in for the report's own language: German where the sheet names it,
 * and the key itself otherwise, so a missing translation is visible. */
const DE: Record<string, string> = {
  'tracker.report_title': 'Eigenbemuehungen',
  'tracker.report_period': 'Zeitraum',
  'tracker.report_name': 'Name',
  'tracker.report_generated': 'Erstellt am',
  'tracker.title': 'Bewerbungen',
  'tracker.col_date': 'Datum',
  'tracker.col_company': 'Firma',
  'tracker.col_role': 'Position',
  'tracker.col_method': 'Weg',
  'tracker.col_status': 'Status',
  'tracker.col_contact': 'Kontakt',
  'tracker.total': 'Gesamt',
  'tracker.response_rate': 'Rueckmeldequote',
  'tracker.avg_days': 'Tage im Schnitt',
  'status.offer': 'Angebot',
};
const t = (key: string) => DE[key] ?? key;

describe('trackerReportBaseName', () => {
  it('names the German sheet by the term the office uses', () => {
    expect(trackerReportBaseName('de', '2026-08-07')).toBe('eigenbemuehungen-2026-08-07');
  });

  it('names every other market generically', () => {
    expect(trackerReportBaseName('intl', '2026-08-07')).toBe('job-application-report-2026-08-07');
  });
});

describe('trackerContactDisplay', () => {
  it('joins the name and the channel', () => {
    expect(trackerContactDisplay(row({ contactName: 'Ada', contactChannel: 'email' }))).toBe(
      'Ada - email',
    );
  });

  // Asymmetric on the two halves: each missing in turn. A row with both, or
  // neither, cannot show that the separator is dropped rather than printed
  // against an empty side.
  it('prints one half alone without a dangling separator', () => {
    expect(trackerContactDisplay(row({ contactName: 'Ada' }))).toBe('Ada');
    expect(trackerContactDisplay(row({ contactChannel: 'email' }))).toBe('email');
  });

  it('prints nothing for a row with no contact', () => {
    expect(trackerContactDisplay(row())).toBe('');
  });
});

describe('trackerCsvCell', () => {
  it('translates a status into the report language', () => {
    expect(trackerCsvCell(row({ status: 'offer' }), col({ id: 'status', type: 'status' }), t)).toBe(
      'Angebot',
    );
  });

  it('prints no status as empty rather than as a stray key', () => {
    expect(trackerCsvCell(row(), col({ id: 'status', type: 'status' }), t)).toBe('');
  });

  it('prints a stage with its date, and without one when there is none', () => {
    const stage = col({ id: 'nextStage', type: 'stage' });

    expect(
      trackerCsvCell(
        row({ nextStageLabel: 'Interview', nextStageAt: '2026-09-01T10:00:00Z' }),
        stage,
        t,
      ),
    ).toBe('Interview 2026-09-01');
    expect(trackerCsvCell(row({ nextStageLabel: 'Interview' }), stage, t)).toBe('Interview');
    expect(trackerCsvCell(row(), stage, t)).toBe('');
  });

  it('prints the source url for a link column', () => {
    expect(
      trackerCsvCell(
        row({ sourceUrl: 'https://x.test/1' }),
        col({ id: 'sourceUrl', type: 'link' }),
        t,
      ),
    ).toBe('https://x.test/1');
  });

  // `false` is falsy but not nullish and must print "no", not empty - the same
  // distinction the grid makes, and the one the office reads.
  it('prints a false yesno as "no" and an absent one as empty', () => {
    const yesno = col({ id: 'blueCardEligible', type: 'yesno' });

    expect(trackerCsvCell(row({ blueCardEligible: false }), yesno, t)).toBe('no');
    expect(trackerCsvCell(row({ blueCardEligible: true }), yesno, t)).toBe('yes');
    expect(trackerCsvCell(row(), yesno, t)).toBe('');
  });

  it('truncates a timestamp in a date column', () => {
    expect(
      trackerCsvCell(
        row({ appliedAt: '2026-08-07T09:30:00Z' }),
        col({ id: 'appliedAt', type: 'date' }),
        t,
      ),
    ).toBe('2026-08-07');
  });

  // A newline inside a cell would break the row apart even once quoted, since
  // the fallback text export splits on lines.
  it('flattens newlines in a free-text cell', () => {
    expect(trackerCsvCell(row({ notes: 'one\ntwo' }), col({ id: 'notes' }), t)).toBe('one two');
  });

  it('reads a custom column out of the row blob, truncating it only when dated', () => {
    const blob = row({ customFields: '{"cf_1":"2026-08-07T09:30:00Z"}' });

    expect(trackerCsvCell(blob, col({ id: 'cf_1', custom: true, type: 'date' }), t)).toBe(
      '2026-08-07',
    );
    expect(trackerCsvCell(blob, col({ id: 'cf_1', custom: true, type: 'text' }), t)).toBe(
      '2026-08-07T09:30:00Z',
    );
  });

  it('prints a custom column with no stored value as empty', () => {
    expect(trackerCsvCell(row(), col({ id: 'cf_1', custom: true }), t)).toBe('');
  });
});

describe('buildTrackerCsv', () => {
  const base = {
    columns: [col({ id: 'company', label: 'Firma' }), col({ id: 'title', label: 'Position' })],
    periodLabel: 'Letzte 3 Monate',
    applicant: 'Ada Lovelace',
    generatedOn: '2026-08-07',
    t,
  };

  // This document is submitted to the Agentur fuer Arbeit, so the assertion is
  // the exact bytes rather than a shape.
  it('writes the metadata block, a blank line, the header and one numbered row per application', () => {
    const csv = buildTrackerCsv({
      ...base,
      rows: [row({ company: 'Aiven', title: 'Engineer' }), row({ company: 'Basecamp' })],
    });

    expect(csv).toBe(
      [
        '"Zeitraum","Letzte 3 Monate"',
        '"Name","Ada Lovelace"',
        '"Erstellt am","2026-08-07"',
        '',
        '"#","Firma","Position"',
        '"1","Aiven","Engineer"',
        '"2","Basecamp",""',
      ].join('\n'),
    );
  });

  // RFC 4180: a quote is doubled, and every field is wrapped, which is what
  // stops a company name containing a comma from shifting the whole row.
  it('doubles quotes and wraps every field', () => {
    const csv = buildTrackerCsv({ ...base, rows: [row({ company: 'Say "hi", now' })] });

    expect(csv.split('\n').at(-1)).toBe('"1","Say ""hi"", now",""');
  });

  it('numbers rows from one, not from zero', () => {
    const csv = buildTrackerCsv({ ...base, rows: [row({ company: 'Aiven' })] });
    expect(csv.split('\n').at(-1)?.startsWith('"1"')).toBe(true);
  });

  it('writes the header even when there are no applications', () => {
    const csv = buildTrackerCsv({ ...base, rows: [] });

    expect(csv.split('\n')).toEqual([
      '"Zeitraum","Letzte 3 Monate"',
      '"Name","Ada Lovelace"',
      '"Erstellt am","2026-08-07"',
      '',
      '"#","Firma","Position"',
    ]);
  });

  it('takes the generated date from its caller, so the same inputs give the same file', () => {
    const first = buildTrackerCsv({ ...base, rows: [], generatedOn: '2026-01-01' });
    const second = buildTrackerCsv({ ...base, rows: [], generatedOn: '2026-01-01' });

    expect(first).toBe(second);
    expect(first).toContain('"Erstellt am","2026-01-01"');
  });
});

describe('buildTrackerReportText', () => {
  const base = {
    rows: [
      row({
        appliedAt: '2026-08-01',
        company: 'Aiven',
        title: 'Engineer',
        method: 'email',
        status: 'offer',
        contactName: 'Ada',
        contactChannel: 'email',
      }),
    ],
    periodLabel: 'Letzte 3 Monate',
    applicant: 'Ada Lovelace',
    generatedOn: '2026-08-07',
    t,
  };
  const summary = { total: 1, rate: 100, avg: 4 };

  it('writes the whole fallback sheet', () => {
    expect(buildTrackerReportText(base, summary)).toBe(
      [
        '# Eigenbemuehungen',
        'Zeitraum: Letzte 3 Monate',
        'Name: Ada Lovelace',
        'Erstellt am: 2026-08-07',
        '',
        '## Bewerbungen',
        '#   Datum       Firma               Position            Weg         Status     Kontakt                 ',
        '1   2026-08-01  Aiven               Engineer            email       offer      Ada - email             ',
        '',
        'Gesamt: 1   Rueckmeldequote: 100%   Tage im Schnitt: 4',
      ].join('\n'),
    );
  });

  // Asymmetric on the two padding paths: one field short enough to pad, one
  // long enough to truncate. A fixture of only short values never reaches the
  // ellipsis, and one of only long values never proves the padding.
  it('pads a short field and truncates a long one with an ellipsis', () => {
    const text = buildTrackerReportText(
      {
        ...base,
        rows: [row({ company: 'A', title: 'Staff Platform Reliability Engineer' })],
      },
      summary,
    );
    const line = text.split('\n')[7];

    expect(line).toContain('A                   ');
    expect(line).toContain('Staff Platform Reli…');
  });

  it('prints an absent field as blank padding rather than as "undefined"', () => {
    const text = buildTrackerReportText({ ...base, rows: [row({ company: 'Aiven' })] }, summary);
    const [header, line] = text.split('\n').slice(6, 8);

    expect(text).not.toContain('undefined');
    // Every column still occupies its width, so the row lines up with the head.
    expect(line).toHaveLength(header.length);
    expect(line.startsWith('1               Aiven')).toBe(true);
  });

  it('still prints the header and the totals with no applications', () => {
    const text = buildTrackerReportText({ ...base, rows: [] }, { total: 0, rate: 0, avg: 0 });

    expect(text).toContain('## Bewerbungen');
    expect(text).toContain('Gesamt: 0   Rueckmeldequote: 0%   Tage im Schnitt: 0');
  });
});
