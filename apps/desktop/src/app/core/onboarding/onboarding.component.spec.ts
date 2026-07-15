import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CvParsedContent } from '@applye/core';
import { AiService, DbService, KeysService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast/toast.service';
import { OnboardingComponent } from './onboarding.component';

function parsedCv(): CvParsedContent {
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

describe('OnboardingComponent flow', () => {
  let component: OnboardingComponent;
  let fixture: ComponentFixture<OnboardingComponent>;
  let hasProviderKey: jest.Mock;
  let run: jest.Mock;

  beforeEach(async () => {
    hasProviderKey = jest.fn().mockResolvedValue(false);
    run = jest
      .fn()
      .mockResolvedValue({ text: '{"archetypes":["Staff FE"],"compRange":"EUR 90-120K"}' });

    const dbStub: Partial<DbService> = {
      getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en', aiMode: 'api' }),
      documentLibraryList: jest.fn().mockResolvedValue([]),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
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
        { provide: KeysService, useValue: { hasProviderKey, setProviderKey: jest.fn() } },
        { provide: Router, useValue: { navigateByUrl: jest.fn() } },
        { provide: ThemeService, useValue: { theme: () => 'light' } },
        TranslateService,
        ToastService,
      ],
    }).compileComponents();

    create();
  });

  /** The constructor reads the keyring, so a test that wants a key present must
   * re-create the component after arming the mock. */
  function create(): void {
    fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
  }

  describe('review step is skipped when there is no resume', () => {
    it('jumps from resume straight to targeting', async () => {
      component.step.set(2);
      component.resumePath.set('skip');

      await component.goNext();

      expect(component.step()).toBe(4);
    });

    it('jumps forward when a path is chosen but no text was entered', async () => {
      component.step.set(2);
      component.resumePath.set('paste');
      component.resumeText.set('   ');

      await component.goNext();

      expect(component.step()).toBe(4);
    });

    it('is unreachable backwards — back() mirrors the forward jump', () => {
      component.step.set(4);

      component.back();

      expect(component.step()).toBe(2);
    });

    it('is not clickable in the stepper and goTo() refuses it', () => {
      component.step.set(4);
      expect(component.railSteps()[3].clickable).toBe(false);

      component.goTo(3);

      expect(component.step()).toBe(4);
    });

    it('stays reachable once a resume was parsed', () => {
      component.parsedCv.set(parsedCv());
      component.step.set(4);
      expect(component.railSteps()[3].clickable).toBe(true);

      component.back();

      expect(component.step()).toBe(3);
    });
  });

  describe('suggestArchetypes', () => {
    beforeEach(() => {
      component.resumeText.set('a resume');
    });

    it('does not advance the wizard — the Targeting step calls it in place', async () => {
      component.step.set(4);

      await component.suggestArchetypes();

      expect(component.step()).toBe(4);
    });

    it('keeps roles the user typed in and does not re-check unchecked ones', async () => {
      component.archetypes.set(['Manual Role']);

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Manual Role', 'Staff FE']);
    });

    it('seeds roles as-is when the user has chosen none', async () => {
      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Staff FE']);
    });

    it('seeds the comp range while untouched', async () => {
      await component.suggestArchetypes();

      expect(component.compCurrency()).toBe('EUR');
      expect(component.compMin()).toBe(90);
      expect(component.compMax()).toBe(120);
    });

    it('leaves a hand-edited comp range alone', async () => {
      component.setCompMin('200');
      component.setCompMax('250');

      await component.suggestArchetypes();

      expect(component.compMin()).toBe(200);
      expect(component.compMax()).toBe(250);
    });

    it('advances once when driven by the footer from the Review step', async () => {
      component.step.set(3);

      await component.goNext();

      expect(component.step()).toBe(4);
    });

    it('still advances from Review when the suggestion call fails', async () => {
      run.mockRejectedValueOnce(new Error('offline'));
      component.step.set(3);

      await component.goNext();

      expect(component.step()).toBe(4);
    });
  });

  describe('a key saved by an earlier run', () => {
    it('is reported as present instead of "not connected"', async () => {
      hasProviderKey.mockResolvedValue(true);
      create();

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.keyStatus()).toBe('saved');
      expect(component.keyPresent()).toBe(true);
    });

    it('leaves the status idle when the keyring has nothing', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.keyStatus()).toBe('idle');
      expect(component.keyPresent()).toBe(false);
    });

    it('is re-checked per provider on switch', async () => {
      hasProviderKey.mockResolvedValue(true);

      component.selectProvider('openai');
      await fixture.whenStable();

      expect(hasProviderKey).toHaveBeenLastCalledWith('openai');
      expect(component.keyStatus()).toBe('saved');
    });
  });
});
