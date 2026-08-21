import { ComponentFixture, TestBed } from '@angular/core/testing';
import { COVER_LETTER_STYLE_DEFAULT, PRINT_PX_PER_MM, type CoverLetterContent } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CoverLetterPreviewComponent } from './cover-letter-preview.component';

const CONTENT: CoverLetterContent = {
  address: { recipientName: 'Jane Doe', company: 'Acme' },
  date: '2026-07-09',
  subject: 'Application for Software Engineer',
  greeting: 'Dear Jane Doe,',
  bodyParagraphs: ['Paragraph one.', 'Paragraph two.', 'Paragraph three.'],
  closing: 'Sincerely,',
  signature: 'Vitalii Kasap',
};

describe('CoverLetterPreviewComponent', () => {
  let component: CoverLetterPreviewComponent;
  let fixture: ComponentFixture<CoverLetterPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoverLetterPreviewComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverLetterPreviewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('content', CONTENT);
    fixture.componentRef.setInput('style', { ...COVER_LETTER_STYLE_DEFAULT });
    fixture.detectChanges();
  });

  it('renders the paginated sheet', () => {
    expect(fixture.nativeElement.querySelector('lib-paginated-sheet')).toBeTruthy();
  });

  it('emits one atom per body paragraph plus the fixed blocks', () => {
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
    fixture.componentRef.setInput('content', {
      ...CONTENT,
      subject: '',
      bodyParagraphs: ['Paragraph one.'],
    });
    fixture.detectChanges();

    const ids = component.atoms().map((a) => a.id);
    expect(ids).toEqual(['address', 'date', 'greeting', 'body:0', 'closing', 'signature']);
  });

  // The page is modelled at the scale the **print** pipeline uses, not the
  // display convention. Exported PDFs write every text matrix at 0.8 points per
  // CSS pixel - 90 to the inch - and `96 / 25.4` therefore modelled every page
  // 6.67% larger than the sheet: the measured column came out wider than the
  // printable area so text wrapped differently in the export, and the paginator
  // packed 971px of content into a card where only 911px could print, so the
  // bottom of each card was clipped away. That is `B4`. See `PRINT_PX_PER_MM`.
  it('exposes A4 sheet dimensions via geometry', () => {
    fixture.componentRef.setInput('style', {
      ...COVER_LETTER_STYLE_DEFAULT,
      page: { size: 'a4', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
    });
    const g = component.geometry();
    expect(g.pageWidthPx).toBeCloseTo(210 * PRINT_PX_PER_MM);
    expect(g.marginTopPx).toBeCloseTo(20 * PRINT_PX_PER_MM);
  });
});
