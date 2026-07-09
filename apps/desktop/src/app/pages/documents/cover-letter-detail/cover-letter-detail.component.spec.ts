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

  it('emits one atom per body paragraph plus the fixed blocks', () => {
    component.doc.set({ id: 1, docType: 'cover_letter', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.content.set({
      address: { recipientName: 'Jane Doe', company: 'Acme' },
      date: '2026-07-09',
      subject: 'Application for Software Engineer',
      greeting: 'Dear Jane Doe,',
      bodyParagraphs: ['Paragraph one.', 'Paragraph two.', 'Paragraph three.'],
      closing: 'Sincerely,',
      signature: 'Vitalii Kasap',
    });
    component.previewMode.set(true);
    fixture.detectChanges();

    const ids = component.atoms().map((a) => a.id);
    expect(ids).toEqual([
      'address',
      'date',
      'subject',
      'greeting',
      'body:0',
      'body:1',
      'body:2',
      'closing',
      'signature',
    ]);
  });

  it('omits the subject atom when the letter has no subject', () => {
    component.doc.set({ id: 1, docType: 'cover_letter', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.content.set({
      address: { recipientName: 'Jane Doe' },
      date: '2026-07-09',
      subject: '',
      greeting: 'Dear Jane Doe,',
      bodyParagraphs: ['Paragraph one.'],
      closing: 'Sincerely,',
      signature: 'Vitalii Kasap',
    });
    component.previewMode.set(true);
    fixture.detectChanges();

    const ids = component.atoms().map((a) => a.id);
    expect(ids).toEqual(['address', 'date', 'greeting', 'body:0', 'closing', 'signature']);
  });

  it('exposes A4 sheet dimensions via geometry', () => {
    component.style.set({
      ...component.style(),
      page: { size: 'a4', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
    });
    const g = component.geometry();
    expect(g.pageWidthPx).toBeCloseTo((210 * 96) / 25.4);
    expect(g.marginTopPx).toBeCloseTo((20 * 96) / 25.4);
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
