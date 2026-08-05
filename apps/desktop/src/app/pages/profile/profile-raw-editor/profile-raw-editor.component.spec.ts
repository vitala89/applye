import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Settings } from '@applye/core';
import { AiService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { ParsedProfile } from '../profile-parse.util';
import { ProfileRawEditorComponent } from './profile-raw-editor.component';

const SETTINGS = {
  aiMode: 'api',
  provider: 'openai',
  economyModel: 'gpt-x',
  defaultDocLanguage: 'de',
} as unknown as Settings;

let renderSkill: jest.Mock;
let run: jest.Mock;
let toast: { success: jest.Mock; error: jest.Mock };

function createFixture(
  markdown: string,
  settings: Settings | null = SETTINGS,
): ComponentFixture<ProfileRawEditorComponent> {
  renderSkill = jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' });
  run = jest.fn().mockResolvedValue({ text: '{"name":"Mira"}', tokensInput: 1, tokensOutput: 1 });
  toast = { success: jest.fn(), error: jest.fn() };

  TestBed.configureTestingModule({
    imports: [ProfileRawEditorComponent],
    providers: [
      TranslateService,
      { provide: AiService, useValue: { renderSkill, run } },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture = TestBed.createComponent(ProfileRawEditorComponent);
  fixture.componentRef.setInput('markdown', markdown);
  fixture.componentRef.setInput('settings', settings);
  fixture.detectChanges();
  return fixture;
}

function instance(fixture: ComponentFixture<ProfileRawEditorComponent>) {
  return fixture.componentInstance as unknown as {
    parse: () => Promise<void>;
    apply: () => void;
    discard: () => void;
    preview: () => ParsedProfile | null;
    status: () => string;
    error: () => boolean;
    parsing: () => boolean;
    t: () => (key: string) => string;
  };
}

describe('ProfileRawEditorComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('emits every keystroke rather than holding the markdown', async () => {
    const fixture = createFixture('# Mira');
    await fixture.whenStable();
    fixture.detectChanges();

    const area: HTMLTextAreaElement = fixture.nativeElement.querySelector('.editor');
    expect(area.value).toBe('# Mira');

    const seen: string[] = [];
    fixture.componentInstance.markdownChanged.subscribe((v) => seen.push(v));
    area.value = '# Mira Halvorsen';
    area.dispatchEvent(new Event('input'));

    expect(seen).toEqual(['# Mira Halvorsen']);
  });

  /** Blank markdown must not spend a token. */
  it('refuses to call the model on blank markdown', async () => {
    const fixture = createFixture('   \n  ');
    await instance(fixture).parse();

    expect(run).not.toHaveBeenCalled();
    expect(instance(fixture).status()).toBe(instance(fixture).t()('profile.parse_empty_hint'));
    expect(instance(fixture).error()).toBe(false);
  });

  it('does nothing at all until settings have loaded', async () => {
    const fixture = createFixture('# Mira', null);
    await instance(fixture).parse();

    expect(run).not.toHaveBeenCalled();
    expect(instance(fixture).status()).toBe('');
  });

  it('sends the trimmed markdown and the configured language', async () => {
    const fixture = createFixture('  # Mira  ');
    await instance(fixture).parse();

    expect(renderSkill).toHaveBeenCalledWith('profile-import', {
      profile_text: '# Mira',
      language: 'de',
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ language: 'de', model: 'gpt-x' }));
  });

  it('falls back to English when no document language is set', async () => {
    const fixture = createFixture('# Mira', { ...SETTINGS, defaultDocLanguage: undefined });
    await instance(fixture).parse();

    expect(renderSkill).toHaveBeenCalledWith('profile-import', {
      profile_text: '# Mira',
      language: 'en',
    });
  });

  /** The model is told to answer with JSON and routinely fences it anyway. */
  it('accepts a fenced JSON answer', async () => {
    const fixture = createFixture('# Mira');
    run.mockResolvedValueOnce({
      text: '```json\n{"name":"Mira"}\n```',
      tokensInput: 1,
      tokensOutput: 1,
    });
    await instance(fixture).parse();

    expect(instance(fixture).preview()).toEqual({ name: 'Mira' });
    expect(instance(fixture).error()).toBe(false);
  });

  /** A JSON array parses fine and is not a profile. Letting it through would
   * hand the page an object with no fields and blank the form. */
  it('rejects valid JSON that is not an object', async () => {
    const fixture = createFixture('# Mira');
    run.mockResolvedValueOnce({ text: '[1,2,3]', tokensInput: 1, tokensOutput: 1 });
    await instance(fixture).parse();

    expect(instance(fixture).preview()).toBeNull();
    expect(instance(fixture).error()).toBe(true);
    expect(instance(fixture).status()).toBe(instance(fixture).t()('profile.parse_failed'));
  });

  it('reports unparseable output instead of throwing', async () => {
    const fixture = createFixture('# Mira');
    run.mockResolvedValueOnce({ text: 'sorry, I cannot', tokensInput: 1, tokensOutput: 1 });
    await expect(instance(fixture).parse()).resolves.toBeUndefined();

    expect(instance(fixture).preview()).toBeNull();
    expect(instance(fixture).error()).toBe(true);
  });

  it('surfaces a failed call and clears the busy flag', async () => {
    const fixture = createFixture('# Mira');
    run.mockRejectedValueOnce(new Error('no key'));
    await instance(fixture).parse();

    expect(instance(fixture).error()).toBe(true);
    expect(instance(fixture).status()).toContain('no key');
    expect(instance(fixture).parsing()).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  /** The preview is never applied on its own - the user asks for it. */
  it('emits the parse only when apply is pressed, and clears it as it hands it over', async () => {
    const fixture = createFixture('# Mira');
    const emitted: ParsedProfile[] = [];
    fixture.componentInstance.applied.subscribe((p) => emitted.push(p));

    await instance(fixture).parse();
    expect(instance(fixture).preview()).toEqual({ name: 'Mira' });
    expect(emitted).toEqual([]);

    instance(fixture).apply();
    expect(emitted).toEqual([{ name: 'Mira' }]);
    // Left behind, it would reappear the next time raw mode opens.
    expect(instance(fixture).preview()).toBeNull();
  });

  it('discards the preview without emitting', async () => {
    const fixture = createFixture('# Mira');
    const emitted: ParsedProfile[] = [];
    fixture.componentInstance.applied.subscribe((p) => emitted.push(p));

    await instance(fixture).parse();
    instance(fixture).discard();

    expect(instance(fixture).preview()).toBeNull();
    expect(instance(fixture).status()).toBe('');
    expect(emitted).toEqual([]);
  });
});
