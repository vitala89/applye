import { TestBed } from '@angular/core/testing';
import { BootGateStore, type BootScreen } from '@applye/application';
import { App } from './app';
import { UpdaterService } from './core/updater.service';
import { OnboardingService } from './core/onboarding/onboarding.service';

/**
 * Everything the root component does at boot is route the store's answer. The
 * store is overridden at the component's own provider, because that is where
 * it is declared.
 */
function setup(screen: BootScreen) {
  const onboarding = new OnboardingService();
  const checks: number[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: UpdaterService, useValue: { check: () => (checks.push(1), Promise.resolve()) } },
      { provide: OnboardingService, useValue: onboarding },
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
