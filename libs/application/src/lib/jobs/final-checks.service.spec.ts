import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DbService, SystemGateway } from '@applye/data';
import { DocumentLibraryItem } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { FinalCheckInputs, FinalChecksService } from './final-checks.service';

/**
 * Covers the behaviour that used to live inline in `JobsComponent`. The rules
 * are token-free text analysis, so they are fully testable without a provider;
 * these are the first tests they have ever had.
 *
 * The storage tests run against **jsdom's real `sessionStorage`** rather than a
 * two-method fake behind a stub `DOCUMENT`. The fake implemented `getItem` and
 * `setItem` and nothing else, which is exactly as much of `Storage` as the
 * service happened to use - so it could only ever confirm the calls the service
 * already made, never that they add up to a working round trip.
 */
describe('FinalChecksService', () => {
  let db: { hashText: jest.Mock };

  /** Long enough to clear the 900-character "reasonable CV" floor, and built
   * from the job keywords so the overlap rule is satisfied too. */
  const goodCvText = 'engineering platform delivery kubernetes typescript '.repeat(20);

  /**
   * A readable CV.
   *
   * This used to be `{ summary: text }`, which is not a `CvContent` at all -
   * `cvContentToMd` threw on it, and the service's catch handed the raw JSON
   * back as the document's "text". The checks then ran over JSON syntax that
   * happened to contain the words they were looking for, and passed. The
   * fixture is a real CV now, so a passing check means a readable document was
   * read; `documentText` returns `''` for anything else, and the unreadable
   * case is asserted separately below.
   */
  function cvItem(text = goodCvText): DocumentLibraryItem {
    return {
      id: 1,
      docType: 'cv',
      label: 'CV',
      contentJson: JSON.stringify({
        sections: [{ key: 'summary', order: 0, visible: true, text }],
      }),
      language: 'en',
      regionTag: 'generic',
    } as never;
  }

  /** A CV row whose stored content cannot be parsed at all. */
  function unreadableCvItem(): DocumentLibraryItem {
    return { ...cvItem(), contentJson: '{not json' } as never;
  }

  function letterItem(paragraph: string): DocumentLibraryItem {
    return {
      id: 2,
      docType: 'cover_letter',
      label: 'Letter',
      contentJson: JSON.stringify({ subject: 'S', bodyParagraphs: [paragraph] }),
      language: 'en',
      regionTag: 'generic',
    } as never;
  }

  function inputs(over: Partial<FinalCheckInputs> = {}): FinalCheckInputs {
    return {
      cv: null,
      coverLetter: null,
      jdText: 'engineering platform delivery kubernetes typescript',
      language: 'en',
      region: 'generic',
      ...over,
    };
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  function make(): FinalChecksService {
    db = { hashText: jest.fn(async (s: string) => `hash:${s.length}`) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FinalChecksService,
        { provide: DbService, useValue: db },
        { provide: SystemGateway, useValue: db },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    });
    return TestBed.inject(FinalChecksService);
  }

  it('starts with nothing run and nothing outdated', () => {
    const s = make();
    expect(s.checks()).toBeNull();
    expect(s.outdated()).toBe(false);
  });

  it('builds the i18n key from the status', () => {
    expect(make().statusKey('needs_edits')).toBe('jobs.wizard.final_check_needs_edits');
  });

  it('hashes the documents together with the language and region', async () => {
    const s = make();
    await s.documentsHash(inputs({ cv: cvItem() }));

    const payload = JSON.parse(db.hashText.mock.calls[0][0]);
    expect(payload.cv).toEqual({
      label: 'CV',
      contentJson: cvItem().contentJson,
      language: 'en',
      regionTag: 'generic',
    });
    expect(payload.coverLetter).toBeNull();
    expect(payload.language).toBe('en');
    expect(payload.region).toBe('generic');
  });

  it('flags a missing CV and a missing cover letter', async () => {
    const s = make();
    await s.run(inputs());

    const checks = s.checks();
    expect(checks?.notes).toContain('jobs.wizard.final_note_missing_cv');
    expect(checks?.notes).toContain('jobs.wizard.final_note_missing_cover_letter');
    expect(checks?.ats).toBe('needs_review');
    expect(checks?.hr).toBe('needs_edits');
  });

  it('flags a CV that is too short', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem('too short') }));

    expect(s.checks()?.notes).toContain('jobs.wizard.final_note_short_cv');
    expect(s.checks()?.ats).toBe('needs_review');
  });

  it('flags a cover letter under 500 characters', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem(), coverLetter: letterItem('short letter') }));

    expect(s.checks()?.notes).toContain('jobs.wizard.final_note_short_cover_letter');
  });

  it('flags weak keyword overlap between the CV and the job text', async () => {
    const s = make();
    await s.run(
      inputs({
        cv: cvItem('unrelated '.repeat(120)),
        jdText: 'engineering platform delivery kubernetes typescript',
      }),
    );

    expect(s.checks()?.notes).toContain('jobs.wizard.final_note_keyword_overlap');
  });

  it('passes ATS with a long, overlapping CV and both settings present', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem(), coverLetter: letterItem('x'.repeat(600)) }));

    const checks = s.checks();
    expect(checks?.ats).toBe('pass');
    expect(checks?.hr).toBe('strong');
    expect(checks?.notes).toEqual([]);
    expect(s.outdated()).toBe(false);
    expect(s.unreadableDocuments()).toEqual([]);
  });

  /**
   * The regression this suite exists to hold: an unreadable document used to be
   * fed to the checks as its own raw JSON. That string is long and full of
   * words, so the length floor and the keyword overlap both cleared it and the
   * step reported a confident `pass` on a document it had never read.
   */
  it('does not pass a CV whose stored content cannot be read, and names it', async () => {
    const s = make();
    await s.run(inputs({ cv: unreadableCvItem(), coverLetter: letterItem('x'.repeat(600)) }));

    expect(s.checks()?.ats).not.toBe('pass');
    expect(s.unreadableDocuments()).toEqual(['cv']);
  });

  it('clears the unreadable list when a later run reads the document', async () => {
    const s = make();
    await s.run(inputs({ cv: unreadableCvItem() }));
    expect(s.unreadableDocuments()).toEqual(['cv']);

    await s.run(inputs({ cv: cvItem() }));
    expect(s.unreadableDocuments()).toEqual([]);
  });

  it('records fit as rescore when the previous result was already outdated', async () => {
    const s = make();
    s.outdated.set(true);
    await s.run(inputs({ cv: cvItem() }));

    expect(s.checks()?.fit).toBe('rescore');
    expect(s.outdated()).toBe(false);
  });

  it('stores the hash the run was computed against', async () => {
    const s = make();
    const i = inputs({ cv: cvItem() });
    await s.run(i);

    expect(s.checks()?.inputHash).toBe(await s.documentsHash(i));
  });

  it('refreshFreshness marks the result outdated once a document changes', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem() }));
    expect(s.outdated()).toBe(false);

    await s.refreshFreshness(inputs({ cv: cvItem('a different, much longer body '.repeat(40)) }));
    expect(s.outdated()).toBe(true);
  });

  it('refreshFreshness leaves an unchanged result fresh', async () => {
    const s = make();
    const i = inputs({ cv: cvItem() });
    await s.run(i);

    await s.refreshFreshness(i);
    expect(s.outdated()).toBe(false);
  });

  it('refreshFreshness clears the flag when nothing has been run', async () => {
    const s = make();
    s.outdated.set(true);

    await s.refreshFreshness(inputs());
    expect(s.outdated()).toBe(false);
  });

  it('needRetailor requires a linked CV and a fresh, unhappy result', async () => {
    const s = make();
    expect(s.needRetailor(cvItem())).toBe(false);

    await s.run(inputs({ cv: cvItem('too short') }));
    expect(s.checks()?.ats).toBe('needs_review');
    expect(s.needRetailor(cvItem())).toBe(true);
    expect(s.needRetailor(null)).toBe(false);

    s.outdated.set(true);
    expect(s.needRetailor(cvItem())).toBe(false);
  });

  it('needRetailor is false once the checks pass', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem(), coverLetter: letterItem('x'.repeat(600)) }));

    expect(s.needRetailor(cvItem())).toBe(false);
  });

  it('parks a result under its review hash and restores it', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem() }));
    const before = s.checks();

    s.storeForReturn('rh');
    s.reset();
    expect(s.checks()).toBeNull();

    expect(s.restoreAfterReturn('rh')).toEqual(before);
  });

  it('restores nothing for an unknown or corrupt review hash', () => {
    const s = make();
    expect(s.restoreAfterReturn('missing')).toBeNull();

    sessionStorage.setItem('applye:wizardFinalChecks:corrupt', '{not json');
    expect(s.restoreAfterReturn('corrupt')).toBeNull();
  });

  it('stores nothing when there is no result to park', () => {
    const s = make();
    s.storeForReturn('rh');
    expect(sessionStorage.length).toBe(0);
  });

  it('reset clears both signals', async () => {
    const s = make();
    await s.run(inputs({ cv: cvItem() }));
    s.outdated.set(true);

    s.reset();
    expect(s.checks()).toBeNull();
    expect(s.outdated()).toBe(false);
  });
});
