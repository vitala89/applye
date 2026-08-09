import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TrackerColumnsStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { TrackerColumnDrawerComponent } from './tracker-column-drawer.component';

describe('TrackerColumnDrawerComponent', () => {
  let fixture: ComponentFixture<TrackerColumnDrawerComponent>;
  let columns: {
    essentialColumns: { key: string; labelKey: string; pin?: boolean }[];
    optionalColumns: { key: string; labelKey: string }[];
    customColumns: ReturnType<typeof signal<{ id: string; label: string; type: string }[]>>;
    newColumnName: ReturnType<typeof signal<string>>;
    newColumnType: ReturnType<typeof signal<string>>;
    isVisible: jest.Mock;
    toggle: jest.Mock;
    addColumn: jest.Mock;
    removeColumn: jest.Mock;
  };
  let toast: { success: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    columns = {
      essentialColumns: [
        { key: 'company', labelKey: 'tracker.col_company', pin: true },
        { key: 'role', labelKey: 'tracker.col_role' },
      ],
      optionalColumns: [{ key: 'notes', labelKey: 'tracker.col_notes' }],
      customColumns: signal<{ id: string; label: string; type: string }[]>([]),
      newColumnName: signal(''),
      newColumnType: signal('text'),
      isVisible: jest.fn().mockReturnValue(true),
      toggle: jest.fn(),
      addColumn: jest.fn().mockResolvedValue(true),
      removeColumn: jest.fn().mockResolvedValue(undefined),
    };
    toast = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [TrackerColumnDrawerComponent],
      providers: [
        { provide: TrackerColumnsStore, useValue: columns },
        { provide: ToastService, useValue: toast },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrackerColumnDrawerComponent);
    fixture.detectChanges();
  });

  it('closes from its own close button', () => {
    const closed = jest.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement.querySelector('.jt-drawer__head button') as HTMLElement).click();

    expect(closed).toHaveBeenCalled();
  });

  // A pinned column is one the tracker cannot render without. The switch is
  // disabled *and* guarded in the handler, because a disabled button still
  // fires from a scripted click and the guard is the half that means it.
  it('refuses to toggle a pinned column', () => {
    const switches = fixture.nativeElement.querySelectorAll('.jt-switch');
    const pinned = switches[0] as HTMLButtonElement;

    expect(pinned.disabled).toBe(true);
    pinned.click();

    expect(columns.toggle).not.toHaveBeenCalled();
  });

  it('toggles an unpinned column through the store', () => {
    const switches = fixture.nativeElement.querySelectorAll('.jt-switch');
    (switches[1] as HTMLElement).click();

    expect(columns.toggle).toHaveBeenCalledWith('role');
  });

  it('reports a custom column that was added', async () => {
    (fixture.nativeElement.querySelector('.jt-addcol__btn') as HTMLElement).click();
    await fixture.whenStable();

    expect(columns.addColumn).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('tracker.custom_added');
  });

  // The store returns false when it declines the write - an empty name, or a
  // duplicate. Saying "added" then would be a lie the user cannot check.
  it('stays quiet when the store declines the write', async () => {
    columns.addColumn.mockResolvedValue(false);

    (fixture.nativeElement.querySelector('.jt-addcol__btn') as HTMLElement).click();
    await fixture.whenStable();

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the custom section only once a custom column exists', () => {
    expect(fixture.nativeElement.querySelector('.jt-colrow--custom')).toBeNull();

    columns.customColumns.set([{ id: 'c1', label: 'Referral', type: 'text' }]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.jt-colrow--custom');
    expect(row).not.toBeNull();
    expect(row.querySelector('.jt-tag').textContent).toContain('text');
  });

  it('removes a custom column through the store', async () => {
    columns.customColumns.set([{ id: 'c1', label: 'Referral', type: 'text' }]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.jt-colrow--custom button') as HTMLElement).click();
    await fixture.whenStable();

    expect(columns.removeColumn).toHaveBeenCalledWith('c1');
  });
});
