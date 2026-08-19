import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TrackerRow } from '@applye/core';
import { DbService, DocumentsGateway, JobsGateway, TrackerGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService, TrackerColumnsStore, TrackerRowEditorStore } from '@applye/application';
import { TrackerComponent } from './tracker.component';

/**
 * **Written before the grid was extracted, deliberately.** Every other component
 * under `pages/tracker/` has a spec and the page itself had none, so the largest
 * block on it - the table - was the one part of this screen no test had ever
 * rendered. Everything here asserts against the rendered DOM rather than against
 * which component drew it, so the same assertions hold before and after
 * `app-tracker-table` exists.
 *
 * **The cell branches are counted, not merely found.** The read side of a cell
 * is an eight-way `@if` chain over the column type, and "a status pill exists
 * somewhere in the table" passes while every column has become a status pill.
 * Each branch is therefore counted against the number of columns that should
 * produce it.
 */
const TODAY = new Date().toISOString().slice(0, 10);

/** Yields to the macrotask queue so a floating promise can settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function row(partial: Partial<TrackerRow> = {}): TrackerRow {
  return {
    id: 1,
    jobId: 11,
    appliedAt: TODAY,
    company: 'Northlane',
    title: 'UI Engineer',
    status: 'applied',
    sourceUrl: 'https://example.com/job',
    notes: 'called back',
    archived: false,
    ...partial,
  } as TrackerRow;
}

describe('TrackerComponent grid', () => {
  let fixture: ComponentFixture<TrackerComponent>;
  let navigate: jest.Mock;
  let updateFields: jest.Mock;

  async function mount(rows: TrackerRow[] = [row()]): Promise<void> {
    navigate = jest.fn();
    updateFields = jest.fn().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    // One stub, two tokens: the grid's rows and archiving come from
    // `TrackerGateway` now, and the rest is still `DbService`'s.
    const dbStub = {
      trackerRows: jest.fn().mockResolvedValue(rows),
      getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en' }),
      trackerCustomColumns: jest.fn().mockResolvedValue([]),
      updateApplicationTrackerFields: updateFields,
      setApplicationArchived: jest.fn().mockResolvedValue(undefined),
      setApplicationStatus: jest.fn().mockResolvedValue(undefined),
      deleteJob: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [TrackerComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: TrackerGateway, useValue: dbStub },
        { provide: Router, useValue: { navigate } },
        TranslateService,
        ToastService,
      ],
    });
    fixture = TestBed.createComponent(TrackerComponent);
    fixture.detectChanges();
    // The page loads from its constructor as a floating promise, which
    // `whenStable` does not track in a zoneless application - two macrotasks
    // settle the two awaited gateway reads.
    await flush();
    await flush();
    fixture.detectChanges();
  }

  const all = (s: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(s));
  const one = (s: string): HTMLElement | null => fixture.nativeElement.querySelector(s);
  const text = (s: string): string => (one(s)?.textContent ?? '').trim();
  /** How many columns the grid is currently showing, from its own header. */
  const visibleCols = (): number => all('thead .jt-th').length - 2;

  /** Turns on a column the grid hides by default, and redraws. */
  function showSourceUrl(): void {
    const columns = fixture.debugElement.injector.get(TrackerColumnsStore);
    columns.columnState.update((s) => ({ ...s, sourceUrl: true }));
    fixture.detectChanges();
  }

  describe('the header', () => {
    it('draws one heading per visible column, plus the index and action columns', async () => {
      await mount();

      expect(all('thead tr').length).toBe(1);
      expect(all('thead .jt-th--idx').length).toBe(1);
      expect(all('thead .jt-th--act').length).toBe(1);
      expect(visibleCols()).toBeGreaterThan(0);
      expect(all('.jt-th__inner').length).toBe(visibleCols());
    });

    /** The pencil marks a column the user can edit in place. Not every column
     *  carries one, which is the whole point of the mark. */
    it('marks the editable columns and only those', async () => {
      await mount();

      const pencils = all('.jt-th__pencil').length;
      expect(pencils).toBeGreaterThan(0);
      expect(pencils).toBeLessThan(visibleCols());
      expect(all('.jt-th__mark').length).toBe(0);
    });
  });

  describe('the rows', () => {
    it('draws one row per view row, numbered from 01', async () => {
      await mount([row({ id: 1 }), row({ id: 2, jobId: 12 }), row({ id: 3, jobId: 13 })]);

      expect(all('tbody .jt-row').length).toBe(3);
      expect(all('.jt-td--idx').map((c) => c.textContent?.trim())).toEqual(['01', '02', '03']);
    });

    it('gives every row one cell per column, plus its index and its actions', async () => {
      await mount();

      expect(all('tbody .jt-row').length).toBe(1);
      expect(all('tbody .jt-td').length).toBe(visibleCols() + 2);
      expect(all('.jt-td--act app-tracker-row-actions').length).toBe(1);
    });

    it('marks an archived row', async () => {
      await mount([row({ archived: true, id: 4 })]);

      // The archived segment is where an archived row shows.
      fixture.componentInstance.segment.set('archived');
      fixture.detectChanges();

      expect(all('.jt-row.is-archived').length).toBe(1);
    });
  });

  describe('the read side of a cell', () => {
    /** The company cell is a link only when there is a job behind the row.
     *  Both halves are counted, because the fallback is silent. */
    it('links the company when the row has a job, and does not when it has none', async () => {
      await mount([row()]);
      expect(all('.jt-joblink').length).toBe(1);
      expect(all('.jt-strong').length).toBe(0);
      expect(text('.jt-joblink')).toContain('Northlane');

      await mount([row({ jobId: undefined })]);
      expect(all('.jt-joblink').length).toBe(0);
      expect(all('.jt-strong').length).toBe(1);
      expect(text('.jt-strong')).toBe('Northlane');
    });

    /** By JOB id, not the application id the row is keyed by - and it must be
     *  the clicked row's job, which one row on screen cannot show. */
    it('opens the job behind the clicked row, by job id', async () => {
      await mount([row({ id: 7, jobId: 42 }), row({ id: 8, jobId: 43 })]);

      (all('.jt-joblink')[1] as HTMLElement).click();

      expect(navigate).toHaveBeenCalledWith(['/jobs', 43]);
      expect(navigate).not.toHaveBeenCalledWith(['/jobs', 42]);
      expect(navigate).not.toHaveBeenCalledWith(['/jobs', 8]);
    });

    /** Exactly one status pill per row, carrying the row's status as data. */
    it('draws one status pill per row, keyed by the status', async () => {
      await mount([row({ status: 'interview' }), row({ id: 2, jobId: 12, status: 'offer' })]);

      const pills = all('.jt-status');
      expect(pills.length).toBe(2);
      expect(pills.map((p) => p.getAttribute('data-status'))).toEqual(['interview', 'offer']);
      expect(all('.jt-status__dot').length).toBe(2);
    });

    /** `sourceUrl` is not one of the columns the grid shows by default, so this
     *  turns it on first - which also exercises the path from the column state
     *  to a rendered cell. */
    it('offers the source link only when there is a url', async () => {
      await mount([row()]);
      showSourceUrl();
      expect(all('a.jt-link').length).toBe(1);
      expect(one('a.jt-link')?.getAttribute('href')).toBe('https://example.com/job');
      expect(one('a.jt-link')?.getAttribute('rel')).toBe('noopener');
      expect(one('a.jt-link')?.getAttribute('target')).toBe('_blank');

      await mount([row({ sourceUrl: undefined })]);
      showSourceUrl();
      expect(all('a.jt-link').length).toBe(0);
      expect(all('.jt-dim').length).toBeGreaterThan(0);
    });

    /** The stage cell is the only one that draws two values, and the second is
     *  conditional on the first. */
    it('shows the next stage with its date, the label alone, or a dash', async () => {
      await mount([row({ nextStageLabel: 'Technical round', nextStageAt: '2026-09-03' })]);
      expect(all('.jt-stage').length).toBe(1);
      expect(text('.jt-stage__label')).toBe('Technical round');
      expect(all('.jt-stage__date').length).toBe(1);

      await mount([row({ nextStageLabel: 'Technical round', nextStageAt: undefined })]);
      expect(all('.jt-stage__label').length).toBe(1);
      expect(all('.jt-stage__date').length).toBe(0);

      await mount([row({ nextStageLabel: undefined })]);
      expect(all('.jt-stage').length).toBe(0);
    });

    /** An empty cell reads as a dash rather than as nothing, which is what
     *  keeps the grid's rows the same height. */
    it('dims an empty cell instead of leaving it blank', async () => {
      await mount([row({ notes: undefined, techStack: undefined })]);

      const dimmed = all('.jt-dim');
      expect(dimmed.length).toBeGreaterThan(0);
      for (const cell of dimmed) {
        expect(cell.textContent?.trim()).toBe('-');
      }
    });
  });

  describe('editing a row in place', () => {
    /** Nothing is an input until a row is being edited - the grid is read-only
     *  by default, and that is the branch a split is most likely to invert. */
    it('shows no inputs until a row is opened for editing', async () => {
      await mount();

      expect(all('.jt-input').length).toBe(0);
      expect(all('.jt-row.is-editing').length).toBe(0);
    });

    it('turns only the editable columns of only that row into inputs', async () => {
      await mount([row({ id: 1 }), row({ id: 2, jobId: 12 })]);
      const editor = fixture.debugElement.injector.get(TrackerRowEditorStore);

      editor.start(fixture.componentInstance['rows'].view()[0]);
      fixture.detectChanges();

      expect(all('.jt-row.is-editing').length).toBe(1);
      const inputs = all('.jt-input').length;
      expect(inputs).toBeGreaterThan(0);
      expect(inputs).toBeLessThan(visibleCols());
      // The second row is untouched.
      expect(all('tbody tr')[1].querySelectorAll('.jt-input').length).toBe(0);
    });

    /** A status column edits through a select of the six statuses; a date
     *  column through a date input. The type of the control is the only thing
     *  stopping a user typing free text into a status. */
    it('gives each column type the control it needs', async () => {
      await mount();
      const editor = fixture.debugElement.injector.get(TrackerRowEditorStore);

      editor.start(fixture.componentInstance['rows'].view()[0]);
      fixture.detectChanges();

      const selects = all('select.jt-input') as HTMLSelectElement[];
      expect(selects.length).toBeGreaterThan(0);
      expect(selects[0].querySelectorAll('option').length).toBe(6);

      const dates = all('input.jt-input').filter((i) => i.getAttribute('type') === 'date');
      expect(dates.length).toBeGreaterThan(0);
    });

    it('writes what was typed into the draft', async () => {
      await mount();
      const editor = fixture.debugElement.injector.get(TrackerRowEditorStore);

      editor.start(fixture.componentInstance['rows'].view()[0]);
      fixture.detectChanges();

      const input = all('input.jt-input').find(
        (i) => i.getAttribute('type') === 'text',
      ) as HTMLInputElement;
      input.value = 'rewritten';
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(Object.values(editor.draft())).toContain('rewritten');
    });
  });

  describe('the branches around the grid', () => {
    it('says the list is empty rather than drawing an empty table', async () => {
      await mount([]);

      expect(all('.jt__table').length).toBe(0);
      expect(all('.jt__empty').length).toBe(1);
      expect(all('app-tracker-summary-strip').length).toBe(0);
    });

    it('draws the table and the summary strip together when there are rows', async () => {
      await mount();

      expect(all('.jt__table').length).toBe(1);
      expect(all('.jt__scroll').length).toBe(1);
      expect(all('app-tracker-summary-strip').length).toBe(1);
      expect(all('.jt__empty').length).toBe(0);
    });

    /** Which row's menu is open is page state, handed down to the grid. Only
     *  the trigger of that row reports itself expanded - a row-actions button
     *  is the only place the flag is visible at all. */
    it('marks only the row whose menu is open as expanded', async () => {
      await mount([row({ id: 1 }), row({ id: 2, jobId: 12 })]);

      const expanded = (): (string | null)[] =>
        all('app-tracker-row-actions [aria-expanded]').map((b) => b.getAttribute('aria-expanded'));
      expect(expanded()).toEqual(['false', 'false']);

      fixture.componentInstance.menuId.set(2);
      fixture.detectChanges();

      expect(expanded()).toEqual(['false', 'true']);
    });

    /** Scrolling the grid dismisses an open row menu, because the menu is a
     *  fixed-position popup anchored to a cell that has just moved. */
    it('closes an open row menu when the grid scrolls', async () => {
      await mount();
      const page = fixture.componentInstance;
      page.menuId.set(1);
      page.menuRow.set(page['rows'].view()[0]);
      page.menuPos.set({ top: 10, left: 10 });
      fixture.detectChanges();
      expect(all('app-tracker-row-menu').length).toBe(1);

      one('.jt__scroll')?.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();

      expect(page.menuId()).toBeNull();
      expect(all('app-tracker-row-menu').length).toBe(0);
    });
  });
});
