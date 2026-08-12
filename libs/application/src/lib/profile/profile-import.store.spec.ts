import { TestBed } from '@angular/core/testing';
import { Settings } from '@applye/core';
import { AiService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ProfileImportStore } from './profile-import.store';
import { ToastService } from '../shell/toast.service';

const SETTINGS = {
  aiMode: 'api',
  provider: 'openai',
  economyModel: 'gpt-x',
  defaultDocLanguage: 'de',
} as unknown as Settings;

describe('ProfileImportStore', () => {
  let store: ProfileImportStore;
  let renderSkill: jest.Mock;
  let run: jest.Mock;
  let toast: { success: jest.Mock; error: jest.Mock };
  let t: (key: string) => string;

  beforeEach(() => {
    renderSkill = jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' });
    run = jest.fn().mockResolvedValue({ text: '{"name":"Mira"}', tokensInput: 1, tokensOutput: 1 });
    toast = { success: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        ProfileImportStore,
        TranslateService,
        { provide: AiService, useValue: { renderSkill, run } },
        { provide: ToastService, useValue: toast },
      ],
    });
    store = TestBed.inject(ProfileImportStore);
    t = TestBed.inject(TranslateService).t();
  });

  afterEach(() => TestBed.resetTestingModule());

  /** Blank markdown must not spend a token. */
  it('refuses to call the model on blank markdown', async () => {
    await store.parse('   \n  ', SETTINGS);

    expect(run).not.toHaveBeenCalled();
    expect(store.status()).toBe(t('profile.parse_empty_hint'));
    expect(store.error()).toBe(false);
  });

  it('does nothing at all until settings have loaded', async () => {
    await store.parse('# Mira', null);

    expect(run).not.toHaveBeenCalled();
    expect(store.status()).toBe('');
  });

  it('sends the trimmed markdown and the configured language', async () => {
    await store.parse('  # Mira  ', SETTINGS);

    expect(renderSkill).toHaveBeenCalledWith('profile-import', {
      profile_text: '# Mira',
      language: 'de',
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ language: 'de', model: 'gpt-x' }));
  });

  it('falls back to English when no document language is set', async () => {
    await store.parse('# Mira', { ...SETTINGS, defaultDocLanguage: undefined });

    expect(renderSkill).toHaveBeenCalledWith('profile-import', {
      profile_text: '# Mira',
      language: 'en',
    });
  });

  /** The model is told to answer with JSON and routinely fences it anyway. */
  it('accepts a fenced JSON answer', async () => {
    run.mockResolvedValueOnce({
      text: '```json\n{"name":"Mira"}\n```',
      tokensInput: 1,
      tokensOutput: 1,
    });
    await store.parse('# Mira', SETTINGS);

    expect(store.preview()).toEqual({ name: 'Mira' });
    expect(store.error()).toBe(false);
  });

  /** A JSON array parses fine and is not a profile. Letting it through would
   * hand the page an object with no fields and blank the form. */
  it('rejects valid JSON that is not an object', async () => {
    run.mockResolvedValueOnce({ text: '[1,2,3]', tokensInput: 1, tokensOutput: 1 });
    await store.parse('# Mira', SETTINGS);

    expect(store.preview()).toBeNull();
    expect(store.error()).toBe(true);
    expect(store.status()).toBe(t('profile.parse_failed'));
  });

  it('reports unparseable output instead of throwing', async () => {
    run.mockResolvedValueOnce({ text: 'sorry, I cannot', tokensInput: 1, tokensOutput: 1 });
    await expect(store.parse('# Mira', SETTINGS)).resolves.toBeUndefined();

    expect(store.preview()).toBeNull();
    expect(store.error()).toBe(true);
  });

  it('surfaces a failed call and clears the busy flag', async () => {
    run.mockRejectedValueOnce(new Error('no key'));
    await store.parse('# Mira', SETTINGS);

    expect(store.error()).toBe(true);
    expect(store.status()).toContain('no key');
    expect(store.parsing()).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  /** `take` is the only way the preview leaves, and it leaves exactly once -
   * a preview left behind would reappear the next time raw mode opens. */
  it('hands the preview over once and clears it', async () => {
    await store.parse('# Mira', SETTINGS);

    expect(store.take()).toEqual({ name: 'Mira' });
    expect(store.preview()).toBeNull();
    expect(store.take()).toBeNull();
  });

  it('discards the preview and the status together', async () => {
    await store.parse('# Mira', SETTINGS);
    store.discard();

    expect(store.preview()).toBeNull();
    expect(store.status()).toBe('');
  });
});
