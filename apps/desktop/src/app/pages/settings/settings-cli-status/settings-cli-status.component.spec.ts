import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CliStatus } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { SettingsCliStatusComponent } from './settings-cli-status.component';

const WORKING = {
  provider: 'claude',
  label: 'Claude Code',
  command: 'claude',
  installed: true,
  working: true,
  version: '2.1.0',
  path: '/usr/local/bin/claude',
} as CliStatus;

const BROKEN = {
  provider: 'openai',
  label: 'Codex CLI',
  command: 'codex',
  installed: true,
  working: false,
  error: 'spawn ENOENT',
} as CliStatus;

const MISSING = {
  provider: 'openai',
  label: 'Codex CLI',
  command: 'codex',
  installed: false,
  working: false,
} as CliStatus;

/**
 * A CLI has three states, not two, and the middle one is the reason this
 * component exists: present on the path but unable to run. A file check calls
 * that healthy and the first real call fails, so the row has to say so itself.
 */
describe('SettingsCliStatusComponent', () => {
  let fixture: ComponentFixture<SettingsCliStatusComponent>;

  function render(statuses: CliStatus[]): void {
    fixture.componentRef.setInput('statuses', statuses);
    fixture.detectChanges();
  }

  function text(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  function row(): HTMLElement {
    return fixture.nativeElement.querySelector('.cli-status__row');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsCliStatusComponent],
      providers: [TranslateService],
    });
    fixture = TestBed.createComponent(SettingsCliStatusComponent);
    fixture.componentRef.setInput('statuses', []);
    fixture.detectChanges();
  });

  it('shows the version and path for a CLI that runs, and offers nothing to fix', () => {
    render([WORKING]);

    expect(text()).toContain('2.1.0');
    expect(text()).toContain('/usr/local/bin/claude');
    expect(row().classList.contains('cli-status__row--broken')).toBe(false);
    expect(row().classList.contains('cli-status__row--missing')).toBe(false);
    // Only the Re-check button.
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(1);
  });

  it('marks an installed-but-unrunnable CLI as broken and shows its error', () => {
    render([BROKEN]);

    expect(row().classList.contains('cli-status__row--broken')).toBe(true);
    expect(row().classList.contains('cli-status__row--missing')).toBe(false);
    expect(text()).toContain('spawn ENOENT');
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(2);
  });

  it('marks an absent CLI as missing and names the command to install', () => {
    render([MISSING]);

    expect(row().classList.contains('cli-status__row--missing')).toBe(true);
    expect(row().classList.contains('cli-status__row--broken')).toBe(false);
    expect(fixture.nativeElement.querySelector('code')?.textContent).toBe('codex');
  });

  it('reports which provider to install', () => {
    render([MISSING]);
    const asked: string[] = [];
    fixture.componentInstance.installRequested.subscribe((p) => asked.push(p));

    (fixture.nativeElement.querySelectorAll('button')[0] as HTMLButtonElement).click();

    expect(asked).toEqual(['openai']);
  });

  /** One install at a time: a second click while npm is running would race the
   * first, and both rows offer the same button. */
  it('disables every install button while one is running', () => {
    render([BROKEN, MISSING]);
    fixture.componentRef.setInput('installing', 'openai');
    fixture.detectChanges();

    const installButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.cli-status__row button'),
    ) as HTMLButtonElement[];
    expect(installButtons.length).toBe(2);
    expect(installButtons.every((b) => b.disabled)).toBe(true);
  });

  it('shows only the probe message while probing, and no rows', () => {
    render([WORKING]);
    fixture.componentRef.setInput('probing', true);
    fixture.detectChanges();

    expect(text()).toContain('Looking for installed CLIs');
    expect(fixture.nativeElement.querySelectorAll('.cli-status__row').length).toBe(0);
  });

  it('reports a re-check', () => {
    let asked = 0;
    fixture.componentInstance.recheckRequested.subscribe(() => asked++);

    (fixture.nativeElement.querySelectorAll('button')[0] as HTMLButtonElement).click();

    expect(asked).toBe(1);
  });

  /** The note describes CLI mode specifically, so it travels with this list
   * rather than with the provider picker. */
  it('carries the CLI-mode privacy note', () => {
    expect(fixture.nativeElement.querySelector('.disclosure')).not.toBeNull();
    expect(text()).toContain('stores no API key');
  });
});
