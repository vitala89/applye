import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TrackerPrintStore } from '@applye/application';
import { TrackerReportPrintComponent } from './tracker-report-print.component';

/**
 * This route renders into a HIDDEN window and is screenshotted straight into
 * the user's PDF. There is no toast here, no console anyone reads, and no
 * second chance: whatever this component decides is what the exported document
 * says.
 *
 * The regression below is that a `columns` argument that would not parse used
 * to be swallowed into an empty list, so the export produced a report with no
 * columns that looked exactly like one the user had configured that way.
 */
describe('TrackerReportPrintComponent', () => {
  function setup(columns: string) {
    const print = {
      rows: signal([]),
      summary: signal({ total: 0, rate: 0, avg: 0 }),
      load: jest.fn(async () => undefined),
      markPrintWindowReady: jest.fn(async () => undefined),
    };
    const params = new Map<string, string>([['columns', columns]]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TrackerReportPrintComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (k: string) => params.get(k) ?? null } } },
        },
      ],
    });
    TestBed.overrideComponent(TrackerReportPrintComponent, {
      set: { providers: [{ provide: TrackerPrintStore, useValue: print }] },
    });
    return TestBed.createComponent(TrackerReportPrintComponent);
  }

  it('reads the columns it was given', () => {
    const c = setup(JSON.stringify([{ id: 'company', label: 'Company' }])).componentInstance;

    expect(c.columns()).toHaveLength(1);
    expect(c.columnsError()).toBeNull();
  });

  it('says so in the printed output when the columns cannot be read', () => {
    const c = setup('{not json').componentInstance;

    expect(c.columns()).toEqual([]);
    expect(c.columnsError()).toContain('could not be read');
  });

  /**
   * The regression this pins was found by opening the route in a browser, and
   * no unit test could have found it from the outside: `styles.scss` hides
   * `body.printing-report *` and re-shows only `app-tracker-report` and its
   * DESCENDANTS. A notice rendered by this route, one level above the sheet,
   * is therefore visible on screen and invisible in the exported PDF - the one
   * artifact it exists for. Containment is the property that matters, so
   * containment is what is asserted.
   */
  it('renders the notice inside the sheet, which is the only printed subtree', async () => {
    const fixture = setup('{not json');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sheet: HTMLElement = fixture.nativeElement.querySelector('app-tracker-report');
    const notice: HTMLElement = fixture.nativeElement.querySelector('.paper__notice');

    expect(sheet).not.toBeNull();
    expect(notice).not.toBeNull();
    expect(sheet.contains(notice)).toBe(true);
    expect(notice.textContent).toContain('could not be read');
  });

  it('renders no notice on the sheet when the columns read cleanly', async () => {
    const fixture = setup(JSON.stringify([{ id: 'company', label: 'Company' }]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.paper__notice')).toBeNull();
  });
});
