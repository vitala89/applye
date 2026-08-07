import { TestBed } from '@angular/core/testing';
import type { TrackerCustomColumn, TrackerRow } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { TrackerColumnsStore } from './tracker-columns.store';
import { TrackerReportStore } from './tracker-report.store';
import { TrackerRowsStore } from './tracker-rows.store';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, jobId: 100, ...over };
}

/** Prefixes every key with its locale, so a test can tell which language a
 * string was resolved in without depending on real translations. */
const i18n = {
  tFor: jest.fn((locale: string) => (key: string) => `${locale}:${key}`),
};

function createStore(rows: TrackerRow[] = [], customColumns: TrackerCustomColumn[] = []) {
  const db = {
    trackerRows: jest.fn().mockResolvedValue(rows),
    getSettings: jest.fn().mockResolvedValue(null),
    trackerCustomColumns: jest.fn().mockResolvedValue(customColumns),
    exportReport: jest.fn().mockResolvedValue('/tmp/report.csv'),
    trackerReportExportPdfWysiwyg: jest.fn().mockResolvedValue(undefined),
  };
  i18n.tFor.mockClear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      TrackerColumnsStore,
      TrackerRowsStore,
      TrackerReportStore,
      { provide: DbService, useValue: db },
      { provide: TranslateService, useValue: i18n },
    ],
  });
  return {
    store: TestBed.inject(TrackerReportStore),
    columns: TestBed.inject(TrackerColumnsStore),
    rows: TestBed.inject(TrackerRowsStore),
    db,
    choose: jest.fn().mockResolvedValue('/tmp/report.pdf'),
  };
}

describe('TrackerReportStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the sheet has its own language', () => {
    // The whole point of ADR-0005 amendment eight: this is a document, not app
    // chrome, so its language follows the chosen market and not the UI.
    it('prints German for the German market and English for every other', () => {
      const { store } = createStore();

      expect(store.language()).toBe('de');
      store.market.set('intl');
      expect(store.language()).toBe('en');
    });

    it('labels its columns in the report language, not the UI one', () => {
      const { store } = createStore();
      expect(store.columns()[0].label).toBe('de:tracker.col_company');

      store.market.set('intl');
      expect(store.columns()[0].label).toBe('en:tracker.col_company');
    });

    it('names the period in the report language', () => {
      const { store, rows } = createStore();

      expect(store.periodLabel()).toBe('de:tracker.range_3months');
      rows.range.set('all');
      expect(store.periodLabel()).toBe('de:tracker.range_all');
      rows.range.set('month');
      expect(store.periodLabel()).toBe('de:tracker.range_month');
    });
  });

  describe('columns', () => {
    it('mirrors the visible tracker columns, with their print widths', () => {
      const { store } = createStore();
      const company = store.columns()[0];

      expect(company).toMatchObject({ id: 'company', width: 34, custom: false });
    });

    it('follows the column panel', async () => {
      const { store, columns } = createStore();
      expect(store.columns().map((c) => c.id)).not.toContain('techStack');

      columns.toggle('techStack');
      expect(store.columns().map((c) => c.id)).toContain('techStack');
    });

    // Asymmetric on the two label sources: a built-in column is translated, a
    // custom one keeps the user's own wording because there is no translation
    // for it. A fixture of only built-in columns cannot show the difference.
    it('keeps a custom column’s own label untranslated', async () => {
      const { store, columns } = createStore(
        [],
        [{ id: 'cf_1', label: 'Referral', type: 'text', sort: 0 }],
      );
      await columns.load();
      const custom = store.columns().at(-1);

      expect(custom).toMatchObject({ id: 'cf_1', label: 'Referral', custom: true, width: 30 });
    });
  });

  describe('fitInfo', () => {
    // The default essential columns measure 214mm: over the 170mm portrait
    // budget and inside the 257mm landscape one, so the same column set gives
    // both answers and the orientation is provably read.
    it('follows the orientation', () => {
      const { store } = createStore();

      expect(store.fitInfo().overflow.map((c) => c.id)).toEqual(['nextActionAt', 'nextStage']);

      store.landscape.set(true);
      expect(store.fitInfo().overflow).toEqual([]);
    });
  });

  describe('exportCsv', () => {
    it('writes the CSV under the German file name and returns the path', async () => {
      const { store, rows, db } = createStore([row({ appliedAt: '2026-08-01', company: 'Aiven' })]);
      await rows.load();
      rows.range.set('all');
      store.applicant.set('Ada');

      await expect(store.exportCsv()).resolves.toBe('/tmp/report.csv');

      const [content, format, base] = db.exportReport.mock.calls[0];
      expect(format).toBe('csv');
      expect(base).toMatch(/^eigenbemuehungen-\d{4}-\d{2}-\d{2}$/);
      expect(content).toContain('"Aiven"');
      expect(content).toContain('"de:tracker.report_name","Ada"');
    });

    it('names the file generically for every other market', async () => {
      const { store, db } = createStore();
      store.market.set('intl');

      await store.exportCsv();

      expect(db.exportReport.mock.calls[0][2]).toMatch(/^job-application-report-/);
    });

    it('exports the report rows, which include archived ones', async () => {
      const { store, rows, db } = createStore([
        row({ id: 1, appliedAt: '2026-08-01', company: 'Aiven' }),
        row({ id: 2, appliedAt: '2026-08-02', company: 'Basecamp', archived: true }),
      ]);
      await rows.load();
      rows.range.set('all');

      await store.exportCsv();

      expect(db.exportReport.mock.calls[0][0]).toContain('"Basecamp"');
    });

    it('clears exporting afterwards, and propagates a gateway failure', async () => {
      const { store, db } = createStore();
      db.exportReport.mockRejectedValue(new Error('read only'));

      await expect(store.exportCsv()).rejects.toThrow('read only');
      expect(store.exporting()).toBe(false);
    });

    it('refuses a second export while one is running', async () => {
      const { store, db } = createStore();
      let release: () => void = () => undefined;
      db.exportReport.mockReturnValue(
        new Promise<string>((r) => (release = () => r('/tmp/a.csv'))),
      );

      const first = store.exportCsv();
      await expect(store.exportCsv()).resolves.toBeNull();
      release();
      await first;

      expect(db.exportReport).toHaveBeenCalledTimes(1);
    });
  });

  describe('exportPdf', () => {
    it('offers a default name, then writes to the chosen path', async () => {
      const { store, db, choose } = createStore();

      await expect(store.exportPdf(choose)).resolves.toBe('/tmp/report.pdf');

      expect(choose).toHaveBeenCalledWith(expect.stringMatching(/^eigenbemuehungen-.*\.pdf$/));
      expect(db.trackerReportExportPdfWysiwyg).toHaveBeenCalledWith(
        expect.objectContaining({ savePath: '/tmp/report.pdf', market: 'de', mode: 'fit' }),
      );
    });

    it('sends the period, its label and the columns as JSON', async () => {
      const { store, rows, db, choose } = createStore();
      await rows.load();
      rows.range.set('month');

      await store.exportPdf(choose);

      const sent = db.trackerReportExportPdfWysiwyg.mock.calls[0][0];
      expect(sent.period).toBe('month');
      expect(sent.periodLabel).toBe('de:tracker.range_month');
      expect(JSON.parse(sent.columns)[0]).toMatchObject({ id: 'company' });
    });

    // Asymmetric on the one row the grid hides and the sheet must not: the
    // fixture carries an archived row, so a fallback built from `view()`
    // instead of `reportRows()` silently drops an application from the
    // evidence submitted to the office.
    it('sends the plain-text fallback, in the report language, archived rows included', async () => {
      const { store, rows, db, choose } = createStore([
        row({ id: 1, appliedAt: '2026-08-01', company: 'Aiven' }),
        row({ id: 2, appliedAt: '2026-08-02', company: 'Basecamp', archived: true }),
      ]);
      await rows.load();
      rows.range.set('all');

      await store.exportPdf(choose);

      const { fallbackContent } = db.trackerReportExportPdfWysiwyg.mock.calls[0][0];
      expect(fallbackContent).toContain('de:tracker.report_title');
      expect(fallbackContent).toContain('Aiven');
      expect(fallbackContent).toContain('Basecamp');
    });

    // Cancelling the Save dialog must write nothing at all.
    it('writes nothing when the user cancels', async () => {
      const { store, db, choose } = createStore();
      choose.mockResolvedValue(null);

      await expect(store.exportPdf(choose)).resolves.toBeNull();
      expect(db.trackerReportExportPdfWysiwyg).not.toHaveBeenCalled();
      expect(store.exporting()).toBe(false);
    });

    // The dialog is app code called mid-operation, which is why it is passed
    // in: `exporting` has to cover it, or the buttons re-enable underneath it.
    it('holds exporting true while the Save dialog is open', async () => {
      const { store, choose } = createStore();
      choose.mockImplementation(async () => {
        expect(store.exporting()).toBe(true);
        return '/tmp/report.pdf';
      });

      await store.exportPdf(choose);

      expect(choose).toHaveBeenCalledTimes(1);
      expect(store.exporting()).toBe(false);
    });

    it('clears exporting after a failure, and propagates it', async () => {
      const { store, db, choose } = createStore();
      db.trackerReportExportPdfWysiwyg.mockRejectedValue(new Error('no space'));

      await expect(store.exportPdf(choose)).rejects.toThrow('no space');
      expect(store.exporting()).toBe(false);
    });

    it('refuses to run while a CSV export is in flight', async () => {
      const { store, db, choose } = createStore();
      let release: () => void = () => undefined;
      db.exportReport.mockReturnValue(
        new Promise<string>((r) => (release = () => r('/tmp/a.csv'))),
      );

      const csv = store.exportCsv();
      await expect(store.exportPdf(choose)).resolves.toBeNull();
      release();
      await csv;

      expect(choose).not.toHaveBeenCalled();
    });
  });
});
