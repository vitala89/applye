import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService, DocumentsGateway, JobsGateway, ProfileSettingsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { CoverLetterDetailComponent } from './cover-letter-detail.component';
import { CoverLetterStyleCardComponent } from './cover-letter-style-card/cover-letter-style-card.component';

describe('CoverLetterDetailComponent preview atoms', () => {
  let component: CoverLetterDetailComponent;
  let fixture: ComponentFixture<CoverLetterDetailComponent>;

  beforeEach(async () => {
    const dbStub: Partial<ProfileSettingsGateway> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
      listApplications: jest.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [CoverLetterDetailComponent],
      providers: [
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

  // Export no longer raises the OS print dialog. It saves and hands the letter
  // to the same export the Documents list uses, which drives the print from
  // Rust with the document's own margins on `NSPrintInfo` - the macOS dialog
  // owns its own, so the Style card's margins could never reach an export made
  // from here (`B4`). Kept as a tripwire: a `window.print()` put back on this
  // path restores a second export that answers differently from the first.
  it('exportPdfWysiwyg does not print - it saves and exports', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    document.body.classList.remove('printing-cv');

    await component.exportPdfWysiwyg();

    expect(printSpy).not.toHaveBeenCalled();
    expect(document.body.classList.contains('printing-cv')).toBe(false);
    printSpy.mockRestore();
  });

  // A raw Cmd/Ctrl+P used to print the whole app shell: none of the print
  // stylesheet ever activated outside the two hidden export routes.
  it('Direct OS/browser print hides the app shell on beforeprint and restores it on afterprint', () => {
    window.dispatchEvent(new Event('beforeprint'));
    fixture.detectChanges();
    expect(document.body.classList.contains('printing-cv')).toBe(true);

    window.dispatchEvent(new Event('afterprint'));
    fixture.detectChanges();
    expect(document.body.classList.contains('printing-cv')).toBe(false);
  });
});

describe('CoverLetterDetailComponent back navigation', () => {
  async function setup(params: Record<string, string | null>) {
    const dbStub: Partial<ProfileSettingsGateway> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
      listApplications: jest.fn().mockResolvedValue([]),
    };
    const navigate = jest.fn();

    await TestBed.configureTestingModule({
      imports: [CoverLetterDetailComponent],
      providers: [
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

describe('CoverLetterDetailComponent applied lock (P2)', () => {
  const docItem = {
    id: 1,
    docType: 'cover_letter' as const,
    source: 'manual' as const,
    isDefault: false,
    contentJson: JSON.stringify({
      address: {},
      date: '',
      subject: '',
      greeting: '',
      bodyParagraphs: [''],
      closing: '',
      signature: '',
    }),
    styleJson: JSON.stringify({ fontSizePt: 13 }),
  };

  async function setup(linkedApp: Record<string, unknown> | null) {
    const dbStub: Partial<ProfileSettingsGateway> = {
      documentLibraryGet: jest.fn().mockResolvedValue(docItem),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
      listApplications: jest
        .fn()
        .mockResolvedValue(linkedApp ? [{ coverLetterDocumentId: 1, ...linkedApp }] : []),
    };

    await TestBed.configureTestingModule({
      imports: [CoverLetterDetailComponent],
      providers: [
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        ToastService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '1' }, queryParamMap: { get: () => null } },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CoverLetterDetailComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('stays editable while the linking application is still saved', async () => {
    const fixture = await setup({ status: 'saved' });

    expect(fixture.componentInstance.locked()).toBe(false);
    expect(fixture.componentInstance.previewMode()).toBe(false);
  });

  it('forces Preview and hides Edit once the application has left saved', async () => {
    const fixture = await setup({ status: 'applied' });

    expect(fixture.componentInstance.locked()).toBe(true);
    expect(fixture.componentInstance.previewMode()).toBe(true);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain(fixture.componentInstance['t']()('documents.locked_badge'));
  });
});
