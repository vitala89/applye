import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Profile } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { ProfileComponent } from './profile.component';

/**
 * The pure freshness rule is covered by libs/core scoring-state.spec.ts. These tests cover the
 * wiring instead, which is where the rule can be defeated: savedMdHash describes the saved row,
 * so any code path that persists a new fullMd without refreshing it puts the chip back to
 * reporting a stale scoring profile as cached — the exact bug this feature exists to remove.
 */
describe('ProfileComponent scoring freshness wiring', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let getProfile: jest.Mock;
  let upsertProfile: jest.Mock;
  let hashText: jest.Mock;
  let run: jest.Mock;

  const OLD_MD = '# Vitalii\n\n## Experience\nOld role';
  const NEW_MD = '# Vitalii\n\n## Experience\nNew role';

  /** Stands in for the Rust FNV-1a: distinct text in, distinct hash out. */
  function fakeHash(text: string): string {
    return `hash(${text})`;
  }

  function profileRow(over: Partial<Profile> = {}): Profile {
    return {
      id: 1,
      fullMd: OLD_MD,
      scoringJson: '{"seniority":"senior"}',
      scoringHash: fakeHash(OLD_MD.trim()),
      pitchMd: 'old pitch',
      targetArchetypes: '[]',
      updatedAt: '2026-07-16',
      ...over,
    };
  }

  beforeEach(async () => {
    getProfile = jest.fn().mockResolvedValue(profileRow());
    // Mirrors the real command: a whole-row replace that echoes back what it was given.
    upsertProfile = jest.fn().mockImplementation(async (input) => ({
      ...profileRow(),
      ...input,
      updatedAt: '2026-07-16',
    }));
    hashText = jest.fn().mockImplementation(async (text: string) => fakeHash(text));
    run = jest.fn().mockResolvedValue({ text: 'generated', tokensInput: 1, tokensOutput: 1 });

    const dbStub: Partial<DbService> = {
      getProfile,
      upsertProfile,
      hashText,
      getSettings: jest
        .fn()
        .mockResolvedValue({ uiLanguage: 'en', aiMode: 'api', provider: 'openai' }),
    };

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        {
          provide: AiService,
          useValue: {
            renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
            run,
          },
        },
        { provide: OnboardingService, useValue: { open: () => false, start: jest.fn() } },
        TranslateService,
        ToastService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
  });

  it('reports fresh on load, when the artefact matches the saved markdown', () => {
    expect(component.scoringState()).toBe('fresh');
  });

  it('reports unsaved while the markdown is edited but not saved', () => {
    component.fullMd.set(NEW_MD);
    expect(component.scoringState()).toBe('unsaved');
  });

  // The headline regression: saving clears mdDirty without regenerating anything, so a
  // hash-blind check calls the artefact cached at the exact moment it goes stale.
  it('reports stale after saving a change, not cached', async () => {
    component.fullMd.set(NEW_MD);
    await component.save();

    expect(component.scoringState()).toBe('stale');
  });

  it('returns to fresh once the scoring profile is regenerated', async () => {
    component.fullMd.set(NEW_MD);
    await component.save();
    await component.generateScoringProfile();

    expect(component.scoringState()).toBe('fresh');
    expect(upsertProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoringHash: fakeHash(NEW_MD.trim()) }),
    );
  });

  // generatePitch persists fullMd too. It carries scoringHash forward unchanged, so if it does
  // not refresh savedMdHash it silently makes an edited-but-unsaved profile look cached.
  it('does not report cached after generatePitch persisted an unsaved edit', async () => {
    component.fullMd.set(NEW_MD);

    await component.generatePitch();

    expect(component.scoringState()).toBe('stale');
  });

  // The artefact must describe the text it was generated from, even if the user keeps typing
  // during the AI round trip.
  it('persists the markdown it analysed, not whatever the form holds when the call returns', async () => {
    component.fullMd.set(NEW_MD);
    run.mockImplementation(async () => {
      component.fullMd.set('# Typed while the AI was running');
      return { text: 'generated', tokensInput: 1, tokensOutput: 1 };
    });

    await component.generateScoringProfile();

    expect(upsertProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ fullMd: NEW_MD, scoringHash: fakeHash(NEW_MD.trim()) }),
    );
  });

  it('leaves the scoring profile alone when only archetypes changed', async () => {
    component.addArchetype();
    expect(component.scoringState()).toBe('fresh');

    await component.save();
    expect(component.scoringState()).toBe('fresh');
  });
});
