import { TestBed } from '@angular/core/testing';
import { TranslateService } from './translate.service';

describe('TranslateService', () => {
  let service: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TranslateService);
  });

  it('translates in the current UI locale', () => {
    service.setLocale('de');
    expect(service.t()('tracker.col_company')).toBe('Firma');
  });

  describe('tFor', () => {
    it('translates in an explicit locale regardless of the UI locale', () => {
      service.setLocale('en');
      expect(service.tFor('de')('tracker.col_company')).toBe('Firma');
      // The UI locale is untouched by a document-language lookup.
      expect(service.t()('tracker.col_company')).toBe('Company');
    });

    it('falls back to English for a locale with no entry for the key', () => {
      // ru is a partial bundle: a missing key must not blank the label.
      expect(service.tFor('en')('tracker.col_role')).toBe('Role');
    });

    it('returns the key itself when it exists in no bundle', () => {
      expect(service.tFor('de')('tracker.does_not_exist')).toBe('tracker.does_not_exist');
    });
  });
});
