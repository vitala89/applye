import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoverLetterStyleStore } from '@applye/application';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { CoverLetterStylePopoverComponent } from './cover-letter-style-popover.component';

describe('CoverLetterStylePopoverComponent', () => {
  let fixture: ComponentFixture<CoverLetterStylePopoverComponent>;
  let styles: CoverLetterStyleStore;

  beforeEach(async () => {
    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = { checkStyleSafety: jest.fn().mockResolvedValue([]) };
    await TestBed.configureTestingModule({
      imports: [CoverLetterStylePopoverComponent],
      providers: [
        CoverLetterStyleStore,
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverLetterStylePopoverComponent);
    fixture.componentRef.setInput('styleKey', 'greeting');
    styles = TestBed.inject(CoverLetterStyleStore);
    fixture.detectChanges();
  });

  /** The popover's own classes live in the globally emitted
   * `_cover-letter-controls.scss`, because Angular scopes a component's CSS and
   * these rules used to belong to the page. Asserting the root class is what
   * fails if the markup and the partial ever drift apart. */
  it('renders the popover root the shared stylesheet targets', () => {
    expect(fixture.nativeElement.querySelector('.coverdetail__style-pop')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.coverdetail__style-field')).toHaveLength(4);
  });

  it('starts with no override for its key', () => {
    expect(styles.sectionOverride('greeting')).toBeUndefined();
    expect(styles.hasCustomStyle('greeting')).toBe(false);
  });

  it('writes an override under the key it was given, and no other', () => {
    styles.setSectionStyle('greeting', { fontSizePt: 12 });
    fixture.detectChanges();
    expect(styles.sectionOverride('greeting')?.fontSizePt).toBe(12);
    expect(styles.sectionOverride('closing')).toBeUndefined();
  });

  it('resets only its own key', () => {
    styles.setSectionStyle('greeting', { fontSizePt: 12 });
    styles.setSectionStyle('closing', { fontSizePt: 14 });

    (fixture.nativeElement.querySelector('.coverdetail__style-reset') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(styles.hasCustomStyle('greeting')).toBe(false);
    expect(styles.sectionOverride('closing')?.fontSizePt).toBe(14);
  });

  it('offers the document size as the placeholder, so an empty field reads as inherited', () => {
    styles.updateStyle({ fontSizePt: 13 });
    fixture.detectChanges();
    const size = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    expect(size.placeholder).toBe('13');
    expect(size.value).toBe('');
  });

  // `await whenStable()` rather than `detectChanges()` alone: `ngModel` writes
  // the initial value to the DOM through a microtask, so the element still
  // reads empty on the synchronous pass.
  it('follows the key it is given, so one instance can serve a different block', async () => {
    styles.setSectionStyle('body_2', { fontSizePt: 11 });
    fixture.componentRef.setInput('styleKey', 'body_2');
    fixture.detectChanges();
    await fixture.whenStable();
    const size = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    expect(size.value).toBe('11');
  });
});
