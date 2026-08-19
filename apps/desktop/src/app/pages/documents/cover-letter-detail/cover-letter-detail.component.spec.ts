import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService, DbService, DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { CoverLetterDetailComponent } from './cover-letter-detail.component';
import { CoverLetterStyleCardComponent } from './cover-letter-style-card/cover-letter-style-card.component';

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
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
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

  // The Style card's own collapse moved into `cover-letter-style-card/` with the
  // markup that reads it, and its spec covers it there. What stays here is the
  // *popover* key: it is one-at-a-time across the whole editor, so the page owns
  // it, and the card has to tell the page when a reset-all makes it stale. This
  // asserts that wiring rather than the signal.
  it('closes an open style popover when the card reports a reset-all', () => {
    component.doc.set({ id: 1, docType: 'cover_letter', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(false);
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.directive(CoverLetterStyleCardComponent));
    expect(card).toBeTruthy();
    component.openStyleKey.set('greeting');

    card.componentInstance.resetAllStyles();

    expect(component.openStyleKey()).toBeNull();
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

describe('CoverLetterDetailComponent back navigation', () => {
  async function setup(params: Record<string, string | null>) {
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
    };
    const navigate = jest.fn();

    await TestBed.configureTestingModule({
      imports: [CoverLetterDetailComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        ToastService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => '1' },
              queryParamMap: { get: (key: string) => params[key] ?? null },
            },
          },
        },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CoverLetterDetailComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, navigate };
  }

  it('returns to the job it was opened from (returnTo=myJobs)', async () => {
    const { component, navigate } = await setup({
      returnTo: 'myJobs',
      jobId: '42',
      jobLabel: 'Acme Corp',
    });
    component.back();
    expect(navigate).toHaveBeenCalledWith(['/jobs', '42']);
  });

  it('back label names the job it returns to', async () => {
    const { component } = await setup({ returnTo: 'myJobs', jobId: '42', jobLabel: 'Acme Corp' });
    expect(component.backLabel()).toContain('Acme Corp');
  });

  it('falls back to the Documents list with no returnTo context', async () => {
    const { component, navigate } = await setup({});
    component.back();
    expect(navigate).toHaveBeenCalledWith(['/documents'], { queryParams: { tab: 'cover-letter' } });
  });
});
