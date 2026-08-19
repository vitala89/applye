import { TestBed } from '@angular/core/testing';
import type { Profile } from '@applye/core';
import {
  AiService,
  DocumentsGateway,
  JobsGateway,
  ProfileSettingsGateway,
  SystemGateway,
} from '@applye/data';
import { ProfileArtifactStore } from './profile-artifact.store';
import { ProfileFormStore } from './profile-form.store';
import { ProfileStore } from './profile.store';

const MD = '# Anna Kowalska\n\n## Experience\nA role';
const hash = (t: string) => `hash(${t})`;

function createStores(over: Record<string, jest.Mock> = {}, row: Partial<Profile> = {}) {
  const db = {
    getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: MD, ...row }),
    getSettings: jest.fn().mockResolvedValue({
      uiLanguage: 'en',
      aiMode: 'api',
      provider: 'openai',
      economyModel: 'small',
    }),
    hashText: jest.fn().mockImplementation(async (t: string) => hash(t)),
    upsertProfile: jest
      .fn()
      .mockImplementation(async (input: Partial<Profile>) => ({ id: 1, ...input })),
    ...over,
  };
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
    run: jest.fn().mockResolvedValue({ text: 'generated', tokensInput: 12, tokensOutput: 34 }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ProfileFormStore,
      ProfileStore,
      ProfileArtifactStore,
      { provide: ProfileSettingsGateway, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: SystemGateway, useValue: db },
      { provide: AiService, useValue: ai },
    ],
  });
  return {
    profile: TestBed.inject(ProfileStore),
    artifacts: TestBed.inject(ProfileArtifactStore),
    db,
    ai,
  };
}

describe('ProfileArtifactStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** A refusal, not a failure: nothing to analyse, so nothing is said and
   * `error` stays clear. */
  it('refuses on empty markdown without calling the model', async () => {
    const { profile, artifacts, ai } = createStores({}, { fullMd: '' });
    await profile.load();

    expect(await artifacts.generate('scoring')).toBe('empty');
    expect(ai.run).not.toHaveBeenCalled();
    expect(artifacts.error('scoring')).toBe('');
  });

  it('reports cached when this exact markdown was already analysed', async () => {
    const { profile, artifacts, ai } = createStores(
      {},
      { scoringJson: '{}', scoringHash: hash(MD) },
    );
    await profile.load();

    expect(await artifacts.generate('scoring')).toBe('cached');
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('generates, records the tokens, and reports what it cost', async () => {
    const { profile, artifacts } = createStores();
    await profile.load();

    expect(await artifacts.generate('scoring')).toBe('generated');
    expect(artifacts.tokens('scoring')).toEqual({ input: 12, output: 34 });
    expect(artifacts.busy('scoring')).toBe(false);
  });

  /**
   * The store must not write the row itself. Writing through
   * `ProfileStore.persist` is what keeps `savedMdHash` in step with the row -
   * a hash that lags is exactly what reports a stale artefact as cached.
   */
  it('writes through ProfileStore, so the saved hash advances with the row', async () => {
    const { profile, artifacts } = createStores();
    await profile.load();
    profile.editor.fullMd.set(`${MD}\nMore`);

    await artifacts.generate('scoring');

    expect(profile.savedMdHash()).toBe(hash(`${MD}\nMore`));
    expect(profile.profile()?.scoringHash).toBe(hash(`${MD}\nMore`));
  });

  /** The artefact must describe the text it was generated from, even if the
   * user keeps typing during the round trip. */
  it('persists the markdown it analysed, not what the form holds when the call returns', async () => {
    const { profile, artifacts, ai, db } = createStores();
    await profile.load();
    profile.editor.fullMd.set(MD);
    ai.run.mockImplementation(async () => {
      profile.editor.fullMd.set('# Typed while the AI ran');
      return { text: 'generated', tokensInput: 1, tokensOutput: 1 };
    });

    await artifacts.generate('scoring');

    expect(db.upsertProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ fullMd: MD, scoringHash: hash(MD) }),
    );
  });

  /**
   * Hashing is IPC and can fail. The original called it outside the guard, so a
   * failed hash rejected out of the page's click handler with nothing shown.
   * Found on a rendered screen, where the hash genuinely fails.
   */
  it('reports a failed hash instead of rejecting', async () => {
    const { profile, artifacts } = createStores();
    await profile.load();
    profile.editor.fullMd.set(`${MD}\nEdit`);
    (profile as unknown as { hashText: jest.Mock }).hashText = jest
      .fn()
      .mockRejectedValue(new Error('ipc down'));

    await expect(artifacts.generate('scoring')).resolves.toBe('failed');
    expect(artifacts.error('scoring')).toContain('ipc down');
    expect(artifacts.busy('scoring')).toBe(false);
  });

  it('records a failure without touching the other artefact', async () => {
    const { profile, artifacts, ai } = createStores();
    await profile.load();
    profile.editor.fullMd.set(`${MD}\nEdit`);
    ai.run.mockRejectedValueOnce(new Error('no key'));

    expect(await artifacts.generate('pitch')).toBe('failed');
    expect(artifacts.error('pitch')).toContain('no key');
    expect(artifacts.error('scoring')).toBe('');
    expect(artifacts.busy('pitch')).toBe(false);
  });
});
