import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiService, DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { OnboardingResumeStore } from '@applye/application';
import { OnboardingReviewStore } from '@applye/application';
import { OnboardingResumeStepComponent } from './onboarding-resume-step.component';

describe('OnboardingResumeStepComponent', () => {
  let fixture: ComponentFixture<OnboardingResumeStepComponent>;
  let resume: OnboardingResumeStore;

  function tiles(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.ob__resume-tile'));
  }

  beforeEach(() => {
    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = { cvImportReadFile: jest.fn() };
    TestBed.configureTestingModule({
      imports: [OnboardingResumeStepComponent],
      providers: [
        OnboardingResumeStore,
        OnboardingReviewStore,
        TranslateService,
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: AiService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(OnboardingResumeStepComponent);
    resume = TestBed.inject(OnboardingResumeStore);
    fixture.detectChanges();
  });

  it('offers the three paths and lights the chosen one', () => {
    expect(tiles().length).toBe(3);
    expect(tiles()[0].classList.contains('ob__resume-tile--selected')).toBe(true);

    resume.path.set('skip');
    fixture.detectChanges();
    expect(tiles()[2].classList.contains('ob__resume-tile--selected')).toBe(true);
    expect(tiles()[0].classList.contains('ob__resume-tile--selected')).toBe(false);
  });

  /** One fewer click on the common path: choosing "upload" with nothing
   * attached opens the dialog straight away. The component cannot open it - no
   * store imports a Tauri plugin - so it asks. */
  it('asks for a file when upload is chosen with nothing attached', () => {
    let asked = 0;
    fixture.componentInstance.fileRequested.subscribe(() => asked++);

    tiles()[0].click();
    expect(asked).toBe(1);

    resume.fileName.set('cv.pdf');
    tiles()[0].click();
    expect(asked).toBe(1);
  });

  it('does not ask for a file when paste or skip is chosen', () => {
    let asked = 0;
    fixture.componentInstance.fileRequested.subscribe(() => asked++);

    tiles()[1].click();
    tiles()[2].click();

    expect(asked).toBe(0);
  });

  it('shows the attached file instead of the upload button once one is loaded', () => {
    expect(fixture.nativeElement.querySelector('.ob__attached-card')).toBeNull();

    resume.fileName.set('cv.pdf');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('cv.pdf');
  });

  it('offers the textarea only on the paste path', () => {
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();

    resume.path.set('paste');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
  });

  /** The friendly line was not enough on its own: an auth failure, a missing key
   * and a malformed answer all landed on it, and none was a parsing problem. */
  it('shows the raw failure under the friendly one', () => {
    resume.failed.set(true);
    resume.failureDetail.set('401 Unauthorized');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ob__key-status--invalid')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('401 Unauthorized');
  });
});
