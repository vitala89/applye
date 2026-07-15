import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { CoverLetterDetailComponent } from './cover-letter-detail.component';

describe('CoverLetterDetailComponent preview atoms', () => {
  let component: CoverLetterDetailComponent;
  let fixture: ComponentFixture<CoverLetterDetailComponent>;

  beforeEach(async () => {
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [CoverLetterDetailComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        ToastService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => '1' },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverLetterDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the paginated sheet in preview mode', () => {
    component.doc.set({ id: 1, docType: 'cover_letter', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lib-paginated-sheet')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.letter-sheet')).toBeNull();
  });

  // Atom/geometry coverage lives with the render itself, in
  // `cover-letter-preview.component.spec.ts`.

  it('toggleBlockCollapse flips isBlockOpen and defaults to expanded', () => {
    expect(component.isBlockOpen('recipient')).toBe(true);
    component.toggleBlockCollapse('recipient');
    expect(component.isBlockOpen('recipient')).toBe(false);
    component.toggleBlockCollapse('recipient');
    expect(component.isBlockOpen('recipient')).toBe(true);
    // Collapsing one block leaves others expanded.
    component.toggleBlockCollapse('body');
    expect(component.isBlockOpen('body')).toBe(false);
    expect(component.isBlockOpen('recipient')).toBe(true);
  });

  it('toggleStyleOpen flips the Style card open state, default open', () => {
    expect(component.styleOpen()).toBe(true);
    component.toggleStyleOpen();
    expect(component.styleOpen()).toBe(false);
    component.toggleStyleOpen();
    expect(component.styleOpen()).toBe(true);
  });

  it('exportPdfWysiwyg keeps printing-cv until afterprint (native print is async)', () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    document.body.classList.remove('printing-cv');

    void component.exportPdfWysiwyg();

    expect(printSpy).toHaveBeenCalled();
    expect(document.body.classList.contains('printing-cv')).toBe(true);

    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('printing-cv')).toBe(false);

    printSpy.mockRestore();
  });
});
