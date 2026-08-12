import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Settings } from '@applye/core';
import { AiService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ParsedProfile, ProfileImportStore, ToastService } from '@applye/application';
import { ProfileRawEditorComponent } from './profile-raw-editor.component';

const SETTINGS = {
  aiMode: 'api',
  provider: 'openai',
  economyModel: 'gpt-x',
  defaultDocLanguage: 'de',
} as unknown as Settings;

/**
 * The parse itself belongs to `ProfileImportStore` and is tested there. What is
 * left here is the wiring the component still owns: the textarea that holds no
 * state, and the two controls that decide whether a reviewed preview reaches
 * the page.
 */
describe('ProfileRawEditorComponent', () => {
  let fixture: ComponentFixture<ProfileRawEditorComponent>;

  function createFixture(markdown: string): ComponentFixture<ProfileRawEditorComponent> {
    const renderSkill = jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' });
    const run = jest
      .fn()
      .mockResolvedValue({ text: '{"name":"Mira"}', tokensInput: 1, tokensOutput: 1 });

    TestBed.configureTestingModule({
      imports: [ProfileRawEditorComponent],
      providers: [
        TranslateService,
        { provide: AiService, useValue: { renderSkill, run } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    const f = TestBed.createComponent(ProfileRawEditorComponent);
    f.componentRef.setInput('markdown', markdown);
    f.componentRef.setInput('settings', SETTINGS);
    f.detectChanges();
    return f;
  }

  /** The store the component provides for itself, so a test can put a preview
   * in front of the user without going through the model. */
  function store(f: ComponentFixture<ProfileRawEditorComponent>): ProfileImportStore {
    return f.debugElement.injector.get(ProfileImportStore);
  }

  function instance(f: ComponentFixture<ProfileRawEditorComponent>) {
    return f.componentInstance as unknown as {
      parse: () => Promise<void>;
      apply: () => void;
      discard: () => void;
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('emits every keystroke rather than holding the markdown', async () => {
    fixture = createFixture('# Mira');
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

  it('hands the page the markdown and the settings it owns', async () => {
    fixture = createFixture('  # Mira  ');
    const spy = jest.spyOn(store(fixture), 'parse');

    await instance(fixture).parse();

    expect(spy).toHaveBeenCalledWith('  # Mira  ', SETTINGS);
  });

  /** The preview is never applied on its own - the user asks for it. */
  it('emits the parse only when apply is pressed, and clears it as it hands it over', async () => {
    fixture = createFixture('# Mira');
    const emitted: ParsedProfile[] = [];
    fixture.componentInstance.applied.subscribe((p) => emitted.push(p));

    await instance(fixture).parse();
    expect(store(fixture).preview()).toEqual({ name: 'Mira' });
    expect(emitted).toEqual([]);

    instance(fixture).apply();
    expect(emitted).toEqual([{ name: 'Mira' }]);
    // Left behind, it would reappear the next time raw mode opens.
    expect(store(fixture).preview()).toBeNull();
  });

  it('discards the preview without emitting', async () => {
    fixture = createFixture('# Mira');
    const emitted: ParsedProfile[] = [];
    fixture.componentInstance.applied.subscribe((p) => emitted.push(p));

    await instance(fixture).parse();
    instance(fixture).discard();

    expect(store(fixture).preview()).toBeNull();
    expect(emitted).toEqual([]);
  });
});
