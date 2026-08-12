import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentLibraryItem } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobCrossJobConfirmComponent } from './job-cross-job-confirm/job-cross-job-confirm.component';
import { JobDeleteConfirmComponent } from './job-delete-confirm/job-delete-confirm.component';
import { JobDiscardConfirmComponent } from './job-discard-confirm/job-discard-confirm.component';
import { JobPhotoPromptComponent } from './job-photo-prompt/job-photo-prompt.component';
import { JobTailorCoverLetterModalComponent } from './job-tailor-cover-letter-modal/job-tailor-cover-letter-modal.component';
import { CoverLetterTailorService } from '../../shared/cover-letter-tailor.service';
import { JobActionsService } from '@applye/application';
import { TailoringDiscardService } from '@applye/application';
import { WizardNavService } from '@applye/application';
import { CvPhotoPromptService } from './cv-photo-prompt.service';

const translate = { provide: TranslateService, useValue: { t: () => (k: string) => k } };

/**
 * The four confirms and the tailor modal the job page used to hold inline.
 *
 * Every one of them is gated on a signal owned by a service the page provides,
 * so the shared assertion here is the one that matters: closed renders nothing
 * at all, and the destructive button asks the page rather than acting.
 */
describe('job dialogs', () => {
  describe('JobCrossJobConfirmComponent', () => {
    const nav = () => ({
      crossJobConfirmOpen: signal(false),
      crossJobLabel: signal('Staff FE at Acme'),
      cancelCrossJob: jest.fn(),
      confirmCrossJob: jest.fn(),
    });

    function setup(s: ReturnType<typeof nav>) {
      TestBed.configureTestingModule({
        imports: [JobCrossJobConfirmComponent],
        providers: [translate, { provide: WizardNavService, useValue: s }],
      });
      const fixture = TestBed.createComponent(JobCrossJobConfirmComponent);
      fixture.detectChanges();
      return fixture;
    }

    it('renders nothing while closed', () => {
      const fixture = setup(nav());
      expect(fixture.nativeElement.querySelector('.modal-backdrop')).toBeNull();
    });

    /// The service cannot know which job the user is standing on, so the id
    /// comes from the page and has to survive the trip.
    it('confirms against the job it was given', () => {
      const s = nav();
      s.crossJobConfirmOpen.set(true);
      const fixture = setup(s);
      fixture.componentRef.setInput('jobId', 9);
      fixture.detectChanges();

      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[];
      buttons.find((b) => b.textContent?.includes('cross_job_confirm_btn'))?.click();

      expect(s.confirmCrossJob).toHaveBeenCalledWith(9);
    });
  });

  describe('JobDeleteConfirmComponent', () => {
    const actions = () => ({ deleteConfirmOpen: signal(true), deleting: signal(false) });

    function setup(s: ReturnType<typeof actions>) {
      TestBed.configureTestingModule({
        imports: [JobDeleteConfirmComponent],
        providers: [translate, { provide: JobActionsService, useValue: s }],
      });
      const fixture = TestBed.createComponent(JobDeleteConfirmComponent);
      fixture.detectChanges();
      return fixture;
    }

    it('asks the page to delete rather than deleting', () => {
      const s = actions();
      const fixture = setup(s);
      let asked = 0;
      fixture.componentInstance.confirmed.subscribe(() => asked++);

      fixture.nativeElement.querySelector('.btn--danger').click();

      // The page navigates away afterwards; routing is not this dialog's.
      expect(asked).toBe(1);
    });

    it('disables both buttons while the delete is running', () => {
      const s = actions();
      s.deleting.set(true);
      const fixture = setup(s);
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[];
      expect(buttons.every((b) => b.disabled)).toBe(true);
    });
  });

  describe('JobDiscardConfirmComponent', () => {
    it('asks the page to discard rather than discarding', () => {
      const s = { confirmOpen: signal(true), discarding: signal(false), cancel: jest.fn() };
      TestBed.configureTestingModule({
        imports: [JobDiscardConfirmComponent],
        providers: [translate, { provide: TailoringDiscardService, useValue: s }],
      });
      const fixture = TestBed.createComponent(JobDiscardConfirmComponent);
      fixture.detectChanges();
      let asked = 0;
      fixture.componentInstance.confirmed.subscribe(() => asked++);

      fixture.nativeElement.querySelector('.btn--danger').click();
      expect(asked).toBe(1);

      // Keeping is entirely the service's - nothing leaves the component.
      fixture.nativeElement.querySelector('.btn--secondary').click();
      expect(s.cancel).toHaveBeenCalled();
    });
  });

  describe('JobPhotoPromptComponent', () => {
    function setup(photo: string | null) {
      TestBed.configureTestingModule({
        imports: [JobPhotoPromptComponent],
        providers: [
          translate,
          {
            provide: CvPhotoPromptService,
            useValue: { open: signal(true), busy: signal(false), dismiss: jest.fn() },
          },
        ],
      });
      const fixture = TestBed.createComponent(JobPhotoPromptComponent);
      fixture.componentRef.setInput('profilePhoto', photo);
      fixture.detectChanges();
      return fixture;
    }

    /// Offering to attach a photo the profile does not have is a promise the
    /// prompt cannot keep, so the label changes instead.
    it('offers to add a photo first when the profile has none', () => {
      const text = setup(null).nativeElement.textContent as string;
      expect(text).toContain('photo_prompt_add_first');
      expect(text).toContain('photo_prompt_none');
    });

    it('offers to use the existing photo when there is one', () => {
      const text = setup('data:image/png;base64,x').nativeElement.textContent as string;
      expect(text).toContain('photo_prompt_yes');
      expect(text).not.toContain('photo_prompt_none');
    });
  });

  describe('JobTailorCoverLetterModalComponent', () => {
    const tailor = () => ({
      modalOpen: signal(true),
      selectedId: signal<number | null>(null),
      language: signal('en'),
      running: signal(false),
      error: signal(''),
    });

    function setup(s: ReturnType<typeof tailor>, letters: DocumentLibraryItem[] = []) {
      TestBed.configureTestingModule({
        imports: [JobTailorCoverLetterModalComponent],
        providers: [translate, { provide: CoverLetterTailorService, useValue: s }],
      });
      const fixture = TestBed.createComponent(JobTailorCoverLetterModalComponent);
      fixture.componentRef.setInput('coverLetters', letters);
      fixture.detectChanges();
      return fixture;
    }

    it('lists the letters the page loaded, above the "none" option', () => {
      const fixture = setup(tailor(), [
        { id: 3, label: 'Berlin letter', language: 'de' } as DocumentLibraryItem,
      ]);
      const options = Array.from(
        fixture.nativeElement.querySelectorAll('option'),
      ) as HTMLOptionElement[];
      expect(options[0].textContent).toContain('cover_letter_tailor_none');
      expect(options.some((o) => o.textContent?.includes('Berlin letter'))).toBe(true);
    });

    it('shows the failure the service reports', () => {
      const s = tailor();
      s.error.set('No base letter selected.');
      const fixture = setup(s);
      expect(fixture.nativeElement.querySelector('.modal__error').textContent).toContain(
        'No base letter selected.',
      );
    });

    it('asks the page to run it, because the page navigates to the result', () => {
      const fixture = setup(tailor());
      let asked = 0;
      fixture.componentInstance.confirmed.subscribe(() => asked++);
      fixture.nativeElement.querySelector('.btn--primary').click();
      expect(asked).toBe(1);
    });
  });
});
