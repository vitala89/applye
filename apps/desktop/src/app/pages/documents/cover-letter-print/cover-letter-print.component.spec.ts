import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { CoverLetterPrintStore } from '@applye/application';
import { DbService, DocumentsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { CoverLetterPrintComponent } from './cover-letter-print.component';

const ITEM = {
  id: 7,
  docType: 'cover_letter' as const,
  source: 'manual' as const,
  isDefault: false,
  contentJson: JSON.stringify({
    address: { recipientName: 'Jane Doe' },
    date: '2026-07-09',
    subject: 'Application',
    greeting: 'Dear Jane Doe,',
    bodyParagraphs: ['Paragraph one.'],
    closing: 'Sincerely,',
    signature: 'Vitalii Kasap',
  }),
  styleJson: JSON.stringify({ fontSizePt: 13 }),
};

/** Drives the component's async load + `awaitPrintSettle()` chain to
 * completion. The settle uses real `setTimeout`s (never rAF - an off-screen
 * window throttles it), so the test waits them out rather than faking the
 * clock. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 700));

/** The document's state is `CoverLetterPrintStore`'s since ADR-0005 amendment
 * twenty-seven, and the store is component-scoped - so it comes from the
 * component's own injector rather than the root one. */
const storeOf = (fixture: ComponentFixture<CoverLetterPrintComponent>): CoverLetterPrintStore =>
  fixture.debugElement.injector.get(CoverLetterPrintStore);

describe('CoverLetterPrintComponent', () => {
  let printWindowReady: jest.Mock;

  function setup(item: unknown) {
    printWindowReady = jest.fn().mockResolvedValue(undefined);
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(item),
      printWindowReady,
    };

    TestBed.configureTestingModule({
      imports: [CoverLetterPrintComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        TranslateService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '7' } } },
        },
      ],
    });
    return TestBed.createComponent(CoverLetterPrintComponent);
  }

  afterEach(() => {
    document.body.classList.remove('printing-cv');
    TestBed.resetTestingModule();
  });

  it('renders the stored letter through the editor-shared preview', async () => {
    const fixture = setup(ITEM);
    await settle();
    fixture.detectChanges();

    const letter = storeOf(fixture);
    expect(letter.loaded()).toBe(true);
    expect(letter.content().signature).toBe('Vitalii Kasap');
    // Stored overrides merge over the defaults, exactly as the editor loads them.
    expect(letter.style().fontSizePt).toBe(13);
    expect(fixture.nativeElement.querySelector('app-cover-letter-preview')).toBeTruthy();
  });

  it('flags the DOM printable before telling Rust to print', async () => {
    const fixture = setup(ITEM);
    printWindowReady.mockImplementation(() => {
      // The class MUST already be on at this point - Rust snapshots the DOM as
      // soon as this resolves, and the print styles hang off `body.printing-cv`.
      expect(document.body.classList.contains('printing-cv')).toBe(true);
      return Promise.resolve();
    });

    await settle();
    fixture.detectChanges();

    expect(printWindowReady).toHaveBeenCalled();
  });

  it('never signals ready when the document is missing (Rust times out instead)', async () => {
    const fixture = setup(null);
    await settle();
    fixture.detectChanges();

    expect(storeOf(fixture).loaded()).toBe(false);
    expect(printWindowReady).not.toHaveBeenCalled();
  });
});
