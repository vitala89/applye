import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { BootGateStore, type BootScreen } from '@applye/application';
import { App } from './app';
import { UpdaterService } from './core/updater.service';
import { OnboardingService } from './core/onboarding/onboarding.service';

/**
 * Everything the root component does at boot is route the store's answer. The
 * store is overridden at the component's own provider, because that is where
 * it is declared.
 */
function setup(screen: BootScreen, url = '/dashboard') {
  const onboarding = new OnboardingService();
  const checks: number[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: UpdaterService, useValue: { check: () => (checks.push(1), Promise.resolve()) } },
      { provide: OnboardingService, useValue: onboarding },
      // No navigation happens in these tests, so the stream is empty and the
      // signal keeps the URL the component was created on.
      { provide: Router, useValue: { url, events: EMPTY } },
    ],
  });
  TestBed.overrideComponent(App, {
    set: { providers: [{ provide: BootGateStore, useValue: { load: async () => screen } }] },
  });
  const fixture = TestBed.createComponent(App);
  return { fixture, onboarding, checks };
}

describe('App', () => {
  afterEach(() => TestBed.resetTestingModule());

  /**
   * The hidden PDF-export windows load `print/*`, and they used to get the
   * whole shell with the print stylesheet hiding it - which paints nothing and
   * occupies everything. The report then exported with a trailing blank page
   * because the shell's height was still in the flow (`B6`), and the document
   * had to be lifted out with `position: absolute` to escape it.
   */
  describe('the print routes render no chrome', () => {
    it.each(['/print/cv/12', '/print/cover-letter/3', '/print/tracker-report'])(
      'renders the outlet alone on %s',
      (url) => {
        const { fixture } = setup('app', url);
        fixture.detectChanges();

        expect(fixture.componentInstance.chromeless()).toBe(true);
        expect(fixture.nativeElement.querySelector('app-shell-layout')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-toast-container')).toBeNull();
      },
    );

    // Asserted on the signal rather than on the DOM, unlike the print routes
    // above: rendering the real shell pulls in its `routerLink`s, which need an
    // `ActivatedRoute` off a real router, and standing one up here would be a
    // fixture built to satisfy a fixture. The template branch is one `@if` on
    // this signal, and the print cases already assert the rendered side.
    // Nearly shipped as a regression: the toast container sits outside the
    // three screens, so folding it into the shell branch would have silenced
    // every toast raised during first launch and onboarding.
    it('keeps toasts on the screens that are not the shell', async () => {
      const { fixture } = setup('first-launch', '/dashboard');
      await fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-first-launch')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-toast-container')).not.toBeNull();
    });

    it('keeps the shell on an ordinary route', () => {
      expect(setup('app', '/documents').fixture.componentInstance.chromeless()).toBe(false);
    });

    // A route that merely starts with the word must not lose its chrome.
    it('does not match a route that only looks like one', () => {
      expect(setup('app', '/printer').fixture.componentInstance.chromeless()).toBe(false);
      expect(setup('app', '/jobs/print').fixture.componentInstance.chromeless()).toBe(false);
    });

    // The export window must show the document even when the boot gate would
    // otherwise raise a welcome screen over it - a blank or onboarding PDF is
    // the worst possible output of a silent export.
    it('shows the document even when the boot gate wants the welcome screen', async () => {
      const { fixture } = setup('first-launch', '/print/tracker-report');
      await fixture.componentInstance.ngOnInit();
      fixture.detectChanges();

      expect(fixture.componentInstance.showFirstLaunch()).toBe(true);
      expect(fixture.nativeElement.querySelector('app-first-launch')).toBeNull();
    });
  });

  it('should create', () => {
    expect(setup('app').fixture.componentInstance).toBeTruthy();
  });

  /// The welcome screen is shown by the root component, because it replaces the
  /// whole shell rather than opening over it.
  it('shows the welcome screen when the gate says so', async () => {
    const { fixture } = setup('first-launch');
    await fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance.showFirstLaunch()).toBe(true);
    expect(fixture.componentInstance.showOnboarding()).toBe(false);
  });

  /// Onboarding is opened through `OnboardingService` rather than a local
  /// signal, because the dashboard banner and Settings write the same state.
  it('opens onboarding through the shared service, not a local flag', async () => {
    const { fixture, onboarding } = setup('onboarding');
    await fixture.componentInstance.ngOnInit();

    expect(onboarding.open()).toBe(true);
    expect(fixture.componentInstance.showFirstLaunch()).toBe(false);
  });

  it('shows neither gate when the app opens straight into the shell', async () => {
    const { fixture, onboarding } = setup('app');
    await fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance.showFirstLaunch()).toBe(false);
    expect(onboarding.open()).toBe(false);
  });

  /// The update check is fire-and-forget and must never gate the boot decision:
  /// awaiting it would hold the first paint behind a network call.
  it('starts the update check without waiting for it', async () => {
    const { fixture, checks } = setup('app');
    await fixture.componentInstance.ngOnInit();

    expect(checks).toHaveLength(1);
  });
});
