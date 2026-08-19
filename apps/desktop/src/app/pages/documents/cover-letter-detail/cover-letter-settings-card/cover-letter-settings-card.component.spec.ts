import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CoverLetterContentStore,
  CoverLetterDocumentStore,
  CoverLetterStyleStore,
} from '@applye/application';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { CoverLetterSettingsCardComponent } from './cover-letter-settings-card.component';

describe('CoverLetterSettingsCardComponent', () => {
  let fixture: ComponentFixture<CoverLetterSettingsCardComponent>;
  let letter: CoverLetterContentStore;
  let docs: CoverLetterDocumentStore;

  beforeEach(async () => {
    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = { checkStyleSafety: jest.fn().mockResolvedValue([]) };
    await TestBed.configureTestingModule({
      imports: [CoverLetterSettingsCardComponent],
      providers: [
        CoverLetterContentStore,
        CoverLetterDocumentStore,
        CoverLetterStyleStore,
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverLetterSettingsCardComponent);
    letter = TestBed.inject(CoverLetterContentStore);
    docs = TestBed.inject(CoverLetterDocumentStore);
    fixture.detectChanges();
  });

  function selects(): HTMLSelectElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('select'));
  }

  it('offers the region, the tone and the length', () => {
    const [region, tone, length] = selects();
    expect(region.options).toHaveLength(4);
    expect(tone.options).toHaveLength(4);
    expect(length.options).toHaveLength(3);
  });

  it('writes the region onto the row, not into the letter', async () => {
    const region = selects()[0];
    region.value = 'de';
    region.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(docs.regionTag()).toBe('de');
  });

  it('writes the tone and the length into the letter, not onto the row', async () => {
    const [, tone, length] = selects();
    tone.value = 'Friendly';
    tone.dispatchEvent(new Event('change'));
    length.value = 'Detailed';
    length.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(letter.content().tone).toBe('Friendly');
    expect(letter.content().length).toBe('Detailed');
  });

  describe('the default toggle', () => {
    function toggle(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('.coverdetail__checkbox');
    }

    it('starts off, and reports it to assistive tech', () => {
      expect(docs.isDefault()).toBe(false);
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(toggle().querySelector('lucide-icon')).toBeNull();
    });

    it('flips the row flag and shows its tick', () => {
      toggle().click();
      fixture.detectChanges();
      expect(docs.isDefault()).toBe(true);
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(toggle().classList).toContain('coverdetail__checkbox--active');
      expect(toggle().querySelector('lucide-icon')).not.toBeNull();
    });

    it('flips back off', () => {
      toggle().click();
      fixture.detectChanges();
      toggle().click();
      fixture.detectChanges();
      expect(docs.isDefault()).toBe(false);
      expect(toggle().classList).not.toContain('coverdetail__checkbox--active');
    });
  });
});
