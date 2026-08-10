import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CvParsedContent } from '@applye/core';
import { AiService, DbService, KeysService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast/toast.service';
import { OnboardingComponent } from './onboarding.component';
import { OnboardingAiKeyService } from './onboarding-ai-key.service';
import { OnboardingResumeService } from './onboarding-resume.service';
import { OnboardingTargetingService } from './onboarding-targeting.service';

/** A parsed CV good enough for every step the wizard runs. */
export function parsedCv(): CvParsedContent {
  return {
    personalDetails: { fullName: 'Vitalii Kasap', email: 'v@example.com' },
    summary: 'Frontend engineer',
    experience: [{ role: 'Senior FE', company: 'Acme', bullets: [] }],
    skills: ['Angular'],
    education: [],
    languages: [],
    lowConfidenceNotes: [],
  } as unknown as CvParsedContent;
}

/**
 * The onboarding wizard's mocks, shared by the specs that grew out of one
 * 689-line file. Every mock is returned rather than reached through the
 * TestBed, because a test arms one and then re-creates the component - the
 * constructor reads the keyring, so `create()` has to be callable again after.
 */
export interface OnboardingHarness {
  component: OnboardingComponent;
  fixture: ComponentFixture<OnboardingComponent>;
  /** The AI step's key/model state. The wizard provides it, so it is reached
   * through the component's own injector rather than the TestBed's. */
  aiKey: OnboardingAiKeyService;
  /** Step 2's state. Same reason as `aiKey`: the wizard provides it. */
  resume: OnboardingResumeService;
  /** Step 4's state. */
  targeting: OnboardingTargetingService;
  hasProviderKey: jest.Mock;
  setProviderKey: jest.Mock;
  getProfile: jest.Mock;
  upsertProfile: jest.Mock;
  documentLibraryUpsert: jest.Mock;
  updateSettings: jest.Mock;
  navigateByUrl: jest.Mock;
  run: jest.Mock;
  /** Re-create the component after arming a mock the constructor reads. */
  create: () => {
    component: OnboardingComponent;
    fixture: ComponentFixture<OnboardingComponent>;
    aiKey: OnboardingAiKeyService;
    resume: OnboardingResumeService;
    targeting: OnboardingTargetingService;
  };
}

export async function createOnboarding(): Promise<OnboardingHarness> {
  const hasProviderKey = jest.fn().mockResolvedValue(false);
  const setProviderKey = jest.fn().mockResolvedValue(undefined);
  const getProfile = jest.fn().mockResolvedValue(null);
  const upsertProfile = jest.fn().mockResolvedValue({ id: 1 });
  const documentLibraryUpsert = jest.fn().mockResolvedValue({ id: 1 });
  const updateSettings = jest.fn().mockResolvedValue({});
  const navigateByUrl = jest.fn();
  const run = jest
    .fn()
    .mockResolvedValue({ text: '{"archetypes":["Staff FE"],"compRange":"EUR 90-120K"}' });

  const dbStub: Partial<DbService> = {
    getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en', aiMode: 'api' }),
    documentLibraryList: jest.fn().mockResolvedValue([]),
    cvTemplatesList: jest.fn().mockResolvedValue([]),
    documentLibraryUpsert,
    updateSettings,
    getProfile,
    upsertProfile,
  };

  await TestBed.configureTestingModule({
    imports: [OnboardingComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      {
        provide: AiService,
        useValue: {
          renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
          run,
        },
      },
      { provide: KeysService, useValue: { hasProviderKey, setProviderKey } },
      { provide: Router, useValue: { navigateByUrl } },
      { provide: ThemeService, useValue: { theme: () => 'light' } },
      TranslateService,
      ToastService,
    ],
  }).compileComponents();

  const create = () => {
    const fixture = TestBed.createComponent(OnboardingComponent);
    return {
      component: fixture.componentInstance,
      fixture,
      aiKey: fixture.debugElement.injector.get(OnboardingAiKeyService),
      resume: fixture.debugElement.injector.get(OnboardingResumeService),
      targeting: fixture.debugElement.injector.get(OnboardingTargetingService),
    };
  };
  const first = create();

  return {
    ...first,
    hasProviderKey,
    setProviderKey,
    getProfile,
    upsertProfile,
    documentLibraryUpsert,
    updateSettings,
    navigateByUrl,
    run,
    create,
  };
}
