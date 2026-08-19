import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CoverLetterContentStore,
  CoverLetterDocumentStore,
  CoverLetterStyleStore,
} from '@applye/application';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { CoverLetterAvailabilityCardComponent } from './cover-letter-availability-card.component';

describe('CoverLetterAvailabilityCardComponent', () => {
  let fixture: ComponentFixture<CoverLetterAvailabilityCardComponent>;
  let letter: CoverLetterContentStore;
  let docs: CoverLetterDocumentStore;

  beforeEach(async () => {
    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = { checkStyleSafety: jest.fn().mockResolvedValue([]) };
    await TestBed.configureTestingModule({
      imports: [CoverLetterAvailabilityCardComponent],
      providers: [
        CoverLetterContentStore,
        CoverLetterDocumentStore,
        CoverLetterStyleStore,
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverLetterAvailabilityCardComponent);
    letter = TestBed.inject(CoverLetterContentStore);
    docs = TestBed.inject(CoverLetterDocumentStore);
    fixture.detectChanges();
  });

  function inputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.docedit-field input'));
  }

  /**
   * These four inputs sit in a plain `.docedit-field`, which the global
   * `_editor-shell.scss` does NOT give a control rule - only `.docedit-style-grid`
   * gets one. On the page they were styled by `.coverdetail input:not(...)`, a
   * selector rooted at the page element that Angular's encapsulation stops here,
   * so this component carries its own copy keyed on `.docedit-field input`.
   * This test fails if the markup stops matching it (ADR-0005, amendment sixteen).
   *
   * jsdom performs no layout and does not resolve custom properties, so the
   * rendering itself still cannot be asserted. A visual check is owed.
   */
  it('keeps all four inputs inside the class its stylesheet targets', () => {
    expect(inputs()).toHaveLength(4);
  });

  it('writes each answer into the content store under its own field', () => {
    const [start, salary, notice, attachments] = inputs();
    for (const [el, value] of [
      [start, 'ab sofort'],
      [salary, '75.000 EUR brutto/Jahr'],
      [notice, '3 Monate zum Quartalsende'],
      [attachments, 'Lebenslauf, Zeugnisse'],
    ] as const) {
      el.value = value;
      el.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();

    expect(letter.content().earliestStart).toBe('ab sofort');
    expect(letter.content().salaryExpectation).toBe('75.000 EUR brutto/Jahr');
    expect(letter.content().noticePeriod).toBe('3 Monate zum Quartalsende');
    expect(letter.content().attachments).toBe('Lebenslauf, Zeugnisse');
  });

  function hints(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.docedit-card__hint') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim() ?? '');
  }

  /**
   * Two hints with one class, and they answer different questions: the German
   * one says why a market expects these answers and is regional, the other says
   * what the card does with them and is not. Counting them is what keeps the
   * regional one regional - asserting "a hint exists" would pass either way.
   */
  it('shows the German market hint only for a DE letter', () => {
    expect(hints()).toHaveLength(1);
    docs.regionTag.set('de');
    fixture.detectChanges();
    expect(hints()).toHaveLength(2);
    expect(hints()[0]).toContain('German postings');
  });

  /**
   * The card is invisible in the preview by design - these answers reach the
   * letter through the AI prompt and land in the final body paragraph. Filling
   * them in and seeing nothing change is the confusion this line exists to
   * prevent, so it is not allowed to be regional and it is not allowed to
   * vanish.
   */
  it('always explains that the answers apply on the next generation', () => {
    for (const region of ['us', 'de', 'fr']) {
      docs.regionTag.set(region);
      fixture.detectChanges();
      expect(hints().at(-1)).toContain('regenerate');
    }
  });

  it('still offers the fields outside DE - a posting anywhere may ask for them', () => {
    docs.regionTag.set('us');
    fixture.detectChanges();
    expect(inputs()).toHaveLength(4);
    expect(hints()).toHaveLength(1);
  });
});
