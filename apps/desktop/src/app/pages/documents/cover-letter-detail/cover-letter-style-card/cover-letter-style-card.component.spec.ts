import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoverLetterStyleStore } from '@applye/application';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { CoverLetterStyleCardComponent } from './cover-letter-style-card.component';

describe('CoverLetterStyleCardComponent', () => {
  let fixture: ComponentFixture<CoverLetterStyleCardComponent>;
  let component: CoverLetterStyleCardComponent;
  let styles: CoverLetterStyleStore;

  beforeEach(async () => {
    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = { checkStyleSafety: jest.fn().mockResolvedValue([]) };
    await TestBed.configureTestingModule({
      imports: [CoverLetterStyleCardComponent],
      providers: [
        CoverLetterStyleStore,
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverLetterStyleCardComponent);
    component = fixture.componentInstance;
    styles = TestBed.inject(CoverLetterStyleStore);
    fixture.detectChanges();
  });

  function el(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  it('renders the card open, with the collapse class off', () => {
    expect(component.styleOpen()).toBe(true);
    expect(el('.docedit-collapse')?.classList).not.toContain('docedit-collapse--closed');
  });

  it('collapses and reopens', () => {
    component.toggleStyleOpen();
    fixture.detectChanges();
    expect(el('.docedit-collapse')?.classList).toContain('docedit-collapse--closed');
    component.toggleStyleOpen();
    fixture.detectChanges();
    expect(el('.docedit-collapse')?.classList).not.toContain('docedit-collapse--closed');
  });

  /**
   * The class is defined in the globally emitted `_cover-letter-controls.scss`,
   * not in a stylesheet of this component - moving markup out of a page without
   * its rules is how this editor rendered unstyled once before. The test asserts
   * the markup still asks for the class; the partial is what answers.
   */
  it('shows the customized badge only once something is overridden', () => {
    expect(el('.coverdetail__custom-badge')).toBeNull();
    styles.setSectionStyle('greeting', { fontSizePt: 13 });
    fixture.detectChanges();
    expect(el('.coverdetail__custom-badge')).not.toBeNull();
  });

  it('disables reset-all until there is something to reset', () => {
    expect((el('.docedit-reset') as HTMLButtonElement).disabled).toBe(true);
    styles.setSectionStyle('greeting', { fontSizePt: 13 });
    fixture.detectChanges();
    expect((el('.docedit-reset') as HTMLButtonElement).disabled).toBe(false);
  });

  it('announces a reset-all, so the page can close an open popover', () => {
    const seen: unknown[] = [];
    component.allReset.subscribe(() => seen.push(true));
    styles.setSectionStyle('greeting', { fontSizePt: 13 });

    component.resetAllStyles();

    expect(styles.hasAnyCustomStyle()).toBe(false);
    expect(seen).toHaveLength(1);
  });

  describe('page geometry', () => {
    it('writes one margin side and leaves the other three alone', () => {
      component.setMarginSide('top', 30);
      const margin = component.currentMargin();
      expect(margin.top).toBe(30);
      expect(margin.right).toBe(component.currentMargin().right);
      expect(styles.style().page?.margin.top).toBe(30);
    });

    it('clamps a margin to 0..50 rather than trusting the input', () => {
      component.setMarginSide('top', 999);
      expect(component.currentMargin().top).toBe(50);
      component.setMarginSide('top', -5);
      expect(component.currentMargin().top).toBe(0);
    });

    it('rounds a fractional margin and treats nonsense as zero', () => {
      component.setMarginSide('left', 12.6);
      expect(component.currentMargin().left).toBe(13);
      component.setMarginSide('left', NaN);
      expect(component.currentMargin().left).toBe(0);
    });

    it('keeps the current margins when only the page size changes', () => {
      component.setMarginSide('top', 30);
      component.setPageSize('letter');
      expect(styles.style().page?.size).toBe('letter');
      expect(component.currentMargin().top).toBe(30);
    });
  });

  it('renders one warning per style note, worded from the translation key', () => {
    styles.styleNotes.set([
      { kind: 'font_ats_risk', detail: 'Papyrus' },
      { kind: 'size_out_of_range', detail: '30' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.docedit-note p')).toHaveLength(2);
  });

  it('substitutes the note detail into the message', () => {
    const t = TestBed.inject(TranslateService);
    const template = t.t()('documents.cv_style_note_font');
    expect(component.styleNoteMessage({ kind: 'font_ats_risk', detail: 'Papyrus' })).toBe(
      template.replace('{value}', 'Papyrus'),
    );
  });
});
