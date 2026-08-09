import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TrackerColumnsStore, TrackerReportStore, TrackerRowsStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { TrackerExportModalComponent } from './tracker-export-modal.component';

/**
 * The dialog resolves its three stores through the injector rather than taking
 * them as inputs, which is the whole reason the extraction needed no plumbing.
 * These tests provide stubs at the same level `TrackerComponent` provides the
 * real ones.
 */
describe('TrackerExportModalComponent', () => {
  let fixture: ComponentFixture<TrackerExportModalComponent>;
  let report: {
    applicant: ReturnType<typeof signal<string>>;
    market: ReturnType<typeof signal<string>>;
    mode: ReturnType<typeof signal<string>>;
    landscape: ReturnType<typeof signal<boolean>>;
    exporting: ReturnType<typeof signal<boolean>>;
    fitInfo: ReturnType<typeof signal<{ overflow: { id: string; label: string }[] }>>;
    columns: ReturnType<typeof signal<unknown[]>>;
    periodLabel: ReturnType<typeof signal<string>>;
    exportCsv: jest.Mock;
    exportPdf: jest.Mock;
  };
  let toast: { success: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    report = {
      applicant: signal('Vitalii'),
      market: signal('de'),
      mode: signal('fit'),
      landscape: signal(false),
      exporting: signal(false),
      fitInfo: signal<{ overflow: { id: string; label: string }[] }>({ overflow: [] }),
      columns: signal<unknown[]>([]),
      periodLabel: signal('Aug 2026'),
      exportCsv: jest.fn().mockResolvedValue('/tmp/report.csv'),
      exportPdf: jest.fn().mockResolvedValue('/tmp/report.pdf'),
    };
    toast = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [TrackerExportModalComponent],
      providers: [
        { provide: TrackerReportStore, useValue: report },
        {
          provide: TrackerRowsStore,
          useValue: {
            reportRows: signal([]),
            summary: signal({ total: 0, rate: 0, avg: 0 }),
          },
        },
        { provide: TrackerColumnsStore, useValue: { visibleColumns: signal([]) } },
        { provide: ToastService, useValue: toast },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrackerExportModalComponent);
    fixture.detectChanges();
  });

  it('closes when the backdrop is clicked and when the close button is', () => {
    const closed = jest.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement.querySelector('.jt-modal') as HTMLElement).click();
    (fixture.nativeElement.querySelector('.jt-icon') as HTMLElement).click();

    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('does not close when the panel itself is clicked', () => {
    const closed = jest.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement.querySelector('.jt-modal__panel') as HTMLElement).click();

    expect(closed).not.toHaveBeenCalled();
  });

  // The page used to own this: it called the store, closed itself, then said
  // where the file went. The dialog owns all three now, so the order is worth
  // pinning - a toast about a saved file that is still covered by the dialog
  // reads as if nothing happened.
  it('closes and reports the path after a CSV export', async () => {
    const closed = jest.fn();
    fixture.componentInstance.closed.subscribe(closed);

    const csvButton = [...fixture.nativeElement.querySelectorAll('.jt-tbtn')].find(
      (b) => !(b as HTMLElement).classList.contains('jt-tbtn--primary'),
    ) as HTMLElement;
    csvButton.click();
    await fixture.whenStable();

    expect(report.exportCsv).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('/tmp/report.csv'));
  });

  // Cancelling the native Save dialog resolves with no path. The dialog must
  // stay open in that case, which is the one branch a user can reach by
  // accident and the one no type checks.
  it('stays open when the PDF save dialog is cancelled', async () => {
    report.exportPdf.mockResolvedValue(null);
    const closed = jest.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement.querySelector('.jt-tbtn--primary') as HTMLElement).click();
    await fixture.whenStable();

    expect(closed).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the A4 fit note only when columns overflow', () => {
    expect(fixture.nativeElement.querySelector('.jt-modal__note')).toBeNull();

    report.fitInfo.set({ overflow: [{ id: 'notes', label: 'Notes' }] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.jt-modal__note')).not.toBeNull();
  });

  it('disables both export buttons while an export is running', () => {
    report.exporting.set(true);
    fixture.detectChanges();

    const buttons = [...fixture.nativeElement.querySelectorAll('.jt-tbtn')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});
