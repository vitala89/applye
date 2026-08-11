import { baseCvChoices, documentReviewLanguageFor } from './job-document-defaults';

const job = (over: Record<string, unknown> = {}) => ({ id: 7, ...over }) as never;
const settings = (over: Record<string, unknown> = {}) => ({ ...over }) as never;
const cv = (id: number, over: Record<string, unknown> = {}) =>
  ({ id, language: 'en', isDefault: false, ...over }) as never;

describe('documentReviewLanguageFor', () => {
  it('prefers the language this application already committed to', () => {
    // Changing it mid-application would leave a German CV beside an English
    // cover letter on the same job.
    expect(
      documentReviewLanguageFor(
        { docLanguage: 'de' } as never,
        job({ language: 'fr' }),
        settings(),
      ),
    ).toBe('de');
  });

  it('falls back to the language of the posting', () => {
    expect(
      documentReviewLanguageFor(
        null,
        job({ language: 'fr' }),
        settings({ defaultDocLanguage: 'de' }),
      ),
    ).toBe('fr');
  });

  it('falls back to the user default when the posting does not say', () => {
    expect(documentReviewLanguageFor(null, job(), settings({ defaultDocLanguage: 'de' }))).toBe(
      'de',
    );
  });

  it('lands on English rather than undefined when nothing says anything', () => {
    expect(documentReviewLanguageFor(null, job(), null)).toBe('en');
  });

  it('normalises a language the posting reported in a form we do not support', () => {
    expect(documentReviewLanguageFor(null, job({ language: 'klingon' }), null)).toBe('en');
  });
});

describe('baseCvChoices', () => {
  it('offers the CVs in the job language plus any marked default', () => {
    const cvs = [cv(1, { language: 'de' }), cv(2, { language: 'en' }), cv(3, { isDefault: true })];

    const { matches } = baseCvChoices(cvs, job({ language: 'en' }), settings(), null);

    expect(matches.map((c) => c.id)).toEqual([2, 3]);
  });

  it('defaults the selection to the profile, not to a document', () => {
    // "From scratch" is null. Selecting a CV by accident would silently make
    // the next tailoring build on someone else's document.
    const { selectedId } = baseCvChoices([cv(1)], job({ language: 'en' }), settings(), null);

    expect(selectedId).toBeNull();
  });

  it("selects this job's own tailored CV when it has one", () => {
    const cvs = [cv(1), cv(9)];

    const { selectedId } = baseCvChoices(cvs, job({ language: 'en' }), settings(), 9);

    expect(selectedId).toBe(9);
  });

  it("keeps this job's own CV selectable even when the language filter excludes it", () => {
    // The documented exception, and the reason the filter alone is not enough:
    // a retailor must build on the job's own document, and a CV written in
    // another language would otherwise vanish from the list and reset the
    // choice to the profile.
    const cvs = [cv(1, { language: 'en' }), cv(9, { language: 'uk' })];

    const { matches, selectedId } = baseCvChoices(cvs, job({ language: 'en' }), settings(), 9);

    expect(matches.map((c) => c.id)).toEqual([9, 1]);
    expect(selectedId).toBe(9);
  });

  it('does not select a linked CV that no longer exists in the library', () => {
    const { matches, selectedId } = baseCvChoices(
      [cv(1)],
      job({ language: 'en' }),
      settings(),
      404,
    );

    expect(matches.map((c) => c.id)).toEqual([1]);
    expect(selectedId).toBeNull();
  });

  it('uses the settings default language when the posting does not name one', () => {
    const cvs = [cv(1, { language: 'de' }), cv(2, { language: 'en' })];

    const { matches } = baseCvChoices(cvs, job(), settings({ defaultDocLanguage: 'de' }), null);

    expect(matches.map((c) => c.id)).toEqual([1]);
  });

  it('does not mutate the library list it was given', () => {
    const cvs = [cv(1, { language: 'en' }), cv(9, { language: 'uk' })];

    baseCvChoices(cvs, job({ language: 'en' }), settings(), 9);

    expect(cvs.map((c) => c.id)).toEqual([1, 9]);
  });
});
