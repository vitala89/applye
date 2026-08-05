import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoringState } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ProfileAiToolsComponent } from './profile-ai-tools.component';

interface Inputs {
  canGenerate: boolean;
  scoringOpen: boolean;
  scoringState: ScoringState;
  scoring: boolean;
  scoringJson: string | null;
  scoreStatus: string;
  scoreError: boolean;
  pitchState: ScoringState;
  pitching: boolean;
  pitchMd: string | null;
  pitchStatus: string;
  pitchError: boolean;
}

const DEFAULTS: Inputs = {
  canGenerate: true,
  scoringOpen: true,
  scoringState: 'none',
  scoring: false,
  scoringJson: null,
  scoreStatus: '',
  scoreError: false,
  pitchState: 'none',
  pitching: false,
  pitchMd: null,
  pitchStatus: '',
  pitchError: false,
};

function createFixture(over: Partial<Inputs> = {}): ComponentFixture<ProfileAiToolsComponent> {
  TestBed.configureTestingModule({
    imports: [ProfileAiToolsComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileAiToolsComponent);
  for (const [key, value] of Object.entries({ ...DEFAULTS, ...over })) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture;
}

function cards(fixture: ComponentFixture<ProfileAiToolsComponent>): HTMLElement[] {
  return [...fixture.nativeElement.querySelectorAll('.tool-card')];
}

function buttons(fixture: ComponentFixture<ProfileAiToolsComponent>): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('.tool-card button[appButton]')];
}

describe('ProfileAiToolsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders both tool cards', () => {
    expect(cards(createFixture())).toHaveLength(2);
  });

  /** The section runs no AI call itself; it only asks. */
  it('emits rather than acting, for both artefacts and for the toggle', () => {
    const fixture = createFixture();
    const seen: string[] = [];
    fixture.componentInstance.scoringRequested.subscribe(() => seen.push('scoring'));
    fixture.componentInstance.pitchRequested.subscribe(() => seen.push('pitch'));
    fixture.componentInstance.scoringToggled.subscribe(() => seen.push('toggle'));

    const [scoringBtn, pitchBtn] = buttons(fixture);
    scoringBtn.click();
    pitchBtn.click();
    (fixture.nativeElement.querySelector('.tool-card__head--toggle') as HTMLElement).click();

    expect(seen).toEqual(['scoring', 'pitch', 'toggle']);
  });

  /** One flag drives both buttons: a call or a save in flight, or no markdown
   * to generate from, must disable the other artefact too. */
  it('disables both Generate buttons together', () => {
    expect(buttons(createFixture({ canGenerate: true })).map((b) => b.disabled)).toEqual([
      false,
      false,
    ]);
    TestBed.resetTestingModule();
    expect(buttons(createFixture({ canGenerate: false })).map((b) => b.disabled)).toEqual([
      true,
      true,
    ]);
  });

  it('hides the scoring body while collapsed, and shows the summary when open with an artefact', () => {
    const shut = createFixture({ scoringOpen: false, scoringJson: '{"seniority":"senior"}' });
    expect(shut.nativeElement.querySelector('app-scoring-summary')).toBeNull();
    expect(shut.nativeElement.querySelector('.tool-card__foot')).not.toBeNull(); // the pitch card's
    TestBed.resetTestingModule();

    const open = createFixture({ scoringOpen: true, scoringJson: '{"seniority":"senior"}' });
    expect(open.nativeElement.querySelector('app-scoring-summary')).not.toBeNull();
  });

  it('shows the loading animation instead of the artefact while a call is in flight', () => {
    const busy = createFixture({ scoring: true, scoringJson: '{"seniority":"senior"}' });
    expect(busy.nativeElement.querySelector('.ai-loading')).not.toBeNull();
    expect(busy.nativeElement.querySelector('app-scoring-summary')).toBeNull();
    TestBed.resetTestingModule();

    const pitching = createFixture({ pitching: true, pitchMd: 'my pitch' });
    expect(pitching.nativeElement.querySelector('.ai-loading')).not.toBeNull();
    expect(pitching.nativeElement.querySelector('.output-block')).toBeNull();
  });

  it('renders the pitch text when there is one and no call running', () => {
    const fixture = createFixture({ pitchMd: 'I ship things.' });
    expect(fixture.nativeElement.querySelector('.output-block').textContent.trim()).toBe(
      'I ship things.',
    );
  });

  /** Each card gets its own freshness state; crossing them would be invisible
   * because the two chip blocks look identical. */
  it('gives each card its own freshness chips', () => {
    const fixture = createFixture({ scoringState: 'fresh', pitchState: 'stale' });
    const [scoringCard, pitchCard] = cards(fixture);
    expect(scoringCard.querySelector('.chip--stale')).toBeNull();
    expect(scoringCard.querySelector('.chip')).not.toBeNull();
    expect(pitchCard.querySelector('.chip--stale')).not.toBeNull();
  });

  it('keeps each card status on its own card', () => {
    const fixture = createFixture({ scoreStatus: 'score failed', pitchStatus: 'pitch failed' });
    const [scoringCard, pitchCard] = cards(fixture);
    expect(scoringCard.querySelector('.status').textContent.trim()).toBe('score failed');
    expect(pitchCard.querySelector('.status').textContent.trim()).toBe('pitch failed');
  });
});
