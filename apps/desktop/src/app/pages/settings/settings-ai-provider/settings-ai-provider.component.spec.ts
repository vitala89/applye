import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AiProvider, Settings } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { SettingsAiProviderComponent } from './settings-ai-provider.component';

const CLI_PROVIDERS: { id: AiProvider; label: string; command: string }[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'openai', label: 'Codex CLI', command: 'codex' },
];

describe('SettingsAiProviderComponent', () => {
  let fixture: ComponentFixture<SettingsAiProviderComponent>;

  function settings(over: Partial<Settings> = {}): Settings {
    return {
      aiMode: 'api',
      provider: 'claude',
      defaultModel: '',
      economyModel: '',
      ...over,
    } as Settings;
  }

  function selects(): HTMLSelectElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('select'));
  }

  function text(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsAiProviderComponent],
      providers: [TranslateService],
    });
    fixture = TestBed.createComponent(SettingsAiProviderComponent);
    fixture.componentRef.setInput('settings', settings());
    fixture.componentRef.setInput('cliProviders', CLI_PROVIDERS);
    fixture.componentRef.setInput('apiModels', ['big', 'small']);
    fixture.detectChanges();
  });

  it('offers the two API providers and the API model catalogue in API mode', () => {
    // mode, provider, two model pickers
    expect(selects().length).toBe(4);
    expect(Array.from(selects()[1].options).map((o) => o.value)).toEqual(['claude', 'deepseek']);
    expect(Array.from(selects()[2].options).map((o) => o.value)).toEqual(['big', 'small']);
  });

  it('shows the API privacy note with the vendor named, and the jurisdiction line only for DeepSeek', () => {
    fixture.componentRef.setInput('vendorName', 'Anthropic');
    fixture.detectChanges();
    expect(text()).toContain("Anthropic's servers");
    expect(text()).not.toContain('Chinese jurisdiction');

    fixture.componentRef.setInput('settings', settings({ provider: 'deepseek' }));
    fixture.detectChanges();
    expect(text()).toContain('Chinese jurisdiction');
  });

  /** The CLI-mode note lives with the status list, which the page projects -
   * this component must not carry a second one. */
  it('drops the API note in CLI mode and offers the CLI providers instead', () => {
    fixture.componentRef.setInput('settings', settings({ aiMode: 'cli' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.disclosure')).toBeNull();
    expect(Array.from(selects()[1].options).map((o) => o.value)).toEqual(['claude', 'openai']);
  });

  it('offers the free-text field only for a model picker the page put in custom mode', () => {
    fixture.componentRef.setInput('settings', settings({ aiMode: 'cli' }));
    fixture.componentRef.setInput('cliModels', ['sonnet', 'opus']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input[type="text"]').length).toBe(0);

    fixture.componentRef.setInput('customModel', { defaultModel: true, economyModel: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input[type="text"]').length).toBe(1);
  });

  it('reports which field a CLI model choice belongs to', () => {
    fixture.componentRef.setInput('settings', settings({ aiMode: 'cli' }));
    fixture.componentRef.setInput('cliModels', ['sonnet']);
    fixture.detectChanges();
    const seen: { field: string; choice: string }[] = [];
    fixture.componentInstance.cliModelSelected.subscribe((c) => seen.push(c));

    selects()[3].value = 'sonnet';
    selects()[3].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(seen).toEqual([{ field: 'economyModel', choice: 'sonnet' }]);
  });

  it('reports the tier without holding it', () => {
    const seen: string[] = [];
    fixture.componentInstance.tierChanged.subscribe((t) => seen.push(t));
    const segs = fixture.nativeElement.querySelectorAll('.seg') as NodeListOf<HTMLButtonElement>;

    segs[1].click();
    expect(seen).toEqual(['quality']);
    // Nothing lit until the page says so.
    expect(segs[1].classList.contains('seg--on')).toBe(false);
  });
});
