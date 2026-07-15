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
  let setProviderKey: jest.Mock;
  let getProfile: jest.Mock;
  let upsertProfile: jest.Mock;
  let run: jest.Mock;

  beforeEach(async () => {
    hasProviderKey = jest.fn().mockResolvedValue(false);
    setProviderKey = jest.fn().mockResolvedValue(undefined);
    getProfile = jest.fn().mockResolvedValue(null);
    upsertProfile = jest.fn().mockResolvedValue({ id: 1 });
    run = jest
      .fn()
      .mockResolvedValue({ text: '{"archetypes":["Staff FE"],"compRange":"EUR 90-120K"}' });

    const dbStub: Partial<DbService> = {
      getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en', aiMode: 'api' }),
      documentLibraryList: jest.fn().mockResolvedValue([]),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
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

    it('seeds the selection on the first suggestion', async () => {
      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Staff FE']);
    });

    it('keeps roles the user typed in', async () => {
      await component.suggestArchetypes();
      component.addArchetype('Manual Role');

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Staff FE', 'Manual Role']);
    });

    it('does not re-check a role the user unchecked', async () => {
      await component.suggestArchetypes();
      component.toggleRole('Staff FE');
      expect(component.archetypes()).toEqual([]);

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual([]);
    });

    it('re-offers a role the user unchecked and then chose again', async () => {
      await component.suggestArchetypes();
      component.toggleRole('Staff FE');
      component.toggleRole('Staff FE');

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Staff FE']);
    });

    it('adds a newly suggested role without disturbing the selection', async () => {
      await component.suggestArchetypes();
      run.mockResolvedValueOnce({
        text: '{"archetypes":["Staff FE","Principal FE"],"compRange":"EUR 90-120K"}',
      });

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Staff FE', 'Principal FE']);
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

      expect(component.keyStored()).toBe(true);
      expect(component.keyPresent()).toBe(true);
      expect(component.keyStatus()).toBe('idle');
    });

    it('reports nothing when the keyring is empty', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.keyPresent()).toBe(false);
    });

    it('is re-checked per provider on switch', async () => {
      hasProviderKey.mockResolvedValue(true);

      component.selectProvider('openai');
      await fixture.whenStable();

      expect(hasProviderKey).toHaveBeenLastCalledWith('openai');
      expect(component.keyPresent()).toBe(true);
    });

    it('survives a paste that fails to save', async () => {
      hasProviderKey.mockResolvedValue(true);
      setProviderKey.mockRejectedValue(new Error('keyring locked'));
      create();
      await fixture.whenStable();

      component.keyInput.set('sk-ant-averylongkeyvalue');
      await component.saveKey();

      expect(component.keySaveError()).toBe(true);
      expect(component.keyPresent()).toBe(true);
    });

    it('survives a paste rejected by the format check', async () => {
      hasProviderKey.mockResolvedValue(true);
      create();
      await fixture.whenStable();

      component.keyInput.set('too-short');
      await component.saveKey();

      expect(component.keyStatus()).toBe('invalid');
      expect(component.keyPresent()).toBe(true);
    });
  });

  describe('a key saved by this run', () => {
    it('is reported as present', async () => {
      hasProviderKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      create();
      await fixture.whenStable();
      expect(component.keyPresent()).toBe(false);

      component.keyInput.set('sk-ant-averylongkeyvalue');
      await component.saveKey();

      expect(component.keyStatus()).toBe('valid');
      expect(component.keyPresent()).toBe(true);
    });
  });

  describe('a resume the user walked away from', () => {
    it('is not written to the profile when the skip tile is chosen after a parse', () => {
      component.parsedCv.set(parsedCv());

      component.chooseResume('skip');

      expect(component.parsedCv()).toBeNull();
      expect(component.hasReview()).toBe(false);
    });

    it('is dropped when the pasted text changes', () => {
      component.parsedCv.set(parsedCv());

      component.setPastedResume('a different resume');

      expect(component.parsedCv()).toBeNull();
    });
  });

  describe('re-running over an existing profile', () => {
    const existing = {
      id: 1,
      fullMd: '# Old profile',
      scoringJson: '{"score":8}',
      scoringHash: 'hash-of-old-md',
      pitchMd: 'My elevator pitch',
      targetArchetypes: '["Staff FE"]',
      updatedAt: '2026-07-01',
    };

    beforeEach(async () => {
      getProfile.mockResolvedValue(existing);
      create();
      await fixture.whenStable();
    });

    it('keeps the scoring and pitch the user already paid for', async () => {
      component.parsedCv.set(parsedCv());

      await component.saveProfile();

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          scoringJson: '{"score":8}',
          scoringHash: 'hash-of-old-md',
          pitchMd: 'My elevator pitch',
        }),
      );
    });

    it('writes the new resume over the old profile markdown', async () => {
      component.parsedCv.set(parsedCv());
      component.reviewName.set('Vitalii Kasap');

      await component.saveProfile();

      const written = upsertProfile.mock.calls[0][0].fullMd as string;
      expect(written).toContain('Vitalii Kasap');
      expect(written).not.toContain('# Old profile');
    });

    it('seeds the target roles so finishing does not silently drop them', () => {
      expect(component.archetypes()).toEqual(['Staff FE']);
    });

    it('does not let the resume suggestion replace the seeded roles', async () => {
      component.resumeText.set('a resume');
      run.mockResolvedValueOnce({ text: '{"archetypes":["Principal FE"]}' });

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual(['Staff FE', 'Principal FE']);
    });

    it('still honours a seeded role the user unchecks', async () => {
      component.resumeText.set('a resume');
      component.toggleRole('Staff FE');

      await component.suggestArchetypes();

      expect(component.archetypes()).toEqual([]);
    });

    it('keeps the existing markdown when the resume step is skipped', async () => {
      component.resumePath.set('skip');
      component.addArchetype('Engineering Manager');

      await component.saveProfile();

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ fullMd: '# Old profile' }),
      );
      expect(upsertProfile.mock.calls[0][0].targetArchetypes).toContain('Engineering Manager');
    });

    it('persists a targeting-only re-run instead of returning early', async () => {
      component.resumePath.set('skip');
      component.toggleRole('Staff FE');
      component.addArchetype('Principal FE');

      await component.saveProfile();

      const roles = upsertProfile.mock.calls[0][0].targetArchetypes as string;
      expect(roles).toContain('Principal FE');
      expect(roles).not.toContain('Staff FE');
    });
  });

  describe('a first run with nothing to save', () => {
    it('writes no profile at all', async () => {
      component.resumePath.set('skip');

      await component.saveProfile();

      expect(upsertProfile).not.toHaveBeenCalled();
    });
  });

  describe('an AI call already in flight', () => {
    it('blocks a second Continue, so no step is skipped and no call is paid for twice', async () => {
      component.step.set(3);
      component.resumeText.set('a resume');
      let release!: (v: unknown) => void;
      run.mockReturnValueOnce(new Promise((r) => (release = r)));

      const first = component.goNext();
      // Let the first call reach the (now hanging) AI request before the second.
      await new Promise((r) => setTimeout(r, 0));
      expect(component.busy()).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);

      await component.goNext();

      expect(run).toHaveBeenCalledTimes(1);
      expect(component.step()).toBe(3);

      release({ text: '{"archetypes":["Staff FE"]}' });
      await first;

      expect(component.step()).toBe(4);
    });
  });
});
