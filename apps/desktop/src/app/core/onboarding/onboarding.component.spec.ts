import { ComponentFixture } from '@angular/core/testing';
import { OnboardingComponent } from './onboarding.component';
import {
  OnboardingAiKeyStore,
  OnboardingFinishStore,
  OnboardingResumeStore,
  OnboardingTargetingStore,
} from '@applye/application';
import { createOnboarding, parsedCv } from './onboarding.harness';

describe('OnboardingComponent flow', () => {
  let component: OnboardingComponent;
  let aiKey: OnboardingAiKeyStore;
  let fixture: ComponentFixture<OnboardingComponent>;
  let hasProviderKey: jest.Mock;
  let setProviderKey: jest.Mock;
  let getProfile: jest.Mock;
  let upsertProfile: jest.Mock;
  let run: jest.Mock;
  let resume: OnboardingResumeStore;
  let targeting: OnboardingTargetingStore;
  let finish: OnboardingFinishStore;
  let recreate: () => void;

  beforeEach(async () => {
    const h = await createOnboarding();
    ({
      component,
      fixture,
      aiKey,
      resume,
      targeting,
      finish,
      hasProviderKey,
      setProviderKey,
      getProfile,
      upsertProfile,
      run,
    } = h);
    recreate = () => {
      ({ component, fixture, aiKey, resume, targeting, finish } = h.create());
    };
  });

  /** The constructor reads the keyring, so a test that wants a key present must
   * re-create the component after arming the mock. */
  function create(): void {
    recreate();
  }

  describe('review step is skipped when there is no resume', () => {
    it('jumps from resume straight to targeting', async () => {
      component.step.set(2);
      resume.path.set('skip');

      await component.goNext();

      expect(component.step()).toBe(4);
    });

    it('jumps forward when a path is chosen but no text was entered', async () => {
      component.step.set(2);
      resume.path.set('paste');
      resume.text.set('   ');

      await component.goNext();

      expect(component.step()).toBe(4);
    });

    it('is unreachable backwards - back() mirrors the forward jump', () => {
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
      component.review.parsedCv.set(parsedCv());
      component.step.set(4);
      expect(component.railSteps()[3].clickable).toBe(true);

      component.back();

      expect(component.step()).toBe(3);
    });
  });

  describe('suggestArchetypes', () => {
    beforeEach(() => {
      resume.text.set('a resume');
    });

    it('does not advance the wizard - the Targeting step calls it in place', async () => {
      component.step.set(4);

      await component.suggestArchetypes();

      expect(component.step()).toBe(4);
    });

    it('seeds the selection on the first suggestion', async () => {
      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual(['Staff FE']);
    });

    it('keeps roles the user typed in', async () => {
      await component.suggestArchetypes();
      targeting.addArchetype('Manual Role');

      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual(['Staff FE', 'Manual Role']);
    });

    it('does not re-check a role the user unchecked', async () => {
      await component.suggestArchetypes();
      targeting.toggleRole('Staff FE');
      expect(targeting.archetypes()).toEqual([]);

      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual([]);
    });

    it('re-offers a role the user unchecked and then chose again', async () => {
      await component.suggestArchetypes();
      targeting.toggleRole('Staff FE');
      targeting.toggleRole('Staff FE');

      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual(['Staff FE']);
    });

    it('adds a newly suggested role without disturbing the selection', async () => {
      await component.suggestArchetypes();
      run.mockResolvedValueOnce({
        text: '{"archetypes":["Staff FE","Principal FE"],"compRange":"EUR 90-120K"}',
      });

      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual(['Staff FE', 'Principal FE']);
    });

    it('seeds the comp range while untouched', async () => {
      await component.suggestArchetypes();

      expect(targeting.compCurrency()).toBe('EUR');
      expect(targeting.compMin()).toBe(90);
      expect(targeting.compMax()).toBe(120);
    });

    it('leaves a hand-edited comp range alone', async () => {
      targeting.setCompMin('200');
      targeting.setCompMax('250');

      await component.suggestArchetypes();

      expect(targeting.compMin()).toBe(200);
      expect(targeting.compMax()).toBe(250);
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

  describe('AI provider cards', () => {
    /** API mode is dispatched in `ai/api.rs`, which handles Anthropic and
     * DeepSeek and answers everything else with "not supported in API mode
     * yet". Offering a card the backend rejects walks the user through buying
     * a key that can never work, so the two lists have to agree. */
    it('offers only the providers API mode can actually dispatch to', () => {
      expect(component.v1Providers).toEqual(['claude', 'deepseek']);
    });

    it('keeps Codex available in CLI mode, where OpenAI is reachable', () => {
      expect(component.cliProviders).toContain('openai');
    });

    it('moves a Codex pick to Claude when the user switches back to API mode', async () => {
      component.aiMode.set('cli');
      component.selectedProvider.set('openai');

      await component.chooseAiMode('api');

      expect(component.selectedProvider()).toBe('claude');
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
      expect(aiKey.keyStatus()).toBe('idle');
    });

    it('reports nothing when the keyring is empty', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.keyPresent()).toBe(false);
    });

    it('is re-checked per provider on switch', async () => {
      hasProviderKey.mockResolvedValue(true);

      aiKey.selectProvider('openai');
      await fixture.whenStable();

      expect(hasProviderKey).toHaveBeenLastCalledWith('openai');
      expect(component.keyPresent()).toBe(true);
    });

    it('survives a paste that fails to save', async () => {
      hasProviderKey.mockResolvedValue(true);
      setProviderKey.mockRejectedValue(new Error('keyring locked'));
      create();
      await fixture.whenStable();

      aiKey.keyInput.set('sk-ant-averylongkeyvalue');
      await aiKey.saveKey();

      expect(aiKey.keySaveError()).toBe(true);
      expect(component.keyPresent()).toBe(true);
    });

    it('survives a paste rejected by the format check', async () => {
      hasProviderKey.mockResolvedValue(true);
      create();
      await fixture.whenStable();

      aiKey.keyInput.set('too-short');
      await aiKey.saveKey();

      expect(aiKey.keyStatus()).toBe('invalid');
      expect(component.keyPresent()).toBe(true);
    });
  });

  describe('a key saved by this run', () => {
    it('is reported as present', async () => {
      hasProviderKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      create();
      await fixture.whenStable();
      expect(component.keyPresent()).toBe(false);

      aiKey.keyInput.set('sk-ant-averylongkeyvalue');
      await aiKey.saveKey();

      expect(aiKey.keyStatus()).toBe('valid');
      expect(component.keyPresent()).toBe(true);
    });
  });

  describe('a resume the user walked away from', () => {
    it('is not written to the profile when the skip tile is chosen after a parse', () => {
      component.review.parsedCv.set(parsedCv());

      resume.choose('skip');

      expect(component.review.parsedCv()).toBeNull();
      expect(component.review.hasReview()).toBe(false);
    });

    it('is dropped when the pasted text changes', () => {
      component.review.parsedCv.set(parsedCv());

      resume.setPasted('a different resume');

      expect(component.review.parsedCv()).toBeNull();
    });
  });

  describe('re-running over an existing profile', () => {
    const existing = {
      id: 1,
      fullMd: '# Old profile',
      scoringJson: '{"score":8}',
      scoringHash: 'hash-of-old-md',
      pitchMd: 'My elevator pitch',
      pitchHash: 'pitch-hash-of-old-md',
      targetArchetypes: '["Staff FE"]',
      updatedAt: '2026-07-01',
    };

    beforeEach(async () => {
      getProfile.mockResolvedValue(existing);
      create();
      await fixture.whenStable();
    });

    it('keeps the scoring and pitch the user already paid for', async () => {
      component.review.parsedCv.set(parsedCv());

      await finish.saveProfile();

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          scoringJson: '{"score":8}',
          scoringHash: 'hash-of-old-md',
          pitchMd: 'My elevator pitch',
          pitchHash: 'pitch-hash-of-old-md',
        }),
      );
    });

    it('writes the new resume over the old profile markdown', async () => {
      component.review.parsedCv.set(parsedCv());
      component.review.reviewFirstName.set('Vitalii');
      component.review.reviewLastName.set('Kasap');

      await finish.saveProfile();

      const written = upsertProfile.mock.calls[0][0].fullMd as string;
      expect(written).toContain('Vitalii Kasap');
      expect(written).not.toContain('# Old profile');
    });

    it('seeds the target roles so finishing does not silently drop them', () => {
      expect(targeting.archetypes()).toEqual(['Staff FE']);
    });

    it('does not let the resume suggestion replace the seeded roles', async () => {
      resume.text.set('a resume');
      run.mockResolvedValueOnce({ text: '{"archetypes":["Principal FE"]}' });

      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual(['Staff FE', 'Principal FE']);
    });

    it('still honours a seeded role the user unchecks', async () => {
      resume.text.set('a resume');
      targeting.toggleRole('Staff FE');

      await component.suggestArchetypes();

      expect(targeting.archetypes()).toEqual([]);
    });

    it('keeps the existing markdown when the resume step is skipped', async () => {
      resume.path.set('skip');
      targeting.addArchetype('Engineering Manager');

      await finish.saveProfile();

      expect(upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ fullMd: '# Old profile' }),
      );
      expect(upsertProfile.mock.calls[0][0].targetArchetypes).toContain('Engineering Manager');
    });

    it('persists a targeting-only re-run instead of returning early', async () => {
      resume.path.set('skip');
      targeting.toggleRole('Staff FE');
      targeting.addArchetype('Principal FE');

      await finish.saveProfile();

      const roles = upsertProfile.mock.calls[0][0].targetArchetypes as string;
      expect(roles).toContain('Principal FE');
      expect(roles).not.toContain('Staff FE');
    });
  });
});
