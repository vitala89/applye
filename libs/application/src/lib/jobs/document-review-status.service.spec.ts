import { TestBed } from '@angular/core/testing';
import { DocumentReviewStatusService } from './document-review-status.service';

describe('DocumentReviewStatusService', () => {
  let svc: DocumentReviewStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DocumentReviewStatusService] });
    svc = TestBed.inject(DocumentReviewStatusService);
  });

  describe('the two kinds of failure', () => {
    it('records an unexpected failure apart from the status line', () => {
      svc.fail(new Error('database is gone'));

      expect(svc.status()).toContain('database is gone');
      expect(svc.error()).toBe(true);
      expect(svc.unexpectedFailure()).toBe(svc.status());
    });

    it('does not mark a refused precondition as an unexpected failure', () => {
      svc.refuse('Tailor the CV first.');

      expect(svc.status()).toBe('Tailor the CV first.');
      expect(svc.error()).toBe(true);
      expect(svc.unexpectedFailure()).toBeNull();
    });
  });

  describe('run', () => {
    it('clears a stale error before the work starts', async () => {
      svc.fail('previous failure');

      const pending = svc.run(async () => {
        // Observed inside the body: the line must already be clean, or a
        // failure from a previous attempt is on screen during this one.
        expect(svc.status()).toBe('');
        expect(svc.error()).toBe(false);
        return 'done';
      });

      expect(await pending).toBe('done');
    });

    it('returns the body result and leaves the status line clean on success', async () => {
      expect(await svc.run(async () => 42)).toBe(42);
      expect(svc.status()).toBe('');
      expect(svc.error()).toBe(false);
    });

    it('swallows a throw into the status line and returns null', async () => {
      const result = await svc.run(async () => {
        throw new Error('upstream said no');
      });

      expect(result).toBeNull();
      expect(svc.error()).toBe(true);
      expect(svc.status()).toContain('upstream said no');
      expect(svc.unexpectedFailure()).toContain('upstream said no');
    });

    it('keeps a message the body set for itself', async () => {
      await svc.run(async () => svc.succeed('CV linked'));

      expect(svc.status()).toBe('CV linked');
      expect(svc.error()).toBe(false);
    });

    it('lets a body that refuses report its own reason rather than an error', async () => {
      const result = await svc.run(async () => {
        svc.refuse('No profile yet.');
        return null;
      });

      expect(result).toBeNull();
      expect(svc.status()).toBe('No profile yet.');
      expect(svc.unexpectedFailure()).toBeNull();
    });
  });

  describe('succeed', () => {
    it('clears an error left by an earlier attempt', () => {
      svc.fail('boom');
      svc.succeed('saved, unchanged');

      expect(svc.status()).toBe('saved, unchanged');
      expect(svc.error()).toBe(false);
      expect(svc.unexpectedFailure()).toBeNull();
    });
  });

  describe('the choose-existing dialogs', () => {
    it('closes only the dialog for the kind that was linked', () => {
      svc.chooseCvOpen.set(true);
      svc.chooseCoverLetterOpen.set(true);

      svc.closeChooser('cv');

      expect(svc.chooseCvOpen()).toBe(false);
      expect(svc.chooseCoverLetterOpen()).toBe(true);
    });

    it('closes the cover letter dialog for any other kind', () => {
      svc.chooseCoverLetterOpen.set(true);

      svc.closeChooser('cover_letter');

      expect(svc.chooseCoverLetterOpen()).toBe(false);
    });
  });

  describe('reset', () => {
    it('leaves nothing from the previous job on screen', () => {
      svc.fail('a failure about the previous job');
      svc.chooseCvOpen.set(true);
      svc.chooseCoverLetterOpen.set(true);

      svc.reset();

      expect(svc.status()).toBe('');
      expect(svc.error()).toBe(false);
      expect(svc.chooseCvOpen()).toBe(false);
      expect(svc.chooseCoverLetterOpen()).toBe(false);
    });
  });
});
