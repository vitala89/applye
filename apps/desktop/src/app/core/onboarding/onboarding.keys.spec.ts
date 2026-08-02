import { ComponentFixture } from '@angular/core/testing';
import { OnboardingComponent } from './onboarding.component';
import { createOnboarding, parsedCv } from './onboarding.harness';

describe('OnboardingComponent keys, profile and AI wiring', () => {
  let component: OnboardingComponent;
  let fixture: ComponentFixture<OnboardingComponent>;
  let upsertProfile: jest.Mock;
  let documentLibraryUpsert: jest.Mock;
  let updateSettings: jest.Mock;
  let navigateByUrl: jest.Mock;
  let run: jest.Mock;

  beforeEach(async () => {
    const h = await createOnboarding();
    ({
      component,
      fixture,
      upsertProfile,
      documentLibraryUpsert,
      updateSettings,
      navigateByUrl,
      run,
    } = h);
  });

  describe('a first run with nothing to save', () => {
    it('writes no profile at all', async () => {
      component.resumePath.set('skip');

      await component.saveProfile();

      expect(upsertProfile).not.toHaveBeenCalled();
    });
  });

  // Regression: the AI-setup choices only reached the settings row when the
  // wizard finished, so the resume and targeting calls made mid-wizard were
  // dispatched with the pre-onboarding defaults (`api` + `claude`). Picking
  // DeepSeek, or CLI mode, sent them to a provider with no key - and the resume
  // step reported it as "Couldn't parse that resume".

  describe('in-wizard AI calls follow the mode and provider just picked', () => {
    beforeEach(() => {
      component.resumeText.set('a resume');
      run.mockResolvedValue({ text: '{"personalDetails":{"fullName":"Mira Halvorsen"}}' });
    });

    it('parses the resume with the chosen provider, not the stored one', async () => {
      component.selectProvider('deepseek');

      await component.parseResume();

      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'deepseek', mode: 'api' }),
      );
      expect(component.resumeError()).toBe(false);
    });

    it('sends no model in CLI mode, where the stored API ids are unusable', async () => {
      await component.chooseAiMode('cli');

      await component.parseResume();

      expect(run).toHaveBeenCalledWith(expect.objectContaining({ mode: 'cli', model: '' }));
    });

    it('suggests archetypes with the chosen provider too', async () => {
      run.mockResolvedValue({ text: '{"archetypes":["Staff FE"],"compRange":"EUR 90-120K"}' });
      component.selectProvider('deepseek');

      await component.suggestArchetypes();

      expect(run).toHaveBeenCalledWith(expect.objectContaining({ provider: 'deepseek' }));
    });

    it('commits the choice to settings when the AI step is left', async () => {
      component.step.set(1);
      component.selectProvider('deepseek');

      await component.goNext();

      expect(updateSettings).toHaveBeenCalledWith({
        aiMode: 'api',
        provider: 'deepseek',
        defaultModel: 'deepseek-v4-pro',
        economyModel: 'deepseek-v4-flash',
      });
      expect(component.step()).toBe(2);
    });

    it('surfaces the real failure instead of only the parse wording', async () => {
      run.mockRejectedValue(new Error('no API key for deepseek'));

      await component.parseResume();

      expect(component.resumeError()).toBe(true);
      expect(component.resumeErrorDetail()).toContain('no API key for deepseek');
    });
  });

  /**
   * The AI step persisted the provider but never the model ids, so a DeepSeek
   * user kept the Claude defaults - or, after a CLI-mode run blanked them, an
   * empty string - and every wizard call came back as
   * `The supported API model names are deepseek-v4-pro or deepseek-v4-flash,
   * but you passed .`
   */

  describe('the model ids follow the provider', () => {
    beforeEach(() => {
      component.resumeText.set('a resume');
      run.mockResolvedValue({ text: '{"personalDetails":{"fullName":"Mira Halvorsen"}}' });
    });

    it('opens on the Claude pair', () => {
      expect(component.qualityModel()).toBe('claude-opus-4-8');
      expect(component.economyModel()).toBe('claude-haiku-4-5');
    });

    it('remaps both models when the provider changes', () => {
      component.selectProvider('deepseek');

      expect(component.qualityModel()).toBe('deepseek-v4-pro');
      expect(component.economyModel()).toBe('deepseek-v4-flash');
    });

    it('offers only the selected provider models', () => {
      component.selectProvider('deepseek');
      expect(component.providerModels()).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash']);

      component.selectProvider('claude');
      expect(component.providerModels()).toContain('claude-opus-4-8');
    });

    it('sends the chosen economy model, never an empty one', async () => {
      component.selectProvider('deepseek');

      await component.parseResume();

      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'deepseek', model: 'deepseek-v4-flash' }),
      );
    });

    it('keeps a hand-picked economy model and dispatches with it', async () => {
      component.setEconomyModel('claude-sonnet-4-6');

      await component.parseResume();

      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'claude', model: 'claude-sonnet-4-6' }),
      );
    });

    it('restores a usable pair when leaving CLI mode, which blanks them', async () => {
      await component.chooseAiMode('cli');
      expect(component.qualityModel()).toBe('claude-opus-4-8');

      component.qualityModel.set('');
      component.economyModel.set('');
      await component.chooseAiMode('api');

      expect(component.qualityModel()).toBe('claude-opus-4-8');
      expect(component.economyModel()).toBe('claude-haiku-4-5');
    });

    it('persists both models with the provider on finish', async () => {
      component.selectProvider('deepseek');

      await component.finish();

      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          onboardingSeen: true,
          provider: 'deepseek',
          defaultModel: 'deepseek-v4-pro',
          economyModel: 'deepseek-v4-flash',
        }),
      );
    });

    it('still blanks the models on finish in CLI mode', async () => {
      await component.chooseAiMode('cli');

      await component.finish();

      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ aiMode: 'cli', defaultModel: '', economyModel: '' }),
      );
    });
  });

  describe('finishing the last step', () => {
    it('saves the profile and the CV, marks onboarding seen, and closes', async () => {
      component.parsedCv.set(parsedCv());
      component.reviewFirstName.set('Vitalii');
      component.reviewLastName.set('Kasap');
      const closed = jest.fn();
      component.completed.subscribe(closed);

      await component.finish();

      expect(upsertProfile).toHaveBeenCalled();
      expect(documentLibraryUpsert).toHaveBeenCalled();
      expect(updateSettings).toHaveBeenCalledWith({
        onboardingSeen: true,
        aiMode: 'api',
        provider: 'claude',
        defaultModel: 'claude-opus-4-8',
        economyModel: 'claude-haiku-4-5',
      });
      expect(closed).toHaveBeenCalled();
    });

    // Regression: the wizard used to persist only `onboardingSeen`, so picking
    // any provider other than the default was silently discarded - the user
    // saved an OpenAI key and every task still went to Claude, which had none.
    it('persists the provider the user actually picked', async () => {
      component.selectProvider('deepseek');

      await component.finish();

      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'deepseek', aiMode: 'api' }),
      );
    });

    it('persists CLI mode and blanks the API model ids it would send to a CLI', async () => {
      await component.chooseAiMode('cli');

      await component.finish();

      // An API model id (`claude-opus-4-8`) passed to a CLI is a guaranteed
      // failure, so CLI mode must clear them and let the CLI choose.
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          aiMode: 'cli',
          defaultModel: '',
          economyModel: '',
        }),
      );
    });

    it('moves a CLI-less provider off DeepSeek when switching to CLI mode', async () => {
      component.selectProvider('deepseek');

      await component.chooseAiMode('cli');

      expect(component.selectedProvider()).toBe('claude');
    });

    // Finish is the only exit now that the Ready step's two CTAs are gone. The
    // wizard closes onto whatever route is behind it - the dashboard on a first
    // run, the page a re-run was opened from - instead of picking a
    // destination, which is why it must not navigate.
    it('navigates nowhere itself', async () => {
      component.parsedCv.set(parsedCv());

      await component.finish();

      expect(navigateByUrl).not.toHaveBeenCalled();
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

  describe('name confirm nudge', () => {
    it('seeds both fields from a confident parse and does not nudge', () => {
      component.parsedCv.set(
        makeParsed({
          fullName: 'Anna Kowalska',
          firstName: 'Anna',
          lastName: 'Kowalska',
          nameSplitConfident: true,
        }),
      );

      component.seedReviewFields();

      expect(component.reviewFirstName()).toBe('Anna');
      expect(component.reviewLastName()).toBe('Kowalska');
      expect(component.needsNameConfirm()).toBe(false);
    });

    it('nudges when the parse was not confident', () => {
      component.parsedCv.set(
        makeParsed({
          fullName: 'Anna Maria Kowalska',
          firstName: 'Anna Maria',
          lastName: 'Kowalska',
          nameSplitConfident: false,
        }),
      );

      component.seedReviewFields();

      expect(component.needsNameConfirm()).toBe(true);
    });

    it('nudges when the last name is missing', () => {
      component.parsedCv.set(
        makeParsed({ fullName: 'Prince', firstName: 'Prince', lastName: null }),
      );

      component.seedReviewFields();

      expect(component.reviewFirstName()).toBe('Prince');
      expect(component.reviewLastName()).toBe('');
      expect(component.needsNameConfirm()).toBe(true);
    });

    it('derives the split when the parse omitted it', () => {
      component.parsedCv.set(makeParsed({ fullName: 'Anna Kowalska' }));

      component.seedReviewFields();

      expect(component.reviewFirstName()).toBe('Anna');
      expect(component.reviewLastName()).toBe('Kowalska');
      expect(component.needsNameConfirm()).toBe(true);
    });

    it('stops nudging once the user edits either field', () => {
      component.parsedCv.set(
        makeParsed({ fullName: 'Prince', firstName: 'Prince', lastName: null }),
      );
      component.seedReviewFields();
      expect(component.needsNameConfirm()).toBe(true);

      component.onNameEdited();

      expect(component.needsNameConfirm()).toBe(false);
    });

    it('seeds from the display name when the parse carried empty strings', () => {
      component.parsedCv.set(
        makeParsed({
          fullName: 'Anna Kowalska',
          firstName: '',
          lastName: '',
          nameSplitConfident: true,
        }),
      );

      component.seedReviewFields();

      expect(component.reviewFirstName()).toBe('Anna');
      expect(component.reviewLastName()).toBe('Kowalska');
    });

    it('nudges when only the last name survived the parse', () => {
      component.parsedCv.set(
        makeParsed({
          fullName: 'Anna Kowalska',
          firstName: null,
          lastName: 'Kowalska',
          nameSplitConfident: true,
        }),
      );
      component.reviewLastName.set('Kowalska');

      expect(component.needsNameConfirm()).toBe(true);
    });

    it('leaves a hand-edited field alone when a re-parse seeds again', () => {
      component.parsedCv.set(makeParsed({ fullName: 'Anna Kowalska' }));
      component.seedReviewFields();
      component.reviewFirstName.set('Ania');

      component.parsedCv.set(makeParsed({ fullName: 'Jane Smith' }));
      component.seedReviewFields();

      expect(component.reviewFirstName()).toBe('Ania');
      expect(component.reviewLastName()).toBe('Kowalska');
    });

    it('keeps Continue enabled and describes the inputs while the nudge is up', async () => {
      component.parsedCv.set(
        makeParsed({ fullName: 'Prince', firstName: 'Prince', lastName: null }),
      );
      component.seedReviewFields();
      component.step.set(3);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.needsNameConfirm()).toBe(true);
      const el = fixture.nativeElement as HTMLElement;
      const hint = el.querySelector('.ob__field-hint--confirm');
      expect(hint?.id).toBeTruthy();
      for (const id of ['ob-review-first-name', 'ob-review-last-name']) {
        expect(el.querySelector(`#${id}`)?.getAttribute('aria-describedby')).toBe(hint?.id);
      }
      const next = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Continue'),
      );
      expect(next).toBeTruthy();
      expect(next?.disabled).toBe(false);
    });

    it('recaps the resume name the artifacts got, not a reordered composition', () => {
      component.parsedCv.set(
        makeParsed({
          fullName: 'Kim Minjun',
          firstName: 'Minjun',
          lastName: 'Kim',
          nameSplitConfident: false,
        }),
      );

      component.seedReviewFields();

      expect(component.resumeSummary()).toContain('Kim Minjun');
      expect(component.resumeSummary()).not.toContain('Minjun Kim');
    });

    it('recaps the composed name once the user edits a part', () => {
      component.parsedCv.set(
        makeParsed({ fullName: 'Kim Minjun', firstName: 'Minjun', lastName: 'Kim' }),
      );
      component.seedReviewFields();

      component.reviewLastName.set('Park');
      component.onNameEdited();

      expect(component.resumeSummary()).toContain('Minjun Park');
    });

    it('does not nudge when there is no name at all', () => {
      component.parsedCv.set(makeParsed({ fullName: null }));

      component.seedReviewFields();

      expect(component.needsNameConfirm()).toBe(false);
    });
  });

  function makeParsed(
    personalDetails: Partial<CvParsedContent['personalDetails']>,
  ): CvParsedContent {
    return {
      personalDetails: {
        fullName: null,
        title: null,
        email: null,
        phone: null,
        address: null,
        website: null,
        linkedin: null,
        ...personalDetails,
      },
      summary: null,
      experience: [],
      education: [],
      skills: [],
      languages: [],
      lowConfidenceNotes: [],
    } as unknown as CvParsedContent;
  }
});
