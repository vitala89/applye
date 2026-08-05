import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoringState } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ProfileFreshnessChipsComponent } from './profile-freshness-chips.component';

function createFixture(
  state: ScoringState,
  over: { status?: string; error?: boolean } = {},
): ComponentFixture<ProfileFreshnessChipsComponent> {
  TestBed.configureTestingModule({
    imports: [ProfileFreshnessChipsComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileFreshnessChipsComponent);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('staleHintKey', 'profile.stale_hint');
  fixture.componentRef.setInput('unsavedHintKey', 'profile.unsaved_scoring_hint');
  fixture.componentRef.setInput('status', over.status ?? '');
  fixture.componentRef.setInput('error', over.error ?? false);
  fixture.detectChanges();
  return fixture;
}

function chips(fixture: ComponentFixture<ProfileFreshnessChipsComponent>): string[] {
  return [...fixture.nativeElement.querySelectorAll('.chip')].map((c: HTMLElement) =>
    (c.textContent ?? '').trim(),
  );
}

describe('ProfileFreshnessChipsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** An artefact that does not exist yet is not stale, and the Generate button
   * beside this already says so. */
  it('renders nothing at all for `none`', () => {
    const fixture = createFixture('none');
    expect(chips(fixture)).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.chip-hint')).toBeNull();
  });

  it('shows the cached chip and no hint when fresh', () => {
    const fixture = createFixture('fresh');
    expect(chips(fixture)).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.chip--stale')).toBeNull();
    expect(fixture.nativeElement.querySelector('.chip-hint')).toBeNull();
  });

  /** The two states are visually the same shape, so a mix-up would be silent.
   * Each has to show the hint keyed to it, and only that one. */
  it('shows the stale chip with the stale hint, and the unsaved chip with the unsaved hint', () => {
    const stale = createFixture('stale');
    expect(stale.nativeElement.querySelector('.chip--stale')).not.toBeNull();
    const staleHint = stale.nativeElement.querySelector('.chip-hint').textContent.trim();
    TestBed.resetTestingModule();

    const unsaved = createFixture('unsaved');
    expect(unsaved.nativeElement.querySelector('.chip--stale')).not.toBeNull();
    const unsavedHint = unsaved.nativeElement.querySelector('.chip-hint').textContent.trim();

    expect(staleHint).not.toBe('');
    expect(unsavedHint).not.toBe('');
    expect(staleHint).not.toBe(unsavedHint);
  });

  it('shows a status line only when there is one, and marks it on error', () => {
    const quiet = createFixture('fresh');
    expect(quiet.nativeElement.querySelector('.status')).toBeNull();
    TestBed.resetTestingModule();

    const failed = createFixture('fresh', { status: 'Could not reach the model', error: true });
    const status = failed.nativeElement.querySelector('.status');
    expect(status.textContent.trim()).toBe('Could not reach the model');
    expect(status.classList).toContain('status--error');
    TestBed.resetTestingModule();

    const ok = createFixture('fresh', { status: 'Saved', error: false });
    expect(ok.nativeElement.querySelector('.status').classList).not.toContain('status--error');
  });
});
